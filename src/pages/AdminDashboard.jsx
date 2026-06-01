import { useCallback, useEffect, useMemo, useState, useId } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { marked } from 'marked'
import MediBotOverviewSections from '../components/admin/MediBotOverviewSections'
import { AdminLayer1OperationsView, AdminVerificationQueueView } from '../components/admin/AdminMediBotTabViews'
import { Package, RefreshCw, X } from 'lucide-react'
import {
  getAdminMe,
  getAdminDashboardData,
  getAdminMediBotOverview,
  getAdminChatbotDashboardWidgets,
  mergeMediBotOverviewWithWidgetsBundle,
  getAdminSearchVolumeAnalytics,
  createAdminPharmacy,
  normalizeAdminPaginatedResponse,
  getAdminUsersList,
  getAdminPatientsList,
  getAdminChatbotLogs,
  getAdminChatbotConversationLogs,
  getPharmacistInventory,
  getPharmacistRankingSummary,
  updateAdminPharmacy,
  adminLogoutRequest,
  generateAdminReportNarrative
} from '../utils/api'
import { chatbotLogRowNeedsReview } from '../utils/adminChatbotAudit'
import { extractDashboardVerificationQueue, getPharmacyRegistryStatus } from '../utils/pharmacyRegistryStatus'
import {
  parseLeaderboardRowsFromSummary,
  leaderboardPharmacyIdsMatch,
  rankingScoreLikePharmacyDashboardRow
} from '../utils/pharmacyLeaderboard'
import { displayLabelForAnalyticsGeoRegionKey } from '../utils/zwLocationBuckets'
import { topMedicineBarRowsFromSearchVolume } from '../utils/adminSearchVolumeUi'
import AdminAppShell from '../components/AdminAppShell'
import AdminCommandCenter from '../components/admin/AdminCommandCenter'
import { buildAdminNavSections, ADMIN_DASHBOARD_TAB_IDS } from '../utils/adminNavSections'
import './AdminDashboard.css'

/** Dedupe concurrent `GET .../admin/me/` (React StrictMode double-mount in dev). */
let adminMeRequestPromise = null
function dedupedGetAdminMe() {
  if (!adminMeRequestPromise) {
    adminMeRequestPromise = getAdminMe()
      .catch(() => {})
      .finally(() => {
        adminMeRequestPromise = null
      })
  }
  return adminMeRequestPromise
}

/** Dedupe concurrent initial dashboard `GET .../data/` — silent refresh bypasses. */
let adminDashboardInitialLoadPromise = null
const ADMIN_DASHBOARD_INITIAL_LIST_LIMIT = 30
const ADMIN_DASHBOARD_INITIAL_VERIFICATION_LIMIT = 60
const ADMIN_DASHBOARD_FULL_LIST_LIMIT = 100
const ADMIN_DASHBOARD_FULL_VERIFICATION_LIMIT = 200
const OPTIONAL_ADMIN_FETCH_TIMEOUT_MS = 12000

function formatAdminDateShort(raw) {
  if (raw == null || raw === '' || raw === '—') return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function formatMediBotGeneratedAt(raw) {
  if (raw == null || raw === '') return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','))
  }
  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}

function formatAdminInventoryItemPrice(item) {
  if (item == null || item.price === '' || item.price == null) return '—'
  const u = String(item.price_unit || 'per_packet').replace(/^per_/, '').replace(/_/g, ' ')
  return `$${Number(item.price).toFixed(2)} / ${u}`
}

/** MedicineRequest-style statuses that are still "in progress" (backend model). */
const ADMIN_OPEN_REQUEST_STATUSES = [
  'created',
  'validated',
  'broadcasting',
  'awaiting_responses',
  'partial',
  'ranking',
  'responses_received'
]

function sumRequestStatusBucket(statusDict, keys) {
  if (!statusDict || typeof statusDict !== 'object') return 0
  return keys.reduce((s, k) => s + (Number(statusDict[k]) || 0), 0)
}

function sumAllRequestStatuses(statusDict) {
  if (!statusDict || typeof statusDict !== 'object') return 0
  return Object.values(statusDict).reduce((s, v) => s + (Number(v) || 0), 0)
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('Request timed out')), ms)
    promise
      .then((value) => {
        clearTimeout(id)
        resolve(value)
      })
      .catch((err) => {
        clearTimeout(id)
        reject(err)
      })
  })
}

function suggestPharmacyIdFromName(name) {
  const raw = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (raw.length >= 3) return raw.slice(0, 48)
  return ''
}

const ADMIN_LIST_PAGE_SIZE = 25

function adminConversationRowId(row) {
  return row?.conversation_id ?? row?.conversationId ?? row?.id ?? row?.pk ?? ''
}

function extractChatbotMessages(detail) {
  if (!detail || typeof detail !== 'object') return null
  if (Array.isArray(detail.messages)) return detail.messages
  if (Array.isArray(detail.turns)) return detail.turns
  if (Array.isArray(detail.conversation)) return detail.conversation
  if (Array.isArray(detail.chat_messages)) return detail.chat_messages
  if (Array.isArray(detail.items)) return detail.items
  return null
}

function AdminSearchTrendChart({ counts, labels, labelShort, gradientId, compact }) {
  const n = counts.length
  if (n < 1) return null
  const vw = compact ? 600 : 720
  const vh = compact ? 118 : 200
  const padL = compact ? 30 : 40
  const padR = compact ? 10 : 16
  const padT = compact ? 8 : 14
  const padB = compact ? 22 : 30
  const gw = vw - padL - padR
  const gh = vh - padT - padB
  const max = Math.max(...counts, 1)
  const step = n <= 1 ? 0 : gw / (n - 1)
  const coords = counts.map((c, i) => {
    const x = padL + i * step
    const y = padT + gh - (c / max) * gh
    return [x, y]
  })
  const lineD = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
  const areaD = `M ${padL} ${padT + gh} ${coords.map(([x, y]) => `L ${x} ${y}`).join(' ')} L ${padL + (n - 1) * step} ${padT + gh} Z`
  const yTicks = (compact ? [1, 0.5, 0] : [1, 0.66, 0.33, 0]).map((t) => ({
    y: padT + gh * (1 - t),
    label: t === 0 ? '0' : Math.round(max * t).toString()
  }))
  const dotR = compact ? 2.75 : 3.5

  return (
    <svg className="admin-trend-svg" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d9488" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map(({ y, label }) => (
        <g key={label + y}>
          <line x1={padL} y1={y} x2={vw - padR} y2={y} className="admin-trend-gridline" />
          <text x={6} y={y + 4} className="admin-trend-y-label">
            {label}
          </text>
        </g>
      ))}
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path d={lineD} fill="none" className="admin-trend-line" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(([x, y], i) => (
        <circle key={`${labels[i]}-${i}`} cx={x} cy={y} r={dotR} className="admin-trend-dot" />
      ))}
      {labels.map((iso, i) => (
        <text key={iso} x={padL + i * step} y={vh - (compact ? 5 : 8)} className="admin-trend-x-label" textAnchor="middle">
          {labelShort(iso)}
        </text>
      ))}
    </svg>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const trendGradientId = useId().replace(/:/g, '')
  const [activeTab, setActiveTab] = useState('overview')
  const selectTab = useCallback(
    (id) => {
      setActiveTab(id)
      setSearchParams({ tab: id }, { replace: true })
    },
    [setSearchParams]
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** Pharmacy ID (string) while PATCH .../status/ is in flight for registry table */
  const [pharmacyRegistrySavingId, setPharmacyRegistrySavingId] = useState(null)
  const [pharmacies, setPharmacies] = useState([])
  const [pharmacists, setPharmacists] = useState([])
  const [allRequests, setAllRequests] = useState([])
  const [allReservations, setAllReservations] = useState([])
  const [activityRange, setActivityRange] = useState('7d')
  const [registryStatusFilter, setRegistryStatusFilter] = useState('all')
  const [registryQuery, setRegistryQuery] = useState('')
  const [registrySummary, setRegistrySummary] = useState(null)
  const [searchVolumeAnalytics, setSearchVolumeAnalytics] = useState(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [registerSaving, setRegisterSaving] = useState(false)
  const [registerPharmacyModalOpen, setRegisterPharmacyModalOpen] = useState(false)
  const [registerPharmacyForm, setRegisterPharmacyForm] = useState({
    pharmacy_id: '',
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    phone: '',
    email: ''
  })

  const [usersListPage, setUsersListPage] = useState(1)
  const [usersListSearchIn, setUsersListSearchIn] = useState('')
  const [usersListSearch, setUsersListSearch] = useState('')
  const [usersList, setUsersList] = useState([])
  const [usersListTotal, setUsersListTotal] = useState(null)
  const [usersListLoading, setUsersListLoading] = useState(false)
  const [usersListError, setUsersListError] = useState('')

  const [patientsListPage, setPatientsListPage] = useState(1)
  const [patientsListSearchIn, setPatientsListSearchIn] = useState('')
  const [patientsListSearch, setPatientsListSearch] = useState('')
  const [patientsList, setPatientsList] = useState([])
  const [patientsListTotal, setPatientsListTotal] = useState(null)
  const [patientsListLoading, setPatientsListLoading] = useState(false)
  const [patientsListError, setPatientsListError] = useState('')

  const [chatbotLogsPage, setChatbotLogsPage] = useState(1)
  const [chatbotLogsSearchIn, setChatbotLogsSearchIn] = useState('')
  const [chatbotLogsSearch, setChatbotLogsSearch] = useState('')
  const [chatbotLogsSessionFilterIn, setChatbotLogsSessionFilterIn] = useState('')
  const [chatbotLogsSessionFilter, setChatbotLogsSessionFilter] = useState('')
  const [chatbotLogs, setChatbotLogs] = useState([])
  const [chatbotLogsTotal, setChatbotLogsTotal] = useState(null)
  const [chatbotLogsLoading, setChatbotLogsLoading] = useState(false)
  const [chatbotLogsError, setChatbotLogsError] = useState('')
  /** True after first chatbot logs fetch for overview / audit / command center (avoids demo/placeholder audit cards). */
  const [chatbotLogsHasLoaded, setChatbotLogsHasLoaded] = useState(false)
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [chatbotTranscript, setChatbotTranscript] = useState(null)
  const [chatbotTranscriptLoading, setChatbotTranscriptLoading] = useState(false)
  const [chatbotTranscriptError, setChatbotTranscriptError] = useState('')
  const [chatbotTranscriptDrawerOpen, setChatbotTranscriptDrawerOpen] = useState(false)
  const [clockStr, setClockStr] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { hour12: false })
  )

  const [inventoryReportsByPharmacy, setInventoryReportsByPharmacy] = useState([])
  const [inventoryReportsLoading, setInventoryReportsLoading] = useState(false)
  const [inventoryReportSearch, setInventoryReportSearch] = useState('')

  const [overview, setOverview] = useState(null)
  const [mediBotOverview, setMediBotOverview] = useState(null)
  const [requestsByStatus, setRequestsByStatus] = useState({})
  /** From `GET .../admin/dashboard/data/` (verification_queue + aliases); same rows as dedicated queue endpoint. */
  const [dashboardVerificationQueue, setDashboardVerificationQueue] = useState(null)
  /** One `GET .../pharmacist/<id>/ranking-summary/` after dashboard load — same `leaderboard` table as pharmacy portal. */
  const [adminPortalRankingSummary, setAdminPortalRankingSummary] = useState(null)
  const [adminPortalRankingSummaryLoading, setAdminPortalRankingSummaryLoading] = useState(false)
  const [hasHydratedFullDashboard, setHasHydratedFullDashboard] = useState(false)

  const normalizeList = (data) => {
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.results)) return data.results
    if (Array.isArray(data?.pharmacies)) return data.pharmacies
    if (Array.isArray(data?.pharmacists)) return data.pharmacists
    if (Array.isArray(data?.patient_requests)) return data.patient_requests
    if (Array.isArray(data?.reservations)) return data.reservations
    if (Array.isArray(data?.items)) return data.items
    return []
  }

  const fetchDashboard = async ({ silent = false, full = false } = {}) => {
    if (!silent && adminDashboardInitialLoadPromise) {
      return adminDashboardInitialLoadPromise
    }
    if (!silent) {
      setLoading(true)
    }
    setError('')

    const run = async () => {
      try {
        /** Core lists + overview — do not block UI on MediBot / widgets (they are often slower). */
        const data = await getAdminDashboardData(
          full ? ADMIN_DASHBOARD_FULL_LIST_LIMIT : ADMIN_DASHBOARD_INITIAL_LIST_LIMIT,
          full ? ADMIN_DASHBOARD_FULL_VERIFICATION_LIMIT : ADMIN_DASHBOARD_INITIAL_VERIFICATION_LIMIT
        )
        const pharmacyList = normalizeList(data?.lists?.pharmacies || [])
        const pharmacistList = normalizeList(data?.lists?.pharmacists || [])
        const requests = normalizeList(data?.lists?.patient_requests || [])
        const reservations = normalizeList(data?.lists?.reservations || [])

        setPharmacies(pharmacyList)
        setPharmacists(pharmacistList)
        setAllRequests(requests)
        setAllReservations(reservations)
        setOverview(data?.overview || null)
        setRequestsByStatus(data?.breakdown?.requests_by_status || {})
        setDashboardVerificationQueue(extractDashboardVerificationQueue(data))

        const regBase = data?.registry?.summary || data?.breakdown?.pharmacy_registry
        let regSum = null
        if (regBase && typeof regBase === 'object') {
          regSum = { ...regBase }
          const hasPendingField =
            regSum.pending_review != null ||
            regSum.pending != null ||
            regSum.pending_count != null ||
            regSum.reg_pending != null
          const rpc = data?.registry?.pending_count
          if (!hasPendingField && rpc != null && Number.isFinite(Number(rpc))) {
            regSum.pending_review = Number(rpc)
          }
        }
        setRegistrySummary(regSum)

        if (full) {
          setAdminPortalRankingSummary(null)
          setAdminPortalRankingSummaryLoading(true)
          const firstRankSummaryPharmacistId = pharmacistList
            .map((p) => p?.pharmacist_id ?? p?.id)
            .find((id) => id != null && String(id).trim() !== '')
          if (firstRankSummaryPharmacistId) {
            withTimeout(
              getPharmacistRankingSummary(String(firstRankSummaryPharmacistId), {
                credentials: 'include'
              }),
              OPTIONAL_ADMIN_FETCH_TIMEOUT_MS
            )
              .then((payload) => {
                if (payload && typeof payload === 'object') setAdminPortalRankingSummary(payload)
                else setAdminPortalRankingSummary(null)
              })
              .catch(() => setAdminPortalRankingSummary(null))
              .finally(() => setAdminPortalRankingSummaryLoading(false))
          } else {
            setAdminPortalRankingSummary(null)
            setAdminPortalRankingSummaryLoading(false)
          }
        }

        if (full) {
          getAdminSearchVolumeAnalytics(30)
            .then((vol) => setSearchVolumeAnalytics(vol))
            .catch(() => setSearchVolumeAnalytics(null))
        }

        if (!silent) setLoading(false)

        if (full) {
          const [mediBot, widgetsBundle] = await Promise.all([
            withTimeout(getAdminMediBotOverview(), OPTIONAL_ADMIN_FETCH_TIMEOUT_MS).catch(() => null),
            withTimeout(
              getAdminChatbotDashboardWidgets({ noResponseMinutes: 10 }),
              OPTIONAL_ADMIN_FETCH_TIMEOUT_MS
            ).catch(() => null)
          ])
          setMediBotOverview(mergeMediBotOverviewWithWidgetsBundle(mediBot, widgetsBundle))
        }
        if (full) setHasHydratedFullDashboard(true)
      } catch (err) {
        setError(err?.message || 'Failed to load admin dashboard data.')
      } finally {
        setLoading(false)
      }
    }

    if (!silent) {
      adminDashboardInitialLoadPromise = run()
      try {
        await adminDashboardInitialLoadPromise
      } finally {
        adminDashboardInitialLoadPromise = null
      }
      return
    }
    await run()
  }

  const exportCurrentViewCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const visiblePharmacyRows = registryTableRows.slice(0, 80)
    const visiblePharmacists = pharmacists.slice(0, 40)
    const visibleRequests = allRequests.slice(0, 40)
    const visibleReservations = allReservations.slice(0, 40)
    if (activeTab === 'pharmacies') {
      const rows = visiblePharmacyRows.map((p) => ({
        Pharmacy: p.__name,
        City: p.city || p.location_suburb || '—',
        Type: p.pharmacy_type || p.type || 'Pharmacy',
        'Medicines listed': p.medicine_count ?? p.medicines_listed_count ?? p.inventory_count ?? '—',
        Ranking: p.__rank != null ? `#${p.__rank}` : '—',
        Status: pharmacyRowApiStatus(p)
      }))
      return downloadCsv(`pharmacies-visible-${stamp}.csv`, rows)
    }
    if (activeTab === 'users') return downloadCsv(`users-visible-${stamp}.csv`, usersList)
    if (activeTab === 'chatbot' || activeTab === 'chatbot-audit') return downloadCsv(`chatbot-visible-${stamp}.csv`, chatbotLogs)
    if (activeTab === 'inventory') return downloadCsv(`inventory-visible-${stamp}.csv`, visibleInventoryReports)
    if (activeTab === 'pharmacists') return downloadCsv(`pharmacists-visible-${stamp}.csv`, visiblePharmacists)
    if (activeTab === 'requests') return downloadCsv(`requests-visible-${stamp}.csv`, visibleRequests)
    if (activeTab === 'reservations') return downloadCsv(`reservations-visible-${stamp}.csv`, visibleReservations)
    if (activeTab === 'verification-queue') return downloadCsv(`verification-queue-visible-${stamp}.csv`, dashboardVerificationQueue || [])
    return false
  }

  const exportCurrentViewReportPdf = async () => {
    const now = new Date()
    const visiblePharmacyRows = registryTableRows.slice(0, 80)
    const visiblePharmacists = pharmacists.slice(0, 40)
    const visibleRequests = allRequests.slice(0, 40)
    const visibleReservations = allReservations.slice(0, 40)
    const title = pageHead?.title || 'Admin Dashboard'
    const countByTab = {
      overview:
        requestActivitySeries.counts.length +
        topMedicineTopics.length +
        topRegionTopics.length +
        overviewRecentRegistrationRows.length,
      'layer1-system': requestActivitySeries.counts.length + topRegionTopics.length,
      pharmacies: visiblePharmacyRows.length,
      users: usersList.length,
      'chatbot-audit': chatbotLogs.length,
      chatbot: chatbotLogs.length,
      inventory: visibleInventoryReports.length,
      pharmacists: visiblePharmacists.length,
      requests: visibleRequests.length,
      reservations: visibleReservations.length,
      'verification-queue': (dashboardVerificationQueue || []).length,
      'algorithm-stewardship': 4,
      'weight-tuning': 4,
      'ranking-profiles': 4,
      'content-policy': 1
    }
    const visibleCount = countByTab[activeTab] ?? 0
    const pendingRate =
      requestStats.total > 0 ? `${((requestStats.pending / requestStats.total) * 100).toFixed(1)}%` : '0.0%'
    const respondedCount = Math.max(0, (requestStats.total || 0) - (requestStats.pending || 0))
    const respondedRate =
      requestStats.total > 0 ? `${((respondedCount / requestStats.total) * 100).toFixed(1)}%` : '0.0%'
    const flaggedChats = chatbotLogs.filter(chatbotLogRowNeedsReview).length
    const monthlyPeak = Math.max(...requestActivitySeries.counts, 0)
    const monthlyAvg =
      requestActivitySeries.counts.length > 0
        ? Math.round(requestActivitySeries.counts.reduce((s, n) => s + n, 0) / requestActivitySeries.counts.length)
        : 0
    const monthlyLatest = requestActivitySeries.counts[requestActivitySeries.counts.length - 1] || 0
    const trendDirection =
      monthlyLatest > monthlyAvg ? 'above average' : monthlyLatest < monthlyAvg ? 'below average' : 'at average'
    const topRegion = topRegionTopics[0]?.name || 'N/A'
    const topMedicine = topMedicineTopics[0]?.name || 'N/A'
    const pendingVerification = registryMetrics.pending || 0
    const verifiedPharmacies = registryMetrics.verified || 0
    const suspendedPharmacies = registryMetrics.suspended || 0

    const l1 = mediBotOverview?.layer1_system_health
    const l2 = mediBotOverview?.layer2_pharmacy_governance
    const l3 = mediBotOverview?.layer3_algorithm
    const cleanTopic = (raw) =>
      String(raw || '')
        .replace(/:+\s*$/, '')
        .trim()
    const activeUsersDisplay =
      l1?.active_users != null && Number.isFinite(Number(l1.active_users))
        ? Number(l1.active_users).toLocaleString()
        : Number.isFinite(Number(usersApproxCount))
          ? Number(usersApproxCount).toLocaleString()
          : '—'
    const avgResponseDisplay =
      l1?.avg_response_time_ms != null
        ? `${(Number(l1.avg_response_time_ms) / 1000).toFixed(1)}s`
        : systemStatus.avgResponse || '—'
    const uptimeDisplay =
      l1?.uptime_pct_this_month != null
        ? `${Number(l1.uptime_pct_this_month).toFixed(1)}%`
        : systemStatus.uptimePct || '—'
    const queuePreview = (dashboardVerificationQueue || [])
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.name || r.pharmacy_name || r.__name || 'Unknown pharmacy'}`)
      .join('\n')
    const rankingPreview = overviewPharmacyMatchRows
      .slice(0, 7)
      .map((p) => {
        const rank = p.__displayRank != null ? `#${p.__displayRank}` : '—'
        const name = p.__name || 'Unknown pharmacy'
        const locality = p.location_suburb || p.city || p.address || 'Location unavailable'
        const score = p.__score != null ? ` · ${p.__score}` : ''
        return `${rank} ${name} · ${locality}${score}`
      })
      .join('\n')
    const recentRegs = overviewRecentRegistrationRows
      .slice(0, 7)
      .map((r) => `${r.name} · ${r.type} · ${r.status}`)
      .join('\n')
    const auditPreview = chatbotLogs
      .filter(chatbotLogRowNeedsReview)
      .slice(0, 5)
      .map((r, i) => {
        const text = String(
          r.title || r.summary || r.last_message_preview || r.preview || r.last_message || 'Flagged conversation'
        ).replace(/\s+/g, ' ')
        return `${i + 1}. ${text.slice(0, 180)}${text.length > 180 ? '…' : ''}`
      })
      .join('\n')
    const topMeds = topMedicineTopics
      .slice(0, 10)
      .map((m) => `${cleanTopic(m.name)}: ${m.c}`)
      .join('\n')
    const topRegions = topRegionTopics.slice(0, 10).map((r) => `${r.name}: ${r.c}`).join('\n')
    const weightRows = [
      ['Price competitiveness', Number(l3?.standard_weights?.price ?? 35)],
      ['Distance / travel time', Number(l3?.standard_weights?.distance ?? 25)],
      ['Patient rating', Number(l3?.standard_weights?.rating ?? 25)],
      ['Stock reliability', Number(l3?.standard_weights?.stock ?? 15)]
    ]
      .map(([k, v]) => `${k}: ${Number.isFinite(v) ? v : 0}%`)
      .join('\n')

    const sections = activeTab === 'overview' ? [
      {
        head: 'System Health — Operational Overview',
        body:
          `Active users: ${activeUsersDisplay}\nRequests today: ${adminRequestsToday}\nAvg response: ${avgResponseDisplay}\nActive pharmacies: ${registryMetrics.total}\nUptime (month): ${uptimeDisplay}\n\n` +
          `Pending requests: ${requestStats.pending} of ${requestStats.total} (${pendingRate})\nResponded requests: ${respondedCount} (${respondedRate})`
      },
      {
        head: 'Request Volume and Geography',
        body:
          `Top searched medicines:\n${topMeds || 'N/A'}\n\nTop regions by request:\n${topRegions || 'N/A'}\n\n` +
          `Trend insight: latest bucket ${monthlyLatest}, average ${monthlyAvg}, peak ${monthlyPeak}.`
      },
      {
        head: 'Pharmacy Governance — Trust and Accountability',
        body:
          `Awaiting verification: ${pendingVerification}\nVerified: ${verifiedPharmacies}\nSuspended: ${suspendedPharmacies}\n` +
          `Governance source: ${(dashboardVerificationQueue || []).length > 0 ? 'dashboard queue + registry state' : 'registry state'}\n\n` +
          `Verification queue preview:\n${queuePreview || 'No pending queue rows.'}`
      },
      {
        head: 'Algorithm Stewardship — Ranking Weights',
        body:
          `Active ranking profile: ${l3?.active_ranking_profile || l3?.active_ranking_profile_label || 'urban_default'}\n` +
          `${weightRows}\n\nTop pharmacy ranking preview:\n${rankingPreview || 'No ranking rows available.'}`
      },
      {
        head: 'Chatbot Audit — Flagged Conversations',
        body:
          `Flagged conversations (current snapshot): ${flaggedChats}\n` +
          `Audit readiness: ${flaggedChats > 0 ? 'Review required' : 'No immediate review backlog'}\n\n` +
          `Preview:\n${auditPreview || 'No flagged conversations in current page.'}`
      },
      {
        head: 'Recent Registrations and Action Plan',
        body:
          `Recent registrations:\n${recentRegs || 'N/A'}\n\n` +
          'Action plan:\n1) Clear pending verification queue daily.\n2) Reduce pending request ratio by prioritizing oldest cases.\n3) Track top medicine demand for stock planning.\n4) Review flagged chatbot threads and close safety actions.\n5) Re-generate this report in 24 hours to compare trend movement.'
      }
    ] : [
      {
        head: 'Executive Summary',
        body: `This report covers "${title}" with ${visibleCount} visible data points captured at export time. Current system load shows ${requestStats.total} total requests, ${requestStats.pending} pending (${pendingRate}), and ${respondedCount} responded (${respondedRate}). The data reflects the live admin dashboard state at generation time and should be used as a decision-support snapshot for operations, demand planning, and safety governance.`
      },
      {
        head: 'Operations Performance',
        body: `Request trend monitoring indicates a peak bucket of ${monthlyPeak.toLocaleString()} requests in the current view window, with a current-period value of ${monthlyLatest.toLocaleString()} (${trendDirection} against an average of ${monthlyAvg.toLocaleString()}). Pending pharmacy verifications are ${pendingVerification}, with ${verifiedPharmacies} verified and ${suspendedPharmacies} suspended in the registry totals. Throughput focus should prioritize same-day handling for newly queued verification entries and aging pending requests to avoid compounding backlog risk.`
      },
      {
        head: 'Geographic and Demand Signals',
        body: `Highest observed regional demand appears in ${topRegion}. Top medicine search interest is currently "${topMedicine}". This combination suggests immediate inventory planning opportunities in high-volume corridors, including demand-led stocking of the top searched medicines and branch-level availability checks where demand concentration is highest. If this demand pattern persists in upcoming snapshots, consider temporary stock buffers and targeted pharmacy outreach in the top region.`
      },
      {
        head: 'Risk and Quality Monitoring',
        body: `Chatbot monitoring currently flags ${flaggedChats} conversation(s). This indicates active safety-review workload and a need for structured triage. Recommended quality workflow: (1) review high-risk conversations first, (2) classify issue types (clinical ambiguity, dosage guidance, emergency intent), (3) document remediation actions, and (4) confirm policy alignment in subsequent conversation samples.`
      },
      {
        head: 'Priority Action Plan (Next 7 Days)',
        body:
          '1) Reduce pending request ratio by focusing on oldest open requests first and enforcing response SLA ownership by shift.\n2) Clear verification backlog through daily queue triage with explicit approval/suspension decision logs.\n3) Review top-demand medicine availability in high-volume regions and monitor stockout exceptions daily.\n4) Run chatbot flagged-conversation review twice weekly and track issue recurrence trends.\n5) Re-run this report after interventions and compare trend deltas to validate impact.'
      },
      {
        head: 'System Outlook (Next Reporting Window)',
        body:
          'If pending queues are reduced and verification throughput improves, system responsiveness and patient confidence should improve in the next cycle. If pending ratios remain elevated, risk shifts toward delayed fulfillment and user churn in peak-demand regions. Maintain daily operational review for requests, weekly governance review for verification, and continuous chatbot safety audit to stabilize service quality.'
      }
    ]

    const sectionsToMarkdown = (rows) =>
      rows
        .map((s) => `## ${String(s?.head || 'Section').trim()}\n\n${String(s?.body || '').trim()}`)
        .join('\n\n')

    const normalizeReportMarkdown = (text) => {
      const src = String(text || '').replace(/\r\n?/g, '\n').trim()
      if (!src) return ''
      const hasHeading = /^#{1,6}\s+\S+/m.test(src)
      const hasList = /^(?:\s*[-*]\s+\S+|\s*\d+\.\s+\S+)/m.test(src)
      const hasTable = /^\s*\|.+\|\s*$/m.test(src)
      if (hasHeading && (hasList || hasTable)) return src
      return [
        '## Executive Summary',
        '',
        src,
        '',
        '## Key Findings',
        '',
        '- Review key KPI movements from this reporting window.',
        '- Confirm backlog, verification, and safety trends.',
        '',
        '## Actions',
        '',
        '- Prioritize highest-risk and oldest pending items first.',
        '- Re-run this report after interventions and compare deltas.'
      ].join('\n')
    }

    let aiNarrative = ''
    try {
      const snapshot = {
        active_tab: activeTab,
        title,
        visible_count: visibleCount,
        kpis: {
          requests_total: requestStats.total,
          requests_pending: requestStats.pending,
          requests_responded: respondedCount,
          pending_rate: pendingRate,
          avg_response: avgResponseDisplay,
          uptime: uptimeDisplay,
          active_users: activeUsersDisplay,
          pharmacies_total: registryMetrics.total,
          pharmacies_pending_verification: pendingVerification,
          chatbot_flagged: flaggedChats
        },
        trends: {
          latest: monthlyLatest,
          average: monthlyAvg,
          peak: monthlyPeak,
          top_region: topRegion,
          top_medicine: topMedicine
        },
        previews: {
          verification_queue: queuePreview,
          ranking: rankingPreview,
          chatbot_audit: auditPreview,
          recent_registrations: recentRegs
        }
      }
      const ai = await generateAdminReportNarrative({
        report_type: activeTab === 'overview' ? 'system_overview' : 'tab_snapshot',
        title,
        timeframe: activityRange === '30d' ? 'last_30_days' : 'last_7_days',
        tone: 'executive',
        dashboard_snapshot: snapshot,
        custom_instruction:
          'Return STRICT Markdown only (no HTML). Include these sections exactly: ## Executive Summary, ## Key Findings, ## KPI Snapshot, ## Risks, ## Actions. Under Key Findings include at least 5 bullet points. Include a Markdown table under KPI Snapshot with columns | Metric | Value | Trend |.'
      })
      aiNarrative = normalizeReportMarkdown(ai?.narrative)
    } catch {
      aiNarrative = ''
    }

    const readCssVar = (name, fallback) => {
      try {
        const root = document?.documentElement
        if (!root) return fallback
        const val = getComputedStyle(root).getPropertyValue(name).trim()
        return val || fallback
      } catch {
        return fallback
      }
    }
    const toRgb = (value, fallback) => {
      const s = String(value || '').trim()
      const hex = s.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i)
      if (hex) {
        let h = hex[1]
        if (h.length === 3) h = h.split('').map((c) => c + c).join('')
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
      }
      const rgb = s.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      return fallback
    }
    const theme = {
      brand: toRgb(readCssVar('--teal-dark', '#0f766e'), [15, 118, 110]),
      accent: toRgb(readCssVar('--teal', '#0d9488'), [13, 148, 136]),
      text: toRgb(readCssVar('--text', '#1e293b'), [30, 41, 59]),
      muted: toRgb(readCssVar('--muted', '#64748b'), [100, 116, 139]),
      border: toRgb(readCssVar('--border', '#e2e8f0'), [226, 232, 240]),
      light: toRgb(readCssVar('--teal-light', '#f0fdfa'), [240, 253, 250])
    }

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const pageBottom = pageHeight - 44
    const margin = 42
    const contentWidth = pageWidth - margin * 2
    let y = margin
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(theme.brand[0], theme.brand[1], theme.brand[2])
    doc.text(title, margin, y)
    y += 20
    doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2])
    doc.line(margin, y - 8, margin + contentWidth, y - 8)
    doc.setFontSize(10)
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2])
    doc.text(`Generated: ${now.toLocaleString()}`, margin, y)
    y += 18
    doc.setTextColor(theme.text[0], theme.text[1], theme.text[2])
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('AI-written detailed report', margin, y)
    y += 18

    const writeWrapped = (text, fontSize = 11, lineGap = 14, options = {}) => {
      const indent = Number(options.indent) || 0
      const isBold = options.bold === true
      const color = Array.isArray(options.color) ? options.color : theme.text
      doc.setFont('helvetica', isBold ? 'bold' : 'normal')
      doc.setTextColor(color[0], color[1], color[2])
      doc.setFontSize(fontSize)
      const lines = doc.splitTextToSize(text, Math.max(120, contentWidth - indent))
      for (const line of lines) {
        if (y > pageBottom) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin + indent, y)
        y += lineGap
      }
    }

    const cellTextFromMarked = (cell) => {
      if (cell == null) return ''
      if (typeof cell === 'string') return cell.trim()
      if (typeof cell.text === 'string') return cell.text.trim()
      if (typeof cell.raw === 'string') return cell.raw.trim()
      return String(cell).trim()
    }

    const writeMarkdownTable = (tableToken) => {
      const headerCellsRaw = Array.isArray(tableToken?.header) ? tableToken.header : []
      const bodyRowsRaw = Array.isArray(tableToken?.rows) ? tableToken.rows : []
      const headerCells = headerCellsRaw.map((c) => cellTextFromMarked(c))
      const bodyRows = bodyRowsRaw.map((row) =>
        (Array.isArray(row) ? row : []).map((c) => cellTextFromMarked(c))
      )
      const colCount = Math.max(
        headerCells.length,
        bodyRows.reduce((m, row) => Math.max(m, row.length), 0)
      )
      if (!colCount) return

      const usableWidth = contentWidth
      const colGap = 8
      const colWidth = (usableWidth - (colCount - 1) * colGap) / colCount
      const drawRow = (rowValues, bold = false) => {
        const normalized = Array.from({ length: colCount }, (_, i) => String(rowValues[i] || '').trim())
        const wrappedByCol = normalized.map((txt) => doc.splitTextToSize(txt || ' ', Math.max(60, colWidth - 4)))
        const rowLineCount = Math.max(1, ...wrappedByCol.map((lines) => lines.length))
        const rowHeight = rowLineCount * 12 + 8
        if (y + rowHeight > pageBottom) {
          doc.addPage()
          y = margin
        }

        if (bold) {
          doc.setFillColor(theme.light[0], theme.light[1], theme.light[2])
          doc.rect(margin - 2, y - 2, usableWidth + 4, rowHeight, 'F')
        }
        doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2])
        doc.rect(margin - 2, y - 2, usableWidth + 4, rowHeight)
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setFontSize(10)
        doc.setTextColor(theme.text[0], theme.text[1], theme.text[2])
        for (let ci = 0; ci < colCount; ci += 1) {
          const x = margin + ci * (colWidth + colGap)
          const lines = wrappedByCol[ci]
          doc.text(lines, x, y + 10)
        }
        y += rowHeight
      }

      drawRow(headerCells, true)
      y += 2
      for (const row of bodyRows) drawRow(row, false)
      y += 6
    }

    const writeMarkdown = (markdownText) => {
      const source = String(markdownText || '').replace(/\r\n?/g, '\n').trim()
      if (!source) return
      let tokens = []
      try {
        tokens = marked.lexer(source)
      } catch {
        writeWrapped(source, 11, 14)
        return
      }
      for (const token of tokens) {
        if (!token || typeof token !== 'object') continue
        if (token.type === 'space') {
          y += 6
          continue
        }
        if (token.type === 'heading') {
          const level = Number(token.depth) || 2
          const size = level <= 1 ? 16 : level === 2 ? 14 : 12
          writeWrapped(String(token.text || '').trim(), size, 16, { bold: true, color: theme.brand })
          y += 4
          doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2])
          doc.line(margin, y - 3, margin + contentWidth, y - 3)
          y += 5
          continue
        }
        if (token.type === 'paragraph') {
          writeWrapped(String(token.text || '').trim(), 11, 15)
          y += 6
          continue
        }
        if (token.type === 'list') {
          const items = Array.isArray(token.items) ? token.items : []
          for (let i = 0; i < items.length; i += 1) {
            const item = items[i]
            const marker = token.ordered ? `${i + 1}. ` : '• '
            writeWrapped(`${marker}${String(item?.text || '').trim()}`, 11, 14, { indent: 10 })
          }
          y += 5
          continue
        }
        if (token.type === 'table') {
          writeMarkdownTable(token)
          continue
        }
        if (token.type === 'blockquote') {
          const quoteLines = String(token.text || '')
            .split('\n')
            .map((ln) => ln.trim())
            .filter(Boolean)
          doc.setDrawColor(201, 210, 224)
          const qTop = y - 2
          for (const ln of quoteLines) writeWrapped(ln, 11, 14, { indent: 16, color: theme.muted })
          doc.line(margin + 8, qTop, margin + 8, y - 4)
          y += 4
          continue
        }
        if (token.type === 'code') {
          const codeLines = String(token.text || '')
            .split('\n')
            .map((ln) => ln.trimEnd())
          for (const ln of codeLines) writeWrapped(ln || ' ', 10, 12, { indent: 10 })
          y += 4
          continue
        }
        const raw = String(token.raw || token.text || '').trim()
        if (raw) writeWrapped(raw, 11, 14)
      }
    }

    if (aiNarrative) {
      writeMarkdown(aiNarrative)
    } else {
      writeMarkdown(sectionsToMarkdown(sections))
    }
    const pageCount = doc.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page)
      doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2])
      doc.line(margin, 28, margin + contentWidth, 28)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(theme.brand[0], theme.brand[1], theme.brand[2])
      doc.text('MediConnect', margin, 22)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2])
      doc.text(String(title).slice(0, 80), margin + 64, 22)
      doc.line(margin, pageHeight - 26, margin + contentWidth, pageHeight - 26)
      doc.setFontSize(9)
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 14, { align: 'right' })
    }

    doc.save(`${activeTab || 'dashboard'}-report-${now.toISOString().slice(0, 10)}.pdf`)
  }

  const handleExportCsv = () => {
    setError('')
    const ok = exportCurrentViewCsv()
    if (!ok) setError('CSV export is available for data-list pages only.')
  }

  const handleExportReport = async () => {
    setError('')
    setExportBusy(true)
    try {
      await exportCurrentViewReportPdf()
    } catch (e) {
      setError(e?.message || 'Report export failed')
    } finally {
      setExportBusy(false)
    }
  }

  const pharmacyRowApiStatus = (p) => {
    const vs = String(p?.verification_status || p?.status || '').toLowerCase()
    if (vs === 'suspended') return 'suspended'
    if (vs === 'pending_review' || vs === 'pending') return 'pending_review'
    return 'verified'
  }

  const applyPharmacyRegistryStatus = async (pharmacyId, next) => {
    if (!pharmacyId) return
    setPharmacyRegistrySavingId(String(pharmacyId))
    setError('')
    try {
      const patch =
        next === 'suspended'
          ? { verification_status: 'suspended', is_active: false }
          : next === 'pending_review'
            ? { verification_status: 'pending_review', is_active: true }
            : { verification_status: 'verified', is_active: true }
      await updateAdminPharmacy(pharmacyId, patch)
      await fetchDashboard({ silent: true })
    } catch (e) {
      setError(e?.message || 'Could not update pharmacy status.')
    } finally {
      setPharmacyRegistrySavingId(null)
    }
  }

  const openRegisterPharmacyModal = () => {
    setRegisterPharmacyForm({
      pharmacy_id: '',
      name: '',
      address: '',
      latitude: '',
      longitude: '',
      phone: '',
      email: ''
    })
    setRegisterPharmacyModalOpen(true)
  }

  const closeRegisterPharmacyModal = () => {
    if (registerSaving) return
    setRegisterPharmacyModalOpen(false)
  }

  const handleRegisterPharmacySubmit = async (e) => {
    e.preventDefault()
    const pharmacyId = registerPharmacyForm.pharmacy_id.trim()
    const name = registerPharmacyForm.name.trim()
    const address = registerPharmacyForm.address.trim()
    if (pharmacyId.length < 3 || !name || !address) return

    const latRaw = registerPharmacyForm.latitude.trim()
    const lonRaw = registerPharmacyForm.longitude.trim()
    const latitude = latRaw === '' ? null : Number(latRaw)
    const longitude = lonRaw === '' ? null : Number(lonRaw)
    if (latRaw !== '' && !Number.isFinite(latitude)) {
      setError('Latitude must be a valid number.')
      return
    }
    if (lonRaw !== '' && !Number.isFinite(longitude)) {
      setError('Longitude must be a valid number.')
      return
    }

    const body = {
      pharmacy_id: pharmacyId,
      name,
      address,
      phone: registerPharmacyForm.phone.trim() || '',
      email: registerPharmacyForm.email.trim() || ''
    }
    if (latitude != null) body.latitude = latitude
    if (longitude != null) body.longitude = longitude

    setRegisterSaving(true)
    setError('')
    try {
      await createAdminPharmacy(body)
      await fetchDashboard({ silent: true })
      setRegisterPharmacyModalOpen(false)
      setRegisterPharmacyForm({
        pharmacy_id: '',
        name: '',
        address: '',
        latitude: '',
        longitude: '',
        phone: '',
        email: ''
      })
    } catch (err) {
      setError(err?.message || 'Could not register pharmacy')
    } finally {
      setRegisterSaving(false)
    }
  }

  useEffect(() => {
    if (!registerPharmacyModalOpen) return
    const onKey = (ev) => {
      if (ev.key === 'Escape' && !registerSaving) setRegisterPharmacyModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [registerPharmacyModalOpen, registerSaving])

  useEffect(() => {
    const role = localStorage.getItem('userRole')
    if (role !== 'admin') {
      navigate('/login')
      return
    }
    dedupedGetAdminMe()
    fetchDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (hasHydratedFullDashboard) return
    const id = setTimeout(() => {
      fetchDashboard({ silent: true, full: true })
    }, 450)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydratedFullDashboard])

  useEffect(() => {
    const id = setInterval(
      () => setClockStr(new Date().toLocaleTimeString('en-GB', { hour12: false })),
      1000
    )
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const t = searchParams.get('tab')
    const legacy = {
      chatbot: 'chatbot-audit',
      'command-center': 'algorithm-stewardship',
      watchlist: 'overview',
      'impact-analytics': 'overview',
      'equity-report': 'overview',
      'search-analytics': 'overview',
      'system-health': 'layer1-system',
      'geographic-heatmap': 'layer1-system',
      'sla-monitoring': 'layer1-system',
      'weight-tuning': 'algorithm-stewardship',
      'ranking-profiles': 'algorithm-stewardship',
      'content-policy': 'algorithm-stewardship',
      medicines: 'overview',
      settings: 'overview',
      audit: 'overview'
    }
    if (t && legacy[t]) {
      setSearchParams({ tab: legacy[t] }, { replace: true })
      setActiveTab(legacy[t])
      return
    }
    if (t && ADMIN_DASHBOARD_TAB_IDS.has(t)) {
      setActiveTab(t)
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const id = setTimeout(() => {
      setUsersListSearch(usersListSearchIn.trim())
      setUsersListPage(1)
    }, 400)
    return () => clearTimeout(id)
  }, [usersListSearchIn])

  useEffect(() => {
    const id = setTimeout(() => {
      setPatientsListSearch(patientsListSearchIn.trim())
      setPatientsListPage(1)
    }, 400)
    return () => clearTimeout(id)
  }, [patientsListSearchIn])

  useEffect(() => {
    const id = setTimeout(() => {
      setChatbotLogsSearch(chatbotLogsSearchIn.trim())
      setChatbotLogsPage(1)
    }, 400)
    return () => clearTimeout(id)
  }, [chatbotLogsSearchIn])

  useEffect(() => {
    const id = setTimeout(() => {
      setChatbotLogsSessionFilter(chatbotLogsSessionFilterIn.trim())
      setChatbotLogsPage(1)
    }, 400)
    return () => clearTimeout(id)
  }, [chatbotLogsSessionFilterIn])

  useEffect(() => {
    if (activeTab !== 'users') return
    let cancelled = false
    setUsersListLoading(true)
    setUsersListError('')
    getAdminUsersList({
      page: usersListPage,
      pageSize: ADMIN_LIST_PAGE_SIZE,
      search: usersListSearch
    })
      .then((data) => {
        if (cancelled) return
        const { results, count } = normalizeAdminPaginatedResponse(data)
        setUsersList(results)
        setUsersListTotal(count)
      })
      .catch((e) => {
        if (!cancelled) setUsersListError(e?.message || 'Failed to load users')
      })
      .finally(() => {
        if (!cancelled) setUsersListLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, usersListPage, usersListSearch])

  useEffect(() => {
    if (activeTab !== 'users') return
    let cancelled = false
    setPatientsListLoading(true)
    setPatientsListError('')
    getAdminPatientsList({
      page: patientsListPage,
      pageSize: ADMIN_LIST_PAGE_SIZE,
      search: patientsListSearch
    })
      .then((data) => {
        if (cancelled) return
        const { results, count } = normalizeAdminPaginatedResponse(data)
        setPatientsList(results)
        setPatientsListTotal(count)
      })
      .catch((e) => {
        if (!cancelled) setPatientsListError(e?.message || 'Failed to load patients list')
      })
      .finally(() => {
        if (!cancelled) setPatientsListLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, patientsListPage, patientsListSearch])

  useEffect(() => {
    if (
      activeTab !== 'overview' &&
      activeTab !== 'chatbot' &&
      activeTab !== 'chatbot-audit' &&
      activeTab !== 'command-center' &&
      activeTab !== 'weight-tuning' &&
      activeTab !== 'ranking-profiles' &&
      activeTab !== 'content-policy'
    )
      return
    const ac = new AbortController()
    let cancelled = false
    const deferredForOverview = activeTab === 'overview'
    const startDelayMs = deferredForOverview ? 800 : 0
    setChatbotLogsLoading(true)
    setChatbotLogsError('')
    const kick = setTimeout(() => {
      getAdminChatbotLogs({
        page: activeTab === 'overview' ? 1 : chatbotLogsPage,
        pageSize: ADMIN_LIST_PAGE_SIZE,
        search: activeTab === 'overview' ? '' : chatbotLogsSearch,
        sessionId: activeTab === 'overview' ? '' : chatbotLogsSessionFilter,
        signal: ac.signal
      })
        .then((data) => {
          if (cancelled) return
          const { results, count } = normalizeAdminPaginatedResponse(data)
          setChatbotLogs(results)
          setChatbotLogsTotal(count)
        })
        .catch((e) => {
          if (cancelled || e?.name === 'AbortError') return
          setChatbotLogsError(e?.message || 'Failed to load chatbot logs')
        })
        .finally(() => {
          if (ac.signal.aborted) {
            setChatbotLogsLoading(false)
            return
          }
          if (!cancelled) {
            setChatbotLogsLoading(false)
            setChatbotLogsHasLoaded(true)
          }
        })
    }, startDelayMs)
    return () => {
      cancelled = true
      clearTimeout(kick)
      ac.abort()
    }
  }, [activeTab, chatbotLogsPage, chatbotLogsSearch, chatbotLogsSessionFilter])

  const openChatbotFromCommandCenter = useCallback(
    (cid) => {
      selectTab('chatbot-audit')
      setSelectedConversationId(String(cid))
      setChatbotTranscriptDrawerOpen(true)
    },
    [selectTab]
  )

  const closeChatbotTranscriptDrawer = useCallback(() => {
    setChatbotTranscriptDrawerOpen(false)
    setSelectedConversationId('')
    setChatbotTranscript(null)
    setChatbotTranscriptError('')
  }, [])

  const commandCenterTabs = useMemo(
    () => new Set(['command-center', 'weight-tuning', 'ranking-profiles', 'content-policy']),
    []
  )

  useEffect(() => {
    if (activeTab !== 'chatbot' && activeTab !== 'chatbot-audit') {
      setChatbotTranscriptDrawerOpen(false)
      setChatbotTranscript(null)
      setChatbotTranscriptError('')
      if (!commandCenterTabs.has(activeTab)) {
        setSelectedConversationId('')
      }
      return
    }
    if (!selectedConversationId) {
      setChatbotTranscript(null)
      setChatbotTranscriptLoading(false)
      setChatbotTranscriptError('')
      return
    }
    let cancelled = false
    setChatbotTranscriptLoading(true)
    setChatbotTranscriptError('')
    getAdminChatbotConversationLogs(selectedConversationId)
      .then((d) => {
        if (!cancelled) setChatbotTranscript(d)
      })
      .catch((e) => {
        if (!cancelled) {
          setChatbotTranscriptError(e?.message || 'Failed to load transcript')
          setChatbotTranscript(null)
        }
      })
      .finally(() => {
        if (!cancelled) setChatbotTranscriptLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, selectedConversationId, commandCenterTabs])

  useEffect(() => {
    if (!chatbotTranscriptDrawerOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeChatbotTranscriptDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chatbotTranscriptDrawerOpen, closeChatbotTranscriptDrawer])

  useEffect(() => {
    if (!chatbotTranscriptDrawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [chatbotTranscriptDrawerOpen])

  const requestStats = useMemo(() => {
    const fromBreakdownPending = sumRequestStatusBucket(requestsByStatus, ADMIN_OPEN_REQUEST_STATUSES)
    const fromBreakdownTerminal =
      (Number(requestsByStatus?.completed) || 0) + (Number(requestsByStatus?.responses_received) || 0)
    const totalFromBreakdown = sumAllRequestStatuses(requestsByStatus)

    if (overview && typeof overview === 'object') {
      const total =
        overview.total_patient_requests != null
          ? Number(overview.total_patient_requests)
          : overview.total_requests != null
            ? Number(overview.total_requests)
            : totalFromBreakdown > 0
              ? totalFromBreakdown
              : allRequests.length
      const pending =
        fromBreakdownPending > 0
          ? fromBreakdownPending
          : Number(overview.awaiting_responses_requests) ||
            Number(overview.pending_requests) ||
            Number(overview.requests_pending) ||
            0
      const responded =
        fromBreakdownTerminal > 0
          ? fromBreakdownTerminal
          : Number(overview.completed_requests) ||
            Number(overview.responded_requests) ||
            Number(overview.requests_responded) ||
            0
      return { total: Number.isFinite(total) ? total : allRequests.length, pending, responded }
    }
    const total = allRequests.length
    const pending = allRequests.filter((r) => {
      const status = String(r?.status || '').toLowerCase()
      return (
        ADMIN_OPEN_REQUEST_STATUSES.includes(status) || status === 'pending' || status === 'sent'
      )
    }).length
    const responded = allRequests.filter((r) => {
      const status = String(r?.status || '').toLowerCase()
      return status === 'completed' || status === 'responded' || status === 'responses_received'
    }).length
    return { total, pending, responded }
  }, [allRequests, overview, requestsByStatus])

  const activeReservationsTotal = useMemo(() => {
    if (overview && typeof overview === 'object' && overview.active_reservations != null) {
      const n = Number(overview.active_reservations)
      if (Number.isFinite(n)) return n
    }
    return allReservations.filter((r) => {
      const status = String(r?.status || '').toLowerCase()
      return status === 'pending' || status === 'confirmed'
    }).length
  }, [allReservations, overview])

  const logout = async () => {
    await adminLogoutRequest()
    localStorage.removeItem('token')
    localStorage.removeItem('userRole')
    localStorage.removeItem('admin')
    navigate('/')
  }

  const perPharmacyRows = useMemo(() => {
    const norm = (v) => String(v || '').trim().toLowerCase()
    const rows = pharmacies.map((ph, idx) => {
      const pId = ph?.pharmacy_id ?? ph?.id
      const pName = ph?.pharmacy_name || ph?.name || `Pharmacy ${idx + 1}`
      const keys = new Set([norm(pId), norm(pName)].filter(Boolean))

      const belongsToPharmacy = (item, candidates) => {
        const itemKeys = candidates.map((k) => norm(item?.[k])).filter(Boolean)
        return itemKeys.some((k) => keys.has(k))
      }

      const pharmacyPharmacists = pharmacists.filter((item) =>
        belongsToPharmacy(item, ['pharmacy_id', 'pharmacy', 'pharmacy_name', 'pharmacy_label'])
      )

      const pharmacyReservations = allReservations.filter((item) =>
        belongsToPharmacy(item, ['pharmacy_id', 'pharmacy', 'pharmacy_name'])
      )

      const pharmacyRequests = allRequests.filter((item) =>
        belongsToPharmacy(item, ['pharmacy_id', 'pharmacy', 'pharmacy_name', 'best_pharmacy_name'])
      )

      const pendingRequests = pharmacyRequests.filter((req) => {
        const status = String(req?.status || '').toLowerCase()
        return status === 'pending' || status === 'sent' || status === 'broadcasting'
      }).length

      const activeReservations = pharmacyReservations.filter((res) => {
        const status = String(res?.status || '').toLowerCase()
        return status === 'pending' || status === 'confirmed'
      }).length

      const ratingNum = Number(ph?.rating ?? ph?.pharmacy_rating)
      const matchRateNum = Number(ph?.match_rate)
      const responseRateRaw = Number(ph?.response_rate)
      const responseRateNum = Number.isFinite(matchRateNum)
        ? matchRateNum
        : Number.isFinite(responseRateRaw)
          ? responseRateRaw
          : null
      const needsAttention =
        pendingRequests > 0 ||
        activeReservations > 3 ||
        (Number.isFinite(ratingNum) && ratingNum > 0 && ratingNum < 3.5) ||
        (Number.isFinite(responseRateNum) && responseRateNum < 50)

      return {
        ...ph,
        __id: pId || `ph-${idx}`,
        __name: pName,
        pharmacists: pharmacyPharmacists,
        reservations: pharmacyReservations,
        requests: pharmacyRequests,
        pendingRequests,
        activeReservations,
        ratingNum: Number.isFinite(ratingNum) ? ratingNum : null,
        responseRateNum: Number.isFinite(responseRateNum) ? responseRateNum : null,
        needsAttention
      }
    })

    return rows
  }, [pharmacies, pharmacists, allReservations, allRequests])

  const getRequestDayKey = (req) => {
    const raw = req?.created_at || req?.submitted_at || req?.updated_at
    if (!raw) return null
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }

  const mergedSearchVolume = useMemo(() => {
    const w = mediBotOverview?.widgets?.search_volume
    const a = searchVolumeAnalytics && typeof searchVolumeAnalytics === 'object' ? searchVolumeAnalytics : null
    if (!w || typeof w !== 'object') return a

    /** Dedicated `/admin/analytics/search-volume/` payload should win over `widgets.search_volume` when populated. */
    const pickNonEmptyArray = (fromAnalytics, ...fromWidget) => {
      if (Array.isArray(fromAnalytics) && fromAnalytics.length > 0) return fromAnalytics
      for (const cand of fromWidget) {
        if (Array.isArray(cand) && cand.length > 0) return cand
      }
      return Array.isArray(fromAnalytics) ? fromAnalytics : fromWidget.find((x) => Array.isArray(x))
    }

    const numOr = (primary, ...fallbacks) => {
      if (primary != null && Number.isFinite(Number(primary))) return Number(primary)
      for (const f of fallbacks) {
        if (f != null && Number.isFinite(Number(f))) return Number(f)
      }
      return undefined
    }

    return {
      ...a,
      days: a?.days ?? w.days,
      requests_by_day: pickNonEmptyArray(a?.requests_by_day, w.requests_by_day, w.by_day),
      top_medicines: pickNonEmptyArray(a?.top_medicines, w.top_medicines, w.top_searches),
      top_regions: pickNonEmptyArray(a?.top_regions, w.top_regions, w.by_region),
      total_requests_in_window: numOr(a?.total_requests_in_window, w.total_requests_in_window),
      zero_result_requests: numOr(a?.zero_result_requests, w.zero_result_requests),
      zero_result_rate: numOr(a?.zero_result_rate, w.zero_result_rate)
    }
  }, [mediBotOverview, searchVolumeAnalytics])

  const requestActivitySeries = useMemo(() => {
    const days = activityRange === '30d' ? 30 : 7
    const labels = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      labels.push(d.toISOString().slice(0, 10))
    }
    const labelShort = (iso) => {
      const [y, m, day] = iso.split('-').map(Number)
      const dt = new Date(y, m - 1, day)
      return activityRange === '30d'
        ? `${dt.getMonth() + 1}/${dt.getDate()}`
        : dt.toLocaleDateString(undefined, { weekday: 'narrow' })
    }

    const byDay = mergedSearchVolume?.requests_by_day
    if (Array.isArray(byDay) && byDay.length > 0) {
      const map = new Map()
      byDay.forEach((row) => {
        const key = String(row?.date ?? row?.day ?? '').slice(0, 10)
        const val = Number(row?.count ?? row?.requests ?? row?.total)
        if (key) map.set(key, Number.isFinite(val) ? val : 0)
      })
      const counts = labels.map((iso) => map.get(iso) ?? 0)
      const max = Math.max(...counts, 1)
      return { labels, counts, max, labelShort, source: 'api' }
    }

    const counts = labels.map(() => 0)
    allRequests.forEach((r) => {
      const k = getRequestDayKey(r)
      if (k) {
        const idx = labels.indexOf(k)
        if (idx >= 0) counts[idx] += 1
      }
    })
    const max = Math.max(...counts, 1)
    return { labels, counts, max, labelShort, source: 'local' }
  }, [allRequests, activityRange, mergedSearchVolume])

  const platformUsersCount = useMemo(() => {
    if (overview && typeof overview === 'object' && overview.total_users != null) {
      return Number(overview.total_users) || 0
    }
    if (usersListTotal != null) return Number(usersListTotal) || 0
    return 0
  }, [overview, usersListTotal])

  const platformSessionsCount = useMemo(() => {
    if (overview && typeof overview === 'object' && overview.total_patients != null) {
      return Number(overview.total_patients) || 0
    }
    if (patientsListTotal != null) return Number(patientsListTotal) || 0
    return 0
  }, [overview, patientsListTotal])

  const usersApproxCount = useMemo(() => {
    if (platformUsersCount > 0) return platformUsersCount
    if (platformSessionsCount > 0) return platformSessionsCount
    return pharmacists.length + allRequests.length
  }, [platformUsersCount, platformSessionsCount, pharmacists.length, allRequests.length])

  const pharmacyRegistryCount =
    overview?.registered_pharmacies ?? overview?.total_pharmacies ?? pharmacies.length
  const pharmacistRegistryCount =
    overview?.registered_pharmacists ?? overview?.total_pharmacists ?? pharmacists.length
  const reservationsTotal = overview?.total_reservations ?? allReservations.length

  const topMedicineTopics = useMemo(() => {
    const fromAnalytics = topMedicineBarRowsFromSearchVolume(mergedSearchVolume?.top_medicines)
    if (fromAnalytics) return fromAnalytics
    const map = new Map()
    allRequests.forEach((r) => {
      const names = Array.isArray(r.medicine_names)
        ? r.medicine_names
        : r.medicine_name
          ? [r.medicine_name]
          : []
      names.forEach((raw) => {
        const name = String(raw || '').trim()
        if (!name) return
        map.set(name, (map.get(name) || 0) + 1)
      })
    })
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    const max = entries.length ? entries[0][1] : 1
    return entries.map(([name, c]) => ({ name, c, widthPct: Math.min(100, Math.round((c / max) * 100)) }))
  }, [allRequests, mergedSearchVolume])

  const topRegionTopics = useMemo(() => {
    const apiTop = mergedSearchVolume?.top_regions
    if (!Array.isArray(apiTop) || apiTop.length === 0) return []
    const rows = apiTop
      .map((item) => {
        const label = String(
          item?.label ?? item?.city ?? item?.geo_region ?? item?.name ?? ''
        ).trim()
        const key = String(item?.region ?? item?.key ?? item?.bucket ?? '').trim()
        const name = label || displayLabelForAnalyticsGeoRegionKey(key) || key
        const c = Number(item?.count ?? item?.volume ?? item?.requests ?? 0)
        return name
          ? {
              name,
              key: key || name,
              bucketTitle: key && key !== name ? `${name} (bucket ${key})` : name,
              c: Number.isFinite(c) ? c : 0
            }
          : null
      })
      .filter(Boolean)
    const max = rows.length ? Math.max(...rows.map((r) => r.c)) : 1
    return rows.slice(0, 10).map((r) => ({
      ...r,
      widthPct: Math.min(100, Math.round((r.c / max) * 100))
    }))
  }, [mergedSearchVolume])

  const loadInventoryReports = useCallback(async () => {
    setInventoryReportsLoading(true)
    const rows = perPharmacyRows
    const results = await Promise.all(
      rows.map(async (row) => {
        const phId = row.__id
        const phName = row.__name
        const staff = row.pharmacists?.[0]
        const pharmacistId = staff?.pharmacist_id ?? staff?.id
        if (!pharmacistId) {
          return {
            pharmacyId: phId,
            pharmacyName: phName,
            pharmacistId: null,
            summary: null,
            items: [],
            error: 'no_pharmacist'
          }
        }
        try {
          const data = await getPharmacistInventory(String(pharmacistId), { credentials: 'include' })
          return {
            pharmacyId: phId,
            pharmacyName: phName,
            pharmacistId: String(pharmacistId),
            summary: data?.summary ?? null,
            items: Array.isArray(data?.items) ? data.items : [],
            error: null
          }
        } catch (e) {
          return {
            pharmacyId: phId,
            pharmacyName: phName,
            pharmacistId: String(pharmacistId),
            summary: null,
            items: [],
            error: e?.message || 'fetch_failed'
          }
        }
      })
    )
    setInventoryReportsByPharmacy(results)
    setInventoryReportsLoading(false)
  }, [perPharmacyRows])

  useEffect(() => {
    if (activeTab !== 'inventory') return
    loadInventoryReports()
  }, [activeTab, loadInventoryReports])

  const visibleInventoryReports = useMemo(() => {
    const q = inventoryReportSearch.trim().toLowerCase()
    if (!q) return inventoryReportsByPharmacy
    return inventoryReportsByPharmacy.filter((r) =>
      String(r.pharmacyName || '')
        .toLowerCase()
        .includes(q)
    )
  }, [inventoryReportsByPharmacy, inventoryReportSearch])

  const inventoryOverviewStats = useMemo(() => {
    let branches = inventoryReportsByPharmacy.length
    let stockLines = 0
    let inStockSum = 0
    let lowStockSum = 0
    let outStockSum = 0

    for (const r of inventoryReportsByPharmacy) {
      if (r.error) continue
      const items = Array.isArray(r.items) ? r.items : []
      stockLines += items.length
      const s = r.summary
      if (s && typeof s === 'object') {
        const nIn = Number(s.in_stock)
        const nLow = Number(s.low_stock)
        const nOut = Number(s.out_of_stock)
        if (Number.isFinite(nIn)) inStockSum += nIn
        if (Number.isFinite(nLow)) lowStockSum += nLow
        if (Number.isFinite(nOut)) outStockSum += nOut
      }
    }

    return {
      branches,
      stockLines,
      inStockSum,
      lowStockSum,
      outStockSum
    }
  }, [inventoryReportsByPharmacy])

  const pageHead = useMemo(() => {
    const subDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    const regionLine = 'MediBot Zimbabwe'
    const dataStamp =
      activeTab === 'overview' && mediBotOverview?.generated_at
        ? ` · Snapshot: ${formatMediBotGeneratedAt(mediBotOverview.generated_at)}`
        : ''
    const heads = {
      overview: { title: 'Admin Dashboard', subtitle: `${regionLine} · ${subDate}${dataStamp}` },
      'layer1-system': {
        title: 'System health, geography & latency',
        subtitle: 'Layer 1 — vital signs, regional demand, and latency trends'
      },
      'verification-queue': { title: 'Verification queue', subtitle: 'Pharmacies pending registry approval' },
      pharmacies: { title: 'All pharmacies', subtitle: `${pharmacyRegistryCount} registered` },
      'algorithm-stewardship': {
        title: 'Algorithm & content policy',
        subtitle: 'MCDA weights, ranking presets (rural, shortage, affordability), and patient disclaimer'
      },
      'chatbot-audit': { title: 'AI safety · Chatbot audit', subtitle: 'Flagged conversations and transcripts' },
      users: { title: 'Users', subtitle: 'Staff and patient directory' },
      'command-center': {
        title: 'Command center',
        subtitle: 'Redirected — use Algorithm & content policy or Chatbot audit'
      },
      inventory: { title: 'Inventory Reports', subtitle: 'Stock and sync health across branches.' },
      pharmacists: { title: 'Pharmacists', subtitle: `${pharmacistRegistryCount} registered staff` },
      requests: { title: 'Patient requests', subtitle: `${requestStats.total} in current dataset` },
      reservations: { title: 'Reservations', subtitle: `${reservationsTotal} total` },
      chatbot: { title: 'AI Chatbot Logs', subtitle: 'Conversations and transcripts from chatbot logs API.' }
    }
    return heads[activeTab] || { title: 'Admin Dashboard', subtitle: `${regionLine} · ${subDate}${dataStamp}` }
  }, [
    activeTab,
    mediBotOverview?.generated_at,
    pharmacyRegistryCount,
    pharmacistRegistryCount,
    requestStats.total,
    reservationsTotal
  ])

  /** 1 = best; same numeric score shares the same rank (competition ranking). */
  const pharmacyRankById = useMemo(() => {
    const scored = perPharmacyRows.map((p) => ({
      id: String(p.__id),
      score: rankingScoreLikePharmacyDashboardRow(p),
      name: p.__name
    }))
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return String(a.name).localeCompare(String(b.name))
    })
    const map = new Map()
    let pos = 0
    while (pos < scored.length) {
      const rank = pos + 1
      const s = scored[pos].score
      let next = pos + 1
      while (next < scored.length && scored[next].score === s) next++
      for (let k = pos; k < next; k++) {
        map.set(scored[k].id, rank)
      }
      pos = next
    }
    return map
  }, [perPharmacyRows])

  const registryMetrics = useMemo(() => {
    const s = registrySummary
    if (s && typeof s === 'object') {
      const total = Number(s.total_registered ?? s.total)
      const verified = Number(s.verified)
      const pending = Number(s.pending_review ?? s.pending ?? s.pending_count ?? s.reg_pending)
      const suspended = Number(s.suspended)
      const hasNumber = [total, verified, pending, suspended].some((n) => Number.isFinite(n))
      if (hasNumber) {
        return {
          total: Number.isFinite(total) && total >= 0 ? total : perPharmacyRows.length,
          verified: Number.isFinite(verified) ? verified : 0,
          pending: Number.isFinite(pending) ? pending : 0,
          suspended: Number.isFinite(suspended) ? suspended : 0
        }
      }
    }
    let verified = 0
    let pending = 0
    let suspended = 0
    perPharmacyRows.forEach((p) => {
      const st = getPharmacyRegistryStatus(p)
      if (st === 'suspended') suspended += 1
      else if (st === 'pending') pending += 1
      else verified += 1
    })
    return { total: perPharmacyRows.length, verified, pending, suspended }
  }, [registrySummary, perPharmacyRows])

  /** Registry column rank: `ranking-summary.leaderboard` when matched to this row; else dashboard composite rank. */
  const rankingSummaryRankByRegistryId = useMemo(() => {
    const lb = parseLeaderboardRowsFromSummary(adminPortalRankingSummary)
    const map = new Map()
    if (!lb || lb.length === 0) return map
    for (const p of perPharmacyRows) {
      const pid = String(p.__id)
      const row = lb.find(
        (r) =>
          String(r.pharmacy_id) === pid ||
          leaderboardPharmacyIdsMatch(r.pharmacy_id, pid, p.__name)
      )
      if (row && Number.isFinite(Number(row.rank))) map.set(pid, Number(row.rank))
    }
    return map
  }, [adminPortalRankingSummary, perPharmacyRows])

  const registryTableRows = useMemo(() => {
    const q = registryQuery.trim().toLowerCase()
    let rows = perPharmacyRows.map((p) => {
      const id = String(p.__id)
      return {
        ...p,
        __registryStatus: getPharmacyRegistryStatus(p),
        __rank:
          rankingSummaryRankByRegistryId.get(id) ?? pharmacyRankById.get(id) ?? null
      }
    })
    if (registryStatusFilter !== 'all') {
      rows = rows.filter((p) => p.__registryStatus === registryStatusFilter)
    }
    if (q) {
      rows = rows.filter((p) => {
        const city =
          p.location_suburb ||
          p.city ||
          String(p.address || '')
            .split(',')[0]
            .trim() ||
          ''
        const hay = `${p.__name} ${city} ${p.address || ''}`.toLowerCase()
        return hay.includes(q)
      })
    }
    rows.sort((a, b) => String(a.__name).localeCompare(String(b.__name)))
    return rows
  }, [
    perPharmacyRows,
    registryQuery,
    registryStatusFilter,
    pharmacyRankById,
    rankingSummaryRankByRegistryId
  ])

  const recentRegistrationRows = useMemo(() => {
    return perPharmacyRows.slice(0, 3).map((p) => ({
      id: p.__id,
      name: p.__name,
      type: p.pharmacy_type || p.type || 'Pharmacy',
      status: p.needsAttention ? 'Pending' : 'Active'
    }))
  }, [perPharmacyRows])

  /** Pharmacy ranking overview: only `GET …/ranking-summary/` → `leaderboard` (same as pharmacy portal). No MediBot/widget fallback. */
  const overviewPharmacyMatchRows = useMemo(() => {
    const fromPortalRankingApi = parseLeaderboardRowsFromSummary(adminPortalRankingSummary)
    if (!fromPortalRankingApi || fromPortalRankingApi.length === 0) return []
    return fromPortalRankingApi.map((row) => {
      const match = perPharmacyRows.find(
        (p) =>
          String(p.__id) === String(row.pharmacy_id) ||
          leaderboardPharmacyIdsMatch(row.pharmacy_id, String(p.__id), p.__name)
      )
      return {
        __rowKey: row.key,
        __id: String(row.pharmacy_id ?? row.key),
        __name: row.name,
        __score: row.score != null ? Math.round(row.score) : null,
        __displayRank: row.rank,
        city: match?.location_suburb || match?.city,
        location_suburb: match?.location_suburb,
        address: match?.address,
        needsAttention: match?.needsAttention ?? false
      }
    })
  }, [adminPortalRankingSummary, perPharmacyRows])

  const overviewRecentRegistrationRows = useMemo(() => {
    const w = mediBotOverview?.widgets?.recent_registrations
    if (!Array.isArray(w) || w.length === 0) return recentRegistrationRows
    return w
      .map((row, i) => {
        if (!row || typeof row !== 'object') return null
        const name = String(row.name ?? row.pharmacy_name ?? '').trim()
        if (!name) return null
        return {
          id: String(row.id ?? row.pharmacy_id ?? `rr-${i}`),
          name,
          type: String(row.type ?? row.pharmacy_type ?? 'Pharmacy'),
          status: String(row.status ?? row.registry_status ?? 'Pending')
        }
      })
      .filter(Boolean)
      .slice(0, 8)
  }, [mediBotOverview, recentRegistrationRows])

  const chatbotAuditBadgeCount = useMemo(
    () => chatbotLogs.filter(chatbotLogRowNeedsReview).length,
    [chatbotLogs]
  )

  const adminRequestsToday = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return allRequests.filter((r) => {
      const raw = r.created_at || r.submitted_at
      if (!raw) return false
      const t = new Date(raw).getTime()
      return Number.isFinite(t) && t >= start.getTime()
    }).length
  }, [allRequests])

  const systemStatus = useMemo(
    () => ({
      uptimePct:
        overview?.uptime_pct_this_month != null
          ? `${Number(overview.uptime_pct_this_month).toFixed(1)}%`
          : overview?.uptime_percent != null
            ? `${Number(overview.uptime_percent).toFixed(1)}%`
            : '99.9%',
      avgResponse:
        overview?.avg_response_time_ms != null
          ? `${(Number(overview.avg_response_time_ms) / 1000).toFixed(1)}s`
          : overview?.avg_response_time != null
            ? `${overview.avg_response_time}s`
            : '—',
      platformUsers: platformUsersCount > 0 ? platformUsersCount : '—',
      platformSessions: platformSessionsCount > 0 ? platformSessionsCount : '—',
      operational: true
    }),
    [overview, platformUsersCount, platformSessionsCount]
  )

  const adminProfile = useMemo(
    () => ({ name: 'S. Administrator', role: 'System Admin · Full access', initials: 'SA' }),
    []
  )

  const navSections = useMemo(
    () =>
      buildAdminNavSections({
        usersApproxCount,
        pharmacyRegistryCount,
        pharmacistRegistryCount,
        requestStatsTotal: requestStats.total,
        reservationsTotal,
        verificationPendingCount: registryMetrics.pending,
        chatbotAuditBadgeCount,
        navBadges: mediBotOverview?.nav_badges
      }),
    [
      usersApproxCount,
      pharmacyRegistryCount,
      pharmacistRegistryCount,
      requestStats.total,
      reservationsTotal,
      registryMetrics.pending,
      chatbotAuditBadgeCount,
      mediBotOverview?.nav_badges
    ]
  )

  return (
    <AdminAppShell
      navSections={navSections}
      activeTab={activeTab}
      onSelectTab={selectTab}
      onLogout={logout}
      systemStatus={systemStatus}
      adminProfile={adminProfile}
    >
        <header className="admin-topbar admin-topbar--medibot">
          <div>
            <h1>{pageHead.title}</h1>
            <p>{pageHead.subtitle}</p>
          </div>
          <div className="admin-topbar-actions admin-topbar-actions--medibot">
            <span className="admin-topbar-clock" title="Local time">
              {clockStr}
            </span>
            <button className="btn-light admin-btn-export" type="button" onClick={() => handleExportReport()} disabled={exportBusy}>
              {exportBusy ? 'Generating report…' : 'Export report (PDF)'}
            </button>
            {activeTab !== 'overview' ? (
              <button className="btn-light" type="button" onClick={() => handleExportCsv()} disabled={exportBusy || registerSaving}>
                Export CSV
              </button>
            ) : null}
            {activeTab === 'pharmacies' && (
              <>
                <button
                  className="btn-notify"
                  type="button"
                  onClick={() => openRegisterPharmacyModal()}
                  disabled={registerSaving || exportBusy}
                >
                  + Register pharmacy
                </button>
              </>
            )}
          </div>
        </header>

        {error && <div className="admin-error">{error}</div>}
        {loading ? (
          <div className="admin-loading">Loading admin data...</div>
        ) : (
          <>
            {activeTab === 'overview' && (
            <div className="admin-overview-layout admin-overview-layout--compact">
            <MediBotOverviewSections
              mediBot={mediBotOverview}
              overview={overview}
              usersApproxCount={usersApproxCount}
              pharmacyRegistryCount={pharmacyRegistryCount}
              registryMetrics={registryMetrics}
              allRequests={allRequests}
              perPharmacyRows={perPharmacyRows}
              onOpenVerification={() => selectTab('verification-queue')}
              onNavigateTab={selectTab}
              searchVolumeSnapshot={mergedSearchVolume}
              dashboardVerificationQueue={dashboardVerificationQueue}
              chatbotLogs={chatbotLogs}
              chatbotLogsLoading={chatbotLogsLoading}
              chatbotLogsHasLoaded={chatbotLogsHasLoaded}
              chatbotLogsError={chatbotLogsError}
              onOpenChatbotAuditConversation={(cid) => {
                selectTab('chatbot-audit')
                setSelectedConversationId(String(cid))
                setChatbotTranscriptDrawerOpen(true)
              }}
            />

            <div className="admin-overview-mid">
              <section className="admin-panel admin-panel-tall admin-panel--compact">
                <div className="admin-panel-head">
                  <h2>Search volume — {activityRange === '30d' ? '30 days' : '7 days'}</h2>
                  <div className="admin-segment-toggle" role="group" aria-label="Date range">
                    <button
                      type="button"
                      className={activityRange === '7d' ? 'active' : ''}
                      onClick={() => setActivityRange('7d')}
                    >
                      7d
                    </button>
                    <button
                      type="button"
                      className={activityRange === '30d' ? 'active' : ''}
                      onClick={() => setActivityRange('30d')}
                    >
                      30d
                    </button>
                  </div>
                </div>
                <div className="admin-search-trend-stack admin-search-trend-stack--compact">
                  <div className="admin-trend-wrap admin-trend-wrap--compact">
                    {requestActivitySeries.counts.every((n) => n === 0) ? (
                      <p className="admin-activity-empty muted">
                        {requestActivitySeries.source === 'api'
                          ? 'No request volume in this date window from analytics.'
                          : 'No dated requests in this window — chart will fill when requests include dates. Totals above reflect all loaded data.'}
                      </p>
                    ) : (
                      <AdminSearchTrendChart
                        compact
                        counts={requestActivitySeries.counts}
                        labels={requestActivitySeries.labels}
                        labelShort={requestActivitySeries.labelShort}
                        gradientId={trendGradientId}
                      />
                    )}
                  </div>
                  {(topMedicineTopics.length > 0 || topRegionTopics.length > 0) && (
                    <div className="admin-search-volume-rankings">
                      {topMedicineTopics.length > 0 && (
                        <div className="admin-top-medicines">
                          <h3 className="admin-top-medicines-title">Top searched medicines</h3>
                          <ul className="admin-top-medicines-list">
                            {topMedicineTopics.map((row) => (
                              <li key={row.name} className="admin-top-medicine-row">
                                <span className="admin-top-medicine-name" title={row.name}>
                                  {row.name}
                                </span>
                                <div className="admin-top-medicine-bar-track" aria-hidden>
                                  <div
                                    className="admin-top-medicine-bar-fill"
                                    style={{ width: `${row.widthPct}%` }}
                                  />
                                </div>
                                <span className="admin-top-medicine-count">{row.c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {topRegionTopics.length > 0 && (
                        <div className="admin-top-medicines admin-top-regions">
                          <h3 className="admin-top-medicines-title">Top regions (by request)</h3>
                          <ul className="admin-top-medicines-list">
                            {topRegionTopics.map((row) => (
                              <li key={row.key} className="admin-top-medicine-row">
                                <span className="admin-top-medicine-name" title={row.bucketTitle}>
                                  {row.name}
                                </span>
                                <div
                                  className="admin-top-medicine-bar-track admin-top-region-bar-track"
                                  aria-hidden
                                >
                                  <div
                                    className="admin-top-medicine-bar-fill admin-top-region-bar-fill"
                                    style={{ width: `${row.widthPct}%` }}
                                  />
                                </div>
                                <span className="admin-top-medicine-count">{row.c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="admin-overview-bottom">
              <section className="admin-panel" aria-label="Pharmacy ranking">
                <div className="admin-panel-head">
                  <h2>Pharmacy ranking</h2>
                </div>
                {adminPortalRankingSummaryLoading ? (
                  <p className="muted">Loading ranking summary…</p>
                ) : overviewPharmacyMatchRows.length === 0 ? (
                  <p className="muted">
                    {pharmacists.length === 0
                      ? 'No pharmacists in dashboard data — cannot load ranking summary.'
                      : adminPortalRankingSummary
                        ? 'Ranking summary did not include a non-empty leaderboard list.'
                        : 'Ranking summary could not be loaded.'}
                  </p>
                ) : (
                  <ul className="admin-performance-list">
                    {overviewPharmacyMatchRows.map((p) => {
                      const rank = p.__displayRank
                      const city =
                        p.city ||
                        p.location_suburb ||
                        (String(p.address || '').split(',').pop() || '').trim() ||
                        (String(p.address || '').split(',')[0] || '').trim() ||
                        ''
                      const verified = !p.needsAttention
                      return (
                        <li key={p.__rowKey ?? p.__id} className="admin-performance-row">
                          <div className="admin-performance-main">
                            <span className="admin-performance-name">{p.__name}</span>
                            <span className="admin-performance-loc muted">
                              {city || '—'}
                              {' · '}
                              {verified ? 'Verified' : 'Active'}
                            </span>
                          </div>
                          <div className="admin-performance-score">
                            <span className="admin-performance-pct mono">
                              {rank != null ? `#${rank}` : '—'}
                              {p.__score != null && (
                                <span className="muted"> · {p.__score}</span>
                              )}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="admin-panel" aria-label="Recent registrations">
                <div className="admin-panel-head">
                  <h2>Recent registrations</h2>
                </div>
                {overviewRecentRegistrationRows.length === 0 ? (
                  <p className="muted">No registration rows yet.</p>
                ) : (
                  <div className="admin-table-compact-wrap">
                    <table className="admin-table admin-table-compact">
                      <thead>
                        <tr><th>Name</th><th>Type</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {overviewRecentRegistrationRows.map((row) => (
                          <tr key={row.id}>
                            <td className="cell-strong">{row.name}</td>
                            <td>{row.type}</td>
                            <td>
                              <span className={`status-pill ${row.status === 'Pending' ? 'status-pending' : 'status-responded'}`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
            </div>
            )}

            {activeTab === 'pharmacies' && (
            <>
              <section className="admin-registry-metrics" aria-label="Registry totals">
                <div className="admin-registry-metric">
                  <span className="admin-registry-metric-label">Total registered</span>
                  <strong className="admin-registry-metric-value">{registryMetrics.total}</strong>
                </div>
                <div className="admin-registry-metric">
                  <span className="admin-registry-metric-label">Verified</span>
                  <strong className="admin-registry-metric-value admin-registry-metric-value--good">{registryMetrics.verified}</strong>
                </div>
                <div className="admin-registry-metric">
                  <span className="admin-registry-metric-label">Pending review</span>
                  <strong className="admin-registry-metric-value admin-registry-metric-value--warn">{registryMetrics.pending}</strong>
                </div>
                <div className="admin-registry-metric">
                  <span className="admin-registry-metric-label">Suspended</span>
                  <strong className="admin-registry-metric-value admin-registry-metric-value--bad">{registryMetrics.suspended}</strong>
                </div>
              </section>

              <section className="admin-panel admin-registry-card">
                <div className="admin-panel-head">
                  <h2>Pharmacy registry</h2>
                  <span className="admin-count-chip">{registryTableRows.length}</span>
                </div>
                <div className="admin-registry-filters">
                  <input
                    className="admin-filter-input admin-filter-input--wide"
                    value={registryQuery}
                    onChange={(e) => setRegistryQuery(e.target.value)}
                    placeholder="Search pharmacy name or city…"
                  />
                  <select
                    className="admin-filter-select"
                    value={registryStatusFilter}
                    onChange={(e) => setRegistryStatusFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="verified">Verified</option>
                    <option value="pending">Pending</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                {registryTableRows.length === 0 ? (
                  <p className="muted">No pharmacies match your filters.</p>
                ) : (
                  <div className="table-wrap admin-registry-table-wrap">
                    <table className="admin-table admin-registry-table">
                      <thead>
                        <tr>
                          <th>Pharmacy</th>
                          <th>City</th>
                          <th>Type</th>
                          <th>Medicines listed</th>
                          <th>Last sync</th>
                          <th title="Rank from pharmacy ranking-summary leaderboard when this row matches; otherwise dashboard composite.">
                            Ranking
                          </th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registryTableRows.slice(0, 80).map((p) => {
                          const city =
                            p.city ||
                            p.location_suburb ||
                            (String(p.address || '').split(',').pop() || '').trim() ||
                            (String(p.address || '').split(',')[0] || '').trim() ||
                            '—'
                          const type = p.pharmacy_type || p.type || 'Pharmacy'
                          const medCount = p.medicine_count ?? p.medicines_listed_count ?? p.inventory_count
                          const medicinesListed =
                            medCount != null && medCount !== '' ? String(medCount) : '—'
                          const lastSyncRaw =
                            p.last_sync_at ||
                            p.last_sync ||
                            p.updated_at ||
                            p.created_at ||
                            null
                          const lastSync = lastSyncRaw ? formatAdminDateShort(lastSyncRaw) : '—'
                          const apiSel = pharmacyRowApiStatus(p)
                          const saving = pharmacyRegistrySavingId === String(p.__id)
                          return (
                            <tr key={p.__id}>
                              <td className="cell-strong">{p.__name}</td>
                              <td>{city}</td>
                              <td>{type}</td>
                              <td className="mono">{medicinesListed}</td>
                              <td className="cell-muted admin-registry-nowrap">{lastSync}</td>
                              <td className="mono cell-strong">
                                {p.__rank != null ? `#${p.__rank}` : '—'}
                              </td>
                              <td>
                                <select
                                  className="admin-filter-select admin-registry-status-select"
                                  aria-label={`Verification status for ${p.__name}`}
                                  value={apiSel}
                                  disabled={saving}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === apiSel) return
                                    applyPharmacyRegistryStatus(p.__id, v)
                                  }}
                                >
                                  <option value="verified">Verified</option>
                                  <option value="pending_review">Pending review</option>
                                  <option value="suspended">Suspended</option>
                                </select>
                                {saving ? (
                                  <span className="admin-registry-status-saving muted">Saving…</span>
                                ) : null}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
            )}

            {(activeTab === 'command-center' ||
              activeTab === 'weight-tuning' ||
              activeTab === 'ranking-profiles' ||
              activeTab === 'content-policy' ||
              activeTab === 'algorithm-stewardship') && (
              <AdminCommandCenter
                surface={activeTab === 'command-center' ? 'full' : 'stewardship'}
                overview={overview}
                mediBot={mediBotOverview}
                allRequests={allRequests}
                allReservations={allReservations}
                pharmacies={pharmacies}
                perPharmacyRows={perPharmacyRows}
                adminPortalRankingSummary={adminPortalRankingSummary}
                adminPortalRankingSummaryLoading={adminPortalRankingSummaryLoading}
                chatbotLogs={chatbotLogs}
                chatbotLogsLoading={chatbotLogsLoading}
                onUpdatePharmacy={(id, patch) => updateAdminPharmacy(id, patch)}
                onRefreshDashboard={() => fetchDashboard({ silent: true })}
                onOpenChatbotTab={openChatbotFromCommandCenter}
                onOpenAuditTab={() => selectTab('chatbot-audit')}
                formatDate={formatAdminDateShort}
              />
            )}

            {activeTab === 'layer1-system' && (
              <AdminLayer1OperationsView
                mediBot={mediBotOverview}
                overview={overview}
                usersApproxCount={usersApproxCount}
                pharmacyRegistryCount={pharmacyRegistryCount}
                registryMetrics={registryMetrics}
                requestStats={requestStats}
                allRequests={allRequests}
                searchVolumeSnapshot={mergedSearchVolume}
              />
            )}

            {activeTab === 'verification-queue' && (
              <AdminVerificationQueueView
                mediBot={mediBotOverview}
                dashboardVerificationQueue={dashboardVerificationQueue}
                perPharmacyRows={perPharmacyRows}
                onOpenPharmacies={() => selectTab('pharmacies')}
                onUpdatePharmacy={(id, patch) => updateAdminPharmacy(id, patch)}
                onRefreshDashboard={() => fetchDashboard({ silent: true })}
                formatDate={formatAdminDateShort}
              />
            )}

            {activeTab === 'users' && (
              <div className="admin-users-page">
                <div className="medibot-users-mock-stats">
                  <div className="medibot-users-mock-stat">
                    <div className="medibot-users-mock-stat-ic" style={{ background: 'rgba(0,212,184,0.15)' }}>
                      👥
                    </div>
                    <div>
                      <div className="medibot-mock-stat-val" style={{ color: '#00d4b8' }}>
                        {usersListTotal != null ? usersListTotal.toLocaleString() : usersList.length || '—'}
                      </div>
                      <div className="medibot-mock-stat-label">Total users</div>
                    </div>
                  </div>
                  <div className="medibot-users-mock-stat">
                    <div className="medibot-users-mock-stat-ic" style={{ background: 'rgba(16,185,129,0.15)' }}>
                      🟢
                    </div>
                    <div>
                      <div className="medibot-mock-stat-val" style={{ color: '#34d399' }}>
                        {usersList.length
                          ? usersList.filter((u) => u.is_active !== false).length
                          : '—'}
                      </div>
                      <div className="medibot-mock-stat-label">Active on this page</div>
                    </div>
                  </div>
                  <div className="medibot-users-mock-stat">
                    <div className="medibot-users-mock-stat-ic" style={{ background: 'rgba(239,68,68,0.15)' }}>
                      🔴
                    </div>
                    <div>
                      <div className="medibot-mock-stat-val" style={{ color: '#f87171' }}>
                        {usersList.length ? usersList.filter((u) => u.is_active === false).length : '—'}
                      </div>
                      <div className="medibot-mock-stat-label">Inactive on page</div>
                    </div>
                  </div>
                  <div className="medibot-users-mock-stat">
                    <div className="medibot-users-mock-stat-ic" style={{ background: 'rgba(245,158,11,0.15)' }}>
                      🛡️
                    </div>
                    <div>
                      <div className="medibot-mock-stat-val" style={{ color: '#fbbf24' }}>
                        {usersList.length
                          ? usersList.filter((u) => u.is_staff || u.is_superuser).length
                          : '—'}
                      </div>
                      <div className="medibot-mock-stat-label">Staff on page</div>
                    </div>
                  </div>
                </div>
                <section className="admin-panel">
                  <div className="admin-panel-head">
                    <h2>Platform users</h2>
                    {usersListTotal != null && (
                      <span className="admin-count-chip">{usersListTotal.toLocaleString()} total</span>
                    )}
                  </div>
                  <p className="muted admin-users-hint">
                    Search matches username, email, and name fields. Requires admin session cookies.
                  </p>
                  <div className="admin-registry-filters">
                    <input
                      className="admin-filter-input admin-filter-input--wide"
                      value={usersListSearchIn}
                      onChange={(e) => setUsersListSearchIn(e.target.value)}
                      placeholder="Search users…"
                      aria-label="Search users"
                    />
                  </div>
                  {usersListError && <div className="admin-error admin-error--inline">{usersListError}</div>}
                  {usersListLoading ? (
                    <p className="muted">Loading users…</p>
                  ) : usersList.length === 0 ? (
                    <p className="muted">No users on this page.</p>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Username</th>
                              <th>Email</th>
                              <th>Name</th>
                              <th>Staff</th>
                            </tr>
                          </thead>
                          <tbody>
                            {usersList.map((u, idx) => (
                              <tr key={u.id ?? u.pk ?? u.username ?? idx}>
                                <td className="cell-strong">{u.username || '—'}</td>
                                <td>{u.email || '—'}</td>
                                <td>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                                <td>{u.is_staff || u.is_superuser ? 'Yes' : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="admin-audit-pagination">
                        <button
                          type="button"
                          className="btn-light"
                          disabled={usersListPage <= 1 || usersListLoading}
                          onClick={() => setUsersListPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </button>
                        <span className="muted">Page {usersListPage}</span>
                        <button
                          type="button"
                          className="btn-light"
                          disabled={
                            usersListLoading ||
                            (usersListTotal != null
                              ? usersListPage * ADMIN_LIST_PAGE_SIZE >= usersListTotal
                              : usersList.length < ADMIN_LIST_PAGE_SIZE)
                          }
                          onClick={() => setUsersListPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </>
                  )}
                </section>

                <section className="admin-panel">
                  <div className="admin-panel-head">
                    <h2>Patient sessions</h2>
                    {patientsListTotal != null && (
                      <span className="admin-count-chip">{patientsListTotal.toLocaleString()} total</span>
                    )}
                  </div>
                  <p className="muted admin-users-hint">
                    Search matches <span className="mono">session_id</span>. Open a row for the patient control page.
                  </p>
                  <div className="admin-registry-filters admin-users-toolbar">
                    <input
                      className="admin-filter-input admin-filter-input--wide"
                      value={patientsListSearchIn}
                      onChange={(e) => setPatientsListSearchIn(e.target.value)}
                      placeholder="Search by session id…"
                      aria-label="Search patient sessions"
                    />
                  </div>
                  {patientsListError && <div className="admin-error admin-error--inline">{patientsListError}</div>}
                  {patientsListLoading ? (
                    <p className="muted">Loading patient sessions…</p>
                  ) : patientsList.length === 0 ? (
                    <p className="muted">No patient sessions on this page.</p>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Session</th>
                              <th>Updated</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {patientsList.map((row, idx) => {
                              const sid = row.session_id ?? row.sessionId ?? row.id ?? ''
                              const updated =
                                row.updated_at ?? row.last_active_at ?? row.created_at ?? row.created ?? null
                              return (
                                <tr key={sid || idx}>
                                  <td className="mono cell-strong">{sid || '—'}</td>
                                  <td className="cell-muted admin-registry-nowrap">{formatAdminDateShort(updated)}</td>
                                  <td>
                                    {sid ? (
                                      <button
                                        type="button"
                                        className="btn-light"
                                        onClick={() => navigate(`/admin/patients/${encodeURIComponent(sid)}`)}
                                      >
                                        Open
                                      </button>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="admin-audit-pagination">
                        <button
                          type="button"
                          className="btn-light"
                          disabled={patientsListPage <= 1 || patientsListLoading}
                          onClick={() => setPatientsListPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </button>
                        <span className="muted">Page {patientsListPage}</span>
                        <button
                          type="button"
                          className="btn-light"
                          disabled={
                            patientsListLoading ||
                            (patientsListTotal != null
                              ? patientsListPage * ADMIN_LIST_PAGE_SIZE >= patientsListTotal
                              : patientsList.length < ADMIN_LIST_PAGE_SIZE)
                          }
                          onClick={() => setPatientsListPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'inventory' && (
              <div className="admin-inventory-page">
                <header className="admin-inventory-hero">
                  <div className="admin-inventory-hero-top">
                    <div className="admin-inventory-hero-intro">
                      <h2 className="admin-inventory-title">Inventory reports</h2>
                      <p className="admin-inventory-lead">Per-branch stock visibility across linked pharmacies.</p>
                    </div>
                    <div className="admin-inventory-toolbar">
                      <input
                        className="admin-filter-input admin-inventory-search"
                        value={inventoryReportSearch}
                        onChange={(e) => setInventoryReportSearch(e.target.value)}
                        placeholder="Filter branches…"
                        aria-label="Filter inventory reports by pharmacy"
                      />
                      <button
                        type="button"
                        className="btn-light admin-inventory-reload"
                        disabled={inventoryReportsLoading}
                        onClick={() => loadInventoryReports()}
                      >
                        <RefreshCw size={15} className={inventoryReportsLoading ? 'admin-spin' : ''} aria-hidden />
                        {inventoryReportsLoading ? 'Loading…' : 'Reload'}
                      </button>
                    </div>
                  </div>
                </header>

                {inventoryReportsByPharmacy.length > 0 && (
                  <div className="admin-inventory-kpis" aria-label="Inventory overview">
                    <div className="admin-inventory-kpi admin-inventory-kpi--muted">
                      <span className="admin-inventory-kpi-label">Branches</span>
                      <span className="admin-inventory-kpi-value">
                        {inventoryOverviewStats.branches.toLocaleString()}
                      </span>
                    </div>
                    <div className="admin-inventory-kpi admin-inventory-kpi--muted">
                      <span className="admin-inventory-kpi-label">Stock lines</span>
                      <span className="admin-inventory-kpi-value">
                        {inventoryOverviewStats.stockLines.toLocaleString()}
                      </span>
                    </div>
                    <div className="admin-inventory-kpi admin-inventory-kpi--ok">
                      <span className="admin-inventory-kpi-label">In stock Σ</span>
                      <span className="admin-inventory-kpi-value">
                        {inventoryOverviewStats.inStockSum.toLocaleString()}
                      </span>
                    </div>
                    <div className="admin-inventory-kpi admin-inventory-kpi--warn">
                      <span className="admin-inventory-kpi-label">Low Σ</span>
                      <span className="admin-inventory-kpi-value">
                        {inventoryOverviewStats.lowStockSum.toLocaleString()}
                      </span>
                    </div>
                    <div className="admin-inventory-kpi admin-inventory-kpi--bad">
                      <span className="admin-inventory-kpi-label">Out Σ</span>
                      <span className="admin-inventory-kpi-value">
                        {inventoryOverviewStats.outStockSum.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <section className="admin-panel admin-inventory-panel">
                  {inventoryReportsLoading && inventoryReportsByPharmacy.length === 0 ? (
                    <p className="admin-inventory-state admin-inventory-state--muted">
                      Loading inventory from all pharmacies…
                    </p>
                  ) : visibleInventoryReports.length === 0 ? (
                    <p className="admin-inventory-state admin-inventory-state--muted">
                      {inventoryReportSearch.trim()
                        ? 'No pharmacies match your search.'
                        : 'No pharmacies in the dashboard dataset yet.'}
                    </p>
                  ) : (
                    <>
                    <div className="admin-inventory-panel-head">
                      <h3 className="admin-inventory-section-title">Branch inventory</h3>
                      <span className="admin-inventory-section-count">
                        {visibleInventoryReports.length} branch{visibleInventoryReports.length === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <div className="admin-inventory-pharmacy-grid">
                      {visibleInventoryReports.map((rep) => (
                        <article key={String(rep.pharmacyId)} className="admin-inventory-pharmacy-card">
                          <header className="admin-inventory-card-head">
                            <div className="admin-inventory-card-title-block">
                              <div className="admin-inventory-card-icon-wrap" aria-hidden>
                                <Package size={17} strokeWidth={2} className="admin-inventory-card-icon" />
                              </div>
                              <div className="admin-inventory-card-title-text">
                                <h3>{rep.pharmacyName}</h3>
                                {rep.error === 'no_pharmacist' ? (
                                  <p className="admin-inventory-card-warn muted">
                                    No pharmacist linked — cannot load stock
                                  </p>
                                ) : rep.error ? (
                                  <p className="admin-inventory-card-warn muted">{rep.error}</p>
                                ) : (
                                  <>
                                    <span className="admin-inventory-line-pill">
                                      {rep.items.length} stock line{rep.items.length === 1 ? '' : 's'}
                                    </span>
                                    <p className="admin-inventory-card-meta muted">
                                      Pharmacist ID{' '}
                                      <strong className="mono">{rep.pharmacistId || '—'}</strong>
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                            {rep.summary && !rep.error && (
                              <div className="admin-inventory-summary-pills">
                                <span className="admin-inventory-pill admin-inventory-pill--muted" title="Total SKUs">
                                  <span className="admin-inventory-pill-k">Total</span>
                                  <strong>{rep.summary.total_medicines ?? rep.items.length}</strong>
                                </span>
                                <span className="admin-inventory-pill admin-inventory-pill--ok">
                                  <span className="admin-inventory-pill-k">In stock</span>
                                  <strong>{rep.summary.in_stock ?? '—'}</strong>
                                </span>
                                <span className="admin-inventory-pill admin-inventory-pill--warn">
                                  <span className="admin-inventory-pill-k">Low</span>
                                  <strong>{rep.summary.low_stock ?? '—'}</strong>
                                </span>
                                <span className="admin-inventory-pill admin-inventory-pill--bad">
                                  <span className="admin-inventory-pill-k">Out</span>
                                  <strong>{rep.summary.out_of_stock ?? '—'}</strong>
                                </span>
                              </div>
                            )}
                          </header>
                          {!rep.error && rep.items.length > 0 && (
                            <div className="admin-inventory-items-wrap">
                              <div className="admin-inventory-items-head" aria-hidden>
                                <span>Medicine</span>
                                <span>Qty</span>
                                <span>Price</span>
                                <span>Status</span>
                              </div>
                              <ul className="admin-inventory-items-list">
                                {rep.items.map((item, ix) => (
                                  <li key={`${item.medicine_name}-${ix}`} className="admin-inventory-item-row">
                                    <span className="admin-inventory-item-name" data-label="Medicine">
                                      {item.medicine_name || '—'}
                                    </span>
                                    <span
                                      className="mono admin-inventory-item-qty"
                                      data-label="Qty"
                                    >
                                      {item.quantity ?? '—'}
                                    </span>
                                    <span
                                      className="mono admin-inventory-item-price"
                                      data-label="Price"
                                    >
                                      {formatAdminInventoryItemPrice(item)}
                                    </span>
                                    <span
                                      className={`admin-inventory-status admin-inventory-status--${String(item.status || 'in_stock').replace(/_/g, '-')}`}
                                      data-label="Status"
                                    >
                                      {item.status === 'low_stock'
                                        ? 'Low'
                                        : item.status === 'out_of_stock'
                                          ? 'Out'
                                          : 'In stock'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {!rep.error && rep.items.length === 0 && (
                            <p className="muted admin-inventory-empty admin-inventory-state">
                              No stock lines returned for this branch.
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                    </>
                  )}
                </section>
              </div>
            )}

            {(activeTab === 'chatbot' || activeTab === 'chatbot-audit') && (
              <>
              <div className="admin-chatbot-logs-page">
                <section className="admin-panel">
                  <div className="admin-panel-head">
                    <h2>Conversations</h2>
                    {chatbotLogsTotal != null && (
                      <span className="admin-count-chip">{chatbotLogsTotal.toLocaleString()} total</span>
                    )}
                  </div>
                  <p className="muted admin-users-hint">
                    Filter by session or search conversation / session id. Use <strong>View transcript</strong> to open
                    the conversation in a side panel.
                  </p>
                  <div className="admin-registry-filters admin-chatbot-log-filters">
                    <input
                      className="admin-filter-input admin-filter-input--wide"
                      value={chatbotLogsSearchIn}
                      onChange={(e) => setChatbotLogsSearchIn(e.target.value)}
                      placeholder="Search conversations…"
                      aria-label="Search chatbot logs"
                    />
                    <input
                      className="admin-filter-input"
                      value={chatbotLogsSessionFilterIn}
                      onChange={(e) => setChatbotLogsSessionFilterIn(e.target.value)}
                      placeholder="Session id (exact)"
                      aria-label="Filter by session id"
                    />
                  </div>
                  {chatbotLogsError && <div className="admin-error admin-error--inline">{chatbotLogsError}</div>}
                  {chatbotLogsLoading ? (
                    <p className="muted">Loading logs…</p>
                  ) : chatbotLogs.length === 0 ? (
                    <p className="muted">No conversations on this page.</p>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table className="admin-table admin-chatbot-log-table">
                          <thead>
                            <tr>
                              <th>Conversation</th>
                              <th>Session</th>
                              <th>Updated</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {chatbotLogs.map((row, idx) => {
                              const cid = adminConversationRowId(row)
                              const sid = row.session_id ?? row.sessionId ?? row.session ?? '—'
                              const updated =
                                row.updated_at ?? row.last_message_at ?? row.modified_at ?? row.created_at ?? null
                              const active =
                                chatbotTranscriptDrawerOpen && String(cid) === String(selectedConversationId)
                              return (
                                <tr
                                  key={cid || idx}
                                  className={active ? 'admin-chatbot-log-row admin-chatbot-log-row--active' : 'admin-chatbot-log-row'}
                                >
                                  <td className="mono cell-strong">{cid || '—'}</td>
                                  <td className="mono">{sid}</td>
                                  <td className="cell-muted admin-registry-nowrap">{formatAdminDateShort(updated)}</td>
                                  <td>
                                    {cid ? (
                                      <button
                                        type="button"
                                        className="btn-light"
                                        onClick={() => {
                                          setSelectedConversationId(String(cid))
                                          setChatbotTranscriptDrawerOpen(true)
                                        }}
                                      >
                                        View transcript
                                      </button>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="admin-audit-pagination">
                        <button
                          type="button"
                          className="btn-light"
                          disabled={chatbotLogsPage <= 1 || chatbotLogsLoading}
                          onClick={() => setChatbotLogsPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </button>
                        <span className="muted">Page {chatbotLogsPage}</span>
                        <button
                          type="button"
                          className="btn-light"
                          disabled={
                            chatbotLogsLoading ||
                            (chatbotLogsTotal != null
                              ? chatbotLogsPage * ADMIN_LIST_PAGE_SIZE >= chatbotLogsTotal
                              : chatbotLogs.length < ADMIN_LIST_PAGE_SIZE)
                          }
                          onClick={() => setChatbotLogsPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>

              {chatbotTranscriptDrawerOpen && (
                <div className="admin-transcript-drawer-root">
                  <button
                    type="button"
                    className="admin-transcript-drawer-backdrop"
                    aria-label="Close transcript panel"
                    onClick={closeChatbotTranscriptDrawer}
                  />
                  <aside
                    className="admin-transcript-drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-transcript-drawer-title"
                  >
                    <header className="admin-transcript-drawer-header">
                      <div>
                        <h2 id="admin-transcript-drawer-title" className="admin-transcript-drawer-title">
                          Transcript
                        </h2>
                        {selectedConversationId && (
                          <p className="admin-transcript-drawer-meta mono" title={selectedConversationId}>
                            {selectedConversationId}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="admin-transcript-drawer-close"
                        onClick={closeChatbotTranscriptDrawer}
                        aria-label="Close"
                      >
                        <X size={22} strokeWidth={2} />
                      </button>
                    </header>
                    <div className="admin-transcript-drawer-body">
                      {chatbotTranscriptLoading ? (
                        <p className="muted">Loading transcript…</p>
                      ) : chatbotTranscriptError ? (
                        <div className="admin-error admin-error--inline">{chatbotTranscriptError}</div>
                      ) : (
                        (() => {
                          const msgs = extractChatbotMessages(chatbotTranscript)
                          if (msgs && msgs.length > 0) {
                            return (
                              <div className="admin-transcript admin-transcript--drawer" role="log">
                                {msgs.map((m, i) => {
                                  const roleRaw = m.role ?? m.sender ?? m.from ?? m.author ?? ''
                                  const r = String(roleRaw).toLowerCase()
                                  const isBot =
                                    r.includes('bot') ||
                                    r.includes('assistant') ||
                                    r === 'ai' ||
                                    r === 'system' ||
                                    r === 'model'
                                  const body =
                                    m.content ??
                                    m.text ??
                                    m.message ??
                                    m.body ??
                                    (typeof m === 'string' ? m : '')
                                  return (
                                    <div
                                      key={i}
                                      className={`admin-transcript-bubble ${isBot ? 'admin-transcript-bubble--bot' : 'admin-transcript-bubble--user'}`}
                                    >
                                      <div className="admin-transcript-role muted">
                                        {roleRaw || (isBot ? 'assistant' : 'user')}
                                      </div>
                                      <div className="admin-transcript-body">{String(body)}</div>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          }
                          if (chatbotTranscript != null) {
                            return (
                              <pre className="admin-transcript-raw admin-transcript-raw--drawer">
                                {JSON.stringify(chatbotTranscript, null, 2)}
                              </pre>
                            )
                          }
                          return <p className="muted">No messages in this conversation.</p>
                        })()
                      )}
                    </div>
                  </aside>
                </div>
              )}
              </>
            )}

            {activeTab === 'pharmacists' && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Pharmacists</h2>
                  <span className="admin-count-chip">{pharmacists.length}</span>
                </div>
                {pharmacists.length === 0 ? (
                  <p className="muted">No pharmacists found.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr><th>Name</th><th>Email</th><th>Pharmacy</th></tr>
                      </thead>
                      <tbody>
                        {pharmacists.slice(0, 40).map((p, idx) => (
                          <tr key={p.pharmacist_id || `${p.email}-${idx}`}>
                            <td>{p.full_name || p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'N/A'}</td>
                            <td>{p.email || 'N/A'}</td>
                            <td>{p.pharmacy_name || p.pharmacy || p.pharmacy_id || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'requests' && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Requests</h2>
                  <span className="admin-count-chip">{allRequests.length}</span>
                </div>
                {allRequests.length === 0 ? (
                  <p className="muted">No requests found.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr><th>Request</th><th>Medicines</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {allRequests.slice(0, 40).map((r, idx) => (
                          <tr key={r.request_id || r.id || idx}>
                            <td className="mono">{r.short_request_id || r.request_id || 'N/A'}</td>
                            <td>{Array.isArray(r.medicine_names) ? r.medicine_names.join(', ') : (r.medicine_name || 'N/A')}</td>
                            <td><span className={`status-pill status-${String(r.status || '').toLowerCase() || 'unknown'}`}>{r.status || 'N/A'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'reservations' && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Reservations</h2>
                  <span className="admin-count-chip">{allReservations.length}</span>
                </div>
                {allReservations.length === 0 ? (
                  <p className="muted">No reservations found.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr><th>Reservation</th><th>Patient</th><th>Status</th><th>Phone</th></tr>
                      </thead>
                      <tbody>
                        {allReservations.slice(0, 40).map((r, idx) => (
                          <tr key={r.reservation_id || r.id || idx}>
                            <td className="mono">{r.reservation_id || r.id || 'N/A'}</td>
                            <td>{r.patient_name || 'N/A'}</td>
                            <td><span className={`status-pill status-${String(r.status || '').toLowerCase() || 'unknown'}`}>{r.status || 'N/A'}</span></td>
                            <td>{r.patient_phone || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}

      {registerPharmacyModalOpen && (
        <div
          className="admin-modal-overlay"
          role="presentation"
          onClick={closeRegisterPharmacyModal}
        >
          <div
            className="admin-modal admin-modal--register-pharmacy"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-register-pharmacy-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h2 id="admin-register-pharmacy-title">Register pharmacy</h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={closeRegisterPharmacyModal}
                disabled={registerSaving}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted admin-modal-lead">
              Required: a unique pharmacy ID (at least 3 characters), display name, and street address. Coordinates,
              phone, and email are optional.
            </p>
            <form className="admin-register-pharm-form" onSubmit={handleRegisterPharmacySubmit}>
              <label className="admin-register-pharm-label">
                <span>
                  Pharmacy ID <span className="admin-req-star">*</span>
                </span>
                <div className="admin-register-ph-inline">
                  <input
                    className="admin-filter-input admin-filter-input--wide"
                    name="pharmacy_id"
                    value={registerPharmacyForm.pharmacy_id}
                    onChange={(e) =>
                      setRegisterPharmacyForm((f) => ({ ...f, pharmacy_id: e.target.value }))
                    }
                    placeholder="e.g. medicconnect_central_01"
                    minLength={3}
                    required
                    autoComplete="off"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-light"
                    onClick={() => {
                      const s = suggestPharmacyIdFromName(registerPharmacyForm.name)
                      if (s) setRegisterPharmacyForm((f) => ({ ...f, pharmacy_id: s }))
                    }}
                    disabled={!registerPharmacyForm.name.trim()}
                  >
                    Suggest from name
                  </button>
                </div>
              </label>
              <label className="admin-register-pharm-label">
                <span>
                  Pharmacy name <span className="admin-req-star">*</span>
                </span>
                <input
                  className="admin-filter-input admin-filter-input--wide"
                  name="name"
                  value={registerPharmacyForm.name}
                  onChange={(e) =>
                    setRegisterPharmacyForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Display name"
                  required
                  autoComplete="organization"
                />
              </label>
              <label className="admin-register-pharm-label">
                <span>
                  Address <span className="admin-req-star">*</span>
                </span>
                <textarea
                  className="admin-register-pharm-textarea"
                  name="address"
                  value={registerPharmacyForm.address}
                  onChange={(e) =>
                    setRegisterPharmacyForm((f) => ({ ...f, address: e.target.value }))
                  }
                  placeholder="Street, suburb, city"
                  required
                  rows={3}
                  autoComplete="street-address"
                />
              </label>
              <div className="admin-register-ph-coords">
                <label className="admin-register-pharm-label">
                  <span>Latitude (optional)</span>
                  <input
                    className="admin-filter-input"
                    inputMode="decimal"
                    name="latitude"
                    value={registerPharmacyForm.latitude}
                    onChange={(e) =>
                      setRegisterPharmacyForm((f) => ({ ...f, latitude: e.target.value }))
                    }
                    placeholder="e.g. -17.8252"
                  />
                </label>
                <label className="admin-register-pharm-label">
                  <span>Longitude (optional)</span>
                  <input
                    className="admin-filter-input"
                    inputMode="decimal"
                    name="longitude"
                    value={registerPharmacyForm.longitude}
                    onChange={(e) =>
                      setRegisterPharmacyForm((f) => ({ ...f, longitude: e.target.value }))
                    }
                    placeholder="e.g. 31.0335"
                  />
                </label>
              </div>
              <label className="admin-register-pharm-label">
                <span>Phone (optional)</span>
                <input
                  className="admin-filter-input admin-filter-input--wide"
                  name="phone"
                  value={registerPharmacyForm.phone}
                  onChange={(e) =>
                    setRegisterPharmacyForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  autoComplete="tel"
                />
              </label>
              <label className="admin-register-pharm-label">
                <span>Email (optional)</span>
                <input
                  className="admin-filter-input admin-filter-input--wide"
                  name="email"
                  type="email"
                  value={registerPharmacyForm.email}
                  onChange={(e) =>
                    setRegisterPharmacyForm((f) => ({ ...f, email: e.target.value }))
                  }
                  autoComplete="email"
                />
              </label>
              <div className="admin-modal-actions">
                <button type="button" className="btn-light" onClick={closeRegisterPharmacyModal} disabled={registerSaving}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-notify"
                  disabled={
                    registerSaving ||
                    registerPharmacyForm.pharmacy_id.trim().length < 3 ||
                    !registerPharmacyForm.name.trim() ||
                    !registerPharmacyForm.address.trim()
                  }
                >
                  {registerSaving ? 'Creating…' : 'Create pharmacy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminAppShell>
  )
}
