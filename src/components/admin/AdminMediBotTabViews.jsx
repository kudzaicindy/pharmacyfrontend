import { useMemo, useState, useCallback, useEffect } from 'react'
import {
  MapPin,
  AlertTriangle,
  Users,
  Inbox,
  Building2,
  Wifi,
  CheckCircle,
  Minus,
  Zap,
  Bot,
  SlidersHorizontal
} from 'lucide-react'
import { getPharmacyRegistryStatus, normalizeVerificationQueue } from '../../utils/pharmacyRegistryStatus'
import {
  displayLabelForAnalyticsGeoRegionKey,
  haystackForZwCityBucket
} from '../../utils/zwLocationBuckets'
import {
  cityRowsFromSearchVolumeTopRegions,
  topMedicineBarRowsFromSearchVolume
} from '../../utils/adminSearchVolumeUi'

const CITY_BUCKETS = [
  { key: 'harare', label: 'Harare', needles: ['harare', 'chitungwiza', 'epworth'] },
  { key: 'bulawayo', label: 'Bulawayo', needles: ['bulawayo', 'hwange', 'victoria falls', 'matabel'] },
  { key: 'mutare', label: 'Mutare', needles: ['mutare', 'rusape', 'nyanga', 'chipinge'] },
  { key: 'gweru', label: 'Gweru', needles: ['gweru', 'kwekwe', 'kadoma', 'gokwe'] },
  { key: 'masvingo', label: 'Masvingo', needles: ['masvingo', 'chiredzi', 'zaka'] },
  { key: 'other', label: 'Other / rural', needles: [] }
]

const HEAT_ICONS = {
  harare: '🏙️',
  bulawayo: '🏙️',
  mutare: '🏘️',
  gweru: '🌾',
  masvingo: '🌾',
  other: '🌿'
}

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

function formatTrendLabel(date, mode) {
  if (mode === 'month') return date.toLocaleDateString(undefined, { month: 'short' })
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

function buildRequestTrendRows(requests, mode = 'day', points = 12) {
  const unit = mode === 'month' ? 'month' : 'day'
  const now = new Date()
  const slots = []
  for (let i = points - 1; i >= 0; i -= 1) {
    const d = new Date(now)
    if (unit === 'month') {
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
    } else {
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
    }
    slots.push(d)
  }
  const rows = slots.map((start, idx) => {
    const end = idx + 1 < slots.length ? slots[idx + 1] : new Date(now.getTime() + 86400000)
    return {
      key: `${unit}-${start.toISOString()}`,
      label: formatTrendLabel(start, unit),
      startMs: start.getTime(),
      endMs: end.getTime(),
      count: 0
    }
  })
  for (const r of requests || []) {
    const raw = r.created_at || r.submitted_at
    if (!raw) continue
    const t = new Date(raw).getTime()
    if (!Number.isFinite(t)) continue
    const idx = rows.findIndex((x) => t >= x.startMs && t < x.endMs)
    if (idx >= 0) rows[idx].count += 1
  }
  const max = Math.max(...rows.map((r) => r.count), 1)
  return rows.map((r) => ({ ...r, widthPct: Math.max(6, Math.round((r.count / max) * 100)) }))
}

function slaTierFromSeconds(seconds, isRural) {
  const n = Number(seconds)
  if (!Number.isFinite(n)) return 'mid'
  const limit = isRural ? 5 : 2
  if (n <= limit * 0.9) return 'ok'
  if (n <= limit * 1.15) return 'mid'
  return 'bad'
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
      emoji: r.emoji ?? HEAT_ICONS[key] ?? '📍'
    }
  })
}

function normalizeApiSlaRows(layer1) {
  const rows = layer1?.sla_by_region
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows.map((r, i) => {
    const label = String(r.label ?? r.region ?? r.city ?? '—')
    const sufRaw = r.suffix ?? r.urban_rural_label
    let suffix = ''
    if (sufRaw != null && String(sufRaw).trim() !== '') {
      const t = String(sufRaw).trim()
      suffix = t.startsWith('(') ? ` ${t}` : ` (${t})`
    }
    const sec = Number(r.seconds ?? r.avg_seconds ?? r.latency_seconds ?? r.avg_response_seconds)
    const seconds = Number.isFinite(sec) ? sec : 0
    const isRural = suffix.toLowerCase().includes('rural') || Boolean(r.is_rural)
    const tier = String(r.tier ?? slaTierFromSeconds(seconds, isRural))
    return {
      key: String(r.key ?? label ?? i),
      label,
      suffix,
      seconds,
      tier: tier === 'ok' || tier === 'mid' || tier === 'bad' ? tier : slaTierFromSeconds(seconds, isRural)
    }
  })
}

function SlaTierIcon({ tier }) {
  if (tier === 'ok') return <CheckCircle className="medibot-sla-ic ok" size={18} aria-hidden />
  if (tier === 'mid') return <Minus className="medibot-sla-ic mid" size={18} aria-hidden />
  return <AlertTriangle className="medibot-sla-ic bad" size={18} aria-hidden />
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Layer 1 — single tab: vital signs, geographic demand, and latency.
 * Uses `mediBot.layer1_system_health` when present; otherwise loaded requests + overview.
 */
export function AdminLayer1OperationsView({
  mediBot = null,
  overview,
  usersApproxCount = 0,
  pharmacyRegistryCount = 0,
  registryMetrics,
  requestStats,
  allRequests = [],
  searchVolumeSnapshot = null
}) {
  const l1 = mediBot?.layer1_system_health
  const todayStart = startOfToday()
  const requestsToday = (allRequests || []).filter((r) => {
    const raw = r.created_at || r.submitted_at
    if (!raw) return false
    const t = new Date(raw).getTime()
    return Number.isFinite(t) && t >= todayStart.getTime()
  }).length
  const lastHour = countRequestsLastHour(allRequests)

  const activeUsers =
    l1?.active_users != null && Number.isFinite(Number(l1.active_users))
      ? Number(l1.active_users).toLocaleString()
      : [overview?.active_users, overview?.daily_active_users, usersApproxCount].find(
          (v) => typeof v === 'number' && v > 0
        )?.toLocaleString() ?? '—'

  const requestsTodayVal =
    l1?.requests_today != null && Number.isFinite(Number(l1.requests_today))
      ? Number(l1.requests_today)
      : requestsToday
  const lastHourVal =
    l1?.requests_last_hour != null && Number.isFinite(Number(l1.requests_last_hour))
      ? Number(l1.requests_last_hour)
      : lastHour

  const avgSec =
    l1?.avg_response_time_ms != null
      ? Number(l1.avg_response_time_ms) / 1000
      : l1?.avg_response_seconds != null
        ? Number(l1.avg_response_seconds)
        : overview?.avg_response_time_ms != null
          ? Number(overview.avg_response_time_ms) / 1000
          : overview?.avg_response_time != null
            ? Number(overview.avg_response_time)
            : NaN
  const avgResponse = Number.isFinite(avgSec) ? `${avgSec.toFixed(1)}s` : '—'

  const uptime =
    l1?.uptime_pct_this_month != null
      ? `${Number(l1.uptime_pct_this_month).toFixed(1)}%`
      : l1?.uptime_percent != null
        ? `${Number(l1.uptime_percent).toFixed(1)}%`
        : overview?.uptime_pct_this_month != null
          ? `${Number(overview.uptime_pct_this_month).toFixed(1)}%`
          : overview?.uptime_percent != null
            ? `${Number(overview.uptime_percent).toFixed(1)}%`
            : '—'

  const pendingPharmacies = registryMetrics?.pending ?? 0
  const pc = l1?.pharmacy_counts
  const pharmCount =
    (pc && Number.isFinite(Number(pc.registered ?? pc.total)) ? Number(pc.registered ?? pc.total) : null) ??
    pharmacyRegistryCount

  const apiCity = useMemo(() => normalizeApiCityRows(l1), [l1])
  const analyticsCityRows = useMemo(
    () => cityRowsFromSearchVolumeTopRegions(searchVolumeSnapshot?.top_regions),
    [searchVolumeSnapshot?.top_regions]
  )
  const cityRows = analyticsCityRows ?? apiCity ?? countRequestsByCity(allRequests)
  const maxCity = Math.max(...cityRows.map((c) => c.count), 1)
  const totalReq = cityRows.reduce((s, c) => s + c.count, 0)

  const topMedicineBars = useMemo(
    () => topMedicineBarRowsFromSearchVolume(searchVolumeSnapshot?.top_medicines, { maxItems: 10 }),
    [searchVolumeSnapshot?.top_medicines]
  )

  const apiSla = useMemo(() => normalizeApiSlaRows(l1), [l1])
  const slaRows = useMemo(() => {
    if (apiSla) return apiSla
    return countRequestsByCity(allRequests)
      .filter((c) => c.key !== 'other')
      .map((c) => {
        const heavy = c.count > maxCity * 0.35
        const sec = heavy ? 2.2 + c.pct * 0.08 : 1.2 + c.pct * 0.05
        const isRural = c.key === 'other' || c.key === 'gweru' || c.key === 'masvingo'
        return {
          key: c.key,
          label: c.label,
          suffix: isRural ? ' (Rural)' : ' (Urban)',
          seconds: sec,
          tier: slaTierFromSeconds(sec, isRural)
        }
      })
  }, [apiSla, allRequests, maxCity])

  const trendByDay = useMemo(() => buildRequestTrendRows(allRequests, 'day', 14), [allRequests])

  return (
    <div className="medibot-tab-page">
      <div className="medibot-tab-toolbar" style={{ marginBottom: 12 }}>
        <p className="medibot-muted" style={{ margin: 0, fontSize: 12 }}>
          Layer 1 — operational health, geography, and latency in one place.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className="btn-light" onClick={() => scrollToId('layer1-kpis')}>
            KPIs
          </button>
          <button type="button" className="btn-light" onClick={() => scrollToId('layer1-geo')}>
            Geography
          </button>
          <button type="button" className="btn-light" onClick={() => scrollToId('layer1-sla')}>
            Latency
          </button>
        </div>
      </div>

      <section id="layer1-kpis" className="admin-panel" style={{ marginBottom: 12 }}>
        <div className="admin-panel-head">
          <h2>Vital signs</h2>
        </div>
        <div className="medibot-kpi-row medibot-kpi-row--solo medibot-kpi-row--strip medibot-kpi-row--strip-5">
          <div className="medibot-kpi medibot-kpi--tile medibot-kpi--side">
            <span className="medibot-kpi-icon-wrap" aria-hidden>
              <Users size={14} strokeWidth={2} />
            </span>
            <div className="medibot-kpi-body">
              <p className="medibot-kpi-label">Active users</p>
              <p className="medibot-kpi-value">{activeUsers}</p>
            </div>
          </div>
          <div className="medibot-kpi medibot-kpi--tile medibot-kpi--side">
            <span className="medibot-kpi-icon-wrap" aria-hidden>
              <Inbox size={14} strokeWidth={2} />
            </span>
            <div className="medibot-kpi-body">
              <p className="medibot-kpi-label">Requests today</p>
              <p className="medibot-kpi-value">{requestsTodayVal.toLocaleString()}</p>
              <p className="medibot-kpi-foot">Last hour: {lastHourVal.toLocaleString()}</p>
            </div>
          </div>
          <div className="medibot-kpi medibot-kpi--tile medibot-kpi--side">
            <span className="medibot-kpi-icon-wrap" aria-hidden>
              <Zap size={14} strokeWidth={2} />
            </span>
            <div className="medibot-kpi-body">
              <p className="medibot-kpi-label">Avg response</p>
              <p className="medibot-kpi-value">{avgResponse}</p>
              <p className="medibot-kpi-foot">Platform-wide average response window</p>
            </div>
          </div>
          <div className="medibot-kpi medibot-kpi--tile medibot-kpi--side">
            <span className="medibot-kpi-icon-wrap" aria-hidden>
              <Building2 size={14} strokeWidth={2} />
            </span>
            <div className="medibot-kpi-body">
              <p className="medibot-kpi-label">Pharmacies (reg.)</p>
              <p className="medibot-kpi-value">{pharmCount}</p>
              {pendingPharmacies > 0 ? <p className="medibot-kpi-foot">{pendingPharmacies} pending verification</p> : null}
            </div>
          </div>
          <div className="medibot-kpi medibot-kpi--tile medibot-kpi--side">
            <span className="medibot-kpi-icon-wrap" aria-hidden>
              <Wifi size={14} strokeWidth={2} />
            </span>
            <div className="medibot-kpi-body">
              <p className="medibot-kpi-label">Uptime (mo)</p>
              <p className="medibot-kpi-value">{uptime}</p>
            </div>
          </div>
        </div>
        <p className="medibot-muted medibot-tab-lead" style={{ marginBottom: 0 }}>
          Open requests in dataset: {requestStats?.pending ?? '—'} pending · {requestStats?.total ?? '—'} total loaded.
        </p>
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800 }}>Requests trend (daily)</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {trendByDay.map((row) => (
              <li key={row.key} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 8, alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 11 }}>{row.label}</span>
                <div style={{ height: 8, background: 'rgba(148,163,184,0.2)', borderRadius: 999 }}>
                  <div style={{ width: `${row.widthPct}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#00d4b8,#38bdf8)' }} />
                </div>
                <span className="mono" style={{ fontSize: 11 }}>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="layer1-geo" className="admin-panel" style={{ marginBottom: 12 }}>
        <div className="admin-panel-head">
          <h2>Geographic demand</h2>
        </div>
        <p className="medibot-muted medibot-tab-lead">
          {analyticsCityRows
            ? `Volumes from search analytics (${searchVolumeSnapshot?.days ?? 30}-day window), same source as admin “Search volume”.`
            : apiCity
              ? 'Volumes from MediBot overview (city / region buckets).'
              : 'Keyword matching on request addresses until the API sends geo_region or coordinates.'}
        </p>
        <div className="medibot-heatmap-grid">
          {cityRows.map((c) => (
            <div key={c.key} className={`medibot-heatmap-cell medibot-heatmap-cell--${c.key}`}>
              <div className="medibot-heatmap-intensity" style={{ opacity: 0.25 + (c.count / maxCity) * 0.75 }} />
              <MapPin size={20} className="medibot-heatmap-pin" aria-hidden />
              <h3>
                <span className="medibot-city-emoji" style={{ marginRight: 6 }} aria-hidden>
                  {c.emoji ?? HEAT_ICONS[c.key] ?? '📍'}
                </span>
                {c.label}
              </h3>
              <p className="medibot-heatmap-count">{c.count.toLocaleString()}</p>
              <p className="medibot-muted">
                {c.pct}% of {totalReq.toLocaleString()} total
              </p>
            </div>
          ))}
        </div>
        {topMedicineBars && topMedicineBars.length > 0 ? (
          <div className="admin-top-medicines medibot-layer1-top-meds" style={{ marginTop: 18 }}>
            <h3 className="admin-top-medicines-title">Top searched medicines</h3>
            <p className="medibot-muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
              Same analytics window as city volumes above.
            </p>
            <ul className="admin-top-medicines-list">
              {topMedicineBars.map((row) => (
                <li key={row.name} className="admin-top-medicine-row">
                  <span className="admin-top-medicine-name" title={row.name}>
                    {row.name}
                  </span>
                  <div className="admin-top-medicine-bar-track" aria-hidden>
                    <div className="admin-top-medicine-bar-fill" style={{ width: `${row.widthPct}%` }} />
                  </div>
                  <span className="admin-top-medicine-count">{row.c}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section id="layer1-sla" className="admin-panel">
        <div className="admin-panel-head">
          <h2>Latency monitoring</h2>
        </div>
        <p className="medibot-muted medibot-tab-lead">
          {apiSla
            ? 'Regional latency from MediBot overview.'
            : 'Heuristic latency from request mix until the API exposes region_latency_p95_ms (or similar).'}
        </p>
        <ul className="medibot-sla-list medibot-sla-list--wide">
          {slaRows.map((row) => (
            <li key={row.key} className="medibot-sla-row">
              <span className="medibot-sla-label">
                {row.label}
                {row.suffix ? <span className="medibot-sla-suffix">{row.suffix}</span> : null}
              </span>
              <div className="medibot-sla-track">
                <div
                  className={`medibot-sla-fill ${row.tier === 'ok' ? 'medibot-sla-fill--ok' : row.tier === 'mid' ? 'medibot-sla-fill--mid' : 'medibot-sla-fill--slow'}`}
                  style={{ width: `${Math.min(100, (row.seconds / 6) * 100)}%` }}
                />
              </div>
              <span className="medibot-sla-time">{row.seconds.toFixed(1)}s</span>
              <SlaTierIcon tier={row.tier} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function AdminVerificationQueueView({
  mediBot = null,
  /** Normalized rows from `GET .../admin/dashboard/data/` (`verification_queue` + aliases). */
  dashboardVerificationQueue = null,
  perPharmacyRows = [],
  onOpenPharmacies,
  onUpdatePharmacy,
  onRefreshDashboard,
  formatDate = (raw) => (raw ? new Date(raw).toLocaleDateString() : '—')
}) {
  const [busyId, setBusyId] = useState(null)
  const l2 = mediBot?.layer2_pharmacy_governance

  const fromDashboard = useMemo(() => {
    const q = normalizeVerificationQueue(dashboardVerificationQueue)
    if (!q || !q.length) return null
    return q.map((p, i) => {
      const id = String(p.pharmacy_id ?? p.id ?? p.__id ?? `dash-${i}`)
      return {
        __id: id,
        __name: String(p.name ?? p.pharmacy_name ?? p.__name ?? '—'),
        license_number: p.license_number ?? p.licence_number ?? p.lic,
        pharmacy_id: p.pharmacy_id ?? p.id ?? id,
        created_at: p.submitted_at ?? p.created_at,
        address: p.address ?? p.meta ?? p.location,
        source: 'dashboard'
      }
    })
  }, [dashboardVerificationQueue])

  const fromApi = useMemo(() => {
    const q = normalizeVerificationQueue(l2?.verification_queue)
    if (!q) return null
    return q.map((p, i) => {
      const id = String(p.pharmacy_id ?? p.id ?? p.__id ?? `api-${i}`)
      return {
        __id: id,
        __name: String(p.name ?? p.pharmacy_name ?? p.__name ?? '—'),
        license_number: p.license_number ?? p.licence_number ?? p.lic,
        pharmacy_id: p.pharmacy_id ?? p.id ?? id,
        created_at: p.submitted_at ?? p.created_at,
        address: p.address ?? p.meta ?? p.location,
        source: 'medi-bot'
      }
    })
  }, [l2])

  const fromDataset = useMemo(
    () =>
      perPharmacyRows
        .filter((p) => getPharmacyRegistryStatus(p) === 'pending')
        .map((p) => ({
          __id: p.__id,
          __name: p.__name,
          license_number: p.license_number ?? p.pharmacy_id,
          pharmacy_id: p.pharmacy_id ?? p.id ?? p.__id,
          created_at: p.created_at,
          address: p.address,
          source: 'dataset'
        })),
    [perPharmacyRows]
  )

  const pending = useMemo(() => {
    const map = new Map()
    const put = (row) => {
      const k = String(row.pharmacy_id ?? row.__id)
      if (k && !map.has(k)) map.set(k, row)
    }
    for (const row of fromDashboard ?? []) put(row)
    for (const row of fromApi ?? []) put(row)
    for (const row of fromDataset) put(row)
    return [...map.values()]
  }, [fromDashboard, fromApi, fromDataset])

  const run = useCallback(
    async (pharmacyId, patch) => {
      if (!pharmacyId || !onUpdatePharmacy) return
      setBusyId(pharmacyId)
      try {
        await onUpdatePharmacy(pharmacyId, patch)
        await onRefreshDashboard?.()
      } finally {
        setBusyId(null)
      }
    },
    [onUpdatePharmacy, onRefreshDashboard]
  )

  const queueVariant = (p, idx, total) => {
    const a = String(p.address || '').toLowerCase()
    if (/hwange|chipinge|gokwe|binga|nyanga|kariba|beitbridge|rural|matabeleland/.test(a)) return 'rural'
    if (total >= 3 && idx === total - 1) return 'flagged'
    return 'standard'
  }

  return (
    <div className="medibot-tab-page medibot-mock-page">
      <div className="medibot-mock-toolbar">
        <span className="medibot-mock-chip medibot-mock-chip--warn">
          ⏳ {pending.length} pending
        </span>
        {onOpenPharmacies ? (
          <button type="button" className="btn-light" onClick={onOpenPharmacies}>
            Full registry
          </button>
        ) : null}
      </div>
      <p className="medibot-muted medibot-tab-lead">Review and process pending pharmacy verification submissions.</p>

      {pending.length === 0 ? (
        <div className="medibot-empty-queue">
          <p className="medibot-muted">No pharmacies pending verification.</p>
        </div>
      ) : (
        <div className="medibot-mock-split">
          <div>
            {pending.map((p, idx) => {
              const id = p.pharmacy_id || p.__id
              const busy = busyId === id
              const v = queueVariant(p, idx, pending.length)
              const cardClass =
                v === 'rural'
                  ? 'medibot-mock-queue-card medibot-mock-queue-card--rural'
                  : v === 'flagged'
                    ? 'medibot-mock-queue-card medibot-mock-queue-card--flagged'
                    : 'medibot-mock-queue-card'
              const pri =
                v === 'rural' ? (
                  <span className="medibot-mock-pri medibot-mock-pri-rural">⚡ Rural — Priority</span>
                ) : v === 'flagged' ? (
                  <span className="medibot-mock-pri medibot-mock-pri-rural" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                    ⚠ Flagged
                  </span>
                ) : (
                  <span className="medibot-mock-pri medibot-mock-pri-std">Standard</span>
                )
              return (
                <article key={p.__id} className={cardClass}>
                  <div className="medibot-mock-queue-head">
                    <div>
                      <div className="medibot-mock-queue-name">{p.__name}</div>
                      <div className="medibot-mock-queue-lic">
                        Lic: {p.license_number || id || '—'} · Submitted {formatDate(p.created_at)}
                        {p.source ? ` · ${p.source}` : ''}
                      </div>
                    </div>
                    {pri}
                  </div>
                  <div className="medibot-mock-meta-grid">
                    <div className="medibot-mock-meta">
                      <div className="medibot-mock-meta-k">Location</div>
                      <div className="medibot-mock-meta-v">{p.address || '—'}</div>
                    </div>
                    <div className="medibot-mock-meta">
                      <div className="medibot-mock-meta-k">Registry ID</div>
                      <div className="medibot-mock-meta-v mono">{String(id)}</div>
                    </div>
                  </div>
                  <div className="medibot-mock-q-actions">
                    <button
                      type="button"
                      className="medibot-mock-qa medibot-mock-qa-approve"
                      disabled={busy || !onUpdatePharmacy}
                      onClick={() => run(id, { verification_status: 'verified', is_active: true })}
                    >
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      className="medibot-mock-qa medibot-mock-qa-suspend"
                      disabled={busy || !onUpdatePharmacy}
                      onClick={() => run(id, { verification_status: 'suspended', is_active: false })}
                    >
                      ✗ Suspend
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
          <aside>
            <div className="medibot-mock-panel">
              <div className="medibot-mock-panel-title">📋 Checklist — approval criteria</div>
              <div className="medibot-mock-checklist">
                <div className="medibot-mock-checklist-row">
                  <span style={{ color: '#34d399' }}>✓</span>
                  <span>Valid professional registration (NPA / council)</span>
                </div>
                <div className="medibot-mock-checklist-row">
                  <span style={{ color: '#34d399' }}>✓</span>
                  <span>Business / operating licence</span>
                </div>
                <div className="medibot-mock-checklist-row">
                  <span style={{ color: '#34d399' }}>✓</span>
                  <span>Premises verification where required</span>
                </div>
                <div className="medibot-mock-checklist-row">
                  <span style={{ color: '#fbbf24' }}>~</span>
                  <span className="medibot-muted">Owner ID and supporting docs (per your policy)</span>
                </div>
                <div className="medibot-mock-checklist-row">
                  <span style={{ color: '#00d4b8' }}>⚡</span>
                  <span className="medibot-muted">Rural branches may qualify for expedited review</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
