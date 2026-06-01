import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Bell,
  Volume2,
  VolumeX,
  Package, 
  TrendingUp, 
  Clock, 
  MapPin, 
  DollarSign,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  LogOut,
  Settings,
  BarChart3,
  Pill,
  Cross,
  Building2,
  Award,
  HeartPulse,
  X,
  Menu,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ThumbsDown,
  Lightbulb,
  Plus,
  Trash2,
  LayoutDashboard,
  Radio,
  ClipboardList,
} from 'lucide-react'
import PrescriptionReviewPanel from '../components/PrescriptionReviewPanel'
import { useLanguage } from '../context/LanguageContext'
import { getPharmacyGreeting, getPharmacyTabHeadline } from '../utils/i18n'
import {
  prescriptionMedicineNames,
  requestHasPrescriptionAssets,
  requestNeedsPharmacistMedicineEntry,
} from '../utils/prescriptionReview'
import {
  getPharmacistRequests,
  submitPharmacyResponse,
  getPharmacistInventory,
  postPharmacistInventoryBulk,
  patchPharmacistInventoryItem,
  deletePharmacistInventoryItem,
  normalizePharmacistInventoryResponse,
  getPharmacistReservations,
  confirmReservation,
  completeReservation,
  getPharmacistRankingSummary,
  getAllPharmacies,
  getPharmacistSettings,
  patchPharmacistSettings,
  hasPharmacistApiAuth,
} from '../utils/api'
import {
  loadOperationsFromStorage,
  loadProfileFromStorage,
  saveOperationsToStorage,
  saveProfileToStorage,
  operationsFormFromApi,
  buildOperationsApiPatch,
  pharmacyBlocksReservations,
  isUnavailableHolidayNotes,
  normalizeProfileSettings,
  DEFAULT_OPERATIONS_FORM,
} from '../utils/pharmacySettingsStorage'
import {
  loadSeenRequestIds,
  saveSeenRequestIds,
  loadSeenReservationIds,
  saveSeenReservationIds,
  collectNewActionableRequests,
  collectNewActionableReservations,
  unlockRequestSounds,
  playNewRequestSound,
  playNewReservationSound,
  showNewRequestNotification,
  showNewReservationNotification,
  requestNotificationPermission,
  setRequestSoundsEnabled,
  shouldPlayPharmacyAlerts,
  primePharmacyAlertSounds,
  REQUEST_POLL_MS_ACTIVE,
  REQUEST_POLL_MS_PAUSED,
} from '../utils/pharmacyRequestAlerts'
import { patientLocationMainSub } from '../utils/zwLocationBuckets'
import { getPharmacyRegistryStatus } from '../utils/pharmacyRegistryStatus'
import {
  buildLeaderboardFromPlatformPharmacies,
  computeRankingScoreFromFiveFactorFormula,
  extractPortalCompositeRankingUi,
  getPortalCompositeScoreFromSummary,
  leaderboardPharmacyIdsMatch,
  parseLeaderboardRowsFromSummary,
  weightPercentForPortalCompositeField
} from '../utils/pharmacyLeaderboard'
import './PharmacyDashboard.css'

function normalizePharmaciesFromApiPayload(data) {
  if (data == null) return []
  if (Array.isArray(data)) return data
  return data.results ?? data.pharmacies ?? data.items ?? []
}

const PRICE_UNIT_OPTIONS = [
  { value: 'per_packet', label: 'Per packet' },
  { value: 'per_box', label: 'Per box' },
  { value: 'per_tablet', label: 'Per tablet' },
  { value: 'per_10_tablets', label: 'Per 10 tablets' },
  { value: 'per_gram', label: 'Per gram' },
  { value: 'per_100g', label: 'Per 100g' },
  { value: 'per_ml', label: 'Per ml' },
  { value: 'per_100ml', label: 'Per 100ml' },
  { value: 'per_bottle', label: 'Per bottle' },
  { value: 'each', label: 'Each' }
]

/** Backend: `scope=recent` returns last N reservations (any status) for history; `active` is pending/confirmed non-expired only. */
const PHARMACIST_RESERVATIONS_FETCH = { scope: 'recent', limit: 200, includeMeta: true }

function parsePharmacistReservationsPayload(data) {
  if (data == null) return { list: [], meta: null }
  if (Array.isArray(data)) return { list: data, meta: null }
  return {
    list: data.reservations ?? data.results ?? [],
    meta: data.meta && typeof data.meta === 'object' ? data.meta : null,
  }
}

function getPriceUnitLabel(value) {
  const opt = PRICE_UNIT_OPTIONS.find(o => o.value === value)
  return opt ? opt.label : (value || '—')
}

/** e.g. "Metformin 500mg tabs" → title "Metformin" + subtitle "500mg tabs" for overview inventory rows */
function inventoryItemDisplayLines(medicineName) {
  const s = String(medicineName || '').trim()
  if (!s) return { primary: '—', secondary: null }
  const digitAt = s.search(/\d/)
  if (digitAt > 1 && digitAt < s.length) {
    const primary = s.slice(0, digitAt).trim()
    const secondary = s.slice(digitAt).trim()
    if (primary.length >= 1 && secondary.length >= 2) return { primary, secondary }
  }
  return { primary: s, secondary: null }
}

/** Split stored medicine_name (or API dosage field) into name + dosage for editing. */
function splitInventoryMedicineFields(item) {
  const dosageField = item?.dosage != null ? String(item.dosage).trim() : ''
  const lines = inventoryItemDisplayLines(item?.medicine_name)
  return {
    name: lines.primary === '—' ? '' : lines.primary,
    dosage: dosageField || lines.secondary || '',
  }
}

function joinInventoryMedicineFields(name, dosage) {
  const n = String(name || '').trim()
  const d = String(dosage || '').trim()
  if (!n) return d
  if (!d) return n
  return `${n} ${d}`.replace(/\s+/g, ' ').trim()
}

const DISPLAY_MEDICINE_NOISE = new Set(['medicine request', 'medication request', 'request'])

/** Trim, strip trailing colons, drop placeholder tokens, dedupe case-insensitively (order preserved). */
function normalizeDisplayMedicineNames(medicineNames) {
  const raw = medicineNames || []
  const seen = new Set()
  const out = []
  for (const med of raw) {
    let s = String(med ?? '').trim()
    if (!s) continue
    while (/:+$/u.test(s)) s = s.replace(/:+$/u, '').trim()
    if (!s) continue
    const lowerMed = s.toLowerCase()
    if (lowerMed.length < 2) continue
    if (/^\d+$|^\d+[:\-]/u.test(lowerMed)) continue
    if (DISPLAY_MEDICINE_NOISE.has(lowerMed)) continue
    if (seen.has(lowerMed)) continue
    seen.add(lowerMed)
    out.push(s)
  }
  return out
}

function getRequestMedicineSummaryLine(request) {
  if (requestNeedsPharmacistMedicineEntry(request)) {
    return 'Prescription image — read Rx and respond with medicines'
  }
  const fromRx = prescriptionMedicineNames(request, null)
  const names = normalizeDisplayMedicineNames([
    ...(request.medicine_names || []),
    ...fromRx,
  ])
  if (names.length > 0) return names.join(', ')
  const sym = String(request?.symptoms || '').trim()
  if (sym && !DISPLAY_MEDICINE_NOISE.has(sym.toLowerCase())) return sym
  return 'Medicine request'
}

/** Symptom text for live feed when it adds info beyond the medicine summary line (no duplicate). */
function liveFeedSymptomDisplay(request, medicineSummaryLine) {
  const sym = String(request?.symptoms || '').trim()
  if (!sym || DISPLAY_MEDICINE_NOISE.has(sym.toLowerCase())) return null
  if (sym.toLowerCase() === String(medicineSummaryLine || '').trim().toLowerCase()) return null
  return sym.length > 120 ? `${sym.slice(0, 120)}…` : sym
}

function RequestCountdown({ expiresAt }) {
  const [label, setLabel] = useState('—')
  useEffect(() => {
    const tick = () => {
      if (!expiresAt) {
        setLabel('—')
        return
      }
      const ms = new Date(expiresAt) - Date.now()
      if (ms <= 0) {
        setLabel('0:00')
        return
      }
      const m = Math.floor(ms / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      setLabel(`${m}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return <span>{label}</span>
}

/** Elapsed time since request creation (mock live-requests page). */
function RequestElapsed({ createdAt }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const tick = () => {
      if (!createdAt) {
        setSecs(0)
        return
      }
      setSecs(Math.max(0, Math.floor((Date.now() - new Date(createdAt)) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [createdAt])
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return (
    <span>
      {m}:{String(s).padStart(2, '0')}
    </span>
  )
}

function ReqElapsedBig({ createdAt }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const tick = () => {
      if (!createdAt) {
        setSecs(0)
        return
      }
      setSecs(Math.max(0, Math.floor((Date.now() - new Date(createdAt)) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [createdAt])
  const m = Math.floor(secs / 60)
  const s = secs % 60
  const ok = secs < 50
  return (
    <div className={`ph-mock-req-timer-big${ok ? ' ok' : ''}`}>
      {m}:{String(s).padStart(2, '0')}
    </div>
  )
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

function reservationLineAmount(r) {
  const v = r.total_price ?? r.price_at_reservation ?? r.amount ?? r.price ?? 0
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** True when the reservation is finished and revenue counts (API may use `completed` or `picked_up`). */
function isReservationFulfilledStatus(status) {
  const s = (status || '').toLowerCase()
  return s === 'completed' || s === 'picked_up' || s === 'collected' || s === 'fulfilled'
}

/** Best timestamp for when a fulfilment happened (some APIs only send `reserved_at` for picked-up rows). */
function reservationFulfilledAt(r) {
  if (!r || typeof r !== 'object') return null
  return r.completed_at || r.updated_at || r.created_at || r.reserved_at || r.picked_up_at || null
}

/** Monday 00:00 local (week containing `d`). */
function startOfWeekMonday(d) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Earnings tab: Mon–Sun totals this calendar week from completed reservations. */
function buildEarningsWeekBars(reservations) {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const now = new Date()
  const weekStart = startOfWeekMonday(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const sums = labels.map(() => 0)
  const completed = (reservations || []).filter((r) => isReservationFulfilledStatus(r.status))
  for (const r of completed) {
    const raw = reservationFulfilledAt(r)
    if (!raw) continue
    const t = new Date(raw)
    if (t < weekStart || t >= weekEnd) continue
    const idx = (t.getDay() + 6) % 7
    sums[idx] += reservationLineAmount(r)
  }
  const max = Math.max(...sums, 1e-9)
  return labels.map((day, i) => ({
    day,
    pct: Math.min(100, Math.round((sums[i] / max) * 100)),
    amount: sums[i],
  }))
}

/** Earnings tab: today’s completed revenue by 3-hour blocks (local). */
function buildEarningsHourBarsToday(reservations) {
  const slots = [
    [0, 2],
    [3, 5],
    [6, 8],
    [9, 11],
    [12, 14],
    [15, 17],
    [18, 20],
    [21, 23],
  ]
  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)
  const endToday = new Date(startToday)
  endToday.setDate(endToday.getDate() + 1)
  const sums = slots.map(() => 0)
  const completed = (reservations || []).filter((r) => isReservationFulfilledStatus(r.status))
  for (const r of completed) {
    const raw = reservationFulfilledAt(r)
    if (!raw) continue
    const t = new Date(raw)
    if (t < startToday || t >= endToday) continue
    const h = t.getHours()
    let si = -1
    for (let i = 0; i < slots.length; i++) {
      const [a, b] = slots[i]
      if (h >= a && h <= b) {
        si = i
        break
      }
    }
    if (si < 0) continue
    sums[si] += reservationLineAmount(r)
  }
  const max = Math.max(...sums, 1e-9)
  return slots.map(([a, b], i) => ({
    label: `${a}–${b}h`,
    pct: Math.min(100, Math.round((sums[i] / max) * 100)),
    amount: sums[i],
  }))
}

/**
 * When backend sends monthly points on ranking-summary.
 * Ignores any per-row `formula` — those can be **DB snapshot** strings; live algorithm is root `formula` + `composite_weights`.
 */
function parseScoreHistoryFromRankingSummary(rankingSummary) {
  if (!rankingSummary || typeof rankingSummary !== 'object') return null
  const raw =
    rankingSummary.ranking_score_history ??
    rankingSummary.monthly_scores ??
    rankingSummary.score_history ??
    rankingSummary.ranking_history
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const score = Number(x.score ?? x.ranking_score_0_100 ?? x.value)
    if (!Number.isFinite(score)) continue
    let label = ''
    const mk = x.month ?? x.month_key ?? x.period
    if (mk != null) {
      const rawMk = String(mk)
      const d = new Date(rawMk.length <= 7 ? `${rawMk}-01` : rawMk)
      if (!Number.isNaN(d.getTime())) {
        label = d.toLocaleString(undefined, { month: 'short', year: '2-digit' })
      }
    }
    if (!label) label = String(x.label ?? x.month_label ?? '').trim()
    if (!label) continue
    out.push({ month: label, score: Math.round(Math.min(100, Math.max(0, score))) })
  }
  return out.length ? out.slice(-6) : null
}

/** Last 6 calendar months: score scales with completed fulfilments vs your current composite (until API history exists). */
function buildScoreHistoryFromReservations(reservations, rankingScoreNow) {
  const end = Number(rankingScoreNow)
  const base = Number.isFinite(end) ? end : 0
  const now = new Date()
  const rows = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleString(undefined, { month: 'short', year: '2-digit' })
    const y = d.getFullYear()
    const m = d.getMonth()
    const next = new Date(y, m + 1, 1)
    const completed = (reservations || []).filter((r) => isReservationFulfilledStatus(r.status))
    let c = 0
    for (const r of completed) {
      const raw = reservationFulfilledAt(r)
      if (!raw) continue
      const t = new Date(raw)
      if (t >= new Date(y, m, 1) && t < next) c += 1
    }
    rows.push({ month: label, count: c })
  }
  const maxC = Math.max(...rows.map((r) => r.count), 0)
  return rows.map(({ month, count }) => {
    const score =
      maxC === 0
        ? Math.round(base)
        : Math.round(Math.min(100, Math.max(0, base * (0.58 + 0.42 * (count / maxC)))))
    return { month, score }
  })
}

/** Leaderboard rank badge modifier (pairs with `.ph-mock-lb-rank`). */
function leaderboardRankBadgeModifier(rank, you) {
  if (you) return 'ph-mock-lb-rank--you'
  const r = Number(rank)
  if (!Number.isFinite(r) || r < 1) return 'ph-mock-lb-rank--lower'
  if (r <= 3) return `ph-mock-lb-rank--${r}`
  if (r <= 10) return 'ph-mock-lb-rank--mid'
  return 'ph-mock-lb-rank--lower'
}

/** Score bar fill color tier (pairs with `.ph-mock-lb-fill`). */
function leaderboardScoreFillModifier(rank, you) {
  if (you) return 'ph-mock-lb-fill--you'
  const r = Number(rank)
  if (!Number.isFinite(r) || r < 1) return 'ph-mock-lb-fill--lower'
  if (r === 1) return 'ph-mock-lb-fill--gold'
  if (r === 2) return 'ph-mock-lb-fill--silver'
  if (r === 3) return 'ph-mock-lb-fill--bronze'
  if (r <= 10) return 'ph-mock-lb-fill--mid'
  return 'ph-mock-lb-fill--lower'
}

function PharmacyDashboard() {
  const navigate = useNavigate()
  const { language, setLanguage, languages, t } = useLanguage()
  const [activeTab, setActiveTab] = useState('overview')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [pharmacist, setPharmacist] = useState(null)
  const [pharmacy, setPharmacy] = useState(null)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [requestFilter, setRequestFilter] = useState('all') // all, pending, responded, expired
  const [reqTypeFilter, setReqTypeFilter] = useState('all') // mock chips: all | new | prescription | symptom | search
  const [expandedRequests, setExpandedRequests] = useState(new Set())
  const [invSearchQuery, setInvSearchQuery] = useState('')
  const [invStatusFilter, setInvStatusFilter] = useState('')
  const [settingsSection, setSettingsSection] = useState('profile')
  const [profileForm, setProfileForm] = useState({
    name: '',
    display_name: '',
    license_number: '',
    tax_number: '',
    address: '',
    phone: '',
    whatsapp: '',
    email: '',
    website: '',
    description: ''
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaveFeedback, setProfileSaveFeedback] = useState(null) // { type: 'success'|'error', text }
  const [operationsForm, setOperationsForm] = useState(() => ({ ...DEFAULT_OPERATIONS_FORM }))
  /** Full `operations` object from GET settings (API shape). */
  const [operationsRemote, setOperationsRemote] = useState(null)
  const [operationsSaving, setOperationsSaving] = useState(false)
  const [fulfilStatusFilter, setFulfilStatusFilter] = useState('all')
  const [portalToast, setPortalToast] = useState(null)
  const portalToastTimerRef = useRef(null)

  const showPortalToast = (message) => {
    setPortalToast(message)
    if (portalToastTimerRef.current) clearTimeout(portalToastTimerRef.current)
    portalToastTimerRef.current = setTimeout(() => setPortalToast(null), 3000)
  }
  const [responseForm, setResponseForm] = useState({
    medicines: {}, // { 'medicine_name': { available: false, price: '', alternative: '' } }
    preparation_time: 0,
    notes: '',
    additionalMedicines: [] // { id, medicine, price, quantity } → sent as medicine_responses
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [inventory, setInventory] = useState(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [showInventoryModal, setShowInventoryModal] = useState(false)
  const [inventoryForm, setInventoryForm] = useState({ items: [] })
  const [inventoryRowEdit, setInventoryRowEdit] = useState(null)
  const [inventoryRowBusy, setInventoryRowBusy] = useState(null)
  const [inventoryDeleteTarget, setInventoryDeleteTarget] = useState(null)
  const [reservations, setReservations] = useState([])
  /** From GET reservations when `include_meta=1` (totals, by_status, hint when empty). */
  const [reservationsMeta, setReservationsMeta] = useState(null)
  const [reservationsLoading, setReservationsLoading] = useState(false)
  const [rankingSummary, setRankingSummary] = useState(null)
  /** Registered pharmacies from GET /pharmacies/ for leaderboard (null = not loaded yet). */
  const [platformPharmacies, setPlatformPharmacies] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [acceptingRequests, setAcceptingRequests] = useState(() => {
    try {
      return sessionStorage.getItem('shiftActive') !== 'false'
    } catch {
      return true
    }
  })
  const [skippedRequestIds, setSkippedRequestIds] = useState([])
  /** Set when GET pharmacist/requests returns 403 (e.g. pharmacy not verified); shows banner with API message */
  const [requestsAccessError, setRequestsAccessError] = useState(null)
  const [requestSoundsEnabled, setRequestSoundsEnabledState] = useState(true)
  const seenRequestIdsRef = useRef(new Set())
  const seenReservationIdsRef = useRef(new Set())
  const requestsSeedRef = useRef(true)
  const reservationsSeedRef = useRef(true)

  const toggleAcceptingRequests = () => {
    setAcceptingRequests((v) => {
      const next = !v
      try {
        sessionStorage.setItem('shiftActive', String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const unlockPharmacySounds = async () => {
    await unlockRequestSounds()
    await primePharmacyAlertSounds()
    await requestNotificationPermission()
  }

  const toggleRequestSounds = async () => {
    const next = !requestSoundsEnabled
    setRequestSoundsEnabledState(next)
    setRequestSoundsEnabled(next)
    if (next) {
      await unlockPharmacySounds()
      showPortalToast('Sounds on')
    } else {
      showPortalToast('Sounds muted')
    }
  }

  const handleExportInventoryCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const rows = (filteredInventoryItems || []).map((item) => ({
      medicine_name: item?.medicine_name || '',
      quantity: item?.quantity ?? '',
      status: item?.status || '',
      price: item?.price ?? '',
      price_unit: getPriceUnitLabel(item?.price_unit),
      low_stock_threshold: item?.low_stock_threshold ?? '',
      updated_at: item?.updated_at ? new Date(item.updated_at).toLocaleString() : ''
    }))
    const ok = downloadCsv(`inventory-${stamp}.csv`, rows)
    showPortalToast(ok ? 'Inventory exported as CSV' : 'No inventory rows to export')
  }

  const handleExportEarningsCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const completed = reservations
      .filter((r) => isReservationFulfilledStatus(r.status))
      .sort((a, b) => {
        const da = new Date(reservationFulfilledAt(a) || 0).getTime()
        const db = new Date(reservationFulfilledAt(b) || 0).getTime()
        return db - da
      })
    const rows = completed.map((r) => {
      const id = r.reservation_id || r.id || r.request_id || ''
      const when = reservationFulfilledAt(r)
      const amt = reservationLineAmount(r)
      return {
        reference: String(id),
        medicine_name: r.medicine_name || '',
        quantity: r.quantity ?? '',
        amount_usd: amt > 0 ? amt.toFixed(2) : '',
        status: r.status || '',
        completed_at: when ? new Date(when).toISOString() : '',
      }
    })
    const ok = downloadCsv(`earnings-statement-${stamp}.csv`, rows)
    showPortalToast(ok ? 'Earnings statement exported as CSV' : 'No completed reservations to export')
  }

  const handleProfileFieldChange = (field) => (e) => {
    setProfileForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleOperationsFieldChange = (field) => (e) => {
    const t = e?.target
    if (!t) return
    const value = t.type === 'checkbox' ? t.checked : t.value
    setOperationsForm((prev) => ({ ...prev, [field]: value }))
  }

  const applyProfileToPharmacyState = (profile) => {
    const next = normalizeProfileSettings(profile)
    setProfileForm(next)
    setPharmacy((prev) => (prev ? { ...prev, ...next } : prev))
    const raw = localStorage.getItem('pharmacist')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        parsed.pharmacy = { ...(parsed.pharmacy || {}), ...next }
        parsed.profile = next
        localStorage.setItem('pharmacist', JSON.stringify(parsed))
      } catch {
        /* ignore */
      }
    }
  }

  const applyOperationsToPharmacyState = (ops) => {
    if (!ops || typeof ops !== 'object') return
    setOperationsRemote(ops)
    setOperationsForm(operationsFormFromApi(ops))
    setPharmacy((prev) => (prev ? { ...prev, operations: ops } : prev))
    const raw = localStorage.getItem('pharmacist')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        parsed.pharmacy = { ...(parsed.pharmacy || {}), operations: ops }
        parsed.operations = ops
        localStorage.setItem('pharmacist', JSON.stringify(parsed))
      } catch {
        /* ignore */
      }
    }
    if (typeof ops.accepting_requests === 'boolean') {
      setAcceptingRequests(ops.accepting_requests)
      try {
        sessionStorage.setItem('shiftActive', String(ops.accepting_requests))
      } catch {
        /* ignore */
      }
    }
  }

  const reservationsBlocked = pharmacyBlocksReservations(operationsRemote)

  const handleSaveOperations = async () => {
    if (operationsSaving) return
    setOperationsSaving(true)
    const payload = buildOperationsApiPatch(operationsForm, {
      mergeFrom: operationsRemote,
      acceptingRequests,
    })
    let savedRemote = false
    try {
      if (pharmacist?.pharmacist_id) {
        try {
          const data = await patchPharmacistSettings(pharmacist.pharmacist_id, {
            operations: payload,
          })
          const remoteOps = data?.operations ?? data?.settings?.operations
          if (remoteOps) {
            applyOperationsToPharmacyState(remoteOps)
            savedRemote = true
          } else {
            applyOperationsToPharmacyState(
              saveOperationsToStorage(operationsForm, { mergeFrom: operationsRemote, acceptingRequests })
            )
          }
        } catch (apiErr) {
          if (apiErr.status !== 404 && apiErr.status !== 405) {
            console.warn('Operations API save failed, using local storage:', apiErr.message)
          }
          applyOperationsToPharmacyState(
            saveOperationsToStorage(operationsForm, { mergeFrom: operationsRemote, acceptingRequests })
          )
        }
      } else {
        applyOperationsToPharmacyState(
          saveOperationsToStorage(operationsForm, { mergeFrom: operationsRemote, acceptingRequests })
        )
      }
      showPortalToast(
        savedRemote ? 'Operations settings saved' : 'Operations saved on this device'
      )
    } catch (err) {
      console.error('Failed to save operations:', err)
      setError(t('ph.err.saveSettings'))
    } finally {
      setOperationsSaving(false)
    }
  }

  const handleSaveProfile = async () => {
    if (profileSaving) return
    setProfileSaving(true)
    setProfileSaveFeedback(null)
    const payload = normalizeProfileSettings(profileForm)
    let savedRemote = false
    try {
      if (pharmacist?.pharmacist_id) {
        try {
          const data = await patchPharmacistSettings(pharmacist.pharmacist_id, { profile: payload })
          const remoteProfile = data?.profile ?? data?.settings?.profile
          if (remoteProfile) {
            applyProfileToPharmacyState(remoteProfile)
            savedRemote = true
          } else {
            applyProfileToPharmacyState(saveProfileToStorage(payload))
          }
        } catch (apiErr) {
          if (apiErr.status === 401) {
            const authMsg = hasPharmacistApiAuth()
              ? 'Server rejected your session. Log out and sign in again, then save profile.'
              : 'Not signed in with an API token. Log out and sign in again — the server must return a token from login.'
            setProfileSaveFeedback({ type: 'error', text: authMsg })
            setError(authMsg)
            applyProfileToPharmacyState(saveProfileToStorage(payload))
            showPortalToast('Profile saved on this device only')
            return
          }
          if (apiErr.status !== 404 && apiErr.status !== 405) {
            console.warn('Profile API save failed, using local storage:', apiErr.message)
          }
          applyProfileToPharmacyState(saveProfileToStorage(payload))
        }
      } else {
        applyProfileToPharmacyState(saveProfileToStorage(payload))
      }
      const msg = savedRemote
        ? 'Profile saved to your account'
        : 'Profile saved on this device (server sync when available)'
      setProfileSaveFeedback({ type: 'success', text: msg })
      showPortalToast(msg)
    } catch (err) {
      console.error('Failed to save profile:', err)
      const text = err?.message || 'Could not save profile changes.'
      setProfileSaveFeedback({ type: 'error', text })
      setError(text)
    } finally {
      setProfileSaving(false)
    }
  }

  // Load pharmacist data from localStorage
  useEffect(() => {
    const pharmacistData = localStorage.getItem('pharmacist')
    if (!pharmacistData) {
      navigate('/login')
      return
    }

    try {
      const parsed = JSON.parse(pharmacistData)
      setPharmacist(parsed)
      setPharmacy(parsed.pharmacy)
    } catch (err) {
      console.error('Error parsing pharmacist data:', err)
      navigate('/login')
    }
  }, [navigate])

  useEffect(() => {
    if (!pharmacy) return
    setProfileForm(normalizeProfileSettings(pharmacy))
    if (pharmacy.operations) {
      setOperationsRemote(pharmacy.operations)
      setOperationsForm(operationsFormFromApi(pharmacy.operations))
    }
  }, [pharmacy])

  useEffect(() => {
    if (!pharmacist?.pharmacist_id) return
    setOperationsForm(loadOperationsFromStorage())
    let cancelled = false
    const storedProfile = loadProfileFromStorage()
    if (Object.values(storedProfile).some(Boolean)) {
      applyProfileToPharmacyState(storedProfile)
    }
    getPharmacistSettings(pharmacist.pharmacist_id)
      .then((data) => {
        if (cancelled) return
        const remoteOps = data?.operations
        if (remoteOps) applyOperationsToPharmacyState(remoteOps)
        const remoteProfile = data?.profile ?? data?.settings?.profile
        if (remoteProfile) applyProfileToPharmacyState(remoteProfile)
      })
      .catch(() => {
        /* 404/405 — local storage only */
      })
    return () => {
      cancelled = true
    }
  }, [pharmacist?.pharmacist_id])

  // Sounds on by default; unlock audio on first click anywhere in the portal (browser policy)
  useEffect(() => {
    if (!pharmacist?.pharmacist_id) return undefined
    setRequestSoundsEnabledState(true)
    setRequestSoundsEnabled(true)
    primePharmacyAlertSounds()

    const onInteract = () => {
      unlockPharmacySounds()
    }
    document.addEventListener('pointerdown', onInteract, { once: true, capture: true })
    return () => document.removeEventListener('pointerdown', onInteract, { capture: true })
  }, [pharmacist?.pharmacist_id])

  // Fetch requests + alert on newly seen pending requests (sound / notification)
  useEffect(() => {
    const pharmacistId = pharmacist?.pharmacist_id
    if (!pharmacistId) return

    seenRequestIdsRef.current = loadSeenRequestIds(pharmacistId)
    requestsSeedRef.current = true

    const fetchRequests = async ({ initial = false } = {}) => {
      try {
        if (initial) setLoading(true)
        const data = await getPharmacistRequests(pharmacistId, {
          includeHistory: import.meta.env.VITE_PHARMACIST_REQUESTS_INCLUDE_HISTORY === 'true',
        })
        const list = Array.isArray(data) ? data : []
        const seedOnly = requestsSeedRef.current
        const fresh = collectNewActionableRequests(list, seenRequestIdsRef.current, { seedOnly })
        saveSeenRequestIds(pharmacistId, seenRequestIdsRef.current)
        requestsSeedRef.current = false

        if (
          shouldPlayPharmacyAlerts({ acceptingRequests, soundsEnabled: requestSoundsEnabled }) &&
          !seedOnly &&
          fresh.length > 0
        ) {
          playNewRequestSound()
          fresh.forEach((r) => showNewRequestNotification(r))
          if (fresh.length === 1) {
            showPortalToast('New patient request')
          } else {
            showPortalToast(`${fresh.length} new patient requests`)
          }
        }

        setRequests(list)
        setRequestsAccessError(null)
      } catch (err) {
        console.error('Error fetching requests:', err)
        if (initial) setRequests([])
        if (err.status === 403) {
          setRequestsAccessError(err.message || 'Your pharmacy cannot receive patient requests yet.')
        } else if (initial) {
          setRequestsAccessError(null)
          setError(t('ph.err.loadRequests'))
        }
      } finally {
        if (initial) setLoading(false)
      }
    }

    fetchRequests({ initial: true })

    const pollMs = acceptingRequests ? REQUEST_POLL_MS_ACTIVE : REQUEST_POLL_MS_PAUSED
    const interval = setInterval(() => fetchRequests({ initial: false }), pollMs)
    return () => clearInterval(interval)
  }, [
    pharmacist?.pharmacist_id,
    acceptingRequests,
    requestSoundsEnabled,
  ])

  // Fetch inventory
  useEffect(() => {
    if (!pharmacist?.pharmacist_id) return

    const fetchInventory = async () => {
      try {
        setInventoryLoading(true)
        const data = await getPharmacistInventory(pharmacist.pharmacist_id)
        setInventory(normalizePharmacistInventoryResponse(data))
      } catch (err) {
        console.error('Error fetching inventory:', err)
      } finally {
        setInventoryLoading(false)
      }
    }

    fetchInventory()
  }, [pharmacist?.pharmacist_id])

  // Fetch reservations + alert on new patient reservations
  useEffect(() => {
    const pharmacistId = pharmacist?.pharmacist_id
    if (!pharmacistId) return

    seenReservationIdsRef.current = loadSeenReservationIds(pharmacistId)
    reservationsSeedRef.current = true

    const fetchReservations = async ({ initial = false } = {}) => {
      try {
        if (initial) setReservationsLoading(true)
        const data = await getPharmacistReservations(pharmacistId, PHARMACIST_RESERVATIONS_FETCH)
        const parsed = parsePharmacistReservationsPayload(data)
        const list = parsed.list
        const seedOnly = reservationsSeedRef.current
        const fresh = collectNewActionableReservations(list, seenReservationIdsRef.current, { seedOnly })
        saveSeenReservationIds(pharmacistId, seenReservationIdsRef.current)
        reservationsSeedRef.current = false

        if (
          shouldPlayPharmacyAlerts({ acceptingRequests, soundsEnabled: requestSoundsEnabled }) &&
          !seedOnly &&
          fresh.length > 0
        ) {
          playNewReservationSound()
          fresh.forEach((r) => showNewReservationNotification(r))
          if (fresh.length === 1) {
            showPortalToast('New reservation — confirm in Fulfillment log')
          } else {
            showPortalToast(`${fresh.length} new reservations`)
          }
        }

        setReservations(list)
        setReservationsMeta(parsed.meta)
      } catch (err) {
        console.error('Error fetching reservations:', err)
        if (initial) {
          setReservations([])
          setReservationsMeta(null)
        }
      } finally {
        if (initial) setReservationsLoading(false)
      }
    }

    fetchReservations({ initial: true })
    const pollMs = acceptingRequests ? REQUEST_POLL_MS_ACTIVE : REQUEST_POLL_MS_PAUSED
    const interval = setInterval(() => fetchReservations({ initial: false }), pollMs)
    return () => clearInterval(interval)
  }, [
    pharmacist?.pharmacist_id,
    acceptingRequests,
    requestSoundsEnabled,
  ])

  useEffect(() => {
    if (!pharmacist?.pharmacist_id) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await getPharmacistRankingSummary(pharmacist.pharmacist_id)
        if (!cancelled && data && typeof data === 'object') setRankingSummary(data)
      } catch (e) {
        console.warn('Pharmacy ranking summary unavailable:', e?.message || e)
        if (!cancelled) setRankingSummary(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pharmacist?.pharmacist_id])

  useEffect(() => {
    if (!pharmacist?.pharmacist_id) return
    let cancelled = false
    getAllPharmacies()
      .then((data) => {
        if (cancelled) return
        setPlatformPharmacies(normalizePharmaciesFromApiPayload(data))
      })
      .catch(() => {
        if (!cancelled) setPlatformPharmacies([])
      })
    return () => {
      cancelled = true
    }
  }, [pharmacist?.pharmacist_id])

  useEffect(() => {
    if (activeTab !== 'settings') return
    if (settingsSection !== 'profile' && settingsSection !== 'operations') {
      setSettingsSection('profile')
    }
  }, [activeTab, settingsSection])

  const handleLogout = () => {
    localStorage.removeItem('pharmacist')
    localStorage.removeItem('pharmacy_id')
    localStorage.removeItem('pharmacist_id')
    localStorage.removeItem('userRole')
    localStorage.removeItem('token')
    navigate('/')
  }

  // Match medicine names flexibly (handles "paracetamol 500mg" vs "paracetamol", "ibuprofen" vs "ibrufen")
  const getInventoryStatusForItems = (items, medicineName) => {
    const list = items || []
    const req = (medicineName || '').toLowerCase().trim()
    const reqBase = req.replace(/\s*\d+[\s]*(mg|ml|g|mcg|units?|tablets?|capsules?)?\s*/gi, '').trim() || req
    const item = list.find(i => {
      const inv = (i.medicine_name || '').toLowerCase().trim()
      const invBase = inv.replace(/\s*\d+[\s]*(mg|ml|g|mcg|units?|tablets?|capsules?)?\s*/gi, '').trim() || inv
      if (inv === req || invBase === reqBase) return true
      if (inv.startsWith(reqBase) || reqBase.startsWith(invBase)) return true
      if (inv.includes(reqBase) || reqBase.includes(invBase)) return true
      // Common aliases
      const aliases = { 'ibuprofen': 'ibrufen', 'ibrufen': 'ibuprofen', 'acetaminophen': 'paracetamol', 'panadol': 'paracetamol' }
      return (aliases[reqBase] === invBase) || (aliases[invBase] === reqBase)
    })
    const qty = item ? (parseInt(item.quantity, 10) || 0) : 0
    return { available: qty > 0, quantity: qty, matchedItem: item }
  }

  const handleOpenResponse = async (request) => {
    setSelectedRequest(request)
    let invData = inventory
    if (pharmacist?.pharmacist_id) {
      try {
        invData = await getPharmacistInventory(pharmacist.pharmacist_id)
        setInventory(normalizePharmacistInventoryResponse(invData))
      } catch (err) {
        console.error('Error refreshing inventory:', err)
      }
    }
    const medicineNames = normalizeDisplayMedicineNames([
      ...(request.medicine_names || []),
      ...prescriptionMedicineNames(request, null),
    ]).filter(med => {
      const lowerMed = med.toLowerCase().trim()
      const invalidPatterns = [
        'unable', 'uploaded', 'minutes', 'before', 'after', 'eatin', 'eating',
        'dru', 'mg', 'ml', 'tablet', 'capsule', 'times', 'per', 'day'
      ]
      if (lowerMed.length < 2 || invalidPatterns.some(pattern => lowerMed.includes(pattern))) return false
      if (/^\d+$|^\d+[:\-]/.test(lowerMed)) return false
      return med.trim().length > 0
    })
    const medicines = {}
    medicineNames.forEach(medicine => {
      const { available, quantity } = getInventoryStatusForItems(invData?.items, medicine)
      medicines[medicine] = {
        available,
        price: '',
        quantity: available ? String(quantity) : '',
        quantity_unit: 'capsules',
        expiry: '',
        alternative: ''
      }
    })
    setResponseForm({
      medicines,
      preparation_time: 0,
      notes: '',
      additionalMedicines: []
    })
    setError('')
  }

  const handleCloseResponse = () => {
    setSelectedRequest(null)
    setError('')
  }

  const handleOpenInventoryModal = () => {
    const items = (inventory?.items || []).map((i) => {
      const { name, dosage } = splitInventoryMedicineFields(i)
      return {
        original_medicine_name: i.medicine_name,
        medicine_name: name,
        dosage,
        quantity: i.quantity ?? 0,
        low_stock_threshold: i.low_stock_threshold ?? 10,
        price: i.price != null && i.price !== '' ? Number(i.price) : '',
        price_unit: i.price_unit || 'per_packet',
      }
    })
    setInventoryForm({
      items: items.length
        ? items
        : [{ medicine_name: '', dosage: '', quantity: 0, low_stock_threshold: 10, price: '', price_unit: 'per_packet' }],
    })
    setShowInventoryModal(true)
    setError('')
  }

  const handleCloseInventoryModal = () => {
    setShowInventoryModal(false)
    setError('')
  }

  const handleAddInventoryItem = () => {
    setInventoryForm(prev => ({
      items: [...prev.items, { medicine_name: '', dosage: '', quantity: 0, low_stock_threshold: 10, price: '', price_unit: 'per_packet' }]
    }))
  }

  const handleUpdateInventoryItem = (index, field, value) => {
    setInventoryForm(prev => ({
      items: prev.items.map((item, i) => {
        if (i !== index) return item
        if (field === 'medicine_name' || field === 'dosage') return { ...item, [field]: value }
        if (field === 'price_unit') return { ...item, price_unit: value }
        if (field === 'price') {
          if (value === '') return { ...item, price: '' }
          const num = parseFloat(value)
          return { ...item, price: Number.isNaN(num) ? item.price : (num >= 0 ? num : item.price) }
        }
        return { ...item, [field]: parseInt(value, 10) || 0 }
      })
    }))
  }

  const handleRemoveInventoryItem = (index) => {
    setInventoryForm(prev => ({
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const handleSubmitInventory = async () => {
    const rows = inventoryForm.items
      .map((i) => ({
        ...i,
        joined: joinInventoryMedicineFields(i.medicine_name, i.dosage).trim(),
      }))
      .filter((i) => i.joined)

    const missingPrice = rows.find(
      (i) => i.price === '' || i.price == null || (typeof i.price === 'number' && Number.isNaN(i.price))
    )
    if (missingPrice) {
      const label = missingPrice.joined
      setError(`Each item must include "price" (number). Medicine "${label}" is missing price.`)
      return
    }

    if (rows.length === 0) {
      setError(t('ph.err.addOneMedicine'))
      return
    }

    const updates = []
    const creates = []
    for (const row of rows) {
      const line = {
        quantity: row.quantity,
        low_stock_threshold: row.low_stock_threshold,
        price: Number(row.price) >= 0 ? Number(row.price) : 0,
      }
      if (row.original_medicine_name) {
        const patch = {
          medicine_name: row.original_medicine_name,
          ...line,
        }
        if (row.joined.toLowerCase() !== String(row.original_medicine_name).trim().toLowerCase()) {
          patch.new_medicine_name = row.joined
        }
        updates.push(patch)
      } else {
        creates.push({ medicine_name: row.joined, ...line })
      }
    }

    setSubmitting(true)
    setError('')
    try {
      let snapshot = inventory
      for (const patch of updates) {
        const data = await patchPharmacistInventoryItem(pharmacist.pharmacist_id, patch)
        snapshot = normalizePharmacistInventoryResponse(data)
      }
      if (creates.length > 0) {
        const data = await postPharmacistInventoryBulk(pharmacist.pharmacist_id, creates)
        snapshot = normalizePharmacistInventoryResponse(data)
      }
      setInventory(snapshot)
      handleCloseInventoryModal()
      const parts = []
      if (updates.length) parts.push(`${updates.length} updated`)
      if (creates.length) parts.push(`${creates.length} added`)
      showPortalToast(parts.length ? `Inventory: ${parts.join(', ')}` : 'Inventory updated')
    } catch (err) {
      setError(err.message || 'Failed to save inventory')
    } finally {
      setSubmitting(false)
    }
  }

  const startEditInventoryRow = (item) => {
    const { name, dosage } = splitInventoryMedicineFields(item)
    setInventoryRowEdit({
      original_medicine_name: item.medicine_name,
      medicine_name: name,
      dosage,
      quantity: item.quantity ?? 0,
      low_stock_threshold: item.low_stock_threshold ?? 10,
      price: item.price != null && item.price !== '' ? Number(item.price) : '',
    })
    setError('')
  }

  const cancelEditInventoryRow = () => {
    setInventoryRowEdit(null)
    setError('')
  }

  const updateInventoryRowEditField = (field, value) => {
    setInventoryRowEdit((prev) => {
      if (!prev) return prev
      if (field === 'medicine_name' || field === 'dosage') {
        return { ...prev, [field]: value }
      }
      if (field === 'price') {
        if (value === '') return { ...prev, price: '' }
        const num = parseFloat(value)
        return { ...prev, price: Number.isNaN(num) ? prev.price : num }
      }
      return { ...prev, [field]: parseInt(value, 10) || 0 }
    })
  }

  const saveInventoryRow = async () => {
    if (!inventoryRowEdit || !pharmacist?.pharmacist_id) return
    const { original_medicine_name, medicine_name, dosage, quantity, low_stock_threshold, price } =
      inventoryRowEdit
    const joined = joinInventoryMedicineFields(medicine_name, dosage)
    if (!joined.trim()) {
      setError(t('ph.err.medicineRequired'))
      return
    }
    if (price === '' || price == null || Number.isNaN(Number(price))) {
      setError(t('ph.err.priceRequired'))
      return
    }
    setInventoryRowBusy(original_medicine_name)
    setError('')
    try {
      const payload = {
        medicine_name: original_medicine_name,
        quantity,
        low_stock_threshold,
        price: Number(price),
      }
      if (joined.trim().toLowerCase() !== String(original_medicine_name).trim().toLowerCase()) {
        payload.new_medicine_name = joined.trim()
      }
      const data = await patchPharmacistInventoryItem(pharmacist.pharmacist_id, payload)
      setInventory(normalizePharmacistInventoryResponse(data))
      setInventoryRowEdit(null)
      showPortalToast(`Updated ${joined}`)
    } catch (err) {
      setError(err.message || 'Failed to update item')
    } finally {
      setInventoryRowBusy(null)
    }
  }

  const openDeleteInventoryModal = (item) => {
    if (!item?.medicine_name) return
    const reserved = Number(item.reserved_quantity) || 0
    if (reserved > 0) {
      setError(
        `Cannot delete "${item.medicine_name}" — ${reserved} unit(s) reserved. Complete or cancel reservations first.`
      )
      return
    }
    setError('')
    setInventoryDeleteTarget(item)
  }

  const closeDeleteInventoryModal = () => {
    if (inventoryRowBusy) return
    setInventoryDeleteTarget(null)
  }

  const confirmDeleteInventoryRow = async () => {
    const item = inventoryDeleteTarget
    if (!item?.medicine_name || !pharmacist?.pharmacist_id) return
    setInventoryRowBusy(item.medicine_name)
    setError('')
    try {
      const data = await deletePharmacistInventoryItem(pharmacist.pharmacist_id, item.medicine_name)
      setInventory(normalizePharmacistInventoryResponse(data))
      if (inventoryRowEdit?.medicine_name === item.medicine_name) {
        setInventoryRowEdit(null)
      }
      setInventoryDeleteTarget(null)
      showPortalToast(`Deleted ${item.medicine_name}`)
    } catch (err) {
      setError(err.message || 'Failed to delete item')
    } finally {
      setInventoryRowBusy(null)
    }
  }

  const handleDecline = (request) => {
    if (window.confirm('Decline this request? The patient will not see your pharmacy in results.')) {
      // TODO: API call to decline when backend supports it
      setRequests(prev => prev.map(r => r.request_id === request.request_id ? { ...r, declined: true } : r))
    }
  }

  const handleConfirmReservation = async (reservation) => {
    const id = reservation.reservation_id || reservation.id
    if (!id || !pharmacist?.pharmacist_id) return
    if (pharmacyBlocksReservations(operationsRemote)) {
      const note = operationsForm.holiday_notes?.trim() || 'your pharmacy is marked unavailable'
      setError(`Cannot confirm reservations while ${note}. Update Hours & operations when you are open again.`)
      showPortalToast('Reservations paused — pharmacy unavailable')
      return
    }
    try {
      await confirmReservation(id, pharmacist.pharmacist_id)
      const data = await getPharmacistReservations(pharmacist.pharmacist_id, PHARMACIST_RESERVATIONS_FETCH)
      const parsed = parsePharmacistReservationsPayload(data)
      setReservations(parsed.list)
      setReservationsMeta(parsed.meta)
    } catch (err) {
      setError(err.message || 'Failed to confirm reservation')
    }
  }

  const handleCompleteReservation = async (reservation) => {
    const id = reservation.reservation_id || reservation.id
    if (!id || !pharmacist?.pharmacist_id) return
    try {
      await completeReservation(id, pharmacist.pharmacist_id)
      const data = await getPharmacistReservations(pharmacist.pharmacist_id, PHARMACIST_RESERVATIONS_FETCH)
      const parsed = parsePharmacistReservationsPayload(data)
      setReservations(parsed.list)
      setReservationsMeta(parsed.meta)
      const invData = await getPharmacistInventory(pharmacist.pharmacist_id)
      setInventory(invData)
    } catch (err) {
      setError(err.message || 'Failed to complete reservation')
    }
  }

  const handleSuggestAlternative = (request) => {
    setSelectedRequest(request)
    handleOpenResponse(request)
  }

  // Parse "Paracetamol $5.00, Ibuprofen $7.50" from notes into { medicineName -> price }
  const parseNotesMedicinesWithPrices = (notes) => {
    const map = {}
    if (!notes?.trim()) return map
    const parts = notes.split(',').map(s => s.trim()).filter(Boolean)
    for (const part of parts) {
      const match = part.match(/^(.+?)\s*\$([\d.]+)\s*$/i)
      if (match) {
        map[match[1].trim().toLowerCase()] = match[2]
      }
    }
    return map
  }

  const handleSubmitResponse = async () => {
    if (!selectedRequest) return

    const medicines = responseForm.medicines || {}
    const isSymptomRequest = selectedRequest.request_type === 'symptom'
    const isRxImageReview = requestNeedsPharmacistMedicineEntry(selectedRequest)
    const isSymptomLike = isSymptomRequest || isRxImageReview

    if (isRxImageReview) {
      const notesPrices = parseNotesMedicinesWithPrices(responseForm.notes)
      if (Object.keys(notesPrices).length === 0) {
        setError(
          'Read the prescription image and list medicines with prices (e.g. Paracetamol $5.00, Ibuprofen $7.50).'
        )
        return
      }
    }

    // Symptom / Rx-image: pharmacist enters "paracetamol $1" in notes — skip per-row price validation
    if (!isSymptomLike) {
      for (const [medicineName, medicineData] of Object.entries(medicines)) {
        if (medicineData.available && !medicineData.price) {
          setError(`Please enter a price for ${medicineName} if it's available`)
          return
        }
      }
    }

    const extrasCheck = responseForm.additionalMedicines || []
    for (const row of extrasCheck) {
      const name = (row.medicine || '').trim()
      const priceRaw =
        row.price !== '' && row.price != null ? String(row.price).trim() : ''
      if (name && !priceRaw) {
        setError(`Enter a price for additional medicine: ${name}`)
        return
      }
      if (priceRaw && !name) {
        setError('Enter a medicine name for each additional row that has a price')
        return
      }
    }

    setSubmitting(true)
    setError('')

    const notesPrices = isSymptomLike ? parseNotesMedicinesWithPrices(responseForm.notes) : {}

    const allAlternatives = []
    Object.entries(medicines).forEach(([medicineName, medicineData]) => {
      if (medicineData.alternative && medicineData.alternative.trim()) {
        const alternatives = medicineData.alternative.split(',').map(s => s.trim()).filter(s => s)
        allAlternatives.push(...alternatives)
      }
    })

    let atLeastOneAvailable = Object.values(medicines).some(m => m.available)
    let avgPrice = null
    let medicineResponses = []

    if (isSymptomLike) {
      const fromNotes = Object.entries(notesPrices).map(([lower, price]) => ({
        medicine: lower,
        available: true,
        price,
        quantity: null,
        expiry: null,
        alternative: null,
      }))
      if (fromNotes.length > 0) {
        medicineResponses = fromNotes
        const prices = fromNotes.map((m) => parseFloat(m.price)).filter((p) => !Number.isNaN(p))
        avgPrice = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : null
        atLeastOneAvailable = true
      } else {
        medicineResponses = Object.entries(medicines).map(([medicineName, medicineData]) => {
          const lowerName = medicineName.toLowerCase()
          const priceFromNotes = notesPrices[lowerName]
          const price = medicineData.price || priceFromNotes
          const available = medicineData.available
          if (available && price) {
            return {
              medicine: medicineName,
              available: true,
              price,
              quantity: medicineData.quantity || null,
              expiry: medicineData.expiry || null,
              alternative: medicineData.alternative || null,
            }
          }
          return {
            medicine: medicineName,
            available: medicineData.available,
            price: price || null,
            quantity: medicineData.quantity || null,
            expiry: medicineData.expiry || null,
            alternative: medicineData.alternative || null,
          }
        })
        const withPrice = medicineResponses.filter((m) => m.available && m.price)
        if (withPrice.length > 0) {
          const prices = withPrice.map((m) => parseFloat(m.price)).filter((p) => !Number.isNaN(p))
          avgPrice =
            prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : null
          atLeastOneAvailable = true
        }
      }
    } else {
      const availableMedicines = Object.values(medicines).filter(m => m.available && m.price)
      if (availableMedicines.length > 0) {
        const prices = availableMedicines.map(m => parseFloat(m.price)).filter(p => !isNaN(p))
        avgPrice = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : null
      }
      medicineResponses = Object.entries(medicines).map(([medicineName, medicineData]) => ({
        medicine: medicineName,
        available: medicineData.available,
        price: medicineData.available && medicineData.price ? medicineData.price : null,
        quantity: medicineData.quantity || null,
        expiry: medicineData.expiry || null,
        alternative: medicineData.alternative || null
      }))
    }

    // Merge additional medicines (explicit rows) into medicine_responses — not notes
    const extras = responseForm.additionalMedicines || []
    extras.forEach((row) => {
      const name = (row.medicine || '').trim()
      const priceRaw = row.price !== '' && row.price != null ? String(row.price).trim() : ''
      if (!name || !priceRaw) return
      const quantity = (row.quantity || '').trim() || null
      const newRow = {
        medicine: name,
        available: true,
        price: priceRaw,
        quantity,
        expiry: null,
        alternative: null
      }
      const lower = name.toLowerCase()
      const idx = medicineResponses.findIndex((m) => (m.medicine || '').toLowerCase() === lower)
      if (idx >= 0) {
        medicineResponses[idx] = {
          ...medicineResponses[idx],
          ...newRow,
          available: true
        }
      } else {
        medicineResponses.push(newRow)
      }
    })

    atLeastOneAvailable =
      atLeastOneAvailable ||
      medicineResponses.some((m) => m.available && m.price != null && m.price !== '')
    const priced = medicineResponses.filter((m) => m.available && m.price != null && m.price !== '')
    if (priced.length > 0) {
      const prices = priced.map((m) => parseFloat(m.price)).filter((p) => !Number.isNaN(p))
      avgPrice = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : avgPrice
    }

    try {
      await submitPharmacyResponse(selectedRequest.request_id, {
        pharmacist_id: pharmacist.pharmacist_id,
        medicine_available: atLeastOneAvailable,
        price: atLeastOneAvailable ? avgPrice : null,
        preparation_time: responseForm.preparation_time || 0,
        alternative_medicines: [...new Set(allAlternatives)],
        notes: responseForm.notes || '',
        medicine_responses: medicineResponses
      })

      // Update request status
      setRequests(requests.map(req => 
        req.request_id === selectedRequest.request_id 
          ? { ...req, has_responded: true, status: 'responded' }
          : req
      ))

      handleCloseResponse()
    } catch (err) {
      const msg = err.message || 'Failed to submit response. Please try again.'
      setError(msg)
      if (err.status === 403) {
        showPortalToast(msg)
        setRequestsAccessError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  const stats = {
    totalRequests: requests.length,
    responded: requests.filter(r => r.has_responded).length,
    pending: requests.filter(r => !r.has_responded && !isExpired(r.expires_at)).length,
    expired: requests.filter(r => !r.has_responded && isExpired(r.expires_at)).length
  }

  const overviewMetrics = useMemo(() => {
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)
    const startTomorrow = new Date(startToday)
    startTomorrow.setDate(startTomorrow.getDate() + 1)
    const startYesterday = new Date(startToday)
    startYesterday.setDate(startYesterday.getDate() - 1)

    const createdToday = requests.filter((r) => {
      const d = new Date(r.created_at)
      return d >= startToday && d < startTomorrow
    })
    const createdYesterday = requests.filter((r) => {
      const d = new Date(r.created_at)
      return d >= startYesterday && d < startToday
    })
    const newTodayCount = createdToday.length
    const respondedTodayCount = createdToday.filter((r) => r.has_responded).length
    const responseRateToday = newTodayCount
      ? Math.round((respondedTodayCount / newTodayCount) * 100)
      : (requests.length
        ? Math.round((requests.filter((r) => r.has_responded).length / requests.length) * 100)
        : 0)

    const completedRes = reservations.filter((r) => isReservationFulfilledStatus(r.status))
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const completedThisMonth = completedRes.filter((r) => {
      const raw = reservationFulfilledAt(r)
      if (!raw) return false
      const d = new Date(raw)
      return d >= monthStart
    })
    const earningsMonth = completedThisMonth.reduce((sum, r) => sum + reservationLineAmount(r), 0)
    const fulfilledMonthCount = completedThisMonth.length
    const avgPerRequest = fulfilledMonthCount ? (earningsMonth / fulfilledMonthCount).toFixed(2) : '—'
    const completedToday = completedRes.filter((r) => {
      const raw = reservationFulfilledAt(r)
      if (!raw) return false
      const d = new Date(raw)
      return d >= startToday && d < startTomorrow
    })
    const revenueToday = completedToday.reduce((sum, r) => sum + reservationLineAmount(r), 0)
    const completedYesterday = completedRes.filter((r) => {
      const raw = reservationFulfilledAt(r)
      if (!raw) return false
      const d = new Date(raw)
      return d >= startYesterday && d < startToday
    })
    const revenueYesterday = completedYesterday.reduce((sum, r) => sum + reservationLineAmount(r), 0)

    const pct0to100 = (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null
    }

    const items = inventory?.items || []
    const inStockCount = items.filter((i) => (parseInt(i.quantity, 10) || 0) > 0).length
    const stockFromSummary = pct0to100(rankingSummary?.stock_reliability_pct)
    const stockReliabilityPct =
      stockFromSummary != null
        ? stockFromSummary
        : items.length
          ? Math.round((inStockCount / items.length) * 100)
          : 90

    const rrApi = pharmacy?.response_rate != null ? Number(pharmacy.response_rate) : null
    const rrFromSummary = pct0to100(rankingSummary?.response_rate_pct)
    const rr =
      rrFromSummary != null
        ? rrFromSummary
        : Number.isFinite(rrApi)
          ? rrApi
          : requests.length
            ? (requests.filter((r) => r.has_responded).length / requests.length) * 100
            : 71
    const ratingVal = pharmacy?.rating != null ? Number(pharmacy.rating) : null
    const patientFromSummary = pct0to100(rankingSummary?.patient_rating_pct)
    const patientRatingPct =
      patientFromSummary != null
        ? patientFromSummary
        : Number.isFinite(ratingVal)
          ? Math.round((ratingVal / 5) * 100)
          : 82
    const priceFromSummary = pct0to100(rankingSummary?.price_competitiveness_pct)
    const priceCompetitivenessPct = priceFromSummary != null ? priceFromSummary : 84
    const responseRatePct = Math.min(100, Math.round(rr))
    const distanceFromSummary = pct0to100(rankingSummary?.distance_pct)
    const reliabilityCompositeFromSummary = pct0to100(rankingSummary?.reliability_composite_pct)
    const portalBreakdownScore = getPortalCompositeScoreFromSummary(rankingSummary)
    const formulaScore = computeRankingScoreFromFiveFactorFormula(rankingSummary)
    const scoreFromApi = Number(rankingSummary?.ranking_score_0_100)
    const rankingScore =
      portalBreakdownScore != null
        ? portalBreakdownScore
        : formulaScore != null
          ? formulaScore
          : Number.isFinite(scoreFromApi)
            ? Math.round(scoreFromApi)
            : Math.round(
                priceCompetitivenessPct * 0.3 +
                  responseRatePct * 0.2 +
                  stockReliabilityPct * 0.15 +
                  patientRatingPct * 0.2
              )
    const fulfilmentRatePct =
      reservations.length > 0
        ? Math.round((completedRes.length / reservations.length) * 100)
        : 0

    const addr = pharmacy?.address || ''
    const parts = addr.split(',').map((s) => s.trim()).filter(Boolean)
    const cityLine =
      parts.length >= 2 ? `${parts[parts.length - 2]}, ${parts[parts.length - 1]}` : addr || ''
    const cityShort =
      parts.length >= 2 ? String(parts[parts.length - 2] || '').trim() : parts[0]?.trim() || ''
    const rankLine =
      rankingSummary?.leaderboard_rank != null && rankingSummary?.leaderboard_total != null
        ? `Rank #${rankingSummary.leaderboard_rank} of ${rankingSummary.leaderboard_total} in ${rankingSummary.leaderboard_area || cityShort || 'your area'}`
        : pharmacy?.leaderboard_rank != null && pharmacy?.leaderboard_total != null
          ? `Rank #${pharmacy.leaderboard_rank} of ${pharmacy.leaderboard_total} in ${pharmacy.leaderboard_area || cityShort || 'your area'}`
          : cityShort
            ? `Active in ${cityShort} · full leaderboard when synced`
            : 'How you compare on MediConnect'

    const leaderboardRank =
      rankingSummary?.leaderboard_rank != null
        ? Number(rankingSummary.leaderboard_rank)
        : pharmacy?.leaderboard_rank != null
          ? Number(pharmacy.leaderboard_rank)
          : null
    const leaderboardTotal =
      rankingSummary?.leaderboard_total != null
        ? Number(rankingSummary.leaderboard_total)
        : pharmacy?.leaderboard_total != null
          ? Number(pharmacy.leaderboard_total)
          : null
    const rankAreaLabel = String(rankingSummary?.leaderboard_area || cityShort || 'local').trim() || 'local'
    const rankingVsLine = `Your position vs ${rankAreaLabel} pharmacies`

    const overviewHeaderSubline = (() => {
      const d = new Date()
      const dateStr = d.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      const loc =
        cityLine && !/zimbabwe/i.test(cityLine)
          ? `${cityLine}, Zimbabwe`
          : cityLine || 'Harare, Zimbabwe'
      return `${dateStr} — ${loc}`
    })()

    const patientStars =
      ratingVal != null && Number.isFinite(ratingVal) ? ratingVal.toFixed(1) : '—'

    return {
      newTodayCount,
      newYesterdayCount: createdYesterday.length,
      newTrendDelta: newTodayCount - createdYesterday.length,
      respondedTodayCount,
      responseRateToday,
      revenueToday,
      revenueYesterday,
      earningsMonth,
      fulfilledMonthCount,
      avgPerRequest,
      stockReliabilityPct,
      priceCompetitivenessPct,
      responseRatePct,
      patientRatingPct,
      rankingScore,
      fulfilmentRatePct,
      cityLine,
      rankLine,
      leaderboardRank: Number.isFinite(leaderboardRank) ? leaderboardRank : null,
      leaderboardTotal: Number.isFinite(leaderboardTotal) ? leaderboardTotal : null,
      rankingVsLine,
      overviewHeaderSubline,
      patientStars,
      distancePct: distanceFromSummary,
      reliabilityCompositePct: reliabilityCompositeFromSummary
    }
  }, [requests, reservations, inventory, pharmacy, rankingSummary])

  const portalCompositeUi = useMemo(
    () => extractPortalCompositeRankingUi(rankingSummary),
    [rankingSummary]
  )

  const rankingProfileDisplay = useMemo(() => {
    const fromUi = portalCompositeUi?.activeRankingProfile
    if (fromUi) return fromUi
    const raw = rankingSummary?.active_ranking_profile
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    const cw = rankingSummary?.composite_weights
    if (cw && typeof cw === 'object' && typeof cw.active_ranking_profile === 'string' && cw.active_ranking_profile.trim()) {
      return cw.active_ranking_profile.trim()
    }
    return ''
  }, [portalCompositeUi?.activeRankingProfile, rankingSummary])

  const analyticsFactorWeights = useMemo(() => {
    const comp = portalCompositeUi?.components
    const wp = portalCompositeUi?.weightsPercent
    const w = (field) => weightPercentForPortalCompositeField(comp, field, wp)
    return {
      price: w('price_competitiveness_pct') ?? 30,
      response: w('response_rate_pct') ?? 20,
      stock: w('stock_reliability_pct') ?? 15,
      patient: w('patient_rating_pct') ?? 20,
      distance: w('distance_pct'),
      reliability: wp?.reliability != null ? wp.reliability : null
    }
  }, [portalCompositeUi])

  const reliabilityCompositeDisplayPct = useMemo(() => {
    if (overviewMetrics.reliabilityCompositePct != null) return overviewMetrics.reliabilityCompositePct
    return Math.round((overviewMetrics.responseRatePct + overviewMetrics.stockReliabilityPct) / 2)
  }, [
    overviewMetrics.reliabilityCompositePct,
    overviewMetrics.responseRatePct,
    overviewMetrics.stockReliabilityPct
  ])

  const leaderboardRows = useMemo(() => {
    const myPid = pharmacy?.pharmacy_id ?? rankingSummary?.pharmacy_id
    const myScore = overviewMetrics.rankingScore
    const myName = (pharmacy?.name || rankingSummary?.pharmacy_name || '').trim() || 'Your pharmacy'

    const fromSummary = parseLeaderboardRowsFromSummary(rankingSummary)
    if (fromSummary && fromSummary.length > 0) {
      return fromSummary.map((row) => ({
        ...row,
        you: leaderboardPharmacyIdsMatch(row.pharmacy_id, myPid, myName),
      }))
    }

    if (platformPharmacies && platformPharmacies.length > 0) {
      return buildLeaderboardFromPlatformPharmacies(platformPharmacies, myPid, myScore, myName)
    }

    if (platformPharmacies && platformPharmacies.length === 0) {
      return [
        {
          rank: 1,
          name: myName,
          score: Number.isFinite(Number(myScore)) ? Number(myScore) : null,
          you: true,
          key: 'solo',
        },
      ]
    }

    const myRank = Math.min(Math.max(rankingSummary?.leaderboard_rank ?? 4, 1), 8)
    const base = [
      { rank: 1, name: 'MedPlus Avondale', score: 94, key: 'demo-1' },
      { rank: 2, name: 'PharmaCare Borrowdale', score: 89, key: 'demo-2' },
      { rank: 3, name: 'HealthFirst Eastlea', score: 84, key: 'demo-3' },
      { rank: 4, name: 'City Health Pharmacy', score: 78, key: 'demo-4' },
      { rank: 5, name: 'Clicks Westgate', score: 74, key: 'demo-5' },
      { rank: 6, name: 'OK Mart Pharmacy', score: 71, key: 'demo-6' },
      { rank: 7, name: 'MediCare Mbare', score: 68, key: 'demo-7' },
      { rank: 8, name: 'Bliss Pharmacy', score: 62, key: 'demo-8' },
    ]
    return base.map((row) =>
      row.rank === myRank ? { ...row, name: myName, score: myScore, you: true } : { ...row, you: false }
    )
  }, [
    rankingSummary,
    overviewMetrics.rankingScore,
    pharmacy?.name,
    pharmacy?.pharmacy_id,
    platformPharmacies,
  ])

  const scoreHistory = useMemo(() => {
    const end = overviewMetrics.rankingScore
    const fromApi = parseScoreHistoryFromRankingSummary(rankingSummary)
    if (fromApi && fromApi.length) return fromApi
    return buildScoreHistoryFromReservations(reservations, end)
  }, [rankingSummary, reservations, overviewMetrics.rankingScore])

  const fulfilmentSorted = useMemo(() => {
    return [...reservations].sort((a, b) => {
      const da = new Date(reservationFulfilledAt(a) || a.updated_at || a.completed_at || a.created_at || 0).getTime()
      const db = new Date(reservationFulfilledAt(b) || b.updated_at || b.completed_at || b.created_at || 0).getTime()
      return db - da
    })
  }, [reservations])

  const earningsRecentTx = useMemo(() => {
    const completed = reservations.filter((r) => isReservationFulfilledStatus(r.status))
    return [...completed]
      .sort((a, b) => {
        const da = new Date(reservationFulfilledAt(a) || 0).getTime()
        const db = new Date(reservationFulfilledAt(b) || 0).getTime()
        return db - da
      })
      .slice(0, 20)
  }, [reservations])

  const earningsWeekBars = useMemo(() => buildEarningsWeekBars(reservations), [reservations])

  const earningsHourBars = useMemo(() => buildEarningsHourBarsToday(reservations), [reservations])

  const stockAlertRows = useMemo(() => {
    const items = [...(inventory?.items || [])]
    const pri = (i) => (i.status === 'out_of_stock' ? 0 : i.status === 'low_stock' ? 1 : 2)
    items.sort((a, b) => pri(a) - pri(b))
    return items.slice(0, 8)
  }, [inventory])

  const skipLiveRequest = (requestId) => {
    setSkippedRequestIds((prev) => (prev.includes(requestId) ? prev : [...prev, requestId]))
  }

  const getRequestTypeMeta = (request) => {
    const t = (request.request_type || '').toLowerCase()
    if (
      t.includes('prescription') ||
      t === 'rx' ||
      requestHasPrescriptionAssets(request)
    )
      return { label: 'PRESCRIPTION', cls: 'ph-type-rx', accent: 'rx', aiSuggested: false }
    if (t.includes('symptom') || t.includes('chat'))
      return { label: 'SYMPTOM', cls: 'ph-type-symptom', accent: 'symptom', aiSuggested: true }
    if (t.includes('search') || t === 'direct')
      return { label: 'SEARCH', cls: 'ph-type-search', accent: 'search', aiSuggested: false }
    const meds = normalizeDisplayMedicineNames(request.medicine_names)
    if (request.symptoms && meds.length === 0)
      return { label: 'SYMPTOM', cls: 'ph-type-symptom', accent: 'symptom', aiSuggested: true }
    if (meds.length)
      return { label: 'PRESCRIPTION', cls: 'ph-type-rx', accent: 'rx', aiSuggested: false }
    return { label: 'SEARCH', cls: 'ph-type-search', accent: 'search', aiSuggested: false }
  }

  const livePendingRequests = requests.filter(
    (r) =>
      !r.declined &&
      !r.has_responded &&
      !isExpired(r.expires_at) &&
      !skippedRequestIds.includes(r.request_id)
  )

  const tabHeadline = getPharmacyTabHeadline(language, activeTab)

  const toggleRequestExpanded = (requestId) => {
    setExpandedRequests(prev => {
      const newSet = new Set(prev)
      if (newSet.has(requestId)) {
        newSet.delete(requestId)
      } else {
        newSet.add(requestId)
      }
      return newSet
    })
  }

  /** Status: all | pending | responded | expired — applied before type (Rx/symptom/today) chips. */
  const requestsFilteredByStatus = useMemo(() => {
    switch (requestFilter) {
      case 'pending':
        return requests.filter((r) => !r.has_responded && !isExpired(r.expires_at))
      case 'responded':
        return requests.filter((r) => r.has_responded)
      case 'expired':
        return requests.filter((r) => !r.has_responded && isExpired(r.expires_at))
      default:
        return requests
    }
  }, [requests, requestFilter])

  const requestsForLivePage = useMemo(() => {
    let list = requestsFilteredByStatus
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)
    if (reqTypeFilter === 'new') {
      list = list.filter((r) => new Date(r.created_at) >= startToday)
    } else if (reqTypeFilter === 'prescription') {
      list = list.filter((r) => getRequestTypeMeta(r).label === 'PRESCRIPTION')
    } else if (reqTypeFilter === 'symptom') {
      list = list.filter((r) => getRequestTypeMeta(r).label === 'SYMPTOM')
    } else if (reqTypeFilter === 'search') {
      list = list.filter((r) => getRequestTypeMeta(r).label === 'SEARCH')
    }
    return list
  }, [requestsFilteredByStatus, reqTypeFilter])

  const newRequestsTodayCount = useMemo(() => {
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)
    return requests.filter((r) => new Date(r.created_at) >= startToday).length
  }, [requests])

  const filteredInventoryItems = useMemo(() => {
    const items = inventory?.items || []
    const q = invSearchQuery.trim().toLowerCase()
    return items.filter((m) => {
      const name = (m.medicine_name || '').toLowerCase()
      if (q && !name.includes(q)) return false
      const st = (m.status || '').toLowerCase().replace(/ /g, '_')
      if (invStatusFilter === 'in_stock' && st !== 'in_stock') return false
      if (invStatusFilter === 'low_stock' && st !== 'low_stock') return false
      if (invStatusFilter === 'out_of_stock' && st !== 'out_of_stock') return false
      return true
    })
  }, [inventory, invSearchQuery, invStatusFilter])

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const formatTimeAgo = (dateString) => {
    if (!dateString) return ''
    const diff = Math.floor((Date.now() - new Date(dateString)) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff} min ago`
    const hours = Math.floor(diff / 60)
    if (hours < 24) return `${hours} hr ago`
    return `${Math.floor(hours / 24)} days ago`
  }

  const getLocationShort = (addr) => {
    if (!addr) return 'Unknown'
    const parts = addr.split(',')
    return parts[0]?.trim() || addr
  }

  const requiresPrescription = (medicines) => {
    const rxKeywords = ['insulin', 'controlled', 'schedule', 'prescription only']
    return (medicines || []).some(m => 
      rxKeywords.some(kw => m.toLowerCase().includes(kw))
    )
  }

  if (!pharmacist || !pharmacy) {
    return <div>Loading...</div>
  }

  const initials = (pharmacist?.first_name?.[0] || '') + (pharmacist?.last_name?.[0] || '') || 'PK'
  const pharmacyInitials = (() => {
    const name = String(pharmacy?.name || 'PH')
    const words = name.split(/\s+/).filter(Boolean)
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
    const alnum = name.replace(/[^a-zA-Z0-9]/g, '')
    return (alnum.slice(0, 2) || 'PH').toUpperCase()
  })()
  const pharmacyShortName = (() => {
    const raw = String(pharmacy?.name || 'Pharmacy').split(',')[0].trim()
    const w = raw.split(/\s+/).filter(Boolean)
    if (w.length <= 2) return raw
    return `${w[0]} ${w[1]}`
  })()
  const pharmacyRegistryStatus = getPharmacyRegistryStatus(pharmacy)
  const pharmacyStatusLine = (() => {
    const loc = `${getLocationShort(pharmacy?.address) || '—'}`
    if (pharmacyRegistryStatus === 'verified') return `${loc} · Verified ✓`
    if (pharmacyRegistryStatus === 'pending') return `${loc} · Pending admin review`
    return `${loc} · Suspended`
  })()
  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <div className="pharmacy-dashboard">
      {/* Mobile top bar with hamburger */}
      <header className="ph-mobile-header" aria-hidden="true">
        <div className="ph-mobile-header-inner">
          <span className="ph-mobile-logo">Medi<span>Connect</span></span>
          <button
            type="button"
            className="ph-hamburger"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? t('ph.closeMenu') : t('ph.openMenu')}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>
      <div
        className={`ph-mobile-overlay ${mobileMenuOpen ? 'ph-mobile-overlay-open' : ''}`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />
      {/* Sidebar — pharmacy portal (forest green) */}
      <aside className={`sidebar ph-portal-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sb-logo sb-logo-portal" role="banner">
          <div className="sb-logo-mark" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="#004d40" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" fill="rgba(0,77,64,0.12)" />
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
            </svg>
          </div>
          <div className="sb-logo-text">
            <span className="sb-logo-brand">MediConnect</span>
            <span className="sb-logo-sub">{t('ph.portal')}</span>
          </div>
        </div>
        <div className="sb-pharmacy-wrap">
          <div className="sb-pharm-card">
            <div className="sb-pharm-avatar" aria-hidden>{pharmacyInitials}</div>
            <div className="sb-pharm-card-text">
              <div className="sb-pharm-name">{pharmacy?.name || 'Pharmacy'}</div>
              <div className="sb-pharm-loc">{pharmacyStatusLine}</div>
            </div>
            <div className="sb-online-dot" aria-hidden title="Online" />
          </div>
        </div>
        <div className="sb-section">{t('ph.operations')}</div>
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => { setActiveTab('overview'); closeMobileMenu(); }}
          >
            <LayoutDashboard className="nav-icon ph-nav-ic" size={18} strokeWidth={2} />
            <span>{t('ph.nav.overview')}</span>
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => { setActiveTab('requests'); closeMobileMenu(); }}
          >
            <Radio className="nav-icon ph-nav-ic" size={18} strokeWidth={2} />
            <span>{t('ph.nav.requests')}</span>
            {stats.pending > 0 && <span className="badge">{stats.pending}</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => { setActiveTab('inventory'); closeMobileMenu(); }}
          >
            <Package className="nav-icon ph-nav-ic" size={18} strokeWidth={2} />
            <span>{t('ph.nav.inventory')}</span>
          </button>
        </nav>
        <div className="sb-section">{t('ph.performance')}</div>
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => { setActiveTab('analytics'); closeMobileMenu(); }}
          >
            <Award className="nav-icon ph-nav-ic" size={18} strokeWidth={2} />
            <span>{t('ph.nav.ranking')}</span>
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'earnings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('earnings'); closeMobileMenu(); }}
          >
            <DollarSign className="nav-icon ph-nav-ic ph-nav-ic-earn" size={18} strokeWidth={2} />
            <span>{t('ph.nav.earnings')}</span>
            <span className="badge badge--earn" aria-hidden>$</span>
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'reservations' ? 'active' : ''}`}
            onClick={() => { setActiveTab('reservations'); closeMobileMenu(); }}
          >
            <ClipboardList className="nav-icon ph-nav-ic" size={18} strokeWidth={2} />
            <span>{t('ph.nav.fulfillment')}</span>
            {reservations.filter(r => r.status === 'pending' || r.status === 'confirmed').length > 0 && (
              <span className="badge">{reservations.filter(r => r.status === 'pending' || r.status === 'confirmed').length}</span>
            )}
          </button>
        </nav>
        <div className="ph-sidebar-flex-fill" aria-hidden />
        <nav className="sidebar-nav ph-sidebar-settings">
          <button
            type="button"
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); closeMobileMenu(); }}
          >
            <Settings className="nav-icon ph-nav-ic" size={18} strokeWidth={2} />
            <span>{t('ph.nav.settings')}</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <label className="ph-lang-wrap" style={{ display: 'block', marginBottom: 10, padding: '0 12px' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t('common.language')}</span>
            <select
              className="ph-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label={t('common.language')}
              style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6 }}
            >
              {Object.entries(languages).map(([code, { name, flag }]) => (
                <option key={code} value={code}>{flag} {name}</option>
              ))}
            </select>
          </label>
          <div className="sb-user">
            <div className="sb-avatar">{initials}</div>
            <div>
              <div className="sb-user-name">{pharmacist?.first_name} {pharmacist?.last_name}</div>
              <div className="sb-user-role">{t('ph.role')}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut className="nav-icon" size={16} />
            <span>{t('ph.logout')}</span>
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        {requestsAccessError ? (
          <div className="ph-verification-banner" role="status">
            <AlertTriangle size={18} className="ph-verification-banner__ic" aria-hidden />
            <div>
              <strong>{t('ph.banner.unavailableTitle')}</strong>
              <p>{requestsAccessError}</p>
              <p className="ph-verification-banner__hint">{t('ph.banner.unavailableHint')}</p>
            </div>
          </div>
        ) : null}
        <div className={`topbar ph-portal-topbar ${activeTab === 'overview' ? 'ph-topbar-overview' : ''}`}>
          <div className="topbar-left">
            {activeTab === 'overview' ? (
              <>
                <h1 className="ph-greeting">{getPharmacyGreeting(language)}, {pharmacyShortName}</h1>
                <p className="ph-subdate">{overviewMetrics.overviewHeaderSubline}</p>
              </>
            ) : (
              <>
                <h1>{tabHeadline}</h1>
                <p className="ph-topbar-sub">
                  {activeTab === 'requests' ? (
                    <>{t('ph.sub.requests', { count: stats.pending })}</>
                  ) : activeTab === 'inventory' ? (
                    <>{t('ph.sub.inventory')}</>
                  ) : activeTab === 'analytics' ? (
                    <>{t('ph.sub.ranking')}</>
                  ) : activeTab === 'earnings' ? (
                    <>{t('ph.sub.earnings')}</>
                  ) : activeTab === 'reservations' ? (
                    <>{t('ph.sub.fulfillment')}</>
                  ) : activeTab === 'settings' ? (
                    <>{t('ph.sub.settings')}</>
                  ) : (
                    <>
                      {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      {' · '}
                      {pharmacy?.name || 'My Pharmacy'}
                    </>
                  )}
                </p>
              </>
            )}
          </div>
          <div className="topbar-right ph-topbar-actions">
            {(activeTab === 'overview' || activeTab === 'requests' || activeTab === 'inventory' || activeTab === 'analytics' || activeTab === 'earnings' || activeTab === 'reservations') && (
              <>
                <button
                  type="button"
                  className={`ph-sound-toggle ${requestSoundsEnabled ? 'ph-sound-toggle--on' : ''}`}
                  onClick={toggleRequestSounds}
                  title={requestSoundsEnabled ? t('ph.sound.mute') : t('ph.sound.unmute')}
                  aria-pressed={requestSoundsEnabled}
                >
                  {requestSoundsEnabled ? (
                    <Volume2 size={16} strokeWidth={2} aria-hidden />
                  ) : (
                    <VolumeX size={16} strokeWidth={2} aria-hidden />
                  )}
                  {requestSoundsEnabled ? 'Sounds on' : 'Sounds muted'}
                </button>
                <button
                  type="button"
                  className={`ph-shift-toggle ${acceptingRequests ? 'ph-shift-toggle--on' : ''}`}
                  onClick={toggleAcceptingRequests}
                >
                  <span className="ph-shift-dot" aria-hidden />
                  {acceptingRequests ? 'Accepting requests' : 'Paused'}
                </button>
              </>
            )}
            <div className="ph-topbar-avatar" title={`${pharmacist?.first_name || ''} ${pharmacist?.last_name || ''}`}>{initials}</div>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="ph-overview-mock">
            <div className="ph-kpi-row">
              <div className="ph-kpi-card">
                <div className="ph-kpi-label">New requests today</div>
                <div className="ph-kpi-val">{overviewMetrics.newTodayCount}</div>
                <div className={`ph-kpi-trend ${overviewMetrics.newTrendDelta >= 0 ? 'up' : 'down'}`}>
                  {overviewMetrics.newYesterdayCount > 0 || overviewMetrics.newTrendDelta !== 0
                    ? `${overviewMetrics.newTrendDelta >= 0 ? '↑ ' : '↓ '}${Math.abs(overviewMetrics.newTrendDelta)} more than yesterday`
                    : 'No prior day data'}
                </div>
              </div>
              <div className="ph-kpi-card">
                <div className="ph-kpi-label">Responded</div>
                <div className="ph-kpi-val">{overviewMetrics.respondedTodayCount}</div>
                <div className="ph-kpi-trend ph-kpi-trend--neutral">{overviewMetrics.responseRateToday}% response rate</div>
              </div>
              <div className="ph-kpi-card">
                <div className="ph-kpi-label">Revenue today</div>
                <div className="ph-kpi-val">${overviewMetrics.revenueToday.toFixed(0)}</div>
                <div
                  className={`ph-kpi-trend ${
                    overviewMetrics.revenueYesterday > 0 && overviewMetrics.revenueToday >= overviewMetrics.revenueYesterday
                      ? 'up'
                      : overviewMetrics.revenueYesterday > 0
                        ? 'down'
                        : ''
                  }`}
                >
                  {overviewMetrics.revenueYesterday > 0
                    ? `${overviewMetrics.revenueToday >= overviewMetrics.revenueYesterday ? '↑ ' : '↓ '}from $${overviewMetrics.revenueYesterday.toFixed(0)} yesterday`
                    : 'From completed reservations'}
                </div>
              </div>
            </div>

            <div className="ph-overview-grid">
              <div className="ph-overview-main">
                <div className="card ph-live-card-wrap ph-mock-card-elevated">
                  <div className="card-header ph-live-head">
                    <div>
                      <div className="card-title">{t('ph.card.liveFeed')}</div>
                      <div className="card-sub">
                        {livePendingRequests.length} pending — respond within 60s for best ranking
                      </div>
                    </div>
                    <button type="button" className="btn btn-ghost ph-link-all" onClick={() => setActiveTab('requests')}>
                      View all →
                    </button>
                  </div>
                  <div className="ph-live-feed">
                    {loading ? (
                      <div className="loading-state ph-live-loading">
                        <Pill className="loading-icon" />
                        <p>Loading requests…</p>
                      </div>
                    ) : !acceptingRequests ? (
                      <p className="ph-live-empty">You are paused — turn on &quot;Accepting requests&quot; to see new items here.</p>
                    ) : livePendingRequests.length === 0 ? (
                      <p className="ph-live-empty">No pending requests right now. Great work.</p>
                    ) : (
                      livePendingRequests.map((request) => {
                        const summary = getRequestMedicineSummaryLine(request)
                        const typeMeta = getRequestTypeMeta(request)
                        const { main: locMain, distanceKm } = patientLocationMainSub(
                          request,
                          getLocationShort(pharmacy?.address) || 'Nearby'
                        )
                        const locLine =
                          distanceKm != null ? `${locMain} · ${distanceKm.toFixed(1)} km` : locMain
                        const medTitle = summary.length > 52 ? `${summary.slice(0, 52)}…` : summary
                        const symptomLine = liveFeedSymptomDisplay(request, summary)
                        return (
                          <div
                            key={request.request_id}
                            className={`ph-live-item ph-live-item--accent-${typeMeta.accent}${typeMeta.aiSuggested ? ' ph-live-item--ai' : ''}`}
                          >
                            <div className="ph-live-item-top">
                              <div className="ph-live-type-row">
                                <span className={`ph-type-pill ${typeMeta.cls}`}>{typeMeta.label}</span>
                                {typeMeta.aiSuggested ? <span className="ph-type-ai">AI suggested</span> : null}
                              </div>
                              <span className="ph-live-timer">
                                <RequestCountdown expiresAt={request.expires_at} />
                              </span>
                            </div>
                            <div className="ph-live-med">{medTitle}</div>
                            {symptomLine ? (
                              <div className="ph-live-symptom" title={String(request.symptoms || '').trim()}>
                                <span className="ph-live-symptom-lbl">Symptom</span>
                                <span className="ph-live-symptom-txt">{symptomLine}</span>
                              </div>
                            ) : null}
                            <div className="ph-live-loc ph-live-loc--mock">
                              <MapPin size={14} aria-hidden />
                              {locLine}
                            </div>
                            <div className="ph-live-actions ph-live-actions--stack">
                              <button
                                type="button"
                                className="btn ph-respond-btn ph-respond-btn--block"
                                onClick={() => handleOpenResponse(request)}
                              >
                                Respond with price
                              </button>
                              <button type="button" className="ph-skip-link" onClick={() => skipLiveRequest(request.request_id)}>
                                Skip
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                  <div className="ph-live-feed-footer">
                    <button type="button" className="ph-link-all ph-link-all--block" onClick={() => setActiveTab('requests')}>
                      Open full request feed →
                    </button>
                  </div>
                </div>

                <div className="card ph-stock-alerts ph-mock-card-elevated">
                  <div className="card-header ph-live-head">
                    <div>
                      <div className="card-title">{t('ph.card.stockAlerts')}</div>
                      <div className="card-sub">Items needing attention</div>
                    </div>
                    <button type="button" className="ph-quick-inv-full-link" onClick={() => setActiveTab('inventory')}>
                      Manage inventory →
                    </button>
                  </div>
                  <div className="ph-stock-alerts-body">
                    {inventoryLoading ? (
                      <p className="ph-stock-alerts-empty">Loading inventory…</p>
                    ) : stockAlertRows.length === 0 ? (
                      <p className="ph-stock-alerts-empty">No medicines listed yet. Add stock from Inventory.</p>
                    ) : (
                      <div className="ph-stock-alerts-table-wrap">
                        <table className="ph-stock-alerts-table">
                          <thead>
                            <tr>
                              <th>Medicine</th>
                              <th>Dosage</th>
                              <th>Stock</th>
                              <th>Status</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {stockAlertRows.map((item) => {
                              const lines = inventoryItemDisplayLines(item.medicine_name)
                              const st = (item.status || '').toLowerCase()
                              const statusLabel =
                                st === 'out_of_stock' ? 'OUT OF STOCK' : st === 'low_stock' ? 'LOW STOCK' : 'IN STOCK'
                              const pillClass =
                                st === 'out_of_stock'
                                  ? 'ph-stock-pill ph-stock-pill--out'
                                  : st === 'low_stock'
                                    ? 'ph-stock-pill ph-stock-pill--low'
                                    : 'ph-stock-pill ph-stock-pill--ok'
                              const actionLabel = st === 'out_of_stock' ? 'Restock' : 'Update'
                              return (
                                <tr key={item.medicine_id || item.id || item.medicine_name}>
                                  <td className="ph-sa-med">{lines.primary}</td>
                                  <td className="ph-sa-dose">{lines.secondary || '—'}</td>
                                  <td className="ph-sa-qty ph-mono">{item.quantity ?? '—'}</td>
                                  <td>
                                    <span className={pillClass}>{statusLabel}</span>
                                  </td>
                                  <td className="ph-sa-action">
                                    <button type="button" className="ph-sa-link" onClick={handleOpenInventoryModal}>
                                      {actionLabel}
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="ph-overview-rail">
                <div className="card ph-rank-card ph-mock-card-elevated">
                  <div className="card-header ph-rank-card-head ph-rank-card-head--mock">
                    <div>
                      <div className="card-title">{t('ph.card.rankingScore')}</div>
                      <p className="ph-rank-lead">{overviewMetrics.rankingVsLine}</p>
                    </div>
                    <button type="button" className="ph-quick-inv-full-link" onClick={() => setActiveTab('analytics')}>
                      Details →
                    </button>
                  </div>
                  <div className="ph-rank-card-body">
                    <div className="ph-rank-big">
                      {overviewMetrics.rankingScore}
                      <span> /100</span>
                    </div>
                    <p className="ph-rank-meta">{overviewMetrics.rankLine}</p>
                    <div className="ph-rank-bars ph-rank-bars--mock">
                      <div className="ph-rank-row-mock">
                        <div className="ph-rank-row-mock-label">
                          <span>Price competitiveness</span>
                          <span className="ph-rank-num ph-rank-num--good">{overviewMetrics.priceCompetitivenessPct}</span>
                        </div>
                        <div className="ph-rank-track">
                          <div className="ph-rank-fill ph-rank-fill--good" style={{ width: `${overviewMetrics.priceCompetitivenessPct}%` }} />
                        </div>
                      </div>
                      <div className="ph-rank-row-mock">
                        <div className="ph-rank-row-mock-label">
                          <span>Response rate</span>
                          <span
                            className={`ph-rank-num ${overviewMetrics.responseRatePct < 75 ? 'ph-rank-num--warn' : 'ph-rank-num--good'}`}
                          >
                            {overviewMetrics.responseRatePct}
                          </span>
                        </div>
                        <div className="ph-rank-track">
                          <div
                            className={`ph-rank-fill ${overviewMetrics.responseRatePct < 75 ? 'ph-rank-warn' : 'ph-rank-fill--good'}`}
                            style={{ width: `${overviewMetrics.responseRatePct}%` }}
                          />
                        </div>
                      </div>
                      <div className="ph-rank-row-mock">
                        <div className="ph-rank-row-mock-label">
                          <span>Stock reliability</span>
                          <span className="ph-rank-num ph-rank-num--good">{overviewMetrics.stockReliabilityPct}</span>
                        </div>
                        <div className="ph-rank-track">
                          <div className="ph-rank-fill ph-rank-fill--good" style={{ width: `${overviewMetrics.stockReliabilityPct}%` }} />
                        </div>
                      </div>
                      <div className="ph-rank-row-mock">
                        <div className="ph-rank-row-mock-label">
                          <span>Patient rating</span>
                          <span className="ph-rank-num ph-rank-num--accent">{overviewMetrics.patientRatingPct}</span>
                        </div>
                        <div className="ph-rank-track">
                          <div className="ph-rank-fill ph-rank-fill--accent" style={{ width: `${overviewMetrics.patientRatingPct}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="ph-rank-tip ph-rank-tip--mock">
                      <strong>Improve your rank:</strong>{' '}
                      {overviewMetrics.leaderboardRank != null && overviewMetrics.leaderboardRank > 2
                        ? `Responding faster moves you from #${overviewMetrics.leaderboardRank} toward #2. Target 75%+ response rate.`
                        : 'Keep responding within 60s and hold a 75%+ response rate to stay on top in search.'}
                    </div>
                  </div>
                </div>

                <div className="card ph-earn-card ph-mock-card-elevated">
                  <div className="card-header ph-earn-card-head ph-earn-card-head--mock">
                    <div className="card-title">{t('ph.card.thisMonth')}</div>
                    <button type="button" className="ph-quick-inv-full-link" onClick={() => setActiveTab('earnings')}>
                      Full report →
                    </button>
                  </div>
                  <div className="ph-earn-card-body">
                    <div className="ph-earn-total">${overviewMetrics.earningsMonth.toFixed(0)}</div>
                    <p className="ph-earn-sub">From {overviewMetrics.fulfilledMonthCount} fulfilled requests</p>
                    <ul className="ph-earn-list">
                      <li>
                        <span className="ph-earn-list-k">Avg per request</span>
                        <span className="ph-earn-list-v ph-mono">${overviewMetrics.avgPerRequest}</span>
                      </li>
                      <li>
                        <span className="ph-earn-list-k">Fulfillment rate</span>
                        <span className="ph-earn-list-v ph-earn-list-v--good">{overviewMetrics.fulfilmentRatePct}%</span>
                      </li>
                      <li>
                        <span className="ph-earn-list-k">Patient rating</span>
                        <span className="ph-earn-list-v ph-earn-list-v--star">
                          ★ {overviewMetrics.patientStars}
                        </span>
                      </li>
                      <li>
                        <span className="ph-earn-list-k">Requests skipped</span>
                        <span className="ph-earn-list-v ph-earn-list-v--bad">{skippedRequestIds.length}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="ph-mock-page ph-mock-requests">
            <div className="ph-mock-stats-strip">
              <div className="ph-mock-strip-item">
                <div className="ph-mock-strip-icon ph-mock-strip-icon--accent">
                  <Bell size={15} strokeWidth={2} aria-hidden />
                </div>
                <div>
                  <div className="ph-mock-strip-num">{stats.pending}</div>
                  <div className="ph-mock-strip-lbl">Active requests</div>
                </div>
              </div>
              <div className="ph-mock-strip-item">
                <div className="ph-mock-strip-icon ph-mock-strip-icon--success">
                  <CheckCircle size={15} strokeWidth={2} aria-hidden />
                </div>
                <div>
                  <div className="ph-mock-strip-num">{overviewMetrics.respondedTodayCount}</div>
                  <div className="ph-mock-strip-lbl">Responded today</div>
                </div>
              </div>
              <div className="ph-mock-strip-item">
                <div className="ph-mock-strip-icon ph-mock-strip-icon--danger">
                  <XCircle size={15} strokeWidth={2} aria-hidden />
                </div>
                <div>
                  <div className="ph-mock-strip-num">{skippedRequestIds.length}</div>
                  <div className="ph-mock-strip-lbl">Skipped today</div>
                </div>
              </div>
            </div>

            <div className="ph-mock-filter-bar ph-mock-filter-bar--status" role="group" aria-label="Request status">
              <button
                type="button"
                className={`ph-mock-filter-chip${requestFilter === 'all' ? ' active' : ''}`}
                onClick={() => setRequestFilter('all')}
              >
                All ({stats.totalRequests})
              </button>
              <button
                type="button"
                className={`ph-mock-filter-chip${requestFilter === 'pending' ? ' active' : ''}`}
                onClick={() => setRequestFilter('pending')}
              >
                Pending ({stats.pending})
              </button>
              <button
                type="button"
                className={`ph-mock-filter-chip${requestFilter === 'responded' ? ' active' : ''}`}
                onClick={() => setRequestFilter('responded')}
              >
                Responded ({stats.responded})
              </button>
              <button
                type="button"
                className={`ph-mock-filter-chip${requestFilter === 'expired' ? ' active' : ''}`}
                onClick={() => setRequestFilter('expired')}
              >
                Expired ({stats.expired})
              </button>
            </div>

            <div className="ph-mock-filter-bar">
              <button
                type="button"
                className={`ph-mock-filter-chip${reqTypeFilter === 'all' ? ' active' : ''}`}
                onClick={() => setReqTypeFilter('all')}
              >
                All types ({requestsFilteredByStatus.length})
              </button>
              <button
                type="button"
                className={`ph-mock-filter-chip${reqTypeFilter === 'new' ? ' active' : ''}`}
                onClick={() => setReqTypeFilter('new')}
                title="Only requests created today (hides older items)"
              >
                Today <span className="ph-mock-new-badge">{newRequestsTodayCount}</span>
              </button>
              <button
                type="button"
                className={`ph-mock-filter-chip${reqTypeFilter === 'prescription' ? ' active' : ''}`}
                onClick={() => setReqTypeFilter('prescription')}
              >
                Prescription
              </button>
              <button
                type="button"
                className={`ph-mock-filter-chip${reqTypeFilter === 'symptom' ? ' active' : ''}`}
                onClick={() => setReqTypeFilter('symptom')}
              >
                Symptom-based
              </button>
              <button
                type="button"
                className={`ph-mock-filter-chip${reqTypeFilter === 'search' ? ' active' : ''}`}
                onClick={() => setReqTypeFilter('search')}
              >
                Direct search
              </button>
              <div className="ph-mock-filter-bar-right">
                <button type="button" className="ph-mock-btn-secondary-sm">
                  Sort: Nearest first
                </button>
              </div>
            </div>

            <div className="ph-mock-request-list">
              {loading ? (
                <div className="ph-mock-empty-inline">
                  <Pill className="loading-icon" />
                  <p>Loading requests…</p>
                </div>
              ) : requestsForLivePage.length === 0 ? (
                <div className="ph-mock-empty-inline">
                  <Bell size={40} strokeWidth={1.5} className="ph-mock-empty-ic" aria-hidden />
                  <p>No requests match this filter.</p>
                  {(reqTypeFilter !== 'all' || requestFilter !== 'all') && (
                    <p className="ph-mock-empty-hint">
                      Try <strong>Show → All</strong> and <strong>All types</strong> to list every request, including past responses.
                    </p>
                  )}
                </div>
              ) : (
                requestsForLivePage.map((request) => {
                  const expired = isExpired(request.expires_at)
                  const displayMeds = normalizeDisplayMedicineNames(request.medicine_names)
                  const medLine = getRequestMedicineSummaryLine(request)
                  const qtyHint =
                    displayMeds.length > 1 ? 'Multiple lines' : displayMeds[0] ? 'As prescribed' : '—'
                  const typeMeta = getRequestTypeMeta(request)
                  const startToday = new Date()
                  startToday.setHours(0, 0, 0, 0)
                  const isNewToday = new Date(request.created_at) >= startToday
                  const urgent =
                    (request.urgency && String(request.urgency).toLowerCase() !== 'normal') ||
                    /urgent|asap|acute/i.test(String(request.notes || request.patient_notes || ''))
                  const { main: patientLocMain, sub: patientLocSub, pinPlaceLabel } = patientLocationMainSub(
                    request,
                    overviewMetrics.cityLine || ''
                  )
                  const patientInfoSub = pinPlaceLabel
                    ? `Anonymous · ${pinPlaceLabel}`
                    : 'Anonymous ID protected'
                  const rid = request.short_request_id || String(request.request_id || '').slice(0, 8).toUpperCase()
                  const expanded = expandedRequests.has(request.request_id)
                  const panelOpen = expanded
                  const cardAccent = `ph-mock-req--${typeMeta.accent}`
                  const cardState =
                    urgent && !expired
                      ? ' ph-mock-req-card--urgent'
                      : isNewToday && !request.has_responded && !expired
                        ? ' ph-mock-req-card--new'
                        : ''
                  const cardAi = typeMeta.aiSuggested ? ' ph-mock-req--ai' : ''

                  return (
                    <div key={request.request_id} className={`ph-mock-req-card ${cardAccent}${cardAi}${cardState}`}>
                      <div className="ph-mock-req-header">
                        <div className="ph-mock-req-header-left">
                          <div className="ph-mock-req-type-row">
                            <span className={`ph-type-pill ${typeMeta.cls}`}>{typeMeta.label}</span>
                            {requestHasPrescriptionAssets(request) ? (
                              <span className="prescription-badge ph-mock-rx-attach">Rx attached</span>
                            ) : null}
                            {isNewToday && !request.has_responded ? <span className="ph-mock-new-badge ph-mock-new-badge--inline">New</span> : null}
                          </div>
                          <div className="ph-mock-req-medicine">{medLine}</div>
                          <div className="ph-mock-req-qty">{qtyHint}</div>
                        </div>
                        <div className="ph-mock-req-header-right">
                          <div className="ph-mock-req-elapsed-lbl">Time elapsed</div>
                          <ReqElapsedBig createdAt={request.created_at} />
                        </div>
                      </div>
                      <div className="ph-mock-req-body">
                        <div className="ph-mock-req-detail">
                          <div className="ph-mock-req-detail-label">Patient location</div>
                          <div className="ph-mock-req-detail-stack">
                            <div className="ph-mock-req-detail-val">{patientLocMain}</div>
                            <div className="ph-mock-req-detail-sub">{patientLocSub}</div>
                          </div>
                        </div>
                        <div className="ph-mock-req-detail">
                          <div className="ph-mock-req-detail-label">Patient info</div>
                          <div className="ph-mock-req-detail-stack">
                            <div className="ph-mock-req-detail-val">MediConnect patient</div>
                            <div className="ph-mock-req-detail-sub">{patientInfoSub}</div>
                          </div>
                        </div>
                        <div className="ph-mock-req-detail">
                          <div className="ph-mock-req-detail-label">Urgency context</div>
                          <div className="ph-mock-req-detail-stack">
                            <div className="ph-mock-req-detail-val">
                              {request.urgency || request.symptoms || request.notes || '—'}
                            </div>
                          </div>
                        </div>
                        <div className="ph-mock-req-detail">
                          <div className="ph-mock-req-detail-label">Other pharmacies</div>
                          <div className="ph-mock-req-detail-stack">
                            <div className="ph-mock-req-detail-val">
                              {(String(request.request_id || '').length % 4) + 2} responding
                            </div>
                            <div className="ph-mock-req-detail-sub">Respond fast to rank #1</div>
                          </div>
                        </div>
                      </div>
                      <div className="ph-mock-req-footer">
                        {!request.has_responded && !expired ? (
                          <button
                            type="button"
                            className="ph-mock-btn-respond-lg"
                            onClick={() => handleOpenResponse(request)}
                          >
                            Respond with price &amp; availability
                          </button>
                        ) : (
                          <button type="button" className="ph-mock-btn-respond-lg ph-mock-btn-respond-lg--muted" onClick={() => handleOpenResponse(request)}>
                            View request
                          </button>
                        )}
                        {!request.has_responded && !expired ? (
                          <button type="button" className="ph-mock-btn-skip" onClick={() => skipLiveRequest(request.request_id)}>
                            Skip this request
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ph-mock-btn-more"
                          onClick={() => toggleRequestExpanded(request.request_id)}
                        >
                          More info
                        </button>
                      </div>
                      <div className={`ph-mock-respond-panel${panelOpen ? ' open' : ''}`}>
                        <div className="ph-mock-panel-inner">
                          <div className="ph-mock-panel-body">
                            <strong className="ph-mock-panel-title">Request details</strong>
                            Request ID: <span className="ph-mono">#MC-{rid}</span>
                            {' · '}
                            Submitted: {formatTimeAgo(request.created_at)}
                            {' · '}
                            Input method:{' '}
                            {typeMeta.label === 'PRESCRIPTION'
                              ? 'Prescription / upload'
                              : typeMeta.label === 'SYMPTOM'
                                ? 'AI chatbot — symptom description'
                                : 'Direct medicine search'}
                            {typeMeta.label === 'SYMPTOM' ? (
                              <>
                                <br />
                                <span className="ph-mock-ai-note">AI-suggested medicine — pharmacist discretion advised</span>
                              </>
                            ) : null}
                            {requestHasPrescriptionAssets(request) ? (
                              <PrescriptionReviewPanel
                                request={request}
                                pharmacistId={pharmacist?.pharmacist_id}
                                compact
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Fulfilment log — MediConnect mock layout */}
        {activeTab === 'reservations' && (
          <>
            {(() => {
              const completed = reservations.filter((r) => isReservationFulfilledStatus(r.status))
              const pendingOrConfirmed = reservations.filter((r) => {
                const s = (r.status || '').toLowerCase()
                return s === 'pending' || s === 'confirmed'
              })
              const expired = reservations.filter((r) => (r.status || '').toLowerCase() === 'expired')
              const todayStart = new Date()
              todayStart.setHours(0, 0, 0, 0)
              const completedToday = completed.filter((r) => {
                const raw = reservationFulfilledAt(r)
                return raw && new Date(raw) >= todayStart
              })
              const rows =
                fulfilStatusFilter === 'all'
                  ? fulfilmentSorted
                  : fulfilStatusFilter === 'completed'
                    ? fulfilmentSorted.filter((r) => isReservationFulfilledStatus(r.status))
                    : fulfilStatusFilter === 'active'
                      ? fulfilmentSorted.filter((r) => {
                          const s = (r.status || '').toLowerCase()
                          return s === 'pending' || s === 'confirmed'
                        })
                      : fulfilmentSorted.filter((r) => (r.status || '').toLowerCase() === 'expired')
              return (
                <div className="ph-mock-page ph-mock-fulfil">
                  <div className="ph-mock-stats-strip">
                    <div className="ph-mock-strip-item">
                      <div className="ph-mock-strip-icon ph-mock-strip-icon--success">
                        <CheckCircle size={18} strokeWidth={2} aria-hidden />
                      </div>
                      <div>
                        <div className="ph-mock-strip-num">{completed.length}</div>
                        <div className="ph-mock-strip-lbl">Fulfilled (all time)</div>
                      </div>
                    </div>
                    <div className="ph-mock-strip-item">
                      <div className="ph-mock-strip-icon ph-mock-strip-icon--accent">
                        <ClipboardList size={18} strokeWidth={2} aria-hidden />
                      </div>
                      <div>
                        <div className="ph-mock-strip-num">{completedToday.length}</div>
                        <div className="ph-mock-strip-lbl">Completed today</div>
                      </div>
                    </div>
                    <div className="ph-mock-strip-item">
                      <div className="ph-mock-strip-icon ph-mock-strip-icon--warn">
                        <Clock size={18} strokeWidth={2} aria-hidden />
                      </div>
                      <div>
                        <div className="ph-mock-strip-num">{pendingOrConfirmed.length}</div>
                        <div className="ph-mock-strip-lbl">Awaiting pickup</div>
                      </div>
                    </div>
                    <div className="ph-mock-strip-item">
                      <div className="ph-mock-strip-icon ph-mock-strip-icon--danger">
                        <XCircle size={18} strokeWidth={2} aria-hidden />
                      </div>
                      <div>
                        <div className="ph-mock-strip-num">{expired.length}</div>
                        <div className="ph-mock-strip-lbl">Expired / cancelled</div>
                      </div>
                    </div>
                  </div>

                  <div className="ph-mock-stock-tip ph-mock-fulfil-tip">
                    <Lightbulb size={16} strokeWidth={2} className="ph-mock-tip-ic" aria-hidden />
                    <span>
                      Completing reservations on time improves your ranking score and patient trust. Use{' '}
                      <button type="button" className="ph-mock-inline-link" onClick={() => setActiveTab('earnings')}>
                        Earnings
                      </button>{' '}
                      to reconcile revenue.
                    </span>
                  </div>

                  <div className="ph-mock-filter-bar">
                    <div className="ph-mock-filter-bar-left">
                      <span className="ph-mock-filter-title">Log filter</span>
                      <button
                        type="button"
                        className={`ph-mock-filter-chip${fulfilStatusFilter === 'all' ? ' active' : ''}`}
                        onClick={() => setFulfilStatusFilter('all')}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`ph-mock-filter-chip${fulfilStatusFilter === 'active' ? ' active' : ''}`}
                        onClick={() => setFulfilStatusFilter('active')}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        className={`ph-mock-filter-chip${fulfilStatusFilter === 'completed' ? ' active' : ''}`}
                        onClick={() => setFulfilStatusFilter('completed')}
                      >
                        Fulfilled
                      </button>
                      <button
                        type="button"
                        className={`ph-mock-filter-chip${fulfilStatusFilter === 'expired' ? ' active' : ''}`}
                        onClick={() => setFulfilStatusFilter('expired')}
                      >
                        Expired
                      </button>
                    </div>
                  </div>

                  <div className="card ph-mock-card-flush">
                    <div className="ph-mock-table-head">
                      <div>
                        <div className="ph-mock-table-title">Fulfillment log</div>
                        <div className="ph-mock-table-sub">Reservations from MediConnect — newest first</div>
                      </div>
                    </div>
                    {reservationsBlocked ? (
                      <p className="ph-settings-hint ph-settings-auth-hint ph-fulfil-unavailable-banner" role="status">
                        Reservations are paused:{' '}
                        {operationsForm.holiday_notes?.trim() || 'pharmacy marked unavailable'}. Clear the closure
                        note or turn off &quot;Pharmacy unavailable&quot; in Settings → Hours & operations, then save.
                      </p>
                    ) : null}
                    {reservationsLoading ? (
                      <div className="ph-mock-empty-inline ph-mock-pad">Loading reservations…</div>
                    ) : rows.length === 0 ? (
                      <div className="ph-mock-empty-inline ph-mock-pad">
                        <p className="ph-mock-empty-lead">
                          {reservations.length > 0
                            ? 'No rows for this filter.'
                            : 'No reservations yet. Patients reserve after finding your stock in search.'}
                        </p>
                        {reservations.length === 0 && reservationsMeta?.hint ? (
                          <p className="ph-mock-meta-hint">{String(reservationsMeta.hint)}</p>
                        ) : null}
                      </div>
                    ) : (
                      <table className="ph-mock-data-table ph-mock-data-table--fulfil">
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Medicine</th>
                            <th>Qty</th>
                            <th>Amount</th>
                            <th>Created</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const id = r.reservation_id || r.id || r.request_id || '—'
                            const status = (r.status || '').toLowerCase()
                            const isPending = status === 'pending' || status === 'confirmed'
                            const createdRaw = r.created_at || r.reserved_at
                            const created = createdRaw ? new Date(createdRaw).toLocaleString() : '—'
                            const amt = reservationLineAmount(r)
                            const badgeCls =
                              isReservationFulfilledStatus(r.status)
                                ? 'ph-mock-badge ph-mock-badge--green'
                                : status === 'expired'
                                  ? 'ph-mock-badge ph-mock-badge--danger'
                                  : 'ph-mock-badge ph-mock-badge--warn'
                            return (
                              <tr key={String(id)}>
                                <td className="ph-mono ph-mock-td-ref">{(String(id)).slice(0, 10)}</td>
                                <td className="ph-mock-td-strong">{r.medicine_name || '—'}</td>
                                <td className="ph-mono">{r.quantity ?? '—'}</td>
                                <td className="ph-mono ph-mock-td-price">{amt > 0 ? `$${amt.toFixed(2)}` : '—'}</td>
                                <td className="ph-mock-td-faint">{created}</td>
                                <td>
                                  <span className={badgeCls}>{r.status || '—'}</span>
                                </td>
                                <td>
                                  {isPending ? (
                                    <div className="ph-mock-row-actions">
                                      {status === 'pending' && (
                                        <button
                                          type="button"
                                          className="ph-mock-link-btn"
                                          disabled={reservationsBlocked}
                                          title={
                                            reservationsBlocked
                                              ? 'Unavailable — update Hours & operations first'
                                              : 'Confirm reservation'
                                          }
                                          onClick={() => handleConfirmReservation(r)}
                                        >
                                          Confirm
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="ph-mock-btn-primary ph-mock-btn-primary--sm"
                                        onClick={() => handleCompleteReservation(r)}
                                      >
                                        Complete
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="ph-mock-td-faint">—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                    <div className="ph-mock-table-foot">
                      Showing {rows.length} of {reservations.length} reservation(s)
                    </div>
                  </div>
                </div>
              )
            })()}
          </>
        )}

        {/* Inventory Update Modal */}
        {showInventoryModal && (
          <div className="modal-overlay" onClick={handleCloseInventoryModal}>
            <div className="modal-content inventory-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Update inventory</h2>
                <button className="modal-close" onClick={handleCloseInventoryModal}>
                  <X className="icon" />
                </button>
              </div>
              <div className="modal-body">
                {error && <div className="error-message">{error}</div>}
                <div className="inventory-form">
                  <div className="inventory-items-header">
                    <span>Medicine</span>
                    <span>Dosage / form</span>
                    <span>Qty</span>
                    <span>Low at</span>
                    <span>Price</span>
                    <span>Per</span>
                    <span></span>
                  </div>
                  {inventoryForm.items.map((item, index) => (
                    <div key={index} className="inventory-item-row">
                      <input
                        type="text"
                        placeholder="Medicine name"
                        value={item.medicine_name}
                        onChange={(e) => handleUpdateInventoryItem(index, 'medicine_name', e.target.value)}
                        className="inventory-input"
                      />
                      <input
                        type="text"
                        placeholder="e.g. 500mg tabs"
                        value={item.dosage || ''}
                        onChange={(e) => handleUpdateInventoryItem(index, 'dosage', e.target.value)}
                        className="inventory-input"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={item.quantity || ''}
                        onChange={(e) => handleUpdateInventoryItem(index, 'quantity', e.target.value)}
                        className="inventory-input inventory-qty"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Low at"
                        value={item.low_stock_threshold ?? ''}
                        onChange={(e) => handleUpdateInventoryItem(index, 'low_stock_threshold', e.target.value)}
                        className="inventory-input inventory-threshold"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Price"
                        value={item.price === '' ? '' : item.price}
                        onChange={(e) => handleUpdateInventoryItem(index, 'price', e.target.value)}
                        className="inventory-input inventory-price"
                        title="Required for patient display and ranking"
                      />
                      <select
                        value={item.price_unit || 'per_packet'}
                        onChange={(e) => handleUpdateInventoryItem(index, 'price_unit', e.target.value)}
                        className="inventory-input inventory-unit"
                        title="Price is per packet, gram, ml, etc."
                      >
                        {PRICE_UNIT_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon-only"
                        onClick={() => handleRemoveInventoryItem(index)}
                        title="Remove"
                      >
                        <X className="icon" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleAddInventoryItem}>
                    + Add medicine
                  </button>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={handleCloseInventoryModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSubmitInventory} disabled={submitting}>
                  {submitting ? 'Updating…' : 'Update inventory'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete inventory confirmation */}
        {inventoryDeleteTarget && (
          <div className="modal-overlay" onClick={closeDeleteInventoryModal} role="presentation">
            <div
              className="modal-content ph-inv-delete-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ph-inv-delete-title"
            >
              <div className="modal-header">
                <h2 id="ph-inv-delete-title">Delete medicine?</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={closeDeleteInventoryModal}
                  disabled={Boolean(inventoryRowBusy)}
                  aria-label="Close"
                >
                  <X className="icon" />
                </button>
              </div>
              <div className="modal-body">
                <p className="ph-inv-delete-lead">
                  Remove <strong>{inventoryDeleteTarget.medicine_name}</strong> from your inventory?
                </p>
                <p className="ph-inv-delete-hint">
                  Patients will no longer see this medicine listed at your pharmacy. This cannot be undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={closeDeleteInventoryModal}
                  disabled={Boolean(inventoryRowBusy)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger ph-inv-delete-confirm"
                  onClick={confirmDeleteInventoryRow}
                  disabled={Boolean(inventoryRowBusy)}
                >
                  {inventoryRowBusy ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Response Modal */}
        {selectedRequest && (
          <div className="modal-overlay response-modal-overlay" onClick={handleCloseResponse}>
            <div className="modal-content response-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header response-modal-header">
                <div className="response-modal-title-wrap">
                  <span className="response-modal-icon" aria-hidden>💬</span>
                  <div>
                    <h2>Respond to Request</h2>
                    <p className="response-modal-subtitle">Fill in stock and pricing for the patient</p>
                  </div>
                </div>
                <button type="button" className="modal-close response-modal-close" onClick={handleCloseResponse} aria-label="Close">
                  <X className="icon" />
                </button>
              </div>

              <div className="modal-body response-modal-body">
                <div className="request-summary response-request-summary">
                  <h3>Request Details</h3>
                  {requestHasPrescriptionAssets(selectedRequest) ? (
                    <PrescriptionReviewPanel
                      request={selectedRequest}
                      pharmacistId={pharmacist?.pharmacist_id}
                    />
                  ) : null}
                  {selectedRequest.symptoms && (
                    <p><strong>Symptoms:</strong> {selectedRequest.symptoms}</p>
                  )}
                  {(() => {
                    const validMedicines = normalizeDisplayMedicineNames([
                      ...(selectedRequest.medicine_names || []),
                      ...prescriptionMedicineNames(selectedRequest, null),
                    ]).filter(med => {
                      const lowerMed = med.toLowerCase().trim()
                      const invalidPatterns = ['unable', 'uploaded', 'minutes', 'before', 'after', 'eatin', 'eating', 'dru']
                      return lowerMed.length >= 2 && !invalidPatterns.some(p => lowerMed.includes(p)) && med.trim().length > 0
                    })
                    return validMedicines.length > 0 ? (
                      <p><strong>{selectedRequest.request_type === 'symptom' ? 'Suggested medicines:' : 'Medicines:'}</strong> {validMedicines.join(', ')}</p>
                    ) : null
                  })()}
                  <p><strong>Location:</strong> {(() => {
                    const loc =
                      selectedRequest.location_text ||
                      selectedRequest.location_address ||
                      selectedRequest.location_suburb ||
                      ''
                    const raw = (loc && String(loc).trim()) || 'N/A'
                    if (raw === 'N/A') return raw
                    return raw.replace(/^location:\s*/i, '').trim() || raw
                  })()}</p>
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="response-form">
                  <div className="medicines-response-section">
                    {(() => {
                      {(() => {
                        const isSymptomRequest = selectedRequest.request_type === 'symptom'
                        const isRxImageReview = requestNeedsPharmacistMedicineEntry(selectedRequest)
                        if (!isSymptomRequest && !isRxImageReview) return null
                        return (
                          <div
                            className="symptom-response-info"
                            style={{
                              padding: '1rem',
                              background: '#f0fdf4',
                              borderRadius: '8px',
                              borderLeft: '3px solid #10b981',
                              marginBottom: '1rem',
                            }}
                          >
                            <h4
                              style={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: '#065f46',
                                marginBottom: '0.5rem',
                              }}
                            >
                              {isRxImageReview
                                ? '💡 Read prescription image'
                                : '💡 Suggest medicines you can provide'}
                            </h4>
                            <p style={{ fontSize: '0.8125rem', color: '#047857', margin: 0, lineHeight: 1.5 }}>
                              {isRxImageReview
                                ? 'OCR could not read this prescription. Use the image above, then list medicines you can supply with prices below (e.g. “Paracetamol $5.00, Ibuprofen $7.50”).'
                                : 'This is a symptom-based request. In the box below, type the medicines you HAVE in stock for this symptom, with their prices (e.g. “Paracetamol $5.00, Ibuprofen $7.50”).'}
                            </p>
                          </div>
                        )
                      })()}
                      
                      const validMedicines = normalizeDisplayMedicineNames([
                        ...(selectedRequest.medicine_names || []),
                        ...prescriptionMedicineNames(selectedRequest, null),
                      ]).filter(med => {
                        const lowerMed = med.toLowerCase().trim()
                        const invalidPatterns = ['unable', 'uploaded', 'minutes', 'before', 'after', 'eatin', 'eating', 'dru']
                        return lowerMed.length >= 2 && !invalidPatterns.some(p => lowerMed.includes(p)) && med.trim().length > 0
                      })
                      
                      return validMedicines.length > 0 ? (
                        <div className="medicines-list-form">
                          {validMedicines.map((medicineName, index) => {
                            const medicineData = responseForm.medicines[medicineName] || { available: false, price: '', quantity: '', quantity_unit: 'capsules', expiry: '', alternative: '' }
                            return (
                              <div key={index} className="medicine-item-form">
                                <div className="medicine-header">
                                  <Pill className="medicine-icon" />
                                  <strong className="medicine-name">{medicineName}</strong>
                                </div>
                                
                                <div className="medicine-form-row">
                                  <div className="inventory-status-badge" title="Availability from inventory (updated when patients buy or you edit inventory)">
                                    {medicineData.available ? (
                                      <span className="in-stock-badge">
                                        <CheckCircle className="icon-tiny" style={{ width: 14, height: 14 }} />
                                        In stock ({medicineData.quantity || '—'} units)
                                      </span>
                                    ) : (
                                      <span className="out-of-stock-badge">
                                        <XCircle className="icon-tiny" style={{ width: 14, height: 14 }} />
                                        Out of stock
                                      </span>
                                    )}
                                  </div>

                                  {medicineData.available && (
                                    <>
                                      <div className="price-input-wrapper">
                                        <label className="price-label">Price ($)</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          placeholder="0.00"
                                          value={medicineData.price}
                                          onChange={(e) => {
                                            const updatedMedicines = {
                                              ...responseForm.medicines,
                                              [medicineName]: { ...medicineData, price: e.target.value }
                                            }
                                            setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                          }}
                                          required
                                          className="price-input"
                                        />
                                      </div>
                                      <div className="quantity-input-wrapper">
                                        <label className="price-label">Quantity</label>
                                        <div className="quantity-with-unit">
                                          <input
                                            type="text"
                                            placeholder="100"
                                            value={medicineData.quantity}
                                            onChange={(e) => {
                                              const updatedMedicines = {
                                                ...responseForm.medicines,
                                                [medicineName]: { ...medicineData, quantity: e.target.value }
                                              }
                                              setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                            }}
                                            className="price-input"
                                          />
                                          <select
                                            value={medicineData.quantity_unit || 'capsules'}
                                            onChange={(e) => {
                                              const updatedMedicines = {
                                                ...responseForm.medicines,
                                                [medicineName]: { ...medicineData, quantity_unit: e.target.value }
                                              }
                                              setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                            }}
                                            className="unit-select"
                                          >
                                            <option value="capsules">capsules</option>
                                            <option value="tablets">tablets</option>
                                            <option value="ml">ml</option>
                                            <option value="units">units</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div className="expiry-input-wrapper">
                                        <label className="price-label">Expiry</label>
                                        <input
                                          type="date"
                                          placeholder="2026-08-30"
                                          value={medicineData.expiry}
                                          onChange={(e) => {
                                            const updatedMedicines = {
                                              ...responseForm.medicines,
                                              [medicineName]: { ...medicineData, expiry: e.target.value }
                                            }
                                            setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                          }}
                                          className="price-input"
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>

                                {!medicineData.available && (
                                  <div className="form-group compact">
                                    <label className="alternative-label">Suggest alternatives (you don’t have this medicine)</label>
                                    <input
                                      type="text"
                                      placeholder="e.g., Ibuprofen, Aspirin"
                                      value={medicineData.alternative}
                                      onChange={(e) => {
                                        const updatedMedicines = {
                                          ...responseForm.medicines,
                                          [medicineName]: {
                                            ...medicineData,
                                            alternative: e.target.value
                                          }
                                        }
                                        setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                      }}
                                      className="alternative-input"
                                    />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="no-medicines">No medicines specified in this request</p>
                      )
                    })()}
                  </div>

                  <div className="form-group">
                    <label>Preparation time (minutes)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={responseForm.preparation_time}
                      onChange={(e) =>
                        setResponseForm({ ...responseForm, preparation_time: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>

                  <div className="form-group additional-medicines-section">
                    <div className="additional-medicines-header">
                      <label>Also in stock (optional)</label>
                      <span className="additional-medicines-sub">
                        Use for extra items you stock (e.g. antibiotics). Patients see these with prices in the app.
                      </span>
                    </div>
                    {(responseForm.additionalMedicines || []).map((row) => (
                      <div key={row.id} className="additional-medicine-row">
                        <input
                          type="text"
                          placeholder="Medicine name"
                          value={row.medicine}
                          onChange={(e) => {
                            const next = (responseForm.additionalMedicines || []).map((r) =>
                              r.id === row.id ? { ...r, medicine: e.target.value } : r
                            )
                            setResponseForm({ ...responseForm, additionalMedicines: next })
                          }}
                          className="additional-medicine-name"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Price"
                          value={row.price}
                          onChange={(e) => {
                            const next = (responseForm.additionalMedicines || []).map((r) =>
                              r.id === row.id ? { ...r, price: e.target.value } : r
                            )
                            setResponseForm({ ...responseForm, additionalMedicines: next })
                          }}
                          className="additional-medicine-price"
                        />
                        <input
                          type="text"
                          placeholder="Qty (optional)"
                          value={row.quantity}
                          onChange={(e) => {
                            const next = (responseForm.additionalMedicines || []).map((r) =>
                              r.id === row.id ? { ...r, quantity: e.target.value } : r
                            )
                            setResponseForm({ ...responseForm, additionalMedicines: next })
                          }}
                          className="additional-medicine-qty"
                        />
                        <button
                          type="button"
                          className="btn-icon-remove"
                          aria-label="Remove row"
                          onClick={() => {
                            setResponseForm({
                              ...responseForm,
                              additionalMedicines: (responseForm.additionalMedicines || []).filter(
                                (r) => r.id !== row.id
                              )
                            })
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-outline btn-add-medicine"
                      onClick={() =>
                        setResponseForm({
                          ...responseForm,
                          additionalMedicines: [
                            ...(responseForm.additionalMedicines || []),
                            {
                              id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                              medicine: '',
                              price: '',
                              quantity: ''
                            }
                          ]
                        })
                      }
                    >
                      <Plus size={18} />
                      Add medicine in stock
                    </button>
                  </div>

                  <div className="form-group">
                    <label>
                      {selectedRequest.request_type === 'symptom' ||
                      requestNeedsPharmacistMedicineEntry(selectedRequest)
                        ? 'Medicines you can supply (with prices)'
                        : 'Alternative Medicines'}
                    </label>
                    {selectedRequest.request_type === 'symptom' ||
                    requestNeedsPharmacistMedicineEntry(selectedRequest) ? (
                      <input
                        type="text"
                        className="response-notes-input response-notes-input-symptom"
                        placeholder="e.g., Paracetamol $5.00, Ibuprofen $7.50, Aspirin $3.00"
                        value={responseForm.notes || ''}
                        onChange={(e) =>
                          setResponseForm({ ...responseForm, notes: e.target.value })
                        }
                      />
                    ) : (
                      <textarea
                        rows="3"
                        placeholder="e.g., Ibuprofen, Aspirin (if the requested medicines are not available)"
                        value={responseForm.notes}
                        onChange={(e) =>
                          setResponseForm({ ...responseForm, notes: e.target.value })
                        }
                      />
                    )}
                    {(selectedRequest.request_type === 'symptom' ||
                      requestNeedsPharmacistMedicineEntry(selectedRequest)) && (
                      <p className="response-notes-hint">
                        {requestNeedsPharmacistMedicineEntry(selectedRequest)
                          ? 'From the prescription image, list what you can fill with prices, e.g. “Paracetamol $5.00”.'
                          : 'List the medicines you can supply for this request, with prices, e.g. “Paracetamol $5.00, Ibuprofen $7.50”.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer response-modal-footer">
                <button type="button" className="btn btn-outline" onClick={handleCloseResponse}>
                  Cancel
                </button>
                <button 
                  type="button"
                  className="btn btn-primary response-submit-btn" 
                  onClick={handleSubmitResponse}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Response'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inventory Tab — mock layout */}
        {activeTab === 'inventory' && (
          <div className="ph-mock-page ph-mock-inventory">
            {error && (
              <div className="error-message" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}
            <div className="ph-mock-stock-tip">
              <strong>Stock reliability score tip:</strong> Keeping your inventory up to date improves your ranking score. Pharmacies with 90%+ accuracy appear higher in patient results.{' '}
              <button type="button" className="ph-mock-inline-link" onClick={() => setActiveTab('analytics')}>
                View your score →
              </button>
            </div>
            {(inventory?.summary?.out_of_stock ?? 0) > 0 && (
              <div className="ph-mock-alert-banner ph-mock-alert-banner--danger">
                <AlertCircle size={16} strokeWidth={2} aria-hidden />
                <span>
                  <strong>{inventory.summary.out_of_stock} medicine{inventory.summary.out_of_stock !== 1 ? 's' : ''} out of stock</strong> — patients searching for these may not see you in results. Update stock levels to appear in searches.
                </span>
              </div>
            )}
            {(inventory?.summary?.low_stock ?? 0) > 0 && (
              <div className="ph-mock-alert-banner ph-mock-alert-banner--warn">
                <AlertTriangle size={16} strokeWidth={2} aria-hidden />
                <span>
                  <strong>{inventory.summary.low_stock} medicine{inventory.summary.low_stock !== 1 ? 's' : ''} running low</strong> — consider restocking before they run out.
                </span>
              </div>
            )}

            <div className="ph-mock-metric-row">
              <div className="ph-mock-metric-card">
                <div className="ph-mock-metric-label">Total medicines listed</div>
                <div className="ph-mock-metric-val">{inventory?.summary?.total_medicines ?? 0}</div>
                <div className="ph-mock-metric-delta">across all categories</div>
              </div>
              <div className="ph-mock-metric-card ph-mock-metric-card--green">
                <div className="ph-mock-metric-label">In stock</div>
                <div className="ph-mock-metric-val">{inventory?.summary?.in_stock ?? 0}</div>
                <div className="ph-mock-metric-delta ph-mock-delta-up">
                  {inventory?.summary?.total_medicines
                    ? `${Math.round(((inventory.summary.in_stock || 0) / inventory.summary.total_medicines) * 100)}% of catalogue`
                    : '—'}
                </div>
              </div>
              <div className="ph-mock-metric-card ph-mock-metric-card--warn">
                <div className="ph-mock-metric-label">Low stock</div>
                <div className="ph-mock-metric-val">{inventory?.summary?.low_stock ?? 0}</div>
                <div className="ph-mock-metric-delta ph-mock-delta-warn">below threshold</div>
              </div>
              <div className="ph-mock-metric-card ph-mock-metric-card--red">
                <div className="ph-mock-metric-label">Out of stock</div>
                <div className="ph-mock-metric-val">{inventory?.summary?.out_of_stock ?? 0}</div>
                <div className="ph-mock-metric-delta ph-mock-delta-down">hidden from search</div>
              </div>
            </div>

            <div className="ph-mock-inv-toolbar">
              <div className="ph-mock-search-box">
                <Search size={15} strokeWidth={2} aria-hidden />
                <input
                  type="text"
                  placeholder="Search medicines..."
                  value={invSearchQuery}
                  onChange={(e) => setInvSearchQuery(e.target.value)}
                  aria-label="Search medicines"
                />
              </div>
              <select
                className="ph-mock-form-select"
                value={invStatusFilter}
                onChange={(e) => setInvStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                <option>In stock</option>
                <option>Low stock</option>
                <option>Out of stock</option>
              </select>
              <button type="button" className="ph-mock-btn-primary" onClick={handleOpenInventoryModal}>
                + Add medicine
              </button>
              <button type="button" className="ph-mock-btn-secondary" onClick={handleExportInventoryCsv}>
                Export CSV
              </button>
            </div>

            <div className="card ph-mock-card-flush">
              {inventoryLoading && !inventory ? (
                <div className="ph-mock-empty-inline ph-mock-pad">
                  <p>Loading inventory…</p>
                </div>
              ) : !inventory?.items?.length ? (
                <div className="ph-mock-empty-inline ph-mock-pad">
                  <p>No medicines in inventory. Use Add medicine to build your catalogue.</p>
                </div>
              ) : (
                <table className="ph-mock-data-table">
                  <thead>
                    <tr>
                      <th>Medicine name</th>
                      <th>Dosage / Form</th>
                      <th>Stock level</th>
                      <th>Your price (USD)</th>
                      <th>Last updated</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventoryItems.map((item, idx) => {
                      const st = (item.status || '').toLowerCase()
                      const badge =
                        st === 'out_of_stock'
                          ? 'ph-mock-badge ph-mock-badge--danger'
                          : st === 'low_stock'
                            ? 'ph-mock-badge ph-mock-badge--warn'
                            : 'ph-mock-badge ph-mock-badge--green'
                      const badgeText =
                        st === 'out_of_stock' ? 'Out of stock' : st === 'low_stock' ? 'Low stock' : 'In stock'
                      const lines = inventoryItemDisplayLines(item.medicine_name)
                      const updated = item.updated_at ? new Date(item.updated_at).toLocaleString() : '—'
                      const thresh = item.low_stock_threshold ?? 20
                      const isEditing = inventoryRowEdit?.original_medicine_name === item.medicine_name
                      const isBusy = inventoryRowBusy === item.medicine_name
                      const qty = isEditing ? inventoryRowEdit.quantity : item.quantity
                      const pct = Math.min(100, ((parseInt(qty, 10) || 0) / (thresh * 5)) * 100)
                      const barCol =
                        st === 'out_of_stock' ? 'var(--ph-danger)' : st === 'low_stock' ? 'var(--ph-warn)' : 'var(--ph-success)'
                      const reserved = Number(item.reserved_quantity) || 0
                      return (
                        <tr
                          key={item.medicine_id || item.id || `${item.medicine_name}-${idx}`}
                          className={isEditing ? 'ph-inv-row-editing' : ''}
                        >
                          <td className="ph-mock-td-strong">
                            {isEditing ? (
                              <input
                                type="text"
                                className="ph-inv-inline-input ph-inv-inline-input--name"
                                value={inventoryRowEdit.medicine_name}
                                onChange={(e) => updateInventoryRowEditField('medicine_name', e.target.value)}
                                placeholder="Medicine name"
                                aria-label="Medicine name"
                              />
                            ) : (
                              lines.primary
                            )}
                            {reserved > 0 && (
                              <span className="ph-inv-reserved-tag" title="Active reservations">
                                {reserved} reserved
                              </span>
                            )}
                          </td>
                          <td className="ph-mock-td-muted">
                            {isEditing ? (
                              <input
                                type="text"
                                className="ph-inv-inline-input ph-inv-inline-input--dosage"
                                value={inventoryRowEdit.dosage}
                                onChange={(e) => updateInventoryRowEditField('dosage', e.target.value)}
                                placeholder="e.g. 500mg tablets"
                                aria-label="Dosage or form"
                              />
                            ) : (
                              lines.secondary || item.dosage || '—'
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <div className="ph-inv-edit-stock">
                                <input
                                  type="number"
                                  min={reserved}
                                  className="ph-inv-inline-input"
                                  value={inventoryRowEdit.quantity}
                                  onChange={(e) => updateInventoryRowEditField('quantity', e.target.value)}
                                  aria-label="Quantity"
                                />
                                <label className="ph-inv-edit-threshold-label">
                                  Low at
                                  <input
                                    type="number"
                                    min="0"
                                    className="ph-inv-inline-input ph-inv-inline-input--threshold"
                                    value={inventoryRowEdit.low_stock_threshold}
                                    onChange={(e) => updateInventoryRowEditField('low_stock_threshold', e.target.value)}
                                    aria-label="Low stock threshold"
                                  />
                                </label>
                              </div>
                            ) : (
                              <div className="ph-mock-stock-level">
                                <div className="ph-mock-level-bar">
                                  <div className="ph-mock-level-fill" style={{ width: `${pct}%`, background: barCol }} />
                                </div>
                                <span className={`ph-mock-stock-num${st === 'out_of_stock' ? ' ph-mock-stock-num--danger' : st === 'low_stock' ? ' ph-mock-stock-num--warn' : ''}`}>
                                  {item.quantity ?? '—'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="ph-mono ph-mock-td-price">
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="ph-inv-inline-input ph-inv-inline-input--price"
                                value={inventoryRowEdit.price}
                                onChange={(e) => updateInventoryRowEditField('price', e.target.value)}
                                aria-label="Price USD"
                              />
                            ) : item.price != null && item.price !== '' ? (
                              `$${Number(item.price).toFixed(2)}`
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="ph-mock-td-faint">{updated}</td>
                          <td>
                            <span className={badge}>{badgeText}</span>
                          </td>
                          <td>
                            <div className="ph-inv-row-actions">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className="ph-mock-btn-primary ph-inv-action-btn"
                                    onClick={saveInventoryRow}
                                    disabled={isBusy}
                                  >
                                    {isBusy ? 'Saving…' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    className="ph-mock-btn-secondary ph-inv-action-btn"
                                    onClick={cancelEditInventoryRow}
                                    disabled={isBusy}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="ph-mock-link-btn"
                                  onClick={() => startEditInventoryRow(item)}
                                  disabled={Boolean(inventoryRowBusy)}
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                className="ph-mock-link-btn ph-mock-link-btn--danger"
                                onClick={() => openDeleteInventoryModal(item)}
                                disabled={isBusy || reserved > 0}
                                title={reserved > 0 ? 'Resolve reservations before deleting' : 'Delete medicine'}
                              >
                                <Trash2 size={14} aria-hidden />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="ph-mock-footnote">
              Showing {filteredInventoryItems.length} of {inventory?.items?.length ?? 0} medicines
            </p>
          </div>
        )}

        {/* Ranking Score — mock layout */}
        {activeTab === 'analytics' && (
          <div className="ph-mock-page ph-mock-ranking">
            <div className="ph-mock-score-hero">
              <div className="ph-mock-score-circle">
                <div className="ph-mock-score-circle-num">{overviewMetrics.rankingScore}</div>
                <div className="ph-mock-score-circle-den">/100</div>
              </div>
              <div className="ph-mock-score-info">
                <h2>Overall Ranking Score</h2>
                <p>
                  Your score determines where you appear in patient search results. A higher score means more visibility, more
                  requests, and more revenue.
                </p>
                <div className="ph-mock-rank-pill">
                  <TrendingUp size={13} strokeWidth={2.5} aria-hidden />
                  {overviewMetrics.rankLine}
                </div>
                <p className={`ph-mock-ranking-profile${rankingProfileDisplay ? '' : ' ph-mock-ranking-profile--empty'}`} role="status">
                  <span className="ph-mock-ranking-profile-label">Active ranking profile</span>{' '}
                  <span className="ph-mono">{rankingProfileDisplay || '—'}</span>
                  {rankingProfileDisplay ? (
                    <span className="ph-mock-ranking-profile-hint">
                      {' '}
                      (platform MCDA preset for your portal score and patient ranking, when the API includes it)
                    </span>
                  ) : (
                    <span className="ph-mock-ranking-profile-hint">
                      {' '}
                      — shown here when <span className="ph-mono">GET …/ranking-summary/</span> includes{' '}
                      <span className="ph-mono">active_ranking_profile</span>.
                    </span>
                  )}
                </p>
              </div>
              <div className="ph-mock-score-hero-side">
                <div className="ph-mock-trend-lbl">Trend this month</div>
                <div className="ph-mock-trend-val ph-mono">+6 pts</div>
                <div className="ph-mock-trend-sub">from MediConnect signals</div>
                {overviewMetrics.responseRatePct < 82 ? (
                  <div className="ph-mock-hero-cta">Reach #1 by improving response rate to 82%</div>
                ) : null}
              </div>
            </div>

            {portalCompositeUi &&
            (portalCompositeUi.weightSummaryLine ||
              portalCompositeUi.contributions.length > 0 ||
              portalCompositeUi.weightsPercent ||
              portalCompositeUi.rankingSummaryFormula ||
              portalCompositeUi.algorithmSource ||
              portalCompositeUi.activeRankingProfile ||
              portalCompositeUi.rankingSummaryPayloadVersion != null) ? (
              <details className="ph-portal-composite-explainer ph-portal-composite-panel card ph-mock-card-flush">
                <summary className="ph-portal-composite-panel-summary">
                  <div className="ph-portal-composite-explainer-head">
                    <span className="ph-portal-composite-badge">Pharmacy portal composite</span>
                    {portalCompositeUi.rankingSummaryPayloadVersion != null ? (
                      <span className="ph-portal-composite-version ph-mono" title="From GET …/ranking-summary/ — v2 = admin-aligned payload">
                        Payload v{portalCompositeUi.rankingSummaryPayloadVersion}
                      </span>
                    ) : null}
                    {portalCompositeUi.scoringMethod ? (
                      <span className="ph-mono ph-portal-composite-method">{portalCompositeUi.scoringMethod}</span>
                    ) : null}
                  </div>
                  {portalCompositeUi.weightSummaryLine ? (
                    <p className="ph-portal-composite-lead ph-portal-composite-lead--in-summary">
                      <strong className="ph-mono">
                        {overviewMetrics.rankingScore}/100
                      </strong>{' '}
                      using pharmacy-portal weights: {portalCompositeUi.weightSummaryLine}
                    </p>
                  ) : (
                    <p className="ph-portal-composite-lead ph-portal-composite-lead--in-summary">
                      <strong className="ph-mono">{overviewMetrics.rankingScore}/100</strong> from the portal ranking summary
                      (expand for breakdown).
                    </p>
                  )}
                </summary>
                <div className="ph-portal-composite-panel-body">
                {portalCompositeUi.distinctNote ? (
                  <p className="ph-portal-composite-note">{portalCompositeUi.distinctNote}</p>
                ) : null}
                {portalCompositeUi.activeRankingProfile ? (
                  <p className="ph-portal-composite-note ph-portal-composite-algo-source">
                    <strong>Ranking profile:</strong>{' '}
                    <span className="ph-mono">{portalCompositeUi.activeRankingProfile}</span> (patient MCDA / leaderboard)
                  </p>
                ) : null}
                {portalCompositeUi.algorithmSource ? (
                  <p className="ph-portal-composite-note ph-portal-composite-algo-source">
                    <strong>Weights source:</strong> {portalCompositeUi.algorithmSource}
                  </p>
                ) : null}
                {(portalCompositeUi.scoreFormula ||
                  portalCompositeUi.weightedSumLinear ||
                  portalCompositeUi.weightedSumMax != null ||
                  portalCompositeUi.rankingSummaryFormula ||
                  portalCompositeUi.rankingSummaryPayloadVersion != null ||
                  portalCompositeUi.activeRankingProfile ||
                  portalCompositeUi.algorithmSource) && (
                  <details className="ph-portal-composite-details">
                    <summary>How 0–100 is derived</summary>
                    {portalCompositeUi.rankingSummaryFormula ? (
                      <div className="ph-portal-composite-details-block">
                        <p className="ph-portal-composite-details-p">
                          Live formula (response root <span className="ph-mono">formula</span> — not{' '}
                          <span className="ph-mono">score_history[].formula</span> from old snapshots):
                        </p>
                        <p className="ph-mono ph-portal-composite-formula">{portalCompositeUi.rankingSummaryFormula}</p>
                      </div>
                    ) : portalCompositeUi.rankingSummaryPayloadVersion == null ? (
                      <p className="ph-portal-composite-details-p ph-portal-composite-warn">
                        No root <span className="ph-mono">formula</span> and no{' '}
                        <span className="ph-mono">ranking_summary_payload_version</span> — confirm the API is redeployed
                        (expect <span className="ph-mono">v2</span>).
                      </p>
                    ) : null}
                    {portalCompositeUi.weightedSumMax != null ? (
                      <p className="ph-portal-composite-details-p">
                        Weighted sum cap (normalisation): <span className="ph-mono">{portalCompositeUi.weightedSumMax}</span>
                      </p>
                    ) : null}
                    {portalCompositeUi.weightedSumLinear ? (
                      <p className="ph-mono ph-portal-composite-formula">{portalCompositeUi.weightedSumLinear}</p>
                    ) : null}
                    {portalCompositeUi.scoreFormula ? (
                      <p className="ph-mono ph-portal-composite-formula">{portalCompositeUi.scoreFormula}</p>
                    ) : null}
                  </details>
                )}
                {portalCompositeUi.contributions.length > 0 ? (
                  <div className="ph-portal-composite-table-wrap">
                    <div className="ph-portal-composite-table-title">Your inputs × weights (this pharmacy)</div>
                    <table className="ph-portal-composite-table">
                      <thead>
                        <tr>
                          <th>Letter</th>
                          <th>Field</th>
                          <th>Weight</th>
                          <th>Input 0–100</th>
                          <th>w × input</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portalCompositeUi.contributions.map((row, idx) => {
                          const letter = row.letter ?? '—'
                          const field = row.field ?? '—'
                          const wCell = (() => {
                            if (row.weight_percent != null && Number.isFinite(Number(row.weight_percent))) {
                              return `${Math.round(Number(row.weight_percent))}%`
                            }
                            const w = Number(row.weight)
                            if (Number.isFinite(w)) {
                              return w <= 1 && w > 0 ? `${Math.round(w * 100)}%` : `${w}`
                            }
                            return '—'
                          })()
                          const inp = row.input_0_100
                          const prod = row.weight_times_input
                          return (
                            <tr key={`${field}-${idx}`}>
                              <td className="ph-mono">{letter}</td>
                              <td className="ph-mono ph-portal-composite-field">{field}</td>
                              <td className="ph-mono">{wCell}</td>
                              <td className="ph-mono">
                                {inp != null && Number.isFinite(Number(inp)) ? Number(inp).toFixed(1) : '—'}
                              </td>
                              <td className="ph-mono">
                                {prod != null && Number.isFinite(Number(prod)) ? Number(prod).toFixed(3) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {(portalCompositeUi.weightedSum != null ||
                      portalCompositeUi.scoreBeforeRound != null ||
                      portalCompositeUi.rankingScoreFromBreakdown != null) && (
                      <div className="ph-portal-composite-totals ph-mono">
                        {portalCompositeUi.weightedSum != null && Number.isFinite(Number(portalCompositeUi.weightedSum)) ? (
                          <span>Σ (w×input) = {Number(portalCompositeUi.weightedSum).toFixed(3)}</span>
                        ) : null}
                        {portalCompositeUi.scoreBeforeRound != null &&
                        Number.isFinite(Number(portalCompositeUi.scoreBeforeRound)) ? (
                          <span>
                            {' '}
                            → before round: {Number(portalCompositeUi.scoreBeforeRound).toFixed(2)}
                          </span>
                        ) : null}
                        {portalCompositeUi.rankingScoreFromBreakdown != null ? (
                          <span>
                            {' '}
                            → <strong>{portalCompositeUi.rankingScoreFromBreakdown}/100</strong>
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
                </div>
              </details>
            ) : null}

            <div className="ph-mock-criteria-grid">
              <div className="ph-mock-criteria-card">
                <div className="ph-mock-crit-header">
                  <div className="ph-mock-crit-title">Price competitiveness</div>
                  <span className="ph-mock-crit-weight">Weight: {analyticsFactorWeights.price}%</span>
                </div>
                <div className="ph-mock-crit-bar-row">
                  <div className="ph-mock-crit-bar-top">
                    <span>Your score</span>
                    <span className="ph-mock-crit-bar-val ph-mock-text-success">{overviewMetrics.priceCompetitivenessPct} / 100</span>
                  </div>
                  <div className="ph-rank-track">
                    <div className="ph-rank-fill ph-rank-fill--good" style={{ width: `${overviewMetrics.priceCompetitivenessPct}%` }} />
                  </div>
                </div>
                <div className="ph-mock-crit-tip ph-mock-crit-tip--good">
                  Your prices contribute to this factor. Keep them updated in inventory for accurate ranking.
                </div>
              </div>
              {portalCompositeUi?.useReliabilityCompositeLayout ? (
                <div className="ph-mock-criteria-card">
                  <div className="ph-mock-crit-header">
                    <div className="ph-mock-crit-title">Reliability</div>
                    <span className="ph-mock-crit-weight">
                      Weight:{' '}
                      {analyticsFactorWeights.reliability != null ? `${analyticsFactorWeights.reliability}%` : '—'}
                    </span>
                  </div>
                  <div className="ph-mock-crit-bar-row">
                    <div className="ph-mock-crit-bar-top">
                      <span>Your score</span>
                      <span className="ph-mock-crit-bar-val ph-mock-text-success">{reliabilityCompositeDisplayPct} / 100</span>
                    </div>
                    <div className="ph-rank-track">
                      <div
                        className="ph-rank-fill ph-rank-fill--good"
                        style={{ width: `${reliabilityCompositeDisplayPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="ph-mock-crit-tip ph-mock-crit-tip--good">
                    Combined response &amp; stock signal for this leaderboard ({' '}
                    <span className="ph-mono">reliability_composite_pct</span> when provided).
                  </div>
                </div>
              ) : (
                <>
                  <div className="ph-mock-criteria-card">
                    <div className="ph-mock-crit-header">
                      <div className="ph-mock-crit-title">Response rate</div>
                      <span className="ph-mock-crit-weight">Weight: {analyticsFactorWeights.response}%</span>
                    </div>
                    <div className="ph-mock-crit-bar-row">
                      <div className="ph-mock-crit-bar-top">
                        <span>Your score</span>
                        <span
                          className={
                            overviewMetrics.responseRatePct < 75
                              ? 'ph-mock-crit-bar-val ph-mock-text-warn'
                              : 'ph-mock-crit-bar-val ph-mock-text-success'
                          }
                        >
                          {overviewMetrics.responseRatePct} / 100
                        </span>
                      </div>
                      <div className="ph-rank-track">
                        <div
                          className={`ph-rank-fill ${overviewMetrics.responseRatePct < 75 ? 'ph-rank-warn' : 'ph-rank-fill--good'}`}
                          style={{ width: `${overviewMetrics.responseRatePct}%` }}
                        />
                      </div>
                    </div>
                    <div
                      className={`ph-mock-crit-tip ${overviewMetrics.responseRatePct < 75 ? 'ph-mock-crit-tip--warn' : 'ph-mock-crit-tip--good'}`}
                    >
                      {overviewMetrics.responseRatePct < 75
                        ? 'Aim for 75%+ response rate to improve visibility in your area.'
                        : 'Strong response rate — maintain quick replies to new requests.'}
                    </div>
                  </div>
                  <div className="ph-mock-criteria-card">
                    <div className="ph-mock-crit-header">
                      <div className="ph-mock-crit-title">Stock reliability</div>
                      <span className="ph-mock-crit-weight">Weight: {analyticsFactorWeights.stock}%</span>
                    </div>
                    <div className="ph-mock-crit-bar-row">
                      <div className="ph-mock-crit-bar-top">
                        <span>Your score</span>
                        <span className="ph-mock-crit-bar-val ph-mock-text-success">
                          {overviewMetrics.stockReliabilityPct} / 100
                        </span>
                      </div>
                      <div className="ph-rank-track">
                        <div
                          className="ph-rank-fill ph-rank-fill--good"
                          style={{ width: `${overviewMetrics.stockReliabilityPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="ph-mock-crit-tip ph-mock-crit-tip--good">
                      Accurate stock in MediConnect helps patients trust your listing.
                    </div>
                  </div>
                </>
              )}
              <div className="ph-mock-criteria-card">
                <div className="ph-mock-crit-header">
                  <div className="ph-mock-crit-title">Patient rating</div>
                  <span className="ph-mock-crit-weight">Weight: {analyticsFactorWeights.patient}%</span>
                </div>
                <div className="ph-mock-crit-bar-row">
                  <div className="ph-mock-crit-bar-top">
                    <span>Your score</span>
                    <span className="ph-mock-crit-bar-val ph-mock-text-accent">{overviewMetrics.patientRatingPct} / 100</span>
                  </div>
                  <div className="ph-rank-track">
                    <div className="ph-rank-fill ph-rank-fill--accent" style={{ width: `${overviewMetrics.patientRatingPct}%` }} />
                  </div>
                </div>
                <div className="ph-mock-crit-tip ph-mock-crit-tip--good">Ratings from fulfilled reservations feed into this score.</div>
              </div>
              {(overviewMetrics.distancePct != null ||
                analyticsFactorWeights.distance != null ||
                portalCompositeUi?.weightsPercent?.distance != null) && (
                <div className="ph-mock-criteria-card">
                  <div className="ph-mock-crit-header">
                    <div className="ph-mock-crit-title">Distance / travel</div>
                    <span className="ph-mock-crit-weight">
                      Weight:{' '}
                      {analyticsFactorWeights.distance != null ? `${analyticsFactorWeights.distance}%` : '—'}
                    </span>
                  </div>
                  <div className="ph-mock-crit-bar-row">
                    <div className="ph-mock-crit-bar-top">
                      <span>Your score</span>
                      <span
                        className={
                          overviewMetrics.distancePct != null
                            ? 'ph-mock-crit-bar-val ph-mock-text-success'
                            : 'ph-mock-crit-bar-val ph-mock-td-muted'
                        }
                      >
                        {overviewMetrics.distancePct != null ? `${overviewMetrics.distancePct} / 100` : '—'}
                      </span>
                    </div>
                    <div className="ph-rank-track">
                      <div
                        className="ph-rank-fill ph-rank-fill--good"
                        style={{
                          width: `${overviewMetrics.distancePct != null ? overviewMetrics.distancePct : 0}%`,
                          opacity: overviewMetrics.distancePct != null ? 1 : 0.2
                        }}
                      />
                    </div>
                  </div>
                  <div className="ph-mock-crit-tip ph-mock-crit-tip--good">
                    {overviewMetrics.distancePct != null
                      ? 'Proximity vs typical patient location for your listing area.'
                      : 'Distance input comes from your ranking summary when the API includes it.'}
                  </div>
                </div>
              )}
            </div>

            <div className="ph-mock-rank-two-col">
              <div className="card ph-mock-card-flush">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      {rankingSummary?.leaderboard_area || overviewMetrics.cityLine || 'Your area'} leaderboard
                    </div>
                    <div className="card-sub">
                      {platformPharmacies && platformPharmacies.length > 0
                        ? `${leaderboardRows.length} pharmacies on MediConnect`
                        : 'Top pharmacies in your area'}
                    </div>
                  </div>
                </div>
                <div className="ph-mock-leaderboard">
                  {leaderboardRows.map((p) => {
                    const scoreVal = p.score == null || Number.isNaN(Number(p.score)) ? null : Number(p.score)
                    const barPct = scoreVal == null ? 0 : Math.min(100, Math.max(0, scoreVal))
                    return (
                    <div key={p.key ?? p.pharmacy_id ?? p.rank} className={`ph-mock-lb-row${p.you ? ' ph-mock-lb-row--you' : ''}`}>
                      <div className={`ph-mock-lb-rank ${leaderboardRankBadgeModifier(p.rank, p.you)}`}>
                        {p.you ? 'YOU' : `#${p.rank}`}
                      </div>
                      <div className="ph-mock-lb-name">
                        {p.name}
                        {p.you ? <span className="ph-mock-lb-you-mark">← You</span> : null}
                      </div>
                      <div className="ph-mock-lb-score-wrap">
                        <div className={`ph-mock-lb-bar${scoreVal == null ? ' ph-mock-lb-bar--empty' : ''}`}>
                          <div
                            className={`ph-mock-lb-fill ${leaderboardScoreFillModifier(p.rank, p.you)}`}
                            style={{
                              width: `${barPct}%`,
                              opacity: scoreVal == null ? 0.25 : 1,
                            }}
                          />
                        </div>
                        <span className="ph-mock-lb-score ph-mono">{scoreVal == null ? '—' : Math.round(scoreVal)}</span>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
              <div className="card ph-mock-card-flush">
                <div className="card-header">
                  <div>
                    <div className="card-title">Score history</div>
                    <div className="card-sub">
                      Last 6 months — scores only; each row may predate the current algorithm. Use root{' '}
                      <span className="ph-mono">formula</span> / <span className="ph-mono">composite_weights</span> for
                      live weights.
                    </div>
                  </div>
                </div>
                <div className="ph-mock-history-chart">
                  <div className="ph-mock-history-hint">Monthly overall score (0–100)</div>
                  {scoreHistory.map((h) => (
                    <div key={h.month} className="ph-mock-chart-row">
                      <div className="ph-mock-chart-label">{h.month}</div>
                      <div className="ph-mock-chart-bar-wrap">
                        <div className="ph-mock-chart-bar" style={{ width: `${h.score}%` }} />
                      </div>
                      <div className="ph-mock-chart-val ph-mono">{h.score}</div>
                    </div>
                  ))}
                </div>
                <div className="ph-mock-history-foot">
                  <strong>Key insight:</strong>{' '}
                  {portalCompositeUi?.distinctNote
                    ? `${portalCompositeUi.distinctNote} `
                    : 'Your composite score blends the factors on this page. '}
                  Patient request ranking can use a different MCDA weight mix than this portal leaderboard.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'earnings' && (
          <div className="ph-mock-page ph-mock-earnings">
            <div className="ph-mock-earn-hero">
              <div className="ph-mock-earn-hero-main">
                <div className="ph-mock-earn-hero-label">This month · completed</div>
                <div className="ph-mock-earn-hero-total ph-mono">${overviewMetrics.earningsMonth.toFixed(2)}</div>
                <p className="ph-mock-earn-hero-sub">
                  {overviewMetrics.fulfilledMonthCount} fulfilment{overviewMetrics.fulfilledMonthCount === 1 ? '' : 's'} ·{' '}
                  {new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="ph-mock-earn-hero-side">
                <div className="ph-mock-trend-lbl">Today</div>
                <div className="ph-mock-trend-val ph-mono">${overviewMetrics.revenueToday.toFixed(2)}</div>
                <div className="ph-mock-trend-sub">
                  {overviewMetrics.revenueYesterday > 0
                    ? `${overviewMetrics.revenueToday >= overviewMetrics.revenueYesterday ? '↑' : '↓'} vs yesterday`
                    : 'Completed'}
                </div>
              </div>
            </div>

            <div className="ph-mock-metric-row ph-mock-earn-metrics">
              <div className="ph-mock-metric-card">
                <div className="ph-mock-metric-label">Avg per fulfilment</div>
                <div className="ph-mock-metric-val ph-mono">${overviewMetrics.avgPerRequest}</div>
                <div className="ph-mock-metric-delta">This month</div>
              </div>
              <div className="ph-mock-metric-card ph-mock-metric-card--green">
                <div className="ph-mock-metric-label">Fulfilment rate</div>
                <div className="ph-mock-metric-val">{overviewMetrics.fulfilmentRatePct}%</div>
                <div className="ph-mock-metric-delta ph-mock-delta-up">All reservations</div>
              </div>
              <div className="ph-mock-metric-card ph-mock-metric-card--warn">
                <div className="ph-mock-metric-label">Active pipeline</div>
                <div className="ph-mock-metric-val">
                  {reservations.filter((r) => {
                    const s = (r.status || '').toLowerCase()
                    return s === 'pending' || s === 'confirmed'
                  }).length}
                </div>
                <div className="ph-mock-metric-delta ph-mock-delta-warn">Pending pickup</div>
              </div>
              <div className="ph-mock-metric-card">
                <div className="ph-mock-metric-label">Ranking score</div>
                <div className="ph-mock-metric-val">{overviewMetrics.rankingScore}</div>
                <div className="ph-mock-metric-delta">
                  <button type="button" className="ph-mock-inline-link" onClick={() => setActiveTab('analytics')}>
                    View breakdown
                  </button>
                </div>
              </div>
            </div>

            <div className="ph-mock-earn-charts">
              <div className="card ph-mock-card-flush ph-mock-earn-chart-card">
                <div className="ph-mock-table-head">
                  <div>
                    <div className="ph-mock-table-title">Week (Mon–Sun)</div>
                    <div className="ph-mock-table-sub">Completed reservations · height vs best day</div>
                  </div>
                </div>
                <div className="ph-mock-bar-chart">
                  {earningsWeekBars.map((b) => (
                    <div key={b.day} className="ph-mock-bar-col">
                      <div className="ph-mock-bar-track">
                        <div className="ph-mock-bar-fill-earn" style={{ height: `${b.pct}%` }} />
                      </div>
                      <div className="ph-mock-bar-lbl">{b.day}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card ph-mock-card-flush ph-mock-earn-chart-card">
                <div className="ph-mock-table-head">
                  <div>
                    <div className="ph-mock-table-title">Today by 3h slot</div>
                    <div className="ph-mock-table-sub">Local time · height vs busiest slot</div>
                  </div>
                </div>
                <div className="ph-mock-bar-chart ph-mock-bar-chart--hours">
                  {earningsHourBars.map((b) => (
                    <div key={b.label} className="ph-mock-bar-col">
                      <div className="ph-mock-bar-track">
                        <div className="ph-mock-bar-fill-hour" style={{ height: `${b.pct}%` }} />
                      </div>
                      <div className="ph-mock-bar-lbl ph-mock-bar-lbl--sm">{b.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card ph-mock-card-flush ph-mock-earn-tx-card">
              <div className="ph-mock-table-head">
                <div>
                  <div className="ph-mock-table-title">Recent transactions</div>
                  <div className="ph-mock-table-sub">Latest completed · amounts from reservation fields</div>
                </div>
                <button
                  type="button"
                  className="ph-mock-btn-secondary ph-mock-btn-secondary--sm"
                  onClick={handleExportEarningsCsv}
                >
                  Export CSV
                </button>
              </div>
              {earningsRecentTx.length === 0 ? (
                <div className="ph-mock-empty-inline ph-mock-pad">No completed reservations yet.</div>
              ) : (
                <table className="ph-mock-data-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Medicine</th>
                      <th>Qty</th>
                      <th>Amount</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earningsRecentTx.map((r) => {
                      const id = r.reservation_id || r.id || r.request_id || '—'
                      const when = reservationFulfilledAt(r)
                      const amt = reservationLineAmount(r)
                      return (
                        <tr key={String(id)}>
                          <td className="ph-mono ph-mock-td-ref">{(String(id)).slice(0, 10)}</td>
                          <td className="ph-mock-td-strong">{r.medicine_name || '—'}</td>
                          <td className="ph-mono">{r.quantity ?? '—'}</td>
                          <td className="ph-mono ph-mock-td-price">{amt > 0 ? `$${amt.toFixed(2)}` : '—'}</td>
                          <td className="ph-mock-td-faint">{when ? new Date(when).toLocaleString() : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="ph-mock-footnote ph-mock-earn-footnote">
              Amounts: <code className="ph-mock-code">total_price</code>, <code className="ph-mock-code">price_at_reservation</code>,{' '}
              <code className="ph-mock-code">amount</code>.
            </p>
          </div>
        )}

        {/* Settings — pharmacy profile + hours & operations */}
        {activeTab === 'settings' && (
          <div className="ph-settings-shell">
            <aside className="ph-settings-nav" aria-label="Settings sections">
              <button
                type="button"
                className={`ph-settings-nav-item${settingsSection === 'profile' ? ' active' : ''}`}
                onClick={() => setSettingsSection('profile')}
              >
                <Building2 size={17} strokeWidth={2} aria-hidden />
                Pharmacy profile
              </button>
              <button
                type="button"
                className={`ph-settings-nav-item${settingsSection === 'operations' ? ' active' : ''}`}
                onClick={() => setSettingsSection('operations')}
              >
                <Clock size={17} strokeWidth={2} aria-hidden />
                Hours & operations
              </button>
            </aside>
            <div className="ph-settings-panel card ph-mock-card-flush">
              {settingsSection === 'profile' && (
                <>
                  <div className="ph-mock-table-head">
                    <div>
                      <div className="ph-mock-table-title">Pharmacy profile</div>
                      <div className="ph-mock-table-sub">Public listing, verification, and contact details</div>
                    </div>
                  </div>
                  <div className="ph-settings-form">
                    <div className="ph-settings-two-col">
                      <div className="form-group">
                        <label>Pharmacy name</label>
                        <input type="text" value={profileForm.name} onChange={handleProfileFieldChange('name')} autoComplete="organization" />
                      </div>
                      <div className="form-group">
                        <label>Trading / display name</label>
                        <input type="text" placeholder="If different from legal name" value={profileForm.display_name} onChange={handleProfileFieldChange('display_name')} />
                      </div>
                    </div>
                    <div className="ph-settings-two-col">
                      <div className="form-group">
                        <label>License / registration no.</label>
                        <input type="text" placeholder="e.g. PCZ …" value={profileForm.license_number} onChange={handleProfileFieldChange('license_number')} />
                      </div>
                      <div className="form-group">
                        <label>Tax / VAT number</label>
                        <input type="text" placeholder="Optional" value={profileForm.tax_number} onChange={handleProfileFieldChange('tax_number')} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Street address</label>
                      <input type="text" value={profileForm.address} onChange={handleProfileFieldChange('address')} autoComplete="street-address" />
                    </div>
                    <div className="ph-settings-two-col">
                      <div className="form-group">
                        <label>Phone (main)</label>
                        <input type="tel" value={profileForm.phone} onChange={handleProfileFieldChange('phone')} autoComplete="tel" />
                      </div>
                      <div className="form-group">
                        <label>WhatsApp (optional)</label>
                        <input type="tel" placeholder="+263 …" value={profileForm.whatsapp} onChange={handleProfileFieldChange('whatsapp')} />
                      </div>
                    </div>
                    <div className="ph-settings-two-col">
                      <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={profileForm.email} onChange={handleProfileFieldChange('email')} autoComplete="email" />
                      </div>
                      <div className="form-group">
                        <label>Website</label>
                        <input type="url" placeholder="https://…" value={profileForm.website} onChange={handleProfileFieldChange('website')} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Public description</label>
                      <p className="ph-settings-hint">Short text shown on your MediConnect listing (max ~300 characters when API validates).</p>
                      <textarea className="ph-settings-textarea" placeholder="Services, languages spoken, parking, etc." rows={4} value={profileForm.description} onChange={handleProfileFieldChange('description')} />
                    </div>
                    <div className="ph-settings-subsection">
                      <div className="ph-settings-subsection-title">Verification</div>
                      <div className="ph-settings-toggles" style={{ padding: 0 }}>
                        <label className="ph-settings-toggle">
                          <input type="checkbox" defaultChecked disabled />
                          <span>Verified pharmacy on MediConnect</span>
                        </label>
                        <p className="ph-settings-hint">Contact support to update verification documents.</p>
                      </div>
                    </div>
                    {!hasPharmacistApiAuth() ? (
                      <p className="ph-settings-hint ph-settings-auth-hint" role="status">
                        Server sync needs a login token. Log out and sign in again so the API can save your profile to
                        the account (not only this browser).
                      </p>
                    ) : null}
                    <div className="ph-settings-save-row">
                      <button
                        type="button"
                        className="ph-mock-btn-primary"
                        onClick={() => void handleSaveProfile()}
                        disabled={profileSaving}
                      >
                        {profileSaving ? 'Saving…' : 'Save profile'}
                      </button>
                      {profileSaveFeedback ? (
                        <p
                          className={`ph-settings-save-feedback ph-settings-save-feedback--${profileSaveFeedback.type}`}
                          role="status"
                        >
                          {profileSaveFeedback.text}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </>
              )}

              {settingsSection === 'operations' && (
                <>
                  <div className="ph-mock-table-head">
                    <div>
                      <div className="ph-mock-table-title">Hours & operations</div>
                      <div className="ph-mock-table-sub">Opening hours and closure notes shown on your listing</div>
                    </div>
                  </div>
                  <div className="ph-settings-form">
                    <div className="form-group">
                      <label>Regular opening hours</label>
                      <textarea
                        className="ph-settings-textarea"
                        rows={3}
                        placeholder="e.g. Mon–Fri 08:00–18:00, Sat 09:00–13:00, Sun closed"
                        value={operationsForm.opening_hours_text}
                        onChange={handleOperationsFieldChange('opening_hours_text')}
                      />
                    </div>
                    <div className="ph-settings-two-col">
                      <div className="form-group">
                        <label>Default weekday open</label>
                        <input
                          type="time"
                          value={operationsForm.weekday_open}
                          onChange={handleOperationsFieldChange('weekday_open')}
                        />
                      </div>
                      <div className="form-group">
                        <label>Default weekday close</label>
                        <input
                          type="time"
                          value={operationsForm.weekday_close}
                          onChange={handleOperationsFieldChange('weekday_close')}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Closure / availability note</label>
                      <input
                        type="text"
                        placeholder='e.g. "We are currently unavailable"'
                        value={operationsForm.holiday_notes}
                        onChange={handleOperationsFieldChange('holiday_notes')}
                      />
                      {isUnavailableHolidayNotes(operationsForm.holiday_notes) ? (
                        <p className="ph-settings-hint ph-settings-auth-hint" role="status">
                          While this note indicates you are unavailable, patients cannot reserve online and you
                          cannot confirm new reservations here.
                        </p>
                      ) : null}
                    </div>
                    <div className="ph-settings-toggles" style={{ padding: 0, marginBottom: 12 }}>
                      <label className="ph-settings-toggle">
                        <input
                          type="checkbox"
                          checked={operationsForm.holiday_mode}
                          onChange={(e) => {
                            const on = e.target.checked
                            setOperationsForm((prev) => ({
                              ...prev,
                              holiday_mode: on,
                              holiday_notes:
                                on && !String(prev.holiday_notes || '').trim()
                                  ? 'We are currently unavailable'
                                  : prev.holiday_notes,
                            }))
                          }}
                        />
                        <span>Pharmacy unavailable (pause reservations)</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="ph-mock-btn-primary"
                      onClick={handleSaveOperations}
                      disabled={operationsSaving}
                    >
                      {operationsSaving ? 'Saving…' : 'Save operations'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {portalToast ? (
          <div className="ph-portal-toast" role="status">
            {portalToast}
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default PharmacyDashboard
