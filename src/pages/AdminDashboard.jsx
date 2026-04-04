import { useCallback, useEffect, useMemo, useState, useId } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Package, RefreshCw, X } from 'lucide-react'
import {
  getAdminDashboardData,
  exportAdminPharmaciesRegistry,
  getAdminSearchVolumeAnalytics,
  getAdminAuditLogs,
  createAdminPharmacy,
  normalizeAdminPaginatedResponse,
  getAdminUsersList,
  getAdminPatientsList,
  getAdminChatbotLogs,
  getAdminChatbotConversationLogs,
  getPharmacistInventory
} from '../utils/api'
import AdminAppShell from '../components/AdminAppShell'
import { buildAdminNavSections, ADMIN_DASHBOARD_TAB_IDS } from '../utils/adminNavSections'
import './AdminDashboard.css'

function formatAdminDateShort(raw) {
  if (raw == null || raw === '' || raw === '—') return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function formatAdminInventoryItemPrice(item) {
  if (item == null || item.price === '' || item.price == null) return '—'
  const u = String(item.price_unit || 'per_packet').replace(/^per_/, '').replace(/_/g, ' ')
  return `$${Number(item.price).toFixed(2)} / ${u}`
}

/**
 * Registry pill: admin dashboard payloads include `status` as the backend pill
 * (verified | pending_review | suspended). Fallback: is_active + verification_status.
 * Returns UI keys: verified | pending | suspended.
 */
function getPharmacyRegistryStatus(p) {
  const pill = String(p?.status || '').toLowerCase()
  if (pill === 'pending_review') return 'pending'
  if (pill === 'suspended') return 'suspended'
  if (pill === 'verified') return 'verified'
  if (p && p.is_active === false) return 'suspended'
  const vs = String(p?.verification_status || '').toLowerCase()
  if (vs === 'suspended') return 'suspended'
  if (vs === 'pending_review') return 'pending'
  if (vs === 'verified') return 'verified'
  const legacy = String(p?.account_status || '').toLowerCase()
  if (legacy === 'inactive' || legacy.includes('suspend')) return 'suspended'
  if (legacy === 'pending' || legacy === 'pending_review') return 'pending'
  if (legacy === 'verified' || legacy === 'active') return 'verified'
  return 'verified'
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

function AdminDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const trendGradientId = useId().replace(/:/g, '')
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [pharmacies, setPharmacies] = useState([])
  const [pharmacists, setPharmacists] = useState([])
  const [allRequests, setAllRequests] = useState([])
  const [allReservations, setAllReservations] = useState([])
  const [pharmacySearch, setPharmacySearch] = useState('')
  const [healthFilter, setHealthFilter] = useState('all')
  const [minRatingFilter, setMinRatingFilter] = useState('all')
  const [sortBy, setSortBy] = useState('attention')
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('')
  const [activityRange, setActivityRange] = useState('7d')
  const [registryStatusFilter, setRegistryStatusFilter] = useState('all')
  const [registryQuery, setRegistryQuery] = useState('')
  const [catalogueQuery, setCatalogueQuery] = useState('')
  const [cataloguePharmacyFilter, setCataloguePharmacyFilter] = useState('all')
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

  const [auditLogs, setAuditLogs] = useState([])
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')

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
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [chatbotTranscript, setChatbotTranscript] = useState(null)
  const [chatbotTranscriptLoading, setChatbotTranscriptLoading] = useState(false)
  const [chatbotTranscriptError, setChatbotTranscriptError] = useState('')
  const [chatbotTranscriptDrawerOpen, setChatbotTranscriptDrawerOpen] = useState(false)

  const [inventoryReportsByPharmacy, setInventoryReportsByPharmacy] = useState([])
  const [inventoryReportsLoading, setInventoryReportsLoading] = useState(false)
  const [inventoryReportSearch, setInventoryReportSearch] = useState('')

  const [overview, setOverview] = useState(null)
  const [requestsByStatus, setRequestsByStatus] = useState({})

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

  const fetchDashboard = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const data = await getAdminDashboardData(100)
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
      const regSum = data?.registry?.summary || data?.breakdown?.pharmacy_registry
      setRegistrySummary(regSum && typeof regSum === 'object' ? regSum : null)
      getAdminSearchVolumeAnalytics(30)
        .then((vol) => setSearchVolumeAnalytics(vol))
        .catch(() => setSearchVolumeAnalytics(null))
    } catch (err) {
      setError(err?.message || 'Failed to load admin dashboard data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleExportRegistry = async () => {
    setExportBusy(true)
    setError('')
    try {
      await exportAdminPharmaciesRegistry()
    } catch (e) {
      setError(e?.message || 'Export failed')
    } finally {
      setExportBusy(false)
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
    fetchDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeTab !== 'audit') return
    let cancelled = false
    setAuditLoading(true)
    setAuditError('')
    getAdminAuditLogs({ page: auditPage, pageSize: 50 })
      .then((data) => {
        if (cancelled) return
        const results = data?.results ?? data?.items ?? data?.logs ?? (Array.isArray(data) ? data : [])
        setAuditLogs(Array.isArray(results) ? results : [])
        const tot = data?.count ?? data?.total
        setAuditTotal(Number.isFinite(Number(tot)) ? Number(tot) : null)
      })
      .catch((e) => {
        if (!cancelled) setAuditError(e?.message || 'Failed to load audit logs')
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, auditPage])

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && ADMIN_DASHBOARD_TAB_IDS.has(t)) {
      setActiveTab(t)
    }
  }, [searchParams])

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
    if (activeTab !== 'chatbot') return
    let cancelled = false
    setChatbotLogsLoading(true)
    setChatbotLogsError('')
    getAdminChatbotLogs({
      page: chatbotLogsPage,
      pageSize: ADMIN_LIST_PAGE_SIZE,
      search: chatbotLogsSearch,
      sessionId: chatbotLogsSessionFilter
    })
      .then((data) => {
        if (cancelled) return
        const { results, count } = normalizeAdminPaginatedResponse(data)
        setChatbotLogs(results)
        setChatbotLogsTotal(count)
      })
      .catch((e) => {
        if (!cancelled) setChatbotLogsError(e?.message || 'Failed to load chatbot logs')
      })
      .finally(() => {
        if (!cancelled) setChatbotLogsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, chatbotLogsPage, chatbotLogsSearch, chatbotLogsSessionFilter])

  const closeChatbotTranscriptDrawer = useCallback(() => {
    setChatbotTranscriptDrawerOpen(false)
    setSelectedConversationId('')
    setChatbotTranscript(null)
    setChatbotTranscriptError('')
  }, [])

  useEffect(() => {
    if (activeTab !== 'chatbot') {
      setChatbotTranscriptDrawerOpen(false)
      setSelectedConversationId('')
      setChatbotTranscript(null)
      setChatbotTranscriptError('')
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
  }, [activeTab, selectedConversationId])

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

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userRole')
    navigate('/login')
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

  const attentionCount = useMemo(
    () => perPharmacyRows.filter((p) => p.needsAttention).length,
    [perPharmacyRows]
  )

  const visiblePharmacies = useMemo(() => {
    const q = pharmacySearch.trim().toLowerCase()
    let rows = [...perPharmacyRows]

    if (healthFilter === 'attention') rows = rows.filter((p) => p.needsAttention)
    if (healthFilter === 'healthy') rows = rows.filter((p) => !p.needsAttention)

    if (minRatingFilter !== 'all') {
      const min = Number(minRatingFilter)
      rows = rows.filter((p) => p.ratingNum != null && p.ratingNum >= min)
    }

    if (q) {
      rows = rows.filter((p) => {
        const hay = `${p.__name} ${p.address || ''} ${p.location_suburb || ''}`.toLowerCase()
        return hay.includes(q)
      })
    }

    if (sortBy === 'name') {
      rows.sort((a, b) => String(a.__name).localeCompare(String(b.__name)))
    } else if (sortBy === 'rating') {
      rows.sort((a, b) => (b.ratingNum ?? -1) - (a.ratingNum ?? -1))
    } else if (sortBy === 'requests') {
      rows.sort((a, b) => b.pendingRequests - a.pendingRequests)
    } else {
      rows.sort((a, b) => {
        const aScore = (a.needsAttention ? 1000 : 0) + a.pendingRequests + a.activeReservations
        const bScore = (b.needsAttention ? 1000 : 0) + b.pendingRequests + b.activeReservations
        return bScore - aScore
      })
    }

    return rows.filter((p) => {
      const hay = `${p.__name} ${p.address || ''} ${p.location_suburb || ''}`.toLowerCase()
      return hay.includes(q) || !q
    })
  }, [perPharmacyRows, pharmacySearch, healthFilter, minRatingFilter, sortBy])

  useEffect(() => {
    if (!visiblePharmacies.length) {
      setSelectedPharmacyId('')
      return
    }
    const exists = visiblePharmacies.some((p) => String(p.__id) === String(selectedPharmacyId))
    if (!selectedPharmacyId || !exists) {
      setSelectedPharmacyId(String(visiblePharmacies[0].__id))
    }
  }, [visiblePharmacies, selectedPharmacyId])

  const selectedPharmacy = useMemo(() => {
    if (!visiblePharmacies.length) return null
    return (
      visiblePharmacies.find((p) => String(p.__id) === String(selectedPharmacyId)) ||
      visiblePharmacies[0]
    )
  }, [visiblePharmacies, selectedPharmacyId])

  const getRequestDayKey = (req) => {
    const raw = req?.created_at || req?.submitted_at || req?.updated_at
    if (!raw) return null
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }

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

    const byDay = searchVolumeAnalytics?.requests_by_day
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
  }, [allRequests, activityRange, searchVolumeAnalytics])

  const usersApproxCount = useMemo(() => {
    if (overview && typeof overview === 'object' && overview.total_patients != null) {
      return Number(overview.total_patients) || 0
    }
    if (overview && typeof overview === 'object' && overview.total_users != null) {
      return Number(overview.total_users) || 0
    }
    return pharmacists.length + allRequests.length
  }, [overview, pharmacists.length, allRequests.length])

  const pharmacyRegistryCount =
    overview?.registered_pharmacies ?? overview?.total_pharmacies ?? pharmacies.length
  const pharmacistRegistryCount =
    overview?.registered_pharmacists ?? overview?.total_pharmacists ?? pharmacists.length
  const reservationsTotal = overview?.total_reservations ?? allReservations.length

  const topMedicineTopics = useMemo(() => {
    const apiTop = searchVolumeAnalytics?.top_medicines
    if (Array.isArray(apiTop) && apiTop.length > 0) {
      const rows = apiTop
        .map((item) => {
          const name = String(
            item?.medicine ?? item?.name ?? item?.label ?? item?.query ?? ''
          ).trim()
          const c = Number(item?.count ?? item?.searches ?? item?.total ?? 0)
          return name ? { name, c: Number.isFinite(c) ? c : 0 } : null
        })
        .filter(Boolean)
      const max = rows.length ? Math.max(...rows.map((r) => r.c)) : 1
      return rows.slice(0, 10).map((r) => ({
        ...r,
        widthPct: Math.min(100, Math.round((r.c / max) * 100))
      }))
    }
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
  }, [allRequests, searchVolumeAnalytics])

  /** Patient requests scoped to catalogue pharmacy filter (same field matching as pharmacy focus). */
  const catalogueRequestsForPharmacy = useMemo(() => {
    if (!cataloguePharmacyFilter || cataloguePharmacyFilter === 'all') {
      return allRequests
    }
    const ph = pharmacies.find((p) => String(p.pharmacy_id ?? p.id) === String(cataloguePharmacyFilter))
    if (!ph) return []
    const norm = (v) => String(v || '').trim().toLowerCase()
    const keys = new Set(
      [norm(ph.pharmacy_id), norm(ph.id), norm(ph.pharmacy_name), norm(ph.name)].filter(Boolean)
    )
    return allRequests.filter((r) => {
      const fields = ['pharmacy_id', 'pharmacy', 'pharmacy_name', 'best_pharmacy_name']
      if (fields.some((f) => keys.has(norm(r?.[f])))) return true
      if (Array.isArray(r.pharmacy_names)) {
        return r.pharmacy_names.some((n) => keys.has(norm(n)))
      }
      return false
    })
  }, [allRequests, pharmacies, cataloguePharmacyFilter])

  /** Unique medicines from scoped requests + platform search analytics when showing all pharmacies. */
  const medicineCatalogueRows = useMemo(() => {
    const byKey = new Map()
    const ensure = (k, displayName) => {
      if (!byKey.has(k)) {
        byKey.set(k, {
          key: k,
          name: displayName || k,
          requestMentions: 0,
          analyticsSearches: null
        })
      }
      return byKey.get(k)
    }
    const showAnalytics = !cataloguePharmacyFilter || cataloguePharmacyFilter === 'all'
    const apiTop = showAnalytics ? searchVolumeAnalytics?.top_medicines : null
    if (Array.isArray(apiTop)) {
      apiTop.forEach((item) => {
        const name = String(item?.medicine ?? item?.name ?? item?.label ?? item?.query ?? '').trim()
        if (!name) return
        const k = name.toLowerCase()
        const row = ensure(k, name)
        const ac = Number(item?.count ?? item?.searches ?? item?.total ?? 0)
        if (Number.isFinite(ac)) row.analyticsSearches = ac
      })
    }
    catalogueRequestsForPharmacy.forEach((r) => {
      const names = Array.isArray(r.medicine_names)
        ? r.medicine_names
        : r.medicine_name
          ? [r.medicine_name]
          : []
      names.forEach((raw) => {
        const t = String(raw || '').trim()
        if (!t) return
        const k = t.toLowerCase()
        const row = ensure(k, t)
        row.requestMentions += 1
      })
    })
    return [...byKey.values()].sort((a, b) => {
      const sa = (a.requestMentions || 0) + (a.analyticsSearches || 0)
      const sb = (b.requestMentions || 0) + (b.analyticsSearches || 0)
      if (sb !== sa) return sb - sa
      return a.name.localeCompare(b.name)
    })
  }, [catalogueRequestsForPharmacy, searchVolumeAnalytics, cataloguePharmacyFilter])

  const filteredMedicineCatalogue = useMemo(() => {
    const q = catalogueQuery.trim().toLowerCase()
    if (!q) return medicineCatalogueRows
    return medicineCatalogueRows.filter((r) => r.name.toLowerCase().includes(q))
  }, [medicineCatalogueRows, catalogueQuery])

  /** Medicines mentioned on patient requests, grouped by pharmacy (for catalogue UI). */
  const medicineCatalogueByPharmacy = useMemo(() => {
    return perPharmacyRows
      .map((row) => {
        const byKey = new Map()
        row.requests.forEach((r) => {
          const names = Array.isArray(r.medicine_names)
            ? r.medicine_names
            : r.medicine_name
              ? [r.medicine_name]
              : []
          names.forEach((raw) => {
            const t = String(raw || '').trim()
            if (!t) return
            const k = t.toLowerCase()
            const prev = byKey.get(k)
            byKey.set(k, { key: k, name: t, mentions: (prev?.mentions || 0) + 1 })
          })
        })
        const items = [...byKey.values()].sort((a, b) => b.mentions - a.mentions)
        return {
          pharmacyId: String(row.__id),
          name: row.__name,
          items
        }
      })
      .filter((s) => s.items.length > 0)
      .sort((a, b) => b.items.length - a.items.length)
  }, [perPharmacyRows])

  const filteredCatalogueByPharmacy = useMemo(() => {
    const q = catalogueQuery.trim().toLowerCase()
    if (!q) return medicineCatalogueByPharmacy
    return medicineCatalogueByPharmacy
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((i) => i.name.toLowerCase().includes(q))
      }))
      .filter(
        (sec) =>
          sec.items.length > 0 ||
          sec.name.toLowerCase().includes(q)
      )
  }, [medicineCatalogueByPharmacy, catalogueQuery])

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

  const navSections = useMemo(
    () =>
      buildAdminNavSections({
        usersApproxCount,
        pharmacyRegistryCount,
        pharmacistRegistryCount,
        requestStatsTotal: requestStats.total,
        reservationsTotal
      }),
    [
      usersApproxCount,
      pharmacyRegistryCount,
      pharmacistRegistryCount,
      requestStats.total,
      reservationsTotal
    ]
  )

  const pageHead = useMemo(() => {
    const heads = {
      overview: { title: 'Dashboard', subtitle: 'Operations snapshot · pharmacies, requests, and reservations.' },
      users: {
        title: 'Users & Patients',
        subtitle: 'Staff accounts and patient sessions — loaded from paginated admin APIs.'
      },
      pharmacies: {
        title: 'Pharmacy Registry',
        subtitle: `${pharmacyRegistryCount} registered pharmacies`
      },
      medicines: {
        title: 'Medicine Catalogue',
        subtitle:
          cataloguePharmacyFilter === 'all'
            ? `${medicineCatalogueByPharmacy.length} pharmacies with request mentions · ${medicineCatalogueRows.length} unique names (requests + analytics).`
            : `${medicineCatalogueRows.length} names in requests linked to the selected pharmacy (loaded data).`
      },
      inventory: { title: 'Inventory Reports', subtitle: 'Stock and sync health across branches.' },
      pharmacists: { title: 'Pharmacists', subtitle: `${pharmacistRegistryCount} registered staff` },
      requests: { title: 'Patient requests', subtitle: `${requestStats.total} in current dataset` },
      reservations: { title: 'Reservations', subtitle: `${reservationsTotal} total` },
      'search-analytics': {
        title: 'Search Analytics',
        subtitle: `${requestStats.total.toLocaleString()} patient requests in loaded data · trend by day`
      },
      chatbot: { title: 'AI Chatbot Logs', subtitle: 'Conversations and transcripts from chatbot logs API.' },
      audit: { title: 'Audit Trail', subtitle: 'Admin actions and results.' }
    }
    return heads[activeTab] || heads.overview
  }, [
    activeTab,
    usersApproxCount,
    pharmacyRegistryCount,
    pharmacistRegistryCount,
    requestStats.total,
    reservationsTotal,
    medicineCatalogueRows.length,
    medicineCatalogueByPharmacy.length,
    cataloguePharmacyFilter
  ])

  const pharmacyOpsScore = (p) => {
    let score = 68
    if (Number.isFinite(p.responseRateNum)) score = Math.round(p.responseRateNum * 0.82 + 12)
    if (Number.isFinite(p.ratingNum)) score = Math.round((score * 0.55) + (p.ratingNum / 5) * 45)
    if (p.needsAttention) score -= 20
    score -= Math.min(18, p.pendingRequests * 4)
    score -= Math.min(12, Math.max(0, p.activeReservations - 2) * 2)
    return Math.max(12, Math.min(100, score))
  }

  const registryMetrics = useMemo(() => {
    const s = registrySummary
    if (s && typeof s === 'object') {
      const total = Number(s.total_registered ?? s.total)
      const verified = Number(s.verified)
      const pending = Number(s.pending_review ?? s.pending)
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

  const registryTableRows = useMemo(() => {
    const q = registryQuery.trim().toLowerCase()
    let rows = perPharmacyRows.map((p) => {
      const mr = Number(p.match_rate)
      const __matchPct = Number.isFinite(mr)
        ? Math.round(Math.min(100, Math.max(0, mr)))
        : pharmacyOpsScore(p)
      return {
        ...p,
        __registryStatus: getPharmacyRegistryStatus(p),
        __matchPct
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
  }, [perPharmacyRows, registryQuery, registryStatusFilter])

  const pharmacyPerformanceRows = useMemo(() => {
    return [...perPharmacyRows]
      .map((p) => {
        const mr = Number(p.match_rate)
        const __score = Number.isFinite(mr)
          ? Math.round(Math.min(100, Math.max(0, mr)))
          : pharmacyOpsScore(p)
        return { ...p, __score }
      })
      .sort((a, b) => b.__score - a.__score)
      .slice(0, 3)
  }, [perPharmacyRows])

  const recentRegistrationRows = useMemo(() => {
    return perPharmacyRows.slice(0, 3).map((p) => ({
      id: p.__id,
      name: p.__name,
      type: p.pharmacy_type || p.type || 'Pharmacy',
      status: p.needsAttention ? 'Pending' : 'Active'
    }))
  }, [perPharmacyRows])

  const overviewAlerts = useMemo(() => {
    const items = []
    if (requestStats.pending > 0) {
      items.push({
        id: 'pending-all',
        title: `${requestStats.pending} patient requests awaiting response`,
        meta: 'Platform-wide',
        tone: 'critical',
        ago: 'Live'
      })
    }
    perPharmacyRows
      .filter((p) => p.needsAttention)
      .slice(0, 4)
      .forEach((p) => {
        items.push({
          id: `ph-${p.__id}`,
          title: p.__name,
          meta: p.pendingRequests
            ? `${p.pendingRequests} pending requests · ${p.activeReservations} active holds`
            : 'Queued for operational review',
          tone: 'warn',
          ago: '—'
        })
      })
    if (items.length === 0) {
      items.push({
        id: 'clear',
        title: 'No critical queue items',
        meta: 'All monitored organisations within thresholds',
        tone: 'ok',
        ago: 'Just now'
      })
    }
    return items.slice(0, 8)
  }, [perPharmacyRows, requestStats.pending])

  return (
    <AdminAppShell
      navSections={navSections}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onLogout={logout}
    >
        <header className="admin-topbar">
          <div>
            <h1>{pageHead.title}</h1>
            <p>{pageHead.subtitle}</p>
          </div>
          <div className="admin-topbar-actions">
            {activeTab === 'pharmacies' && (
              <>
                <button
                  className="btn-light"
                  type="button"
                  onClick={() => handleExportRegistry()}
                  disabled={exportBusy || registerSaving}
                >
                  {exportBusy ? 'Exporting…' : 'Export CSV'}
                </button>
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
            <button className="btn-light" type="button" onClick={() => fetchDashboard({ silent: true })} disabled={refreshing}>
              <RefreshCw size={16} /> {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </header>

        {error && <div className="admin-error">{error}</div>}
        {loading ? (
          <div className="admin-loading">Loading admin data...</div>
        ) : (
          <>
            {activeTab === 'overview' && (
            <div className="admin-overview-layout">
            <section className="admin-stats-grid admin-stats-grid--kpi admin-stats-grid--compact" aria-label="Key metrics">
              <div className="admin-stat-card admin-stat-card--plain">
                <div className="admin-stat-card-body">
                  <p className="label">Registered pharmacies</p>
                  <h3>{pharmacyRegistryCount}</h3>
                  <p className={`admin-stat-trend ${attentionCount > 0 ? 'trend-warn' : 'trend-up'}`}>
                    {attentionCount > 0 ? `↑ ${attentionCount} need review` : '↑ Stable'}
                  </p>
                </div>
              </div>
              <div className="admin-stat-card admin-stat-card--plain">
                <div className="admin-stat-card-body">
                  <p className="label">Pharmacists</p>
                  <h3>{pharmacistRegistryCount}</h3>
                  <p className="admin-stat-trend trend-up">↑ {pharmacistRegistryCount} on record</p>
                </div>
              </div>
              <div className="admin-stat-card admin-stat-card--plain">
                <div className="admin-stat-card-body">
                  <p className="label">Patient requests</p>
                  <h3>{requestStats.total}</h3>
                  <p className={`admin-stat-trend ${requestStats.pending > 0 ? 'trend-warn' : 'trend-up'}`}>
                    {requestStats.pending > 0
                      ? `↑ ${requestStats.pending} pending`
                      : `↑ ${requestStats.responded} responded`}
                  </p>
                </div>
              </div>
              <div className="admin-stat-card admin-stat-card--plain">
                <div className="admin-stat-card-body">
                  <p className="label">Reservations</p>
                  <h3>{reservationsTotal}</h3>
                  <p className={`admin-stat-trend ${activeReservationsTotal > 5 ? 'trend-warn' : 'trend-up'}`}>
                    ↑ {activeReservationsTotal} active
                  </p>
                </div>
              </div>
            </section>

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
                </div>
              </section>

              <section className="admin-panel admin-panel-side" aria-label="Operational alerts">
                <div className="admin-panel-head">
                  <h2>System alerts</h2>
                </div>
                <ul className="admin-alert-list">
                  {overviewAlerts.map((a) => (
                    <li key={a.id} className="admin-alert-row">
                      <span className={`admin-alert-dot admin-alert-dot--${a.tone}`} aria-hidden />
                      <div className="admin-alert-body">
                        <div className="admin-alert-title">{a.title}</div>
                        <div className="admin-alert-meta">
                          {a.meta}
                          {a.ago ? ` · ${a.ago}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="admin-overview-bottom">
              <section className="admin-panel" aria-label="Pharmacy match rate">
                <div className="admin-panel-head">
                  <h2>Pharmacy match rate</h2>
                </div>
                {pharmacyPerformanceRows.length === 0 ? (
                  <p className="muted">No pharmacies to rank yet.</p>
                ) : (
                  <ul className="admin-performance-list">
                    {pharmacyPerformanceRows.map((p) => {
                      const score = p.__score
                      const city =
                        p.city ||
                        p.location_suburb ||
                        (String(p.address || '').split(',').pop() || '').trim() ||
                        (String(p.address || '').split(',')[0] || '').trim() ||
                        ''
                      const verified = !p.needsAttention
                      return (
                        <li key={p.__id} className="admin-performance-row">
                          <div className="admin-performance-main">
                            <span className="admin-performance-name">{p.__name}</span>
                            <span className="admin-performance-loc muted">
                              {city || '—'}
                              {' · '}
                              {verified ? 'Verified' : 'Active'}
                            </span>
                          </div>
                          <div className="admin-performance-score">
                            <span className={`admin-alert-dot admin-alert-dot--${score >= 70 ? 'ok' : score >= 50 ? 'warn' : 'critical'}`} aria-hidden />
                            <span className="admin-performance-pct">{score}%</span>
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
                {recentRegistrationRows.length === 0 ? (
                  <p className="muted">No registration rows yet.</p>
                ) : (
                  <div className="admin-table-compact-wrap">
                    <table className="admin-table admin-table-compact">
                      <thead>
                        <tr><th>Name</th><th>Type</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {recentRegistrationRows.map((row) => (
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
                          <th>Match rate</th>
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
                          const statusKey = p.__registryStatus
                          const statusLabel =
                            statusKey === 'suspended'
                              ? 'Suspended'
                              : statusKey === 'pending'
                                ? 'Pending'
                                : 'Verified'
                          const pillClass =
                            statusKey === 'suspended'
                              ? 'status-suspended'
                              : statusKey === 'pending'
                                ? 'status-pending'
                                : 'status-responded'
                          return (
                            <tr key={p.__id}>
                              <td className="cell-strong">{p.__name}</td>
                              <td>{city}</td>
                              <td>{type}</td>
                              <td className="mono">{medicinesListed}</td>
                              <td className="cell-muted admin-registry-nowrap">{lastSync}</td>
                              <td>
                                <div className="admin-match-rate-cell">
                                  <div className="admin-match-rate-track" aria-hidden>
                                    <div
                                      className={`admin-match-rate-fill admin-match-rate-fill--${p.__matchPct >= 70 ? 'hi' : p.__matchPct >= 45 ? 'mid' : 'low'}`}
                                      style={{ width: `${p.__matchPct}%` }}
                                    />
                                  </div>
                                  <span className="admin-match-rate-pct">{p.__matchPct}%</span>
                                </div>
                              </td>
                              <td>
                                <span className={`status-pill ${pillClass}`}>{statusLabel}</span>
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

            {activeTab === 'overview' && (
            <section className="admin-panel admin-panel--compact">
              <div className="admin-panel-head">
                <h2>Pharmacy focus</h2>
                <span className="admin-count-chip">{selectedPharmacy ? 1 : 0}</span>
              </div>
              <div className="admin-overview-controls">
                <input
                  className="admin-filter-input"
                  value={pharmacySearch}
                  onChange={(e) => setPharmacySearch(e.target.value)}
                  placeholder="Search pharmacy or area"
                />
                <select
                  className="admin-filter-select"
                  value={selectedPharmacyId}
                  onChange={(e) => setSelectedPharmacyId(e.target.value)}
                >
                  {visiblePharmacies.length === 0 && (
                    <option value="">No pharmacy available</option>
                  )}
                  {visiblePharmacies.map((p) => (
                    <option key={`pick-${p.__id}`} value={String(p.__id)}>
                      {p.__name}
                    </option>
                  ))}
                </select>
              </div>
              {visiblePharmacies.length === 0 ? (
                <p className="muted">No pharmacies found.</p>
              ) : (
                <div className="admin-request-grid">
                  {selectedPharmacy && (
                    <article className="admin-request-card pharmacy-card formal-card" key={selectedPharmacy.__id}>
                      <div className="pharmacy-card-head">
                        <h3 className="pharmacy-card-title">{selectedPharmacy.__name}</h3>
                        <span className={`status-pill ${selectedPharmacy.needsAttention ? 'status-pending' : 'status-responded'}`}>
                          {selectedPharmacy.needsAttention ? 'Needs attention' : 'Healthy'}
                        </span>
                      </div>
                      <p className="cell-muted pharmacy-card-address">
                        {selectedPharmacy.address || selectedPharmacy.location_address || selectedPharmacy.location_suburb || 'Address N/A'}
                      </p>
                      <p className="cell-muted pharmacy-card-meta">
                        Rating: {selectedPharmacy.rating ?? selectedPharmacy.pharmacy_rating ?? 'N/A'} | Ratings: {selectedPharmacy.rating_count ?? '0'} | Response Rate:{' '}
                        {selectedPharmacy.response_rate != null ? `${selectedPharmacy.response_rate}%` : 'N/A'}
                      </p>
                      <div className="pharmacy-kpi-row">
                        <span className="kpi-chip">Pending req: {selectedPharmacy.pendingRequests}</span>
                        <span className="kpi-chip">Active reservations: {selectedPharmacy.activeReservations}</span>
                        <span className="kpi-chip">Pharmacists: {selectedPharmacy.pharmacists.length}</span>
                      </div>

                      <div className="pharmacy-card-block">
                        <p className="cell-strong pharmacy-card-block-title">Pharmacists ({selectedPharmacy.pharmacists.length})</p>
                        {selectedPharmacy.pharmacists.length === 0 ? (
                          <p className="cell-muted">No pharmacists linked.</p>
                        ) : (
                          <ul className="admin-request-events">
                            {selectedPharmacy.pharmacists.slice(0, 2).map((staff, sIdx) => (
                              <li key={staff.pharmacist_id || `${staff.email}-${sIdx}`} className="pharmacy-list-row">
                                <div className="admin-request-event-main">
                                  <span className="cell-strong">
                                    {staff.full_name || staff.name || [staff.first_name, staff.last_name].filter(Boolean).join(' ') || 'N/A'}
                                  </span>
                                </div>
                                <div className="admin-request-event-meta">
                                  <span>{staff.email || 'No email'}</span>
                                </div>
                              </li>
                            ))}
                            {selectedPharmacy.pharmacists.length > 2 && (
                              <li className="pharmacy-card-more">+{selectedPharmacy.pharmacists.length - 2} more pharmacists</li>
                            )}
                          </ul>
                        )}
                      </div>

                      <div className="pharmacy-card-block">
                        <p className="cell-strong pharmacy-card-block-title">Requests ({selectedPharmacy.requests.length})</p>
                        {selectedPharmacy.requests.length === 0 ? (
                          <p className="cell-muted">No matched requests.</p>
                        ) : (
                          <ul className="admin-request-events">
                            {selectedPharmacy.requests.slice(0, 2).map((r, rIdx) => (
                              <li key={r.request_id || `${selectedPharmacy.__id}-req-${rIdx}`} className="pharmacy-list-row">
                                <div className="admin-request-event-main">
                                  <span className="mono">{r.short_request_id || r.request_id || 'N/A'}</span>
                                  <span className={`status-pill status-${String(r.status || '').toLowerCase() || 'unknown'}`}>
                                    {r.status || 'N/A'}
                                  </span>
                                </div>
                                <div className="admin-request-event-meta">
                                  <span>{Array.isArray(r.medicine_names) ? r.medicine_names.join(', ') : (r.medicine_name || 'N/A')}</span>
                                </div>
                              </li>
                            ))}
                            {selectedPharmacy.requests.length > 2 && (
                              <li className="pharmacy-card-more">+{selectedPharmacy.requests.length - 2} more requests</li>
                            )}
                          </ul>
                        )}
                      </div>

                      <div className="pharmacy-card-block">
                        <p className="cell-strong pharmacy-card-block-title">Reservations ({selectedPharmacy.reservations.length})</p>
                        {selectedPharmacy.reservations.length === 0 ? (
                          <p className="cell-muted">No reservations yet.</p>
                        ) : (
                          <ul className="admin-request-events">
                            {selectedPharmacy.reservations.slice(0, 2).map((res, zIdx) => (
                              <li key={res.reservation_id || `${selectedPharmacy.__id}-res-${zIdx}`} className="pharmacy-list-row">
                                <div className="admin-request-event-main">
                                  <span className="mono">{res.reservation_id || 'N/A'}</span>
                                  <span className={`status-pill status-${String(res.status || '').toLowerCase() || 'unknown'}`}>
                                    {res.status || 'N/A'}
                                  </span>
                                </div>
                                <div className="admin-request-event-meta">
                                  <span>{res.patient_name || 'Unknown patient'} · {res.patient_phone || 'no phone'}</span>
                                </div>
                              </li>
                            ))}
                            {selectedPharmacy.reservations.length > 2 && (
                              <li className="pharmacy-card-more">+{selectedPharmacy.reservations.length - 2} more reservations</li>
                            )}
                          </ul>
                        )}
                      </div>
                    </article>
                  )}
                  {!selectedPharmacy && (
                    <p className="muted">Select a pharmacy from the list above to view its focus card.</p>
                  )}
                </div>
              )}
            </section>
            )}

            {activeTab === 'users' && (
              <div className="admin-users-page">
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
                    <button type="button" className="btn-light" onClick={() => navigate('/admin/control-center')}>
                      Control center
                    </button>
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

            {activeTab === 'medicines' && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Medicine catalogue</h2>
                  <span className="admin-count-chip">{filteredMedicineCatalogue.length}</span>
                </div>
                <p className="muted admin-users-hint">
                  <strong>All pharmacies</strong> shows medicines grouped by branch (from loaded patient requests), similar
                  to an inventory overview. Pick one pharmacy to focus; search analytics (
                  <span className="mono">top_medicines</span>) is merged when viewing all.
                </p>
                <div className="admin-registry-filters admin-catalogue-filters">
                  <select
                    className="admin-filter-select"
                    value={cataloguePharmacyFilter}
                    onChange={(e) => setCataloguePharmacyFilter(e.target.value)}
                    aria-label="Filter catalogue by pharmacy"
                  >
                    <option value="all">All pharmacies</option>
                    {pharmacies.map((p, idx) => {
                      const pid = String(p.pharmacy_id ?? p.id ?? idx)
                      const label = p.pharmacy_name || p.name || `Pharmacy ${idx + 1}`
                      return (
                        <option key={pid} value={pid}>
                          {label}
                        </option>
                      )
                    })}
                  </select>
                  <input
                    className="admin-filter-input admin-filter-input--wide"
                    value={catalogueQuery}
                    onChange={(e) => setCatalogueQuery(e.target.value)}
                    placeholder="Filter by medicine or pharmacy name…"
                    aria-label="Filter medicine catalogue"
                  />
                </div>
                {cataloguePharmacyFilter === 'all' && topMedicineTopics.length > 0 && (
                  <div className="admin-catalogue-platform-bar">
                    <span className="admin-catalogue-platform-label muted">Platform search interest</span>
                    <div className="admin-catalogue-platform-chips">
                      {topMedicineTopics.slice(0, 12).map((t) => (
                        <span key={t.name} className="admin-catalogue-platform-chip" title="From analytics or requests">
                          {t.name}
                          <span className="admin-catalogue-platform-chip-n">{t.c}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {medicineCatalogueRows.length === 0 ? (
                  <p className="muted">
                    {cataloguePharmacyFilter === 'all'
                      ? 'No medicine names yet. Load the dashboard with patient requests (or analytics) and use Refresh.'
                      : 'No medicines found for this pharmacy in loaded requests — try another pharmacy or All pharmacies, or refresh after more data loads.'}
                  </p>
                ) : cataloguePharmacyFilter === 'all' ? (
                  filteredCatalogueByPharmacy.length === 0 ? (
                    <div className="admin-catalogue-fallback">
                      <p className="muted">
                        No per-pharmacy request mentions match your filter. Showing the combined list instead.
                      </p>
                      <div className="admin-catalogue-med-grid">
                        {filteredMedicineCatalogue.slice(0, 200).map((row) => (
                          <div key={row.key} className="admin-catalogue-med-card">
                            <div className="admin-catalogue-med-card-name">{row.name}</div>
                            <div className="admin-catalogue-med-card-meta">
                              <span>Requests {row.requestMentions}</span>
                              {row.analyticsSearches != null && (
                                <span>Analytics {row.analyticsSearches}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="admin-catalogue-by-pharmacy">
                      {filteredCatalogueByPharmacy.map((sec) => (
                        <article key={sec.pharmacyId} className="admin-catalogue-pharmacy-card">
                          <header className="admin-catalogue-pharmacy-card-head">
                            <div>
                              <h3 className="admin-catalogue-pharmacy-title">{sec.name}</h3>
                              <p className="muted admin-catalogue-pharmacy-sub">
                                {sec.items.length} medicine{sec.items.length === 1 ? '' : 's'} in loaded requests
                              </p>
                            </div>
                            <button
                              type="button"
                              className="btn-light"
                              onClick={() => setCataloguePharmacyFilter(sec.pharmacyId)}
                            >
                              Focus pharmacy
                            </button>
                          </header>
                          <div className="admin-catalogue-med-grid admin-catalogue-med-grid--compact">
                            {sec.items.slice(0, 48).map((m) => (
                              <div key={m.key} className="admin-catalogue-med-card admin-catalogue-med-card--compact">
                                <div className="admin-catalogue-med-card-name">{m.name}</div>
                                <span className="admin-catalogue-mention-badge">{m.mentions}</span>
                              </div>
                            ))}
                          </div>
                          {sec.items.length > 48 && (
                            <p className="muted admin-catalogue-pharmacy-more">
                              +{sec.items.length - 48} more — narrow with search or focus this pharmacy
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="admin-catalogue-med-grid">
                    {filteredMedicineCatalogue.slice(0, 200).map((row) => (
                      <div key={row.key} className="admin-catalogue-med-card">
                        <div className="admin-catalogue-med-card-name">{row.name}</div>
                        <div className="admin-catalogue-med-card-meta">
                          <span>On requests {row.requestMentions}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'inventory' && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Inventory by pharmacy</h2>
                  <div className="admin-inventory-toolbar">
                    <input
                      className="admin-filter-input"
                      value={inventoryReportSearch}
                      onChange={(e) => setInventoryReportSearch(e.target.value)}
                      placeholder="Search pharmacy…"
                      aria-label="Filter inventory reports by pharmacy"
                    />
                    <button
                      type="button"
                      className="btn-light"
                      disabled={inventoryReportsLoading}
                      onClick={() => loadInventoryReports()}
                    >
                      <RefreshCw size={16} className={inventoryReportsLoading ? 'admin-spin' : ''} />
                      {inventoryReportsLoading ? 'Loading…' : 'Reload stock'}
                    </button>
                  </div>
                </div>
                <p className="muted admin-users-hint">
                  Live stock from each branch&apos;s primary linked pharmacist (
                  <span className="mono">GET …/pharmacist/inventory/</span>). Use Refresh in the header to reload
                  requests, then <strong>Reload stock</strong> here for up-to-date quantities.
                </p>
                {inventoryReportsLoading && inventoryReportsByPharmacy.length === 0 ? (
                  <p className="muted">Loading inventory from all pharmacies…</p>
                ) : visibleInventoryReports.length === 0 ? (
                  <p className="muted">
                    {inventoryReportSearch.trim()
                      ? 'No pharmacies match your search.'
                      : 'No pharmacies in the dashboard dataset yet.'}
                  </p>
                ) : (
                  <div className="admin-inventory-pharmacy-grid">
                    {visibleInventoryReports.map((rep) => (
                      <article key={String(rep.pharmacyId)} className="admin-inventory-pharmacy-card">
                        <header className="admin-inventory-card-head">
                          <div className="admin-inventory-card-title-row">
                            <Package size={20} className="admin-inventory-card-icon" aria-hidden />
                            <div>
                              <h3>{rep.pharmacyName}</h3>
                              {rep.error === 'no_pharmacist' ? (
                                <p className="admin-inventory-card-warn muted">No pharmacist linked — cannot load stock</p>
                              ) : rep.error ? (
                                <p className="admin-inventory-card-warn muted">{rep.error}</p>
                              ) : (
                                <p className="muted mono admin-inventory-card-sub">
                                  {rep.items.length} line{rep.items.length === 1 ? '' : 's'} · pharmacist{' '}
                                  {rep.pharmacistId || '—'}
                                </p>
                              )}
                            </div>
                          </div>
                          {rep.summary && !rep.error && (
                            <div className="admin-inventory-summary-pills">
                              <span title="Total SKUs">
                                Total <strong>{rep.summary.total_medicines ?? rep.items.length}</strong>
                              </span>
                              <span className="admin-inventory-pill admin-inventory-pill--ok">
                                In stock <strong>{rep.summary.in_stock ?? '—'}</strong>
                              </span>
                              <span className="admin-inventory-pill admin-inventory-pill--warn">
                                Low <strong>{rep.summary.low_stock ?? '—'}</strong>
                              </span>
                              <span className="admin-inventory-pill admin-inventory-pill--bad">
                                Out <strong>{rep.summary.out_of_stock ?? '—'}</strong>
                              </span>
                            </div>
                          )}
                        </header>
                        {!rep.error && rep.items.length > 0 && (
                          <div className="admin-inventory-items-wrap">
                            <div className="admin-inventory-items-head">
                              <span>Medicine</span>
                              <span>Qty</span>
                              <span>Price</span>
                              <span>Status</span>
                            </div>
                            <ul className="admin-inventory-items-list">
                              {rep.items.map((item, ix) => (
                                <li key={`${item.medicine_name}-${ix}`} className="admin-inventory-item-row">
                                  <span className="admin-inventory-item-name">{item.medicine_name || '—'}</span>
                                  <span className="mono">{item.quantity ?? '—'}</span>
                                  <span className="mono">{formatAdminInventoryItemPrice(item)}</span>
                                  <span
                                    className={`admin-inventory-status admin-inventory-status--${String(item.status || 'in_stock').replace(/_/g, '-')}`}
                                  >
                                    {item.status === 'low_stock'
                                      ? 'Low'
                                      : item.status === 'out_of_stock'
                                        ? 'Out'
                                        : 'OK'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {!rep.error && rep.items.length === 0 && (
                          <p className="muted admin-inventory-empty">No stock lines returned for this branch.</p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'search-analytics' && (
              <div className="admin-analytics-page">
                <section className="admin-metrics-row" aria-label="Search analytics summary">
                  <div className="admin-metric-inline">
                    <span className="admin-metric-inline-label">
                      {searchVolumeAnalytics?.total_requests_in_window != null
                        ? 'Requests (analytics window)'
                        : 'Total requests (loaded)'}
                    </span>
                    <strong className="admin-metric-inline-value">
                      {(searchVolumeAnalytics?.total_requests_in_window ?? requestStats.total).toLocaleString()}
                    </strong>
                  </div>
                  <div className="admin-metric-inline">
                    <span className="admin-metric-inline-label">Responded</span>
                    <strong className="admin-metric-inline-value admin-metric-good">{requestStats.responded.toLocaleString()}</strong>
                  </div>
                  <div className="admin-metric-inline">
                    <span className="admin-metric-inline-label">Pending</span>
                    <strong className="admin-metric-inline-value admin-metric-warn">{requestStats.pending.toLocaleString()}</strong>
                  </div>
                  <div className="admin-metric-inline">
                    <span className="admin-metric-inline-label">Unique medicines</span>
                    <strong className="admin-metric-inline-value">{topMedicineTopics.length}</strong>
                  </div>
                  {searchVolumeAnalytics && (
                    <>
                      <div className="admin-metric-inline">
                        <span className="admin-metric-inline-label">Zero-result requests</span>
                        <strong className="admin-metric-inline-value admin-metric-warn">
                          {searchVolumeAnalytics.zero_result_requests != null
                            ? Number(searchVolumeAnalytics.zero_result_requests).toLocaleString()
                            : '—'}
                        </strong>
                      </div>
                      <div className="admin-metric-inline">
                        <span className="admin-metric-inline-label">Zero-result rate</span>
                        <strong className="admin-metric-inline-value">
                          {(() => {
                            const zr = Number(searchVolumeAnalytics.zero_result_rate)
                            if (searchVolumeAnalytics.zero_result_rate == null || !Number.isFinite(zr)) return '—'
                            const pct = zr <= 1 ? zr * 100 : zr
                            return `${pct.toFixed(1)}%`
                          })()}
                        </strong>
                      </div>
                    </>
                  )}
                </section>
                <div className="admin-analytics-grid">
                  <section className="admin-panel admin-panel-tall">
                    <div className="admin-panel-head">
                      <h2>Search trend — {activityRange === '30d' ? '30 days' : '7 days'}</h2>
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
                    <div className="admin-search-trend-stack">
                      <div className="admin-trend-wrap">
                        {requestActivitySeries.counts.every((n) => n === 0) ? (
                          <p className="admin-activity-empty muted">
                            {requestActivitySeries.source === 'api'
                              ? 'No volume in this range from search analytics.'
                              : 'No dated requests in this range.'}
                          </p>
                        ) : (
                          <AdminSearchTrendChart
                            counts={requestActivitySeries.counts}
                            labels={requestActivitySeries.labels}
                            labelShort={requestActivitySeries.labelShort}
                            gradientId={`${trendGradientId}-a`}
                          />
                        )}
                      </div>
                    </div>
                  </section>
                  <section className="admin-panel admin-panel-tall">
                    <div className="admin-panel-head">
                      <h2>Top searched medicines</h2>
                    </div>
                    {topMedicineTopics.length === 0 ? (
                      <p className="muted">No medicine names in loaded requests yet.</p>
                    ) : (
                      <ul className="admin-top-medicines-list admin-top-medicines-list--spaced">
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
                            <span className="admin-top-medicine-pct">{row.widthPct}%</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </div>
            )}

            {activeTab === 'chatbot' && (
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

            {activeTab === 'audit' && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Audit trail</h2>
                  {auditTotal != null && (
                    <span className="admin-count-chip">{auditTotal.toLocaleString()} events</span>
                  )}
                </div>
                {auditError && <div className="admin-error admin-error--inline">{auditError}</div>}
                {auditLoading ? (
                  <p className="muted">Loading audit log…</p>
                ) : auditLogs.length === 0 ? (
                  <p className="muted">No audit entries for this page.</p>
                ) : (
                  <>
                    <div className="table-wrap">
                      <table className="admin-table admin-audit-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Action</th>
                            <th>Actor</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogs.map((log, idx) => {
                            const key = log.id ?? log.pk ?? `${auditPage}-${idx}`
                            const t = log.created_at ?? log.timestamp ?? log.performed_at
                            const action = log.action ?? log.event ?? log.operation ?? '—'
                            const actor =
                              log.user_email ?? log.actor ?? log.admin_username ?? log.user ?? log.user_id ?? '—'
                            const rawDetail =
                              log.details ?? log.message ?? log.target ?? log.metadata ?? log.change_summary ?? ''
                            const detailStr =
                              typeof rawDetail === 'object'
                                ? JSON.stringify(rawDetail)
                                : String(rawDetail || '—')
                            return (
                              <tr key={key}>
                                <td className="cell-muted admin-registry-nowrap">{formatAdminDateShort(t)}</td>
                                <td className="cell-strong">{String(action)}</td>
                                <td>{String(actor)}</td>
                                <td className="admin-audit-detail" title={detailStr}>
                                  {detailStr.length > 160 ? `${detailStr.slice(0, 160)}…` : detailStr}
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
                        disabled={auditPage <= 1 || auditLoading}
                        onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                      <span className="muted">Page {auditPage}</span>
                      <button
                        type="button"
                        className="btn-light"
                        disabled={
                          auditLoading ||
                          (auditTotal != null
                            ? auditPage * 50 >= auditTotal
                            : auditLogs.length < 50)
                        }
                        onClick={() => setAuditPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </>
                )}
              </section>
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

export default AdminDashboard
