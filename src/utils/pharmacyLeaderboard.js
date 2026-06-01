/**
 * Strip composite slug suffixes like "Citizens Pharmacy--2202" → base label (before `--` only).
 */
export function leaderboardPharmacyIdBase(id) {
  if (id == null) return ''
  const s = String(id).trim().replace(/\s+/g, ' ')
  const i = s.indexOf('--')
  return i >= 0 ? s.slice(0, i).trim() : s
}

/**
 * Normalized key so `Citizens Pharmacy--2202`, `Citizens Pharmacy -2202`, and typos line up for matching.
 * Slugs like `simed-01` are left as-is (lowercased).
 */
export function leaderboardPharmacyIdCanonicalKey(id) {
  if (id == null) return ''
  const s = String(id).trim().replace(/\s+/g, ' ')
  const mDouble = s.match(/^(.+?)\s*--\s*(\d+)$/)
  if (mDouble) return mDouble[1].trim().toLowerCase()
  const mSpaceHyphen = s.match(/^(.+?)\s+-\s*(\d+)$/)
  if (mSpaceHyphen) return mSpaceHyphen[1].trim().toLowerCase()
  return s.toLowerCase()
}

/**
 * True when a `ranking-summary` leaderboard row refers to the logged-in pharmacy.
 * Handles composite ids, ` -` vs `--` suffixes, and plain-name ids vs composite session ids.
 */
export function leaderboardPharmacyIdsMatch(rowPharmacyId, myPharmacyId, myPharmacyName) {
  if (rowPharmacyId == null || myPharmacyId == null) return false
  const row = String(rowPharmacyId).trim()
  const mine = String(myPharmacyId).trim()
  if (row === mine) return true
  const ckRow = leaderboardPharmacyIdCanonicalKey(rowPharmacyId)
  const ckMine = leaderboardPharmacyIdCanonicalKey(myPharmacyId)
  if (ckRow && ckMine && ckRow === ckMine) return true
  const baseMine = leaderboardPharmacyIdBase(mine)
  const baseRow = leaderboardPharmacyIdBase(row)
  if (baseMine && baseRow && baseMine.toLowerCase() === baseRow.toLowerCase()) return true
  if (baseMine && baseMine.toLowerCase() === row.toLowerCase()) return true
  if (baseRow && mine.toLowerCase() === baseRow.toLowerCase()) return true
  const name = myPharmacyName != null ? String(myPharmacyName).trim() : ''
  if (name) {
    const nl = name.toLowerCase()
    /** Each check must use this `row` / `ckRow` / `baseRow`; never compare `ckMine` to `nl` alone — that is true for every row when name matches id base. */
    if (nl === row.toLowerCase() || nl === ckRow || nl === baseRow.toLowerCase()) return true
  }
  return false
}

/**
 * Same ordering signal as pharmacy portal overview when ranking-summary leaderboard is absent:
 * 1) Backend composite `ranking_score_0_100` (or `leaderboard_score` / `ranking_score`) when present on the row.
 * 2) Else MCDA blend: 0.3·price + 0.2·response + 0.15·stock + 0.2·patient (defaults 84 / 71 / 90 / 82).
 *
 * @param {object} p - raw pharmacy or `perPharmacyRows` entry
 * @returns {number} integer 0–100
 */
export function rankingScoreLikePharmacyDashboardRow(p) {
  const sr = p.ranking_score_0_100 ?? p.leaderboard_score ?? p.ranking_score
  const apiScore = sr == null || sr === '' ? NaN : Number(sr)
  if (Number.isFinite(apiScore)) {
    return Math.round(Math.min(100, Math.max(0, apiScore)))
  }
  const pct = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null
  }
  const priceCompetitivenessPct = pct(p.price_competitiveness_pct) ?? 84
  const responseRatePct = Number.isFinite(p.responseRateNum)
    ? Math.min(100, Math.round(p.responseRateNum))
    : Number.isFinite(p.match_rate)
      ? Math.min(100, Math.round(Number(p.match_rate)))
      : 71
  const stockReliabilityPct = pct(p.stock_reliability_pct) ?? 90
  const patientRatingPct =
    pct(p.patient_rating_pct) ??
    (Number.isFinite(p.ratingNum) ? Math.round((p.ratingNum / 5) * 100) : 82)
  return Math.round(
    priceCompetitivenessPct * 0.3 +
      responseRatePct * 0.2 +
      stockReliabilityPct * 0.15 +
      patientRatingPct * 0.2
  )
}

/**
 * 0–100 portal composite from `composite_breakdown.ranking_score_0_100` (authoritative when present).
 * @param {object|null|undefined} summary - `GET .../pharmacist/<id>/ranking-summary/` payload
 * @returns {number|null}
 */
export function getPortalCompositeScoreFromSummary(summary) {
  if (!summary || typeof summary !== 'object') return null
  const n = Number(summary.composite_breakdown?.ranking_score_0_100)
  if (!Number.isFinite(n)) return null
  return Math.round(Math.min(100, Math.max(0, n)))
}

/** Labels for `weights_percent` summary line — live MCDA is **P, D, T, Rel** (Rel = response+stock inputs). */
const WEIGHTS_PERCENT_SUMMARY_LETTERS = {
  price: 'P',
  distance: 'D',
  rating: 'T',
  reliability: 'Rel',
  response: 'R',
  stock: 'S'
}

/** Normalised keys from {@link normalizeCompositeWeightsPercent} (not raw API snake_case). */
const WEIGHTS_PERCENT_TO_FIELD_KEYS = {
  price_competitiveness_pct: ['price'],
  distance_pct: ['distance'],
  patient_rating_pct: ['rating'],
  response_rate_pct: ['response'],
  /** Prefer `stock` when both split; else single `reliability` bucket. */
  stock_reliability_pct: ['stock', 'reliability']
}

/**
 * Normalise `composite_weights.weights_percent` (admin MCDA) for the portal UI.
 * @param {object|null|undefined} raw
 * @returns {{ price: number|null, distance: number|null, rating: number|null, reliability: number|null, response: number|null, stock: number|null } | null}
 */
export function normalizeCompositeWeightsPercent(raw) {
  if (!raw || typeof raw !== 'object') return null
  const pick = (...keys) => {
    for (const k of keys) {
      if (raw[k] == null || raw[k] === '') continue
      const n = Number(raw[k])
      if (Number.isFinite(n)) return Math.round(Math.min(100, Math.max(0, n)))
    }
    return null
  }
  const out = {
    price: pick('price', 'price_competitiveness_pct', 'price_pct'),
    distance: pick('distance', 'distance_pct', 'distance_travel_pct', 'travel'),
    rating: pick('rating', 'patient_rating_pct', 'patient_rating'),
    reliability: pick('reliability', 'reliability_pct'),
    response: pick('response', 'response_rate_pct', 'response_rate'),
    stock: pick('stock', 'stock_reliability_pct', 'stock_reliability', 'stock_pct')
  }
  if (!Object.values(out).some((v) => v != null)) return null
  return out
}

/**
 * True when the API uses one **reliability** bucket (not separate response + stock weights).
 * @param {ReturnType<typeof normalizeCompositeWeightsPercent>} wp
 */
export function portalCompositeUsesReliabilityBucket(wp) {
  if (!wp || typeof wp !== 'object') return false
  const hasSplit = wp.response != null || wp.stock != null
  return wp.reliability != null && !hasSplit
}

function buildWeightSummaryLineFromNormalized(wp) {
  if (!wp) return ''
  const order = ['price', 'distance', 'rating', 'reliability', 'response', 'stock']
  const parts = []
  for (const key of order) {
    const v = wp[key]
    if (v == null) continue
    const letter = WEIGHTS_PERCENT_SUMMARY_LETTERS[key] || key[0].toUpperCase()
    parts.push(`${v}%·${letter}`)
  }
  return parts.join(' + ')
}

/**
 * @param {{ letter?: string, weight_percent?: number, weight?: number }[]|null|undefined} components
 * @param {string} field - e.g. `price_competitiveness_pct`
 * @param {ReturnType<typeof normalizeCompositeWeightsPercent>|null|undefined} [weightsPercentNormalized] - from `composite_weights.weights_percent`
 * @returns {number|null}
 */
export function weightPercentForPortalCompositeField(components, field, weightsPercentNormalized) {
  const keys = WEIGHTS_PERCENT_TO_FIELD_KEYS[field]
  if (weightsPercentNormalized && keys) {
    for (const k of keys) {
      const v = weightsPercentNormalized[k]
      if (v != null && Number.isFinite(Number(v))) return Math.round(Number(v))
    }
  }
  if (!Array.isArray(components)) return null
  const row = components.find((c) => c && String(c.field) === String(field))
  if (!row) return null
  const wp = Number(row.weight_percent)
  if (Number.isFinite(wp)) return Math.round(Math.min(100, Math.max(0, wp)))
  const w = Number(row.weight)
  return Number.isFinite(w) ? Math.round(Math.min(100, Math.max(0, w * 100))) : null
}

/**
 * Data for “pharmacy portal composite” copy + breakdown table (`composite_weights`, `composite_breakdown`).
 * @param {object|null|undefined} summary
 * @returns {null | {
 *   weightSummaryLine: string,
 *   distinctNote: string,
 *   scoringMethod: string,
 *   scoreFormula: string,
 *   weightedSumLinear: string,
 *   weightedSumMax: number|null,
 *   components: object[],
 *   contributions: object[],
 *   weightedSum: number|null|undefined,
 *   scoreBeforeRound: number|null|undefined,
 *   rankingScoreFromBreakdown: number|null,
 *   weightsPercent: ReturnType<typeof normalizeCompositeWeightsPercent>,
 *   useReliabilityCompositeLayout: boolean,
 *   algorithmSource: string,
 *   rankingSummaryFormula: string,
 *   rankingSummaryPayloadVersion: number|null,
 *   activeRankingProfile: string
 * }}
 */
export function extractPortalCompositeRankingUi(summary) {
  if (!summary || typeof summary !== 'object') return null
  const cw = summary.composite_weights && typeof summary.composite_weights === 'object' ? summary.composite_weights : null
  const bd = summary.composite_breakdown && typeof summary.composite_breakdown === 'object' ? summary.composite_breakdown : null
  const components = cw && Array.isArray(cw.components) ? cw.components : []
  const contributions = bd && Array.isArray(bd.contributions) ? bd.contributions : []
  const wp = normalizeCompositeWeightsPercent(cw?.weights_percent)
  const hasRootRankingMeta =
    (typeof summary.formula === 'string' && summary.formula.trim() !== '') ||
    summary.ranking_summary_payload_version != null ||
    (typeof summary.algorithm_source === 'string' && summary.algorithm_source.trim() !== '') ||
    (typeof summary.active_ranking_profile === 'string' && summary.active_ranking_profile.trim() !== '') ||
    (typeof cw?.active_ranking_profile === 'string' && cw.active_ranking_profile.trim() !== '')
  if (!cw && contributions.length === 0 && !hasRootRankingMeta) return null

  let weightSummaryLine = components.length
    ? components
        .map((c) => {
          const letter = String(c.letter ?? '').trim() || '?'
          const wPct = Number(c.weight_percent)
          const pct = Number.isFinite(wPct) ? Math.round(wPct) : Math.round(Number(c.weight) * 100) || 0
          return `${pct}%·${letter}`
        })
        .join(' + ')
    : ''

  if (!weightSummaryLine && wp) {
    weightSummaryLine = buildWeightSummaryLineFromNormalized(wp)
  }

  const rs =
    bd?.ranking_score_0_100 != null && Number.isFinite(Number(bd.ranking_score_0_100))
      ? Math.round(Math.min(100, Math.max(0, Number(bd.ranking_score_0_100))))
      : null

  return {
    weightSummaryLine,
    distinctNote:
      typeof cw?.distinct_from_patient_mcda === 'string' ? cw.distinct_from_patient_mcda.trim() : '',
    algorithmSource:
      typeof summary.algorithm_source === 'string'
        ? summary.algorithm_source.trim()
        : typeof cw?.algorithm_source === 'string'
          ? cw.algorithm_source.trim()
          : '',
    /** Live algorithm string — **root `formula` only** (not `definitions.formula`, not `score_history[].formula`). */
    rankingSummaryFormula: typeof summary.formula === 'string' ? summary.formula.trim() : '',
    rankingSummaryPayloadVersion:
      summary.ranking_summary_payload_version != null && Number.isFinite(Number(summary.ranking_summary_payload_version))
        ? Number(summary.ranking_summary_payload_version)
        : null,
    activeRankingProfile:
      typeof summary.active_ranking_profile === 'string'
        ? summary.active_ranking_profile.trim()
        : typeof cw?.active_ranking_profile === 'string'
          ? cw.active_ranking_profile.trim()
          : '',
    scoringMethod: typeof cw?.scoring_method === 'string' ? cw.scoring_method : '',
    scoreFormula: typeof cw?.score_formula === 'string' ? cw.score_formula : '',
    weightedSumLinear: typeof cw?.weighted_sum_linear === 'string' ? cw.weighted_sum_linear : '',
    weightedSumMax: cw?.weighted_sum_max != null && Number.isFinite(Number(cw.weighted_sum_max)) ? Number(cw.weighted_sum_max) : null,
    components,
    contributions,
    weightedSum: bd?.weighted_sum,
    scoreBeforeRound: bd?.score_before_round,
    rankingScoreFromBreakdown: rs,
    weightsPercent: wp,
    useReliabilityCompositeLayout: portalCompositeUsesReliabilityBucket(wp)
  }
}

/** Strip `round((… )*100/N)` wrapper to get the linear sum inside. */
function stripRankingFormulaLinearSegment(formulaRaw) {
  let s = String(formulaRaw).replace(/\s+/g, '').replace(/×/gi, '*')
  const mRound = s.match(/^round\s*\(\s*(.+)\s*\)\s*$/i)
  if (mRound) s = mRound[1]
  const mScale = s.match(/^(.+?)\*100\/([0-9.]+)\s*$/i)
  if (mScale) s = mScale[1]
  const mInner = s.match(/^\((.+)\)$/)
  if (mInner) s = mInner[1]
  return s
}

/**
 * Parse admin-aligned terms like `0.3500*P+0.2500*D+0.2500*T+0.1500*Rel` (order-independent).
 * @returns {{ p: number|null, d: number|null, t: number|null, rel: number|null }}
 */
function parseFourFactorCoefficientsFromFormula(formulaRaw) {
  const s = stripRankingFormulaLinearSegment(formulaRaw)
  const coefs = { p: null, d: null, t: null, rel: null }
  const re = /([0-9.]+)\*(rel|p|d|t)\b/gi
  let m
  while ((m = re.exec(s)) !== null) {
    const c = Number(m[1])
    const k = m[2].toLowerCase()
    if (!Number.isFinite(c)) continue
    if (k === 'rel') coefs.rel = c
    else if (k === 'p') coefs.p = c
    else if (k === 'd') coefs.d = c
    else if (k === 't') coefs.t = c
  }
  return coefs
}

/**
 * Derive 0–100 from ranking-summary `formula` when it matches the backend.
 *
 * 1. **Admin-aligned four-criteria**: `w_p*P + w_d*D + w_t*T + w_rel*Rel` with **Rel** = `reliability_composite_pct`
 *    or average of response + stock rates (inputs into Rel, not separate weighted R/S).
 * 2. **Legacy**: `round((0.25*P+0.18*R+0.12*S+0.15*T+0.15*D)*100/85)`.
 *
 * Prefer `composite_breakdown.ranking_score_0_100` in callers where present.
 */
export function computeRankingScoreFromFiveFactorFormula(summary) {
  if (!summary || typeof summary !== 'object') return null
  /** Match backend: reconciling score from text uses **root `formula` only** — not snapshot/history strings. */
  const formulaRaw = String(summary.formula || '')
  const formulaNorm = formulaRaw.toLowerCase().replace(/\s+/g, '')
  const n = (v) => {
    const x = Number(v)
    return Number.isFinite(x) ? x : null
  }

  const coefs = parseFourFactorCoefficientsFromFormula(formulaRaw)
  if (coefs.p != null && coefs.d != null && coefs.t != null && coefs.rel != null) {
    const P = n(summary.price_competitiveness_pct)
    const D = n(summary.distance_pct)
    const T = n(summary.patient_rating_pct)
    let Rel = n(summary.reliability_composite_pct)
    if (Rel == null) {
      const R = n(summary.response_rate_pct)
      const S = n(summary.stock_reliability_pct)
      if (R != null && S != null) Rel = (R + S) / 2
    }
    if ([P, D, T, Rel].some((x) => x == null)) return null
    const raw = coefs.p * P + coefs.d * D + coefs.t * T + coefs.rel * Rel
    return Math.round(Math.min(100, Math.max(0, raw)))
  }

  const P = n(summary.price_competitiveness_pct)
  const R = n(summary.response_rate_pct)
  const S = n(summary.stock_reliability_pct)
  const T = n(summary.patient_rating_pct)
  const D = summary.distance_pct
  let d = 0
  if (D != null && D !== '') {
    const nd = n(D)
    if (nd == null) return null
    d = nd
  }
  const hasLegacy =
    formulaNorm.includes('0.25*p') &&
    formulaNorm.includes('0.18*r') &&
    formulaNorm.includes('0.12*s') &&
    formulaNorm.includes('0.15*t') &&
    formulaNorm.includes('0.15*d') &&
    formulaNorm.includes('*100/85')
  if (!hasLegacy) return null
  if ([P, R, S, T].some((x) => x == null)) return null
  const raw = 0.25 * P + 0.18 * R + 0.12 * S + 0.15 * T + 0.15 * d
  const scaled = (raw * 100) / 85
  return Math.round(Math.min(100, Math.max(0, scaled)))
}

/**
 * Platform pharmacy leaderboard — same ordering model as the pharmacy portal
 * (`PharmacyDashboard` mock + ranking card when using GET /pharmacies/ data).
 *
 * Dedupes by `pharmacy_id` (or name key); competition ranking for score ties.
 *
 * @param {Array<object>} pharmacies - raw pharmacy objects with optional `ranking_score_0_100` / `leaderboard_score` / `ranking_score`
 * @param {string|number|null} pharmacyIdSelf - logged-in pharmacy id for "you" row score override
 * @param {number|null|undefined} myScore - portal composite when API row is missing score for self
 * @param {string} [myPharmacyName] - display name to match composite ids / leaderboard labels
 * @returns {Array<{ name: string, score: number|null, pharmacy_id: *, rank: number, you: boolean, key: string }>}
 */
export function buildLeaderboardFromPlatformPharmacies(pharmacies, pharmacyIdSelf, myScore, myPharmacyName) {
  if (!Array.isArray(pharmacies) || pharmacies.length === 0) return []

  const seen = new Set()
  const rows = []
  for (const p of pharmacies) {
    const id = p.pharmacy_id ?? p.id
    const k = id != null ? String(id) : `name:${String(p.name ?? p.pharmacy_name ?? '')}`
    if (seen.has(k)) continue
    seen.add(k)
    const name = String(p.name ?? p.pharmacy_name ?? '').trim() || 'Pharmacy'
    const sr = p.ranking_score_0_100 ?? p.leaderboard_score ?? p.ranking_score
    const scoreNum = sr == null || sr === '' ? null : Number(sr)
    const you =
      pharmacyIdSelf != null && id != null && leaderboardPharmacyIdsMatch(id, pharmacyIdSelf, myPharmacyName)
    const score = you
      ? Number.isFinite(Number(myScore))
        ? Number(myScore)
        : Number.isFinite(scoreNum)
          ? scoreNum
          : null
      : Number.isFinite(scoreNum)
        ? scoreNum
        : null
    rows.push({ name, score, pharmacy_id: id, you, key: `pf-${id ?? name}` })
  }
  rows.sort((a, b) => {
    if (a.score != null && b.score != null) return b.score - a.score
    if (a.score != null) return -1
    if (b.score != null) return 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  const ranked = []
  let pos = 0
  while (pos < rows.length) {
    const rank = pos + 1
    const s = rows[pos].score
    let next = pos + 1
    while (next < rows.length && rows[next].score === s) next++
    for (let k = pos; k < next; k++) {
      ranked.push({
        ...rows[k],
        rank,
        you:
          pharmacyIdSelf != null &&
          rows[k].pharmacy_id != null &&
          leaderboardPharmacyIdsMatch(rows[k].pharmacy_id, pharmacyIdSelf, myPharmacyName)
      })
    }
    pos = next
  }
  return ranked
}

/**
 * When ranking-summary (or embedded admin payload) includes a full leaderboard table.
 * Field order matches pharmacy portal + admin MediBot `leaderboard` array.
 */
export function parseLeaderboardRowsFromSummary(rankingSummary) {
  if (!rankingSummary || typeof rankingSummary !== 'object') return null
  const raw =
    rankingSummary.leaderboard_rows ??
    rankingSummary.leaderboard_entries ??
    rankingSummary.leaderboard_peers ??
    rankingSummary.leaderboard
  if (!Array.isArray(raw) || raw.length === 0) return null
  const mapped = raw.map((row, i) => {
    const pid = row.pharmacy_id ?? row.pharmacyId ?? row.id
    let name = String(row.pharmacy_name ?? row.pharmacyName ?? row.name ?? '').trim()
    if (!name || name === 'Pharmacy') {
      if (pid != null && String(pid).trim()) name = String(pid).trim()
    }
    if (!name) name = 'Pharmacy'
    const scoreRaw = row.score ?? row.ranking_score_0_100 ?? row.ranking_score
    const score = scoreRaw == null || scoreRaw === '' ? null : Number(scoreRaw)
    const rankRaw = Number(row.rank ?? row.rank_position ?? row.position ?? i + 1)
    const rankN = Number.isFinite(rankRaw) ? rankRaw : i + 1
    return {
      rank: rankN,
      name,
      score: Number.isFinite(score) ? score : null,
      pharmacy_id: pid,
      key: `api-${rankN}-${pid ?? 'id'}-${String(name).slice(0, 48)}`,
    }
  })
  return [...mapped].sort((a, b) => a.rank - b.rank)
}
