import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPharmacyRegistryStatus } from '../../utils/pharmacyRegistryStatus'
import {
  extractLayer4ImpactForUi,
  extractMcdaWeightsFromLayer3,
  extractMcdaWeightsFromLayer3ProfileRow,
  getLayer3ProfilesArray,
  mapLayer3ActiveProfileToUiPresetKey,
  mapUiPresetToLayer3ActiveProfile,
  mcdaNormalizedWeightsToStandardWeightsPayload
} from '../../utils/adminAlgorithmStewardship'
import { getAdminChatbotPolicy, patchAdminChatbotPolicy, patchAdminRankingConfig } from '../../utils/api'
import {
  leaderboardPharmacyIdsMatch,
  parseLeaderboardRowsFromSummary,
  rankingScoreLikePharmacyDashboardRow
} from '../../utils/pharmacyLeaderboard'
import './AdminCommandCenter.css'

const LS_WEIGHTS = 'admin_mcda_weights_v1'
const LS_PROFILE = 'admin_mcda_profile_v1'
const LS_UPTIME_SESSION = 'admin_cc_session_start'

const ZW_BUCKETS = [
  { key: 'harare', label: 'Harare & surrounds', needles: ['harare', 'chitungwiza', 'epworth'] },
  { key: 'bulawayo', label: 'Bulawayo & Matabeleland', needles: ['bulawayo', 'hwange', 'victoria falls', 'mat south'] },
  { key: 'mutare', label: 'Mutare & Eastern', needles: ['mutare', 'rusape', 'nyanga', 'chipinge'] },
  { key: 'gweru', label: 'Gweru & Midlands', needles: ['gweru', 'kwekwe', 'kadoma', 'gokwe'] },
  { key: 'masvingo', label: 'Masvingo', needles: ['masvingo', 'chiredzi', 'zaka'] },
  { key: 'other', label: 'Other / rural / unspecified', needles: [] }
]

/** Aligned with MediBot `layer3.context_profiles` / `urban_default` snapshot (not legacy mock 30·35·20·15). */
const PROFILE_PRESETS = {
  default: { price: 35, distance: 25, rating: 25, stock: 15, label: 'Urban default' },
  rural: { price: 32, distance: 28, rating: 25, stock: 15, label: 'Rural equity (distance ↓)' },
  shortage: { price: 25, distance: 20, rating: 25, stock: 30, label: 'Shortage mode (stock ↑)' },
  affordability: { price: 40, distance: 30, rating: 15, stock: 15, label: 'Affordability (price ↑)' }
}

/** Demo pharmacies for simulated ranking preview (matches static admin mock). */
const RANK_PREVIEW_PHARMS = [
  { n: 'Newlands Chemist', p: '$3.20', d: '1.2km', r: '4.7', s: '92%' },
  { n: 'Avondale Pharmacy', p: '$3.10', d: '2.8km', r: '4.8', s: '89%' },
  { n: 'Borrowdale Chemist', p: '$3.50', d: '0.9km', r: '4.6', s: '85%' },
  { n: 'Mabelreign Chemist', p: '$3.00', d: '4.1km', r: '4.5', s: '87%' },
  { n: 'Mbare Pharmacy', p: '$2.90', d: '5.6km', r: '3.9', s: '70%' }
]

function rankPreviewScore(ph, w1, w2, w3, w4) {
  const pm = Math.min(1, Math.max(0, 1 - (parseFloat(ph.p.replace('$', '')) - 2.9) / (3.5 - 2.9)))
  const dm = Math.min(1, Math.max(0, 1 - (parseFloat(ph.d) - 0.9) / (5.6 - 0.9)))
  const rm = Math.min(1, Math.max(0, (parseFloat(ph.r) - 3.9) / (4.8 - 3.9)))
  const sm = Math.min(1, Math.max(0, (parseInt(ph.s, 10) - 70) / (92 - 70)))
  return Math.round((pm * w1 + dm * w2 + rm * w3 + sm * w4) * 100) / 100
}

const STEWARDSHIP_SLIDERS = [
  {
    key: 'price',
    icon: '💰',
    title: 'Price competitiveness',
    desc: 'How affordable the medicine is compared to the market average. Higher weight penalises overpriced pharmacies.',
    accent: '#00d4b8',
    max: 60
  },
  {
    key: 'distance',
    icon: '📍',
    title: 'Distance / travel time',
    desc: "Proximity of the pharmacy to the patient's current location. Key for urban patients. Deprioritised in Rural Equity mode.",
    accent: '#60a5fa',
    max: 60
  },
  {
    key: 'rating',
    icon: '⭐',
    title: 'Patient rating',
    desc: 'Cumulative satisfaction score from verified patients who completed a transaction at this pharmacy.',
    accent: '#f59e0b',
    max: 40
  },
  {
    key: 'stock',
    icon: '📦',
    title: 'Stock reliability',
    desc: "Accuracy of pharmacy's listed inventory vs. what is actually in stock. Critical in shortage scenarios.",
    accent: '#c084fc',
    max: 40
  }
]

const AI_FLAG_NEEDLES = [
  'not sure',
  'not certain',
  'consult a doctor',
  'consult your doctor',
  'see a doctor',
  'not a doctor',
  'cannot diagnose',
  "can't diagnose",
  'emergency',
  'seek immediate',
  'disclaimer',
  'not medical advice',
  'verify with',
  'professional advice'
]

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const p = JSON.parse(raw)
    return p && typeof p === 'object' ? { ...fallback, ...p } : fallback
  } catch {
    return fallback
  }
}

function bucketPatientArea(text) {
  const t = String(text || '').toLowerCase()
  if (!t.trim()) return 'other'
  for (const b of ZW_BUCKETS) {
    if (b.key === 'other') continue
    if (b.needles.some((n) => t.includes(n))) return b.key
  }
  return 'other'
}

function textMayNeedReview(s) {
  const t = String(s || '').toLowerCase()
  return AI_FLAG_NEEDLES.some((n) => t.includes(n))
}

function normalizeWeights(w) {
  const price = Math.max(0, Number(w.price) || 0)
  const distance = Math.max(0, Number(w.distance) || 0)
  const rating = Math.max(0, Number(w.rating) || 0)
  const stock = Math.max(0, Number(w.stock) || 0)
  const sum = price + distance + rating + stock || 1
  const p = Math.round((price / sum) * 100)
  const d = Math.round((distance / sum) * 100)
  const r = Math.round((rating / sum) * 100)
  const s = Math.max(0, 100 - p - d - r)
  return { price: p, distance: d, rating: r, stock: s }
}

export default function AdminCommandCenter({
  /** `stewardship` = MCDA weights, ranking presets, and patient disclaimer only (single admin nav tab). */
  surface = 'full',
  overview,
  /** MediBot overview (`GET …/admin/overview/medi-bot/`) — layer3 weights, layer4 impact, layer5 disclaimer when present. */
  mediBot = null,
  allRequests = [],
  allReservations = [],
  pharmacies = [],
  perPharmacyRows = [],
  /** Live `GET …/pharmacist/<id>/ranking-summary/` payload — leaderboard drives accurate preview. */
  adminPortalRankingSummary = null,
  adminPortalRankingSummaryLoading = false,
  chatbotLogs = [],
  chatbotLogsLoading = false,
  onUpdatePharmacy,
  onRefreshDashboard,
  onOpenChatbotTab,
  /** Sidebar jump when `surface="stewardship"` (algorithm tab no longer duplicates audit UI). */
  onOpenAuditTab,
  formatDate = (x) => String(x ?? '—')
}) {
  const weightsDirtyRef = useRef(false)
  const [weights, setWeights] = useState(() =>
    loadJson(LS_WEIGHTS, { price: PROFILE_PRESETS.default.price, distance: PROFILE_PRESETS.default.distance, rating: PROFILE_PRESETS.default.rating, stock: PROFILE_PRESETS.default.stock })
  )
  const [activeProfile, setActiveProfile] = useState(() => localStorage.getItem(LS_PROFILE) || 'default')
  /** API id for PATCH `active_ranking_profile` (e.g. `urban_default`) — drives live ranking profile. */
  const [selectedRankingProfileApiId, setSelectedRankingProfileApiId] = useState('')
  const [disclaimer, setDisclaimer] = useState(
    () =>
      'This assistant does not replace a doctor or pharmacist. Always follow professional medical advice and read medicine labels.'
  )
  const [govBusy, setGovBusy] = useState(null)
  const [algoSavedAt, setAlgoSavedAt] = useState(null)
  const [disclaimerSaved, setDisclaimerSaved] = useState(false)
  const [policyNote, setPolicyNote] = useState('')
  const [algoError, setAlgoError] = useState('')
  const [policyError, setPolicyError] = useState('')
  const [profileSaveMessage, setProfileSaveMessage] = useState('')
  const policyDisclaimerLoadedRef = useRef(false)
  const profileSaveMessageTimeoutRef = useRef(null)

  const flashProfileSaveMessage = useCallback((msg) => {
    setProfileSaveMessage(msg)
    if (profileSaveMessageTimeoutRef.current) {
      clearTimeout(profileSaveMessageTimeoutRef.current)
    }
    profileSaveMessageTimeoutRef.current = setTimeout(() => {
      setProfileSaveMessage('')
      profileSaveMessageTimeoutRef.current = null
    }, 8000)
  }, [])

  useEffect(() => {
    return () => {
      if (profileSaveMessageTimeoutRef.current) {
        clearTimeout(profileSaveMessageTimeoutRef.current)
      }
    }
  }, [])

  const l3 = mediBot?.layer3_algorithm
  const l4 = mediBot?.layer4_impact

  const rankingProfileSelectOptions = useMemo(() => {
    let opts
    const raw = getLayer3ProfilesArray(l3)
    if (raw) {
      opts = [...raw]
        .map((p) => {
          if (!p || typeof p !== 'object') return null
          const id = String(p.id ?? p.key ?? p.slug ?? '').trim()
          const label = String(p.label ?? p.id ?? id ?? 'Profile').trim()
          return id ? { id, label } : null
        })
        .filter(Boolean)
    } else {
      opts = [
        { id: 'urban_default', label: 'Urban default' },
        { id: 'rural_equity', label: 'Rural equity' },
        { id: 'shortage_mode', label: 'Shortage mode' },
        { id: 'affordability', label: 'Affordability' }
      ]
    }
    const active = String(l3?.active_ranking_profile ?? l3?.active_profile ?? '').trim()
    if (active && !opts.some((o) => o.id.toLowerCase() === active.toLowerCase())) {
      opts = [...opts, { id: active, label: active }]
    }
    return opts
  }, [l3, l3?.context_profiles, l3?.profiles, l3?.active_ranking_profile, l3?.active_profile])

  useEffect(() => {
    if (weightsDirtyRef.current) return
    const w = extractMcdaWeightsFromLayer3(l3)
    const uiPreset = mapLayer3ActiveProfileToUiPresetKey(l3?.active_ranking_profile ?? l3?.active_profile)
    if (w) {
      setWeights(w)
      try {
        localStorage.setItem(LS_WEIGHTS, JSON.stringify(w))
      } catch {
        /* ignore */
      }
    }
    if (uiPreset) {
      setActiveProfile(uiPreset)
      try {
        localStorage.setItem(LS_PROFILE, uiPreset)
      } catch {
        /* ignore */
      }
    }
    const apiId = String(l3?.active_ranking_profile ?? l3?.active_profile ?? '').trim()
    if (apiId) setSelectedRankingProfileApiId(apiId)
  }, [l3, mediBot?.generated_at])

  useEffect(() => {
    let cancelled = false
    getAdminChatbotPolicy()
      .then((data) => {
        if (cancelled || !data || typeof data !== 'object') return
        const t =
          data.patient_disclaimer_text ??
          data.patient_disclaimer ??
          data.disclaimer_text ??
          data.disclaimer
        if (typeof t === 'string' && t.trim()) {
          setDisclaimer(t.trim())
          policyDisclaimerLoadedRef.current = true
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (policyDisclaimerLoadedRef.current) return
    const t =
      mediBot?.layer5_ai_safety?.patient_disclaimer_text ??
      mediBot?.layer5_ai_safety?.patient_disclaimer ??
      mediBot?.layer5_ai_safety?.disclaimer_draft
    if (typeof t === 'string' && t.trim()) {
      setDisclaimer(t.trim())
      policyDisclaimerLoadedRef.current = true
    }
  }, [mediBot])

  useEffect(() => {
    if (!sessionStorage.getItem(LS_UPTIME_SESSION)) {
      sessionStorage.setItem(LS_UPTIME_SESSION, String(Date.now()))
    }
  }, [])

  const sessionStart = Number(sessionStorage.getItem(LS_UPTIME_SESSION)) || Date.now()
  const uptimeMinutes = Math.max(0, Math.floor((Date.now() - sessionStart) / 60000))

  const requestsLastHour = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000
    return allRequests.filter((r) => {
      const raw = r.created_at || r.submitted_at
      if (!raw) return false
      const t = new Date(raw).getTime()
      return Number.isFinite(t) && t >= cutoff
    }).length
  }, [allRequests])

  const geoBuckets = useMemo(() => {
    const counts = Object.fromEntries(ZW_BUCKETS.map((b) => [b.key, 0]))
    allRequests.forEach((r) => {
      const area = r.patient_area || r.location_suburb || r.location_address || ''
      const k = bucketPatientArea(area)
      counts[k] = (counts[k] || 0) + 1
    })
    const max = Math.max(...Object.values(counts), 1)
    return ZW_BUCKETS.map((b) => ({
      ...b,
      count: counts[b.key] || 0,
      pct: Math.round(((counts[b.key] || 0) / max) * 100)
    }))
  }, [allRequests])

  const slaHint = useMemo(() => {
    const total = allRequests.length
    if (total < 1) return { tone: 'ok', text: 'Load more dashboard data to approximate queue pressure.' }
    const open = allRequests.filter((r) => {
      const s = String(r.status || '').toLowerCase()
      return ['created', 'validated', 'broadcasting', 'awaiting_responses', 'partial', 'ranking'].includes(s)
    }).length
    const ratio = open / total
    if (ratio > 0.5) return { tone: 'bad', text: 'High share of requests still in pipeline — check pharmacy response capacity.' }
    if (ratio > 0.25) return { tone: 'warn', text: 'Elevated open requests vs completed — monitor response times.' }
    return { tone: 'ok', text: 'Pipeline mix looks healthy on loaded sample.' }
  }, [allRequests])

  const verificationQueue = useMemo(
    () => pharmacies.filter((p) => getPharmacyRegistryStatus(p) === 'pending'),
    [pharmacies]
  )

  const flaggedChats = useMemo(() => {
    const rows = []
    for (const row of chatbotLogs) {
      const blob = `${row.last_message_preview || ''} ${row.title || ''} ${JSON.stringify(row)}`.toLowerCase()
      if (textMayNeedReview(blob)) {
        rows.push(row)
      }
    }
    return rows.slice(0, 40)
  }, [chatbotLogs])

  const applyProfile = (key) => {
    const presetRow = PROFILE_PRESETS[key]
    if (!presetRow) return
    weightsDirtyRef.current = true
    setActiveProfile(key)
    localStorage.setItem(LS_PROFILE, key)
    const apiFromUi = mapUiPresetToLayer3ActiveProfile(key)
    if (apiFromUi) setSelectedRankingProfileApiId(apiFromUi)
    setWeights({ price: presetRow.price, distance: presetRow.distance, rating: presetRow.rating, stock: presetRow.stock })
  }

  const handleRankingProfileSelectChange = useCallback(
    (apiId) => {
      setProfileSaveMessage('')
      const id = String(apiId ?? '').trim()
      setSelectedRankingProfileApiId(id)
      weightsDirtyRef.current = true
      const profiles = getLayer3ProfilesArray(l3)
      const row = profiles
        ? profiles.find((p) => {
            if (!p) return false
            const pid = String(p.id ?? p.key ?? p.slug ?? '')
              .trim()
              .toLowerCase()
            return pid === id.toLowerCase()
          })
        : null
      const w = row ? extractMcdaWeightsFromLayer3ProfileRow(row) : null
      if (w) setWeights(w)
      const ui = mapLayer3ActiveProfileToUiPresetKey(id)
      if (ui) {
        setActiveProfile(ui)
        try {
          localStorage.setItem(LS_PROFILE, ui)
        } catch {
          /* ignore */
        }
      }
    },
    [l3]
  )

  const saveWeights = async () => {
    const n = normalizeWeights(weights)
    setWeights(n)
    setAlgoError('')
    setPolicyNote('')
    try {
      localStorage.setItem(LS_WEIGHTS, JSON.stringify(n))
      const apiProfile =
        String(selectedRankingProfileApiId || '').trim() ||
        mapUiPresetToLayer3ActiveProfile(activeProfile) ||
        activeProfile
      await patchAdminRankingConfig({
        standard_weights: mcdaNormalizedWeightsToStandardWeightsPayload(n),
        active_ranking_profile: apiProfile
      })
      weightsDirtyRef.current = false
      setAlgoSavedAt(new Date().toISOString())
      setPolicyNote(`Weights saved on the server; active ranking profile: ${apiProfile}.`)
      flashProfileSaveMessage(`Ranking profile “${apiProfile}” is live — patient ranking and the pharmacy portal composite use this profile.`)
      await onRefreshDashboard?.()
    } catch (e) {
      setAlgoError(e?.message || 'Could not save to server — values kept in this browser only.')
    }
  }

  const saveDisclaimer = async () => {
    setPolicyError('')
    setPolicyNote('')
    try {
      await patchAdminChatbotPolicy({
        patient_disclaimer_text: disclaimer,
        patient_disclaimer: disclaimer
      })
      policyDisclaimerLoadedRef.current = true
      setDisclaimerSaved(true)
      setTimeout(() => setDisclaimerSaved(false), 2500)
      await onRefreshDashboard?.()
    } catch (e) {
      setPolicyError(e?.message || 'Could not save disclaimer to server — text kept in this browser.')
      setDisclaimerSaved(true)
      setTimeout(() => setDisclaimerSaved(false), 2500)
    }
  }

  const runGovernance = useCallback(
    async (pharmacyId, patch) => {
      if (!pharmacyId || !onUpdatePharmacy) return
      setGovBusy(pharmacyId)
      try {
        await onUpdatePharmacy(pharmacyId, patch)
        await onRefreshDashboard?.()
      } finally {
        setGovBusy(null)
      }
    },
    [onUpdatePharmacy, onRefreshDashboard]
  )

  const sessionsApprox = overview?.total_patients ?? overview?.total_sessions ?? '—'

  const rankedPreview = useMemo(() => {
    if (adminPortalRankingSummaryLoading && adminPortalRankingSummary == null) {
      return []
    }
    const lb = parseLeaderboardRowsFromSummary(adminPortalRankingSummary)
    if (lb && lb.length > 0) {
      return lb.slice(0, 5).map((row) => {
        const match = perPharmacyRows.find(
          (p) =>
            String(p.__id) === String(row.pharmacy_id) ||
            leaderboardPharmacyIdsMatch(row.pharmacy_id, String(p.__id), p.__name)
        )
        const pts = row.score != null && row.score !== '' && Number.isFinite(Number(row.score)) ? Number(row.score) : null
        const sc = pts != null ? Math.min(1, Math.max(0, pts / 100)) : null
        const meta = match
          ? `${match.ratingNum != null ? `★${Number(match.ratingNum).toFixed(1)}` : '—'} · resp ${match.responseRateNum != null ? `${Math.round(match.responseRateNum)}%` : '—'} · ${match.pendingRequests ?? 0} pending`
          : 'Live leaderboard row (no matching pharmacy row in this dashboard snapshot)'
        return {
          key: row.key,
          n: row.name,
          meta,
          sc,
          displayRank: row.rank,
          source: 'live'
        }
      })
    }

    if (Array.isArray(perPharmacyRows) && perPharmacyRows.length >= 1) {
      return [...perPharmacyRows]
        .map((p) => {
          const score100 = rankingScoreLikePharmacyDashboardRow(p)
          const sc = Math.min(1, Math.max(0, score100 / 100))
          const meta = `${p.ratingNum != null ? `★${Number(p.ratingNum).toFixed(1)}` : '—'} · resp ${p.responseRateNum != null ? `${Math.round(p.responseRateNum)}%` : '—'} · ${p.pendingRequests ?? 0} pending`
          return {
            key: `dash-${p.__id}`,
            n: p.__name,
            meta,
            sc,
            displayRank: null,
            source: 'composite'
          }
        })
        .sort((a, b) => {
          const da = a.sc ?? 0
          const db = b.sc ?? 0
          if (db !== da) return db - da
          return String(a.n).localeCompare(String(b.n))
        })
        .slice(0, 5)
        .map((row, i) => ({ ...row, displayRank: i + 1 }))
    }

    const wN = normalizeWeights(weights)
    const f = [wN.price, wN.distance, wN.rating, wN.stock].map((x) => Number(x) / 100)
    return [...RANK_PREVIEW_PHARMS]
      .map((p, i) => ({
        key: `demo-${i}`,
        n: p.n,
        meta: `${p.p} · ${p.d} · ★${p.r} · Stock ${p.s}`,
        sc: rankPreviewScore(p, ...f),
        displayRank: i + 1,
        source: 'demo'
      }))
      .sort((a, b) => b.sc - a.sc)
      .map((row, i) => ({ ...row, displayRank: i + 1 }))
  }, [
    adminPortalRankingSummary,
    adminPortalRankingSummaryLoading,
    perPharmacyRows,
    weights.price,
    weights.distance,
    weights.rating,
    weights.stock
  ])

  const weightTotal = weights.price + weights.distance + weights.rating + weights.stock

  const impactMetrics = useMemo(() => extractLayer4ImpactForUi(l4), [l4])

  const resetWeightsUi = () => {
    setProfileSaveMessage('')
    weightsDirtyRef.current = false
    const w = extractMcdaWeightsFromLayer3(l3)
    const uiPreset = mapLayer3ActiveProfileToUiPresetKey(l3?.active_ranking_profile ?? l3?.active_profile) || 'default'
    if (w) {
      setWeights(w)
      try {
        localStorage.setItem(LS_WEIGHTS, JSON.stringify(w))
      } catch {
        /* ignore */
      }
    } else {
      const p = PROFILE_PRESETS.default
      setWeights({ price: p.price, distance: p.distance, rating: p.rating, stock: p.stock })
      try {
        localStorage.setItem(LS_WEIGHTS, JSON.stringify({ price: p.price, distance: p.distance, rating: p.rating, stock: p.stock }))
      } catch {
        /* ignore */
      }
    }
    setActiveProfile(uiPreset)
    try {
      localStorage.setItem(LS_PROFILE, uiPreset)
    } catch {
      /* ignore */
    }
    const rid = String(l3?.active_ranking_profile ?? l3?.active_profile ?? '').trim()
    if (rid) setSelectedRankingProfileApiId(rid)
  }

  const saveRankingProfileToServer = async () => {
    setAlgoError('')
    setPolicyNote('')
    try {
      const apiProfile =
        String(selectedRankingProfileApiId || '').trim() ||
        mapUiPresetToLayer3ActiveProfile(activeProfile) ||
        activeProfile
      await patchAdminRankingConfig({
        active_ranking_profile: apiProfile
      })
      weightsDirtyRef.current = false
      setAlgoSavedAt(new Date().toISOString())
      flashProfileSaveMessage(
        `Ranking profile updated to “${apiProfile}”. Patient requests and the pharmacy portal now use this profile for MCDA ranking.`
      )
      await onRefreshDashboard?.()
    } catch (e) {
      setAlgoError(e?.message || 'Could not save ranking profile.')
    }
  }

  const preset = PROFILE_PRESETS[activeProfile] || PROFILE_PRESETS.default
  const weightsNormBanner = normalizeWeights(weights)
  const rankColors = ['#00d4b8', '#60a5fa', '#a78bfa', '#f59e0b', 'rgba(255,255,255,0.55)']
  const serverProfileLabel =
    typeof l3?.active_ranking_profile_label === 'string' && l3.active_ranking_profile_label.trim()
      ? l3.active_ranking_profile_label.trim()
      : typeof l3?.active_ranking_profile === 'string' && l3.active_ranking_profile.trim()
        ? l3.active_ranking_profile.trim()
        : null

  const algorithmStewardshipBody = (
    <>
      <section id="admin-cc-algorithm" className="admin-cc-stew-mock" aria-labelledby="cc-layer-3">
        <p id="cc-layer-3" className="admin-cc-sr-only">
          Algorithm weight tuning and ranking preview
        </p>
        <div className="admin-cc-stew-mock-banner">
          <span aria-hidden>⚙️</span>
          <span>
            Active profile: <strong>{serverProfileLabel || preset.label.split('(')[0].trim()}</strong> — Weights: Price{' '}
            {weightsNormBanner.price}%, Distance {weightsNormBanner.distance}%, Rating {weightsNormBanner.rating}%, Stock{' '}
            {weightsNormBanner.stock}% (preset: {preset.label.split('(')[0].trim()})
            {mediBot?.generated_at ? (
              <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
                MediBot snapshot: {formatDate(mediBot.generated_at)}
              </span>
            ) : null}
          </span>
        </div>
        <div className="admin-cc-stew-profile-row">
          <label htmlFor="admin-ranking-profile-select">Ranking profile (live)</label>
          <select
            id="admin-ranking-profile-select"
            className="admin-cc-stew-profile-select"
            value={
              rankingProfileSelectOptions.some(
                (o) => o.id.toLowerCase() === String(selectedRankingProfileApiId || '').toLowerCase()
              )
                ? selectedRankingProfileApiId
                : rankingProfileSelectOptions[0]?.id || ''
            }
            onChange={(e) => handleRankingProfileSelectChange(e.target.value)}
          >
            {rankingProfileSelectOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} ({o.id})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-light admin-cc-stew-profile-save"
            onClick={() => void saveRankingProfileToServer()}
          >
            Save profile only
          </button>
          <p className="admin-cc-stew-profile-hint muted">
            Choose the live ranking profile. Use <strong>Save to server</strong> below if you also want to persist the
            current weight values.
          </p>
          {profileSaveMessage ? (
            <p
              className="admin-cc-stew-profile-msg admin-cc-pill admin-cc-pill--ok"
              role="status"
              aria-live="polite"
            >
              {profileSaveMessage}
            </p>
          ) : null}
        </div>
        <div className="admin-cc-stew-mock-presets">
          {Object.keys(PROFILE_PRESETS).map((key) => (
            <button
              key={key}
              type="button"
              className={`admin-cc-stew-preset-btn ${activeProfile === key ? 'is-active' : ''}`}
              onClick={() => applyProfile(key)}
            >
              {PROFILE_PRESETS[key].label}
            </button>
          ))}
        </div>
        <div className="admin-cc-stew-mock-grid">
          <div>
            {STEWARDSHIP_SLIDERS.map((s) => (
              <div key={s.key} className="admin-cc-stew-slider-card">
                <div className="admin-cc-stew-slider-head">
                  <div className="admin-cc-stew-slider-title">
                    <span aria-hidden>{s.icon}</span> {s.title}
                  </div>
                  <div className="admin-cc-stew-slider-pct mono" style={{ color: s.accent }}>
                    {weights[s.key]}%
                  </div>
                </div>
                <p className="admin-cc-stew-slider-desc">{s.desc}</p>
                <input
                  type="range"
                  className="admin-cc-stew-range"
                  style={{ accentColor: s.accent }}
                  min={0}
                  max={s.max}
                  value={weights[s.key] ?? 0}
                  onChange={(e) => {
                    weightsDirtyRef.current = true
                    setWeights((w) => ({ ...w, [s.key]: Number(e.target.value) }))
                  }}
                  aria-label={s.title}
                />
              </div>
            ))}
            <div className="admin-cc-stew-total-bar">
              <span className="admin-cc-stew-total-label">Total weight</span>
              <span
                className="admin-cc-stew-total-val mono"
                style={{
                  color: weightTotal === 100 ? '#00d4b8' : weightTotal > 100 ? '#ef4444' : '#f59e0b'
                }}
              >
                {weightTotal}%
              </span>
            </div>
            <div className="admin-cc-stew-actions">
              <button type="button" className="btn-light admin-cc-stew-btn-flex" onClick={resetWeightsUi}>
                Reset to default
              </button>
              <button type="button" className="btn-notify admin-cc-stew-btn-flex" onClick={() => void saveWeights()}>
                Save to server
              </button>
            </div>
            {algoError ? (
              <p className="admin-error admin-error--inline" style={{ marginTop: 10 }}>
                {algoError}
              </p>
            ) : null}
            {policyNote ? (
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                {policyNote}
              </p>
            ) : null}
            {algoSavedAt ? (
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                Last saved {formatDate(algoSavedAt)} · Normalized: price {normalizeWeights(weights).price}% · distance{' '}
                {normalizeWeights(weights).distance}% · rating {normalizeWeights(weights).rating}% · stock{' '}
                {normalizeWeights(weights).stock}%
              </p>
            ) : (
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                Weights load from the current ranking setup when available. <strong>Save to server</strong> persists both
                weights and the active profile.
              </p>
            )}
          </div>
          <div>
            <div className="admin-cc-stew-panel">
              <div className="admin-cc-stew-panel-title">📊 Ranking preview</div>
              <p className="admin-cc-stew-panel-lead">
                {adminPortalRankingSummaryLoading && rankedPreview.length === 0
                  ? 'Loading live leaderboard from ranking-summary…'
                  : rankedPreview[0]?.source === 'live'
                    ? 'Top entries from the live ranking-summary leaderboard (same API as the pharmacy portal). Order and points match the current server config — not the unsaved slider draft above.'
                    : rankedPreview[0]?.source === 'composite'
                      ? 'No leaderboard array in ranking-summary yet — sorted by the same dashboard composite as the pharmacy registry (API scores when present, else the 0.3·price + 0.2·response + 0.15·stock + 0.2·rating blend).'
                      : 'Demo pharmacies only (no dashboard pharmacy rows loaded).'}
              </p>
              <ul className="admin-cc-stew-rank-list">
                {rankedPreview.map((p, i) => (
                  <li key={p.key || `${p.n}-${i}`} className="admin-cc-stew-rank-row">
                    <span className="admin-cc-stew-rank-num mono" style={{ color: rankColors[i] ?? rankColors[4] }}>
                      #{p.displayRank ?? i + 1}
                    </span>
                    <div className="admin-cc-stew-rank-main">
                      <div className="admin-cc-stew-rank-name">{p.n}</div>
                      <div className="admin-cc-stew-rank-meta">{p.meta}</div>
                    </div>
                    <span className="admin-cc-stew-rank-score mono" style={{ color: rankColors[i] ?? rankColors[4] }}>
                      {p.sc != null && Number.isFinite(p.sc) ? `${Math.round(p.sc * 100)}pts` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="admin-cc-stew-panel" style={{ marginTop: 16 }}>
              <div className="admin-cc-stew-panel-title">💡 Impact snapshot</div>
              {impactMetrics && impactMetrics.items.length > 0 ? (
                <>
                  <div className="admin-cc-stew-impact-grid">
                    {impactMetrics.items.map((it) => (
                      <div key={it.label} className="admin-cc-stew-impact-item">
                        <div
                          className="admin-cc-stew-impact-val"
                          style={{
                            color:
                              it.tone === 'bad' ? '#ef4444' : it.tone === 'warn' ? '#f59e0b' : '#00d4b8'
                          }}
                        >
                          {it.value}
                        </div>
                        <div className="admin-cc-stew-impact-label">{it.label}</div>
                      </div>
                    ))}
                  </div>
                  {impactMetrics.hint ? (
                    <div className="admin-cc-stew-impact-hint">{impactMetrics.hint}</div>
                  ) : (
                    <p className="muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
                      From MediBot <span className="mono">layer4_impact</span>.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                    No <span className="mono">layer4_impact</span> block in the MediBot overview yet. Expose fulfilment,
                    equity, and transport fields from the backend (see ADMIN_DASHBOARD_BACKEND_SPEC).
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="admin-cc-content-policy" className="admin-cc-layer" aria-labelledby="cc-content-policy-head">
        <div className="admin-cc-layer-head">
          <div>
            <h2 id="cc-content-policy-head">Content policy — Patient disclaimer</h2>
            <p className="admin-cc-layer-sub">
              Loaded from <span className="mono">GET …/admin/chatbot/policy/</span> when available; saved with{' '}
              <span className="mono">PATCH</span> to the same path.
            </p>
          </div>
        </div>
        <div className="admin-cc-layer-body">
          <textarea
            className="admin-cc-textarea"
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
            aria-label="Patient-facing disclaimer draft"
          />
          <div className="admin-cc-sla-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn-notify" onClick={() => void saveDisclaimer()}>
              Save to server
            </button>
            {disclaimerSaved && <span className="admin-cc-pill admin-cc-pill--ok">Saved</span>}
          </div>
          {policyError ? (
            <p className="admin-error admin-error--inline" style={{ marginTop: 10 }}>
              {policyError}
            </p>
          ) : null}
        </div>
      </section>
    </>
  )

  if (surface === 'stewardship') {
    return (
      <div className="admin-cc">
        {algorithmStewardshipBody}
        {onOpenAuditTab ? (
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            <button type="button" className="medibot-link-btn" onClick={onOpenAuditTab}>
              Open chatbot audit
            </button>{' '}
            for flagged conversations and full transcripts.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="admin-cc">
      <section className="admin-cc-layer" aria-labelledby="cc-layer-1">
        <div className="admin-cc-layer-head">
          <div>
            <h2 id="cc-layer-1">Layer 1 — System health</h2>
            <p className="admin-cc-layer-sub">
              Vital signs from the loaded admin dataset. Wire APM / SLA telemetry on the backend for live 2s urban / 5s rural
              targets.
            </p>
          </div>
        </div>
        <div className="admin-cc-layer-body">
          <p className="admin-cc-note">
            Indicators below use the current dashboard snapshot (limited by API <span className="mono">limit</span>). They
            approximate operational health until real-time metrics are connected.
          </p>
          <div className="admin-cc-metrics">
            <div className="admin-cc-metric">
              <span className="admin-cc-metric-label">Patient sessions (distinct)</span>
              <span className="admin-cc-metric-value">{typeof sessionsApprox === 'number' ? sessionsApprox.toLocaleString() : sessionsApprox}</span>
              <p className="admin-cc-metric-hint">From overview API</p>
            </div>
            <div className="admin-cc-metric">
              <span className="admin-cc-metric-label">Requests (last hour)</span>
              <span className="admin-cc-metric-value">{requestsLastHour}</span>
              <p className="admin-cc-metric-hint">Parsed from loaded request timestamps</p>
            </div>
            <div className="admin-cc-metric">
              <span className="admin-cc-metric-label">Active reservations</span>
              <span className="admin-cc-metric-value">
                {overview?.active_reservations != null
                  ? Number(overview.active_reservations).toLocaleString()
                  : allReservations.filter((r) => ['pending', 'confirmed'].includes(String(r.status || '').toLowerCase()))
                      .length}
              </span>
              <p className="admin-cc-metric-hint">Holds not yet completed</p>
            </div>
            <div className="admin-cc-metric">
              <span className="admin-cc-metric-label">Console session</span>
              <span className="admin-cc-metric-value">{uptimeMinutes}m</span>
              <p className="admin-cc-metric-hint">Browser tab uptime (demo stand-in for status page)</p>
            </div>
          </div>
          <div className="admin-cc-sla-row">
            <span className="muted" style={{ fontSize: 12 }}>
              SLA signal (heuristic)
            </span>
            <span className={`admin-cc-pill admin-cc-pill--${slaHint.tone}`}>{slaHint.text}</span>
          </div>
          <h3 style={{ marginTop: 18, marginBottom: 8, fontSize: 13, fontWeight: 800 }}>
            Request volume by region (loaded data)
          </h3>
          <div className="admin-cc-geo-grid">
            {geoBuckets.map((b) => (
              <div key={b.key} className="admin-cc-geo-row">
                <span>
                  {b.label} <span className="muted">({b.count})</span>
                </span>
                <div className="admin-cc-geo-bar" title={`${b.count} requests`}>
                  <div className="admin-cc-geo-bar-fill" style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-cc-layer" aria-labelledby="cc-layer-2">
        <div className="admin-cc-layer-head">
          <div>
            <h2 id="cc-layer-2">Layer 2 — Pharmacy governance</h2>
            <p className="admin-cc-layer-sub">Pending registry approvals. Review, approve, or suspend entries.</p>
          </div>
        </div>
        <div className="admin-cc-layer-body">
          <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>Pending verification</h3>
          {verificationQueue.length === 0 ? (
            <p className="muted">No pharmacies in <span className="mono">pending_review</span> in the loaded list.</p>
          ) : (
            <div className="admin-cc-queue">
              {verificationQueue.map((p) => {
                const id = p.pharmacy_id || p.id
                const busy = govBusy === id
                return (
                  <div key={id} className="admin-cc-queue-card">
                    <div>
                      <strong>{p.name || p.pharmacy_name || id}</strong>
                      <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
                        {id}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {p.address || p.city || '—'}
                      </div>
                    </div>
                    <div className="admin-cc-queue-actions">
                      <button
                        type="button"
                        className="btn-notify"
                        disabled={busy}
                        onClick={() => runGovernance(id, { verification_status: 'verified', is_active: true })}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn-light"
                        disabled={busy}
                        onClick={() =>
                          runGovernance(id, { verification_status: 'suspended', is_active: false })
                        }
                      >
                        Suspend
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="admin-cc-layer" aria-labelledby="cc-layer-3">
        <div className="admin-cc-layer-head">
          <div>
            <h2 id="cc-layer-3">Layer 3 — Algorithm stewardship</h2>
            <p className="admin-cc-layer-sub">
              Weights sync from the current ranking configuration when present; <strong>Save &amp; normalize</strong>
              persists your updates.
            </p>
          </div>
        </div>
        <div className="admin-cc-layer-body">
          <div className="admin-cc-profile-row">
            {Object.keys(PROFILE_PRESETS).map((key) => (
              <button
                key={key}
                type="button"
                className={`btn-light ${activeProfile === key ? 'active' : ''}`}
                onClick={() => applyProfile(key)}
              >
                {PROFILE_PRESETS[key].label}
              </button>
            ))}
          </div>
          <div className="admin-cc-sliders">
            {['price', 'distance', 'rating', 'stock'].map((k) => (
              <div key={k} className="admin-cc-slider-row">
                <span className="cell-strong" style={{ textTransform: 'capitalize' }}>
                  {k}
                </span>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={weights[k] ?? 0}
                  onChange={(e) => {
                    weightsDirtyRef.current = true
                    setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))
                  }}
                />
                <span className="mono">{weights[k]}</span>
              </div>
            ))}
          </div>
          <div className="admin-cc-sla-row">
            <button type="button" className="btn-notify" onClick={() => void saveWeights()}>
              Save &amp; normalize to 100%
            </button>
            {algoSavedAt && (
              <span className="muted" style={{ fontSize: 12 }}>
                Saved {formatDate(algoSavedAt)}
              </span>
            )}
          </div>
          {algoError ? (
            <p className="admin-error admin-error--inline" style={{ marginTop: 10 }}>
              {algoError}
            </p>
          ) : null}
          <p className="admin-cc-note" style={{ marginTop: 12, marginBottom: 0 }}>
            Normalized weights: price {normalizeWeights(weights).price}% · distance {normalizeWeights(weights).distance}% ·
            rating {normalizeWeights(weights).rating}% · stock {normalizeWeights(weights).stock}%
          </p>
        </div>
      </section>

      <section className="admin-cc-layer" aria-labelledby="cc-layer-4">
        <div className="admin-cc-layer-head">
          <div>
            <h2 id="cc-layer-4">Layer 4 — AI safety &amp; content</h2>
            <p className="admin-cc-layer-sub">
              Keyword-flagged chatbot rows for review; patient disclaimer draft for your ethical / UI pipeline.
            </p>
          </div>
        </div>
        <div className="admin-cc-layer-body">
          <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>Flagged conversations (keyword scan)</h3>
          {chatbotLogsLoading ? (
            <p className="muted">Loading chatbot logs…</p>
          ) : flaggedChats.length === 0 ? (
            <p className="muted">No rows matched heuristics on the current log page. Open full logs for deeper review.</p>
          ) : (
            <div className="table-wrap">
              <table className="admin-table admin-cc-flag-table">
                <thead>
                  <tr>
                    <th>Conversation</th>
                    <th>Preview</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {flaggedChats.map((row, idx) => {
                    const cid = row.conversation_id ?? row.conversationId ?? row.id
                    return (
                      <tr key={cid || idx}>
                        <td className="mono">{cid || '—'}</td>
                        <td className="cell-muted" style={{ fontSize: 12, maxWidth: 360 }}>
                          {row.last_message_preview || row.title || '—'}
                        </td>
                        <td>
                          {onOpenChatbotTab && cid ? (
                            <button type="button" className="btn-light" onClick={() => onOpenChatbotTab(String(cid))}>
                              Open in logs
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={{ margin: '20px 0 10px', fontSize: 13 }}>Patient disclaimer (draft)</h3>
          <textarea
            className="admin-cc-textarea"
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
            aria-label="Patient-facing disclaimer draft"
          />
          <div className="admin-cc-sla-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn-notify" onClick={() => void saveDisclaimer()}>
              Save to server
            </button>
            {disclaimerSaved && <span className="admin-cc-pill admin-cc-pill--ok">Saved</span>}
          </div>
          {policyError ? (
            <p className="admin-error admin-error--inline" style={{ marginTop: 10 }}>
              {policyError}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
