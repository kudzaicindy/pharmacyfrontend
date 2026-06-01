import { useMemo } from 'react'
import {
  AlertTriangle,
  SlidersHorizontal,
  Users,
  Inbox,
  Zap,
  Building2,
  Activity
} from 'lucide-react'
import { mapChatbotLogsToAuditPreview } from '../../utils/adminChatbotAudit'
import { getPharmacyRegistryStatus, normalizeVerificationQueue } from '../../utils/pharmacyRegistryStatus'
import {
  displayLabelForAnalyticsGeoRegionKey,
  haystackForZwCityBucket
} from '../../utils/zwLocationBuckets'
import { cityRowsFromSearchVolumeTopRegions } from '../../utils/adminSearchVolumeUi'
import { extractMcdaWeightsFromLayer3 } from '../../utils/adminAlgorithmStewardship'

/** City buckets aligned with dashboard mock (Hwange / Gweru separate from Bulawayo). */
const CITY_BUCKETS = [
  { key: 'harare', label: 'Harare', needles: ['harare', 'chitungwiza', 'epworth'], kind: 'urban' },
  { key: 'bulawayo', label: 'Bulawayo', needles: ['bulawayo', 'victoria falls', 'matabel'], kind: 'urban' },
  { key: 'mutare', label: 'Mutare', needles: ['mutare', 'rusape', 'nyanga', 'chipinge'], kind: 'urban' },
  { key: 'hwange', label: 'Hwange', needles: ['hwange'], kind: 'rural' },
  { key: 'gweru', label: 'Gweru', needles: ['gweru', 'kwekwe', 'kadoma', 'gokwe'], kind: 'rural' },
  { key: 'other', label: 'Other', needles: [], kind: 'rural' }
]

const CITY_ICONS = {
  harare: '🏙️',
  bulawayo: '🏙️',
  mutare: '🏘️',
  hwange: '🌾',
  gweru: '🌾',
  other: '🌿'
}

const DEMO_VERIFICATION = [
  {
    name: 'Mabelreign Chemist',
    lic: 'ZIM-05012',
    submitted: '2 days ago',
    meta: '📍 Mabelreign, Harare · Owner: T. Sibanda · NPA registered ✓',
    note: 'Supporting docs: License cert, premises photo, NPA letter — all uploaded',
    flags: []
  },
  {
    name: 'Highfield Pharmacy',
    lic: 'ZIM-05043',
    submitted: '5 days ago',
    meta: '📍 Highfield, Harare · Owner: R. Moyo · NPA status: Pending verification',
    note: '',
    flags: ['⚠️ License certificate expires in 3 months — flag for early renewal', '⚠️ Request NPA confirmation']
  },
  {
    name: 'Hwange Community Pharmacy',
    lic: 'ZIM-05088',
    submitted: '1 day ago',
    meta: '📍 Hwange, Matabeleland North · Rural area 🌾',
    note: 'NPA registered ✓ · All docs uploaded ✓ · Rural pharmacy — priority processing',
    flags: []
  }
]

const DEFAULT_MEDIBOT_PROFILE_CARDS = [
  { key: 'standard', title: 'Standard', weightsLine: '30 · 35 · 20 · 15', active: true },
  { key: 'rural', title: 'Rural equity', weightsLine: '25 · 20 · 20 · 35', active: false },
  { key: 'shortage', title: 'Shortage', weightsLine: '20 · 30 · 20 · 30', active: false },
  { key: 'affordability', title: 'Affordability', weightsLine: '40 · 30 · 15 · 15', active: false }
]

function bucketFromText(text) {
  const t = String(text || '').toLowerCase()
  if (!t.trim()) return 'other'
  for (const b of CITY_BUCKETS) {
    if (b.key === 'other') continue
    if (b.needles.some((n) => t.includes(n))) return b.key
  }
  return 'other'
}

function countRequestsByCity(requests) {
  const counts = Object.fromEntries(CITY_BUCKETS.map((b) => [b.key, 0]))
  for (const r of requests || []) {
    const hay = haystackForZwCityBucket(r)
    counts[bucketFromText(hay)] += 1
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  return CITY_BUCKETS.map((b) => ({
    ...b,
    count: counts[b.key],
    pct: Math.round((counts[b.key] / total) * 1000) / 10
  }))
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function countRequestsLastHour(requests) {
  const cutoff = Date.now() - 60 * 60 * 1000
  return (requests || []).filter((r) => {
    const raw = r.created_at || r.submitted_at
    if (!raw) return false
    const t = new Date(raw).getTime()
    return Number.isFinite(t) && t >= cutoff
  }).length
}

function normalizeApiCityRows(layer1) {
  const rows = layer1?.request_volume_by_city
  if (!Array.isArray(rows) || rows.length === 0) return null
  const total = rows.reduce((s, r) => s + (Number(r.volume ?? r.count) || 0), 0) || 1
  return rows.map((r, i) => {
    const count = Number(r.volume ?? r.count) || 0
    const key = String(r.key ?? r.slug ?? i)
    let label = String(r.label ?? r.city ?? r.name ?? '').trim()
    if (!label || label === '—') {
      label = displayLabelForAnalyticsGeoRegionKey(key) || key || '—'
    }
    const kind =
      r.kind === 'rural' || r.kind === 'urban'
        ? r.kind
        : Number(r.rural_share) >= 0.5
          ? 'rural'
          : 'urban'
    return {
      key,
      label,
      count,
      pct: Math.round((count / total) * 1000) / 10,
      kind,
      emoji: r.emoji ?? CITY_ICONS[key] ?? '📍'
    }
  })
}

function normalizeStandardWeights(l3) {
  const sw = l3?.standard_weights
  if (sw && typeof sw === 'object') {
    const price = Number(sw.price ?? sw.price_pct ?? sw.price_competitiveness)
    const distance = Number(sw.distance ?? sw.distance_pct ?? sw.travel ?? sw.distance_travel)
    const rating = Number(sw.rating ?? sw.rating_pct ?? sw.patient_rating)
    const stock = Number(
      sw.stock ?? sw.stock_pct ?? sw.stock_reliability ?? sw.reliability
    )
    if ([price, distance, rating, stock].every((n) => Number.isFinite(n))) {
      return [
        { label: 'Price competitiveness', pct: Math.round(price) },
        { label: 'Distance / travel time', pct: Math.round(distance) },
        { label: 'Patient rating', pct: Math.round(rating) },
        { label: 'Stock reliability', pct: Math.round(stock) }
      ]
    }
  }
  const ex = extractMcdaWeightsFromLayer3(l3)
  if (ex) {
    return [
      { label: 'Price competitiveness', pct: ex.price },
      { label: 'Distance / travel time', pct: ex.distance },
      { label: 'Patient rating', pct: ex.rating },
      { label: 'Stock reliability', pct: ex.stock }
    ]
  }
  return null
}

function formatWeightLine(weights) {
  if (weights == null) return ''
  if (Array.isArray(weights)) {
    const a = weights.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    return a.length ? a.map((n) => Math.round(n)).join(' · ') : ''
  }
  if (typeof weights !== 'object') return ''
  const a = [
    weights.price ?? weights[0],
    weights.distance ?? weights[1],
    weights.rating ?? weights[2],
    weights.stock ?? weights[3] ?? weights.reliability
  ].map((x) => Number(x))
  if (!a.every((n) => Number.isFinite(n))) return ''
  return a.map((n) => Math.round(n)).join(' · ')
}

function KpiTileStack({ icon: Icon, label, value, foot, pill }) {
  return (
    <div className="medibot-kpi medibot-kpi--tile">
      <div className="medibot-kpi-head">
        <span className="medibot-kpi-icon-wrap" aria-hidden>
          <Icon size={14} strokeWidth={2} />
        </span>
        {pill}
      </div>
      <p className="medibot-kpi-label">{label}</p>
      <p className="medibot-kpi-value">{value}</p>
      {foot ? <p className="medibot-kpi-foot">{foot}</p> : null}
    </div>
  )
}

/**
 * MediBot main dashboard: system health, geography, governance, algorithm, chatbot audit.
 */
export default function MediBotOverviewSections({
  mediBot = null,
  overview,
  usersApproxCount = 0,
  pharmacyRegistryCount = 0,
  registryMetrics,
  allRequests = [],
  perPharmacyRows = [],
  onOpenVerification,
  onNavigateTab,
  /** Merged `/admin/analytics/search-volume/` + widget; drives city volume when `top_regions` is non-empty. */
  searchVolumeSnapshot = null,
  /** Optional queue rows from `GET .../admin/dashboard/data/` (same shape as MediBot layer2 queue). */
  dashboardVerificationQueue = null,
  /** Conversation index from `GET .../admin/chatbot/logs/` — drives “Chatbot audit” cards when present. */
  chatbotLogs = [],
  chatbotLogsLoading = false,
  chatbotLogsHasLoaded = false,
  chatbotLogsError = '',
  /** Open Chatbot audit tab + transcript drawer for a conversation id. */
  onOpenChatbotAuditConversation
}) {
  const nav = typeof onNavigateTab === 'function' ? onNavigateTab : () => {}

  const l1 = mediBot?.layer1_system_health
  const l2 = mediBot?.layer2_pharmacy_governance
  const l3 = mediBot?.layer3_algorithm

  const apiCityRows = useMemo(() => normalizeApiCityRows(l1), [l1])

  const todayStart = startOfToday()
  const requestsToday = (allRequests || []).filter((r) => {
    const raw = r.created_at || r.submitted_at
    if (!raw) return false
    const t = new Date(raw).getTime()
    return Number.isFinite(t) && t >= todayStart.getTime()
  }).length

  const lastHour = countRequestsLastHour(allRequests)
  const hasRequestDates = (allRequests || []).some((r) => r.created_at || r.submitted_at)

  const requestingPatientCount = useMemo(() => {
    const ids = new Set()
    for (const r of allRequests || []) {
      const id =
        r?.patient_id ??
        r?.patientId ??
        r?.session_id ??
        r?.sessionId ??
        r?.conversation_id ??
        r?.conversationId
      if (id != null && String(id).trim() !== '') ids.add(String(id))
    }
    return ids.size
  }, [allRequests])
  const activeUsersDisplay =
    requestingPatientCount > 0
      ? requestingPatientCount.toLocaleString()
      : Number.isFinite(Number(usersApproxCount)) && Number(usersApproxCount) > 0
        ? Number(usersApproxCount).toLocaleString()
        : '—'

  const userTrendPct =
    l1?.active_users_change_pct != null
      ? Number(l1.active_users_change_pct)
      : overview?.active_users_change_pct != null
        ? Number(overview.active_users_change_pct)
        : 12
  const userTrendUp = userTrendPct >= 0

  const requestsTodayDisplay =
    l1?.requests_today != null && Number.isFinite(Number(l1.requests_today))
      ? Number(l1.requests_today)
      : hasRequestDates
        ? requestsToday
        : 1284
  const lastHourDisplay =
    l1?.requests_last_hour != null && Number.isFinite(Number(l1.requests_last_hour))
      ? Number(l1.requests_last_hour)
      : hasRequestDates
        ? lastHour
        : 142

  const avgSecFromL1 =
    l1?.avg_response_time_ms != null
      ? Number(l1.avg_response_time_ms) / 1000
      : l1?.avg_response_seconds != null
        ? Number(l1.avg_response_seconds)
        : NaN
  const avgSec =
    Number.isFinite(avgSecFromL1)
      ? avgSecFromL1
      : overview?.avg_response_time_ms != null
        ? Number(overview.avg_response_time_ms) / 1000
        : overview?.avg_response_time != null
          ? Number(overview.avg_response_time)
          : 1.8
  const avgResponse = Number.isFinite(avgSec) ? `${avgSec.toFixed(1)}s` : '1.8s'

  const uptimePctFromL1 =
    l1?.uptime_pct_this_month != null
      ? Number(l1.uptime_pct_this_month)
      : l1?.uptime_percent != null
        ? Number(l1.uptime_percent)
        : NaN
  const uptimePct =
    Number.isFinite(uptimePctFromL1)
      ? uptimePctFromL1
      : overview?.uptime_pct_this_month != null
        ? Number(overview.uptime_pct_this_month)
        : overview?.uptime_percent != null
          ? Number(overview.uptime_percent)
          : 99.8
  const uptime = Number.isFinite(uptimePct) ? `${uptimePct.toFixed(1)}%` : '99.8%'

  const dashboardVQ = useMemo(() => normalizeVerificationQueue(dashboardVerificationQueue), [dashboardVerificationQueue])
  const dashboardQueueLen = dashboardVQ?.length ?? 0

  const pendingPharmacies =
    l2?.verification_queue_pending_count != null && Number.isFinite(Number(l2.verification_queue_pending_count))
      ? Number(l2.verification_queue_pending_count)
      : dashboardQueueLen > 0
        ? dashboardQueueLen
        : registryMetrics?.pending ?? 0

  const suspendedCount = (perPharmacyRows || []).filter((p) => getPharmacyRegistryStatus(p) === 'suspended').length
  const pc = l1?.pharmacy_counts
  const registeredCount =
    (pc && Number.isFinite(Number(pc.registered ?? pc.total)) ? Number(pc.registered ?? pc.total) : null) ??
    (pharmacyRegistryCount > 0 ? pharmacyRegistryCount : 240)
  const suspendedDisplay =
    (pc && Number.isFinite(Number(pc.suspended)) ? Number(pc.suspended) : null) ??
    (suspendedCount > 0 ? suspendedCount : 2)
  const activePharmaciesCount =
    (pc && Number.isFinite(Number(pc.active)) ? Number(pc.active) : null) ?? Math.max(0, registeredCount - suspendedDisplay)

  const cityRowsLocal = useMemo(() => countRequestsByCity(allRequests), [allRequests])
  const cityRowsFromSearchVolume = useMemo(
    () => cityRowsFromSearchVolumeTopRegions(searchVolumeSnapshot?.top_regions),
    [searchVolumeSnapshot?.top_regions]
  )
  const cityRows = cityRowsFromSearchVolume ?? apiCityRows ?? cityRowsLocal
  const totalCityReq = cityRows.reduce((s, c) => s + c.count, 0)
  const maxCity = Math.max(...cityRows.map((c) => c.count), 1)

  const ruralShareFromL1 =
    l1?.rural_share_pct != null
      ? Number(l1.rural_share_pct) <= 1
        ? Number(l1.rural_share_pct) * 100
        : Number(l1.rural_share_pct)
      : NaN
  const ruralShare =
    Number.isFinite(ruralShareFromL1) && ruralShareFromL1 >= 0
      ? ruralShareFromL1 / 100
      : totalCityReq > 0
        ? cityRows.filter((c) => c.kind === 'rural').reduce((s, c) => s + c.count, 0) / totalCityReq
        : 0.078
  const ruralPctDisplay =
    Number.isFinite(ruralShareFromL1) && ruralShareFromL1 >= 0
      ? Math.round(ruralShareFromL1 * 10) / 10
      : totalCityReq > 0
        ? Math.round(ruralShare * 1000) / 10
        : 7.8

  const verificationFromDashboard = useMemo(() => {
    const q = dashboardVQ
    if (!q || !q.length) return null
    return q.slice(0, 5).map((p, i) => ({
      __id: String(p.id ?? p.pharmacy_id ?? p.__id ?? i),
      __name: String(p.name ?? p.pharmacy_name ?? p.__name ?? '—'),
      license_number: p.license_number ?? p.licence_number ?? p.lic,
      created_at: p.submitted_at ?? p.created_at,
      address: p.address ?? p.meta ?? p.location
    }))
  }, [dashboardVQ])

  const verificationFromApi = useMemo(() => {
    const q = normalizeVerificationQueue(l2?.verification_queue)
    if (!q) return null
    return q.slice(0, 5).map((p, i) => ({
      __id: String(p.id ?? p.pharmacy_id ?? p.__id ?? i),
      __name: String(p.name ?? p.pharmacy_name ?? p.__name ?? '—'),
      license_number: p.license_number ?? p.licence_number ?? p.lic,
      created_at: p.submitted_at ?? p.created_at,
      address: p.address ?? p.meta ?? p.location
    }))
  }, [l2])

  const verificationPreview =
    verificationFromDashboard != null && verificationFromDashboard.length > 0
      ? verificationFromDashboard
      : verificationFromApi != null && verificationFromApi.length > 0
        ? verificationFromApi
        : (perPharmacyRows || []).filter((p) => getPharmacyRegistryStatus(p) === 'pending').slice(0, 3)

  const awaitingPreview = useMemo(() => {
    const rows = l2?.awaiting_response_preview
    if (!Array.isArray(rows) || !rows.length) return []
    return rows.slice(0, 5).map((r, i) => ({
      id: String(r.id ?? i),
      line: String(r.line ?? r.summary ?? `${r.medicine ?? r.medicines ?? '—'} · ${r.area ?? r.location ?? ''}`).trim()
    }))
  }, [l2])

  const weightRowsApi = useMemo(() => normalizeStandardWeights(l3), [l3])
  const weightRowsDefault = [
    { label: 'Price competitiveness', pct: 30 },
    { label: 'Distance / travel time', pct: 35 },
    { label: 'Patient rating', pct: 20 },
    { label: 'Stock reliability', pct: 15 }
  ]
  const weightRows = weightRowsApi ?? weightRowsDefault

  const contextProfilesApi = useMemo(() => {
    const raw = l3?.context_profiles ?? l3?.profiles
    if (!Array.isArray(raw) || !raw.length) return null
    const activeKey = String(l3?.active_ranking_profile ?? l3?.active_profile ?? '').toLowerCase()
    return raw.map((p) => {
      const key = String(p.key ?? p.id ?? p.slug ?? '').toLowerCase()
      const weightsLine =
        formatWeightLine(p.weights) ||
        formatWeightLine(p) ||
        (Array.isArray(p.weights_pct) ? p.weights_pct.map((n) => Math.round(Number(n))).join(' · ') : '') ||
        (p.label && p.weights_string ? String(p.weights_string) : '')
      const isActive =
        Boolean(p.active) ||
        (activeKey && key === activeKey) ||
        (activeKey && String(p.label ?? '').toLowerCase().replace(/\s+/g, '_') === activeKey)
      return {
        key: key || String(p.label),
        title: String(p.label ?? p.title ?? p.name ?? 'Profile'),
        weightsLine: weightsLine || '—',
        active: isActive
      }
    })
  }, [l3])

  const activeUsersFoot = 'Distinct patients with at least one request in loaded data'

  const avgResponseFoot =
    l1?.response_targets_label != null ? String(l1.response_targets_label) : 'Urban <2s · Rural <5s'

  const uptimeFoot =
    l1?.uptime_incident_label != null ? String(l1.uptime_incident_label) : '1 incident · 22m down'

  const cityBannerText = `Rural share ${ruralPctDisplay}% — consider targeted outreach in lower-volume buckets (e.g. Hwange, Gweru).`

  const agg = l2?.aggregates && typeof l2.aggregates === 'object' ? l2.aggregates : null

  const profileCards = useMemo(() => {
    const raw = contextProfilesApi ?? DEFAULT_MEDIBOT_PROFILE_CARDS
    if (!raw.length) return DEFAULT_MEDIBOT_PROFILE_CARDS
    if (raw.some((p) => p.active)) return raw
    return raw.map((p, i) => ({ ...p, active: i === 0 }))
  }, [contextProfilesApi])

  /** Same source as Chatbot audit tab: {@link getAdminChatbotLogs} + {@link mapChatbotLogsToAuditPreview} (no MediBot layer5 / demo). */
  const auditSection = useMemo(() => {
    const fromLogs = mapChatbotLogsToAuditPreview(chatbotLogs, 5)
    if (fromLogs.length > 0) {
      return { kind: 'rows', rows: fromLogs }
    }
    if (chatbotLogsLoading || !chatbotLogsHasLoaded) {
      return { kind: 'loading' }
    }
    if (chatbotLogsError) {
      return { kind: 'error', message: chatbotLogsError }
    }
    if (!chatbotLogs.length) {
      return {
        kind: 'empty',
        message: 'No conversations in the index. Open Chatbot audit after traffic appears.'
      }
    }
    return {
      kind: 'empty',
      message:
        'No keyword-flagged rows on the first page of the index. Open Chatbot audit to search or browse more pages.'
    }
  }, [chatbotLogs, chatbotLogsLoading, chatbotLogsHasLoaded, chatbotLogsError])

  return (
    <div className="medibot-overview medibot-overview--structured">
      {/* 1 — System health */}
      <section className="medibot-section" aria-labelledby="medibot-s1">
        <h2 id="medibot-s1" className="medibot-section-title">
          <span className="medibot-section-num">1</span> System Health — Operational Overview
        </h2>
        <div className="medibot-kpi-row medibot-kpi-row--overview medibot-kpi-row--strip medibot-kpi-row--strip-5">
          <KpiTileStack
            icon={Users}
            label="Requesting patients"
            value={activeUsersDisplay}
            foot={activeUsersFoot}
            pill={
              <span className={`medibot-kpi-pill ${userTrendUp ? 'medibot-kpi-pill--up' : 'medibot-kpi-pill--down'}`}>
                {userTrendUp ? '▲' : '▼'} {userTrendUp ? '+' : ''}
                {Math.abs(userTrendPct)}%
              </span>
            }
          />
          <KpiTileStack
            icon={Inbox}
            label="Requests today"
            value={requestsTodayDisplay.toLocaleString()}
            foot={`Last hour: ${lastHourDisplay.toLocaleString()}`}
            pill={<span className="medibot-kpi-pill medibot-kpi-pill--neutral">Normal</span>}
          />
          <KpiTileStack
            icon={Zap}
            label="Avg response"
            value={avgResponse}
            foot={avgResponseFoot}
            pill={<span className="medibot-kpi-pill medibot-kpi-pill--ok">Stable</span>}
          />
          <KpiTileStack
            icon={Building2}
            label="Active pharmacies"
            value={activePharmaciesCount.toLocaleString()}
            foot={`${registeredCount.toLocaleString()} reg. · ${suspendedDisplay} susp.`}
            pill={
              <span className="medibot-kpi-pill medibot-kpi-pill--pending">
                {pendingPharmacies > 0 ? pendingPharmacies : verificationPreview.length || (mediBot ? 0 : 3)} pending
              </span>
            }
          />
          <KpiTileStack
            icon={Activity}
            label="Uptime (month)"
            value={uptime}
            foot={uptimeFoot}
            pill={<span className="medibot-kpi-pill medibot-kpi-pill--online">Live</span>}
          />
        </div>

        <div className="medibot-col-block medibot-col-card medibot-col-block--full">
            <h3 className="medibot-subhead">Request volume by city</h3>
            {cityRowsFromSearchVolume ? (
              <p className="medibot-muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
                Source: search analytics ({searchVolumeSnapshot?.days ?? 30}-day window), not Layer 1 API alone.
              </p>
            ) : null}
            <div className="medibot-city-grid medibot-city-grid--compact">
              {cityRows.map((c) => (
                <div key={c.key} className="medibot-city-card">
                  <div className="medibot-city-head">
                    <span className="medibot-city-emoji" aria-hidden>
                      {c.emoji ?? CITY_ICONS[c.key] ?? '📍'}
                    </span>
                    <span>{c.label}</span>
                  </div>
                  <p className="medibot-city-count">{c.count > 0 ? c.count.toLocaleString() : '—'}</p>
                  <div className="medibot-city-bar-track">
                    <div
                      className="medibot-city-bar-fill"
                      style={{ width: `${c.count > 0 ? (c.count / maxCity) * 100 : 8}%` }}
                    />
                  </div>
                  <p className="medibot-city-pct">
                    {c.count > 0 ? (
                      <>
                        {c.kind === 'rural' ? 'Rural — ' : ''}
                        {c.pct}%
                      </>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
              ))}
            </div>
            <div className="medibot-banner medibot-banner--warn medibot-banner--compact">
              <AlertTriangle size={16} aria-hidden />
              <span>{cityBannerText}</span>
            </div>
        </div>
      </section>

      {/* 2 — Governance */}
      <section className="medibot-section" aria-labelledby="medibot-s2">
        <h2 id="medibot-s2" className="medibot-section-title">
          <span className="medibot-section-num">2</span> Pharmacy Governance — Trust &amp; Accountability
        </h2>
        <div className="medibot-gov-grid medibot-gov-grid--card-pair">
          <div className="medibot-gov-col medibot-col-card">
            <div className="medibot-gov-head">
              <h3>
                ⏳ Verification queue
                <span className="medibot-gov-count">
                  {' '}
                  (
                  {pendingPharmacies > 0
                    ? pendingPharmacies
                    : verificationPreview.length || (mediBot ? 0 : 3)}{' '}
                  awaiting approval)
                </span>
              </h3>
              <button type="button" className="medibot-link-btn" onClick={() => onOpenVerification?.()}>
                Open queue →
              </button>
            </div>
            <ul className="medibot-vq-rich-list">
              {verificationPreview.length > 0
                ? verificationPreview.map((p) => (
                    <li key={p.__id} className="medibot-vq-rich-card">
                      <strong>{p.__name}</strong>
                      <p className="medibot-vq-lic">
                        Lic: {p.license_number || p.pharmacy_id || '—'} · Submitted{' '}
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                      </p>
                      <p className="medibot-muted">{p.address || '—'}</p>
                      <div className="medibot-vq-actions">
                        <button type="button" className="medibot-chip-btn medibot-chip-btn--ok">
                          ✓ Approve
                        </button>
                        <button type="button" className="medibot-chip-btn">
                          Request more info
                        </button>
                        <button type="button" className="medibot-chip-btn medibot-chip-btn--bad">
                          ✗ Reject
                        </button>
                      </div>
                    </li>
                  ))
                : verificationFromApi !== null ? (
                    <li key="vq-empty" className="medibot-vq-rich-card medibot-muted">
                      No pharmacies in the verification queue.
                    </li>
                  ) : (
                    DEMO_VERIFICATION.map((d, i) => (
                    <li key={i} className="medibot-vq-rich-card">
                      <strong>{d.name}</strong>
                      <p className="medibot-vq-lic">
                        Lic: {d.lic} · Submitted {d.submitted}
                      </p>
                      <p className="medibot-vq-meta">{d.meta}</p>
                      {d.note ? <p className="medibot-muted">{d.note}</p> : null}
                      {d.flags.map((f, j) => (
                        <p key={j} className="medibot-vq-flag">
                          {f}
                        </p>
                      ))}
                      <div className="medibot-vq-actions">
                        {i === 2 ? (
                          <button type="button" className="medibot-chip-btn medibot-chip-btn--accent">
                            ⚡ Fast-track approve (Rural)
                          </button>
                        ) : (
                          <>
                            <button type="button" className="medibot-chip-btn medibot-chip-btn--ok">
                              ✓ Approve
                            </button>
                            {i === 1 ? null : (
                              <button type="button" className="medibot-chip-btn">
                                Request more info
                              </button>
                            )}
                          </>
                        )}
                        <button type="button" className="medibot-chip-btn medibot-chip-btn--bad">
                          ✗ Reject
                        </button>
                      </div>
                    </li>
                  ))
                )}
            </ul>
          </div>
          <div className="medibot-gov-col medibot-col-card">
            <h3 className="medibot-subhead">Platform-wide pharmacy health</h3>
            <div className="medibot-health-grid medibot-health-grid--inline medibot-health-grid--in-gov-card">
              <div className="medibot-health-stat">
                <span className="medibot-health-k">Avg response rate</span>
                <span className="medibot-health-v">
                  {agg?.avg_response_rate != null && Number.isFinite(Number(agg.avg_response_rate))
                    ? `${Number(agg.avg_response_rate).toFixed(1)}%`
                    : '86.4%'}
                </span>
              </div>
              <div className="medibot-health-stat">
                <span className="medibot-health-k">Avg stock accuracy</span>
                <span className="medibot-health-v">
                  {agg?.avg_stock_accuracy != null && Number.isFinite(Number(agg.avg_stock_accuracy))
                    ? `${Number(agg.avg_stock_accuracy).toFixed(1)}%`
                    : '72.1%'}
                </span>
              </div>
              <div className="medibot-health-stat">
                <span className="medibot-health-k">Avg patient rating</span>
                <span className="medibot-health-v">
                  {agg?.avg_rating != null && Number.isFinite(Number(agg.avg_rating))
                    ? `${Number(agg.avg_rating).toFixed(1)} / 5.0`
                    : '4.4 / 5.0'}
                </span>
              </div>
              <div className="medibot-health-stat">
                <span className="medibot-health-k">Suspended this month</span>
                <span className="medibot-health-v">
                  {agg?.suspended_this_month != null && Number.isFinite(Number(agg.suspended_this_month))
                    ? Number(agg.suspended_this_month).toLocaleString()
                    : suspendedDisplay}
                </span>
              </div>
            </div>
          </div>
        </div>

        {(l2?.stuck_request_count != null && Number(l2.stuck_request_count) > 0) || awaitingPreview.length > 0 ? (
          <div className="medibot-banner medibot-banner--warn medibot-banner--compact" style={{ marginTop: 10 }}>
            <Inbox size={16} aria-hidden />
            <span>
              {l2?.stuck_request_count != null && Number(l2.stuck_request_count) > 0
                ? `${Number(l2.stuck_request_count)} request(s) awaiting pharmacy response. `
                : null}
              {awaitingPreview.length > 0 ? awaitingPreview.map((r) => r.line).filter(Boolean).join(' · ') : null}
            </span>
          </div>
        ) : null}
      </section>

      {/* 3 — Algorithm */}
      <section className="medibot-section" aria-labelledby="medibot-s3">
        <h2 id="medibot-s3" className="medibot-section-title">
          <span className="medibot-section-num">3</span> Algorithm Stewardship — Ranking Weights
        </h2>
        <div className="medibot-cols-2 medibot-cols-2--card-pair">
          <div className="medibot-col-block medibot-col-card">
            <div className="medibot-algo-head">
              <span className="medibot-algo-mode">
                <SlidersHorizontal size={16} aria-hidden />{' '}
                <strong>{l3?.active_ranking_profile_label ?? l3?.active_ranking_profile ?? 'Standard'}</strong> weights
              </span>
            </div>
            {weightRows.map((row) => (
              <div key={row.label} className="medibot-weight-row medibot-weight-row--tight">
                <div className="medibot-weight-text">
                  <strong>{row.label}</strong>
                </div>
                <div className="medibot-weight-bar-wrap">
                  <div className="medibot-weight-bar" style={{ width: `${row.pct}%` }} />
                </div>
                <span className="medibot-weight-pct">{row.pct}%</span>
              </div>
            ))}
            <div className="medibot-weight-total">
              <span>Total</span>
              <strong>100%</strong>
            </div>
          </div>
          <div className="medibot-col-block medibot-col-card">
            <h3 className="medibot-subhead">Context profiles</h3>
            <div className="medibot-profile-stack">
              {profileCards.map((p) => (
                <article
                  key={p.key ?? p.title}
                  className={`medibot-profile-card${p.active ? ' medibot-profile-card--active' : ''}`}
                >
                  <h4>{p.title}</h4>
                  <span
                    className={
                      p.active ? 'medibot-profile-badge' : 'medibot-profile-badge medibot-profile-badge--off'
                    }
                  >
                    {p.active ? 'Active' : 'Off'}
                  </span>
                  <p className="medibot-profile-weights">{p.weightsLine}</p>
                </article>
              ))}
            </div>
            <button type="button" className="medibot-link-btn medibot-profile-link" onClick={() => nav('algorithm-stewardship')}>
              Profiles →
            </button>
          </div>
        </div>
      </section>

      {/* 4 — Chatbot audit */}
      <section className="medibot-section" aria-labelledby="medibot-s4">
        <h2 id="medibot-s4" className="medibot-section-title">
          <span className="medibot-section-num">4</span> Chatbot audit
        </h2>
        <div className="medibot-col-block medibot-col-card medibot-col-block--full">
          <div className="medibot-gov-head">
            <h3>
              Flagged conversations
              <span className="medibot-gov-count"> (preview)</span>
            </h3>
            <button type="button" className="medibot-link-btn" onClick={() => nav('chatbot-audit')}>
              Full log →
            </button>
          </div>
          {auditSection.kind === 'loading' ? (
            <p className="medibot-muted medibot-audit-lead">Loading conversation index…</p>
          ) : auditSection.kind === 'error' ? (
            <p className="medibot-muted medibot-audit-lead">{auditSection.message}</p>
          ) : auditSection.kind === 'empty' ? (
            <p className="medibot-muted medibot-audit-lead">{auditSection.message}</p>
          ) : (
            <ul className="medibot-audit-list">
              {auditSection.rows.map((a, i) => (
                <li
                  key={a.conversationId || `${a.q}-${i}`}
                  className={`medibot-audit-card medibot-audit-card--${a.tone}`}
                >
                  <span className="medibot-audit-sev" aria-hidden>
                    {a.tone === 'bad' ? '🔴' : '🟡'}
                  </span>
                  <div>
                    <p className="medibot-audit-q">{a.q}</p>
                    <p className="medibot-audit-when">{a.when}</p>
                    <p className="medibot-muted medibot-audit-resp">{a.resp}</p>
                    <div className="medibot-vq-actions medibot-vq-actions--wrap">
                      {a.actions.map((x) => (
                        <button
                          key={x}
                          type="button"
                          className="medibot-chip-btn"
                          onClick={() => {
                            if (a.conversationId && typeof onOpenChatbotAuditConversation === 'function') {
                              onOpenChatbotAuditConversation(a.conversationId)
                            } else {
                              nav('chatbot-audit')
                            }
                          }}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
