/**
 * MediBot `active_ranking_profile` / `active_profile` id → UI preset key used in AdminCommandCenter.
 * @param {string|null|undefined} raw
 * @returns {'default'|'rural'|'shortage'|'affordability'|null}
 */
export function mapLayer3ActiveProfileToUiPresetKey(raw) {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  const map = {
    urban_default: 'default',
    rural_equity: 'rural',
    shortage_mode: 'shortage',
    affordability: 'affordability'
  }
  return map[k] ?? null
}

/**
 * UI preset key → API `active_ranking_profile` id (ranking config / layer3).
 * @param {string|null|undefined} uiKey
 * @returns {string|null}
 */
export function mapUiPresetToLayer3ActiveProfile(uiKey) {
  const k = String(uiKey ?? '').trim().toLowerCase()
  const map = {
    default: 'urban_default',
    rural: 'rural_equity',
    shortage: 'shortage_mode',
    affordability: 'affordability'
  }
  return map[k] ?? null
}

function parseMcdaStandardWeightsObject(sw) {
  if (!sw || typeof sw !== 'object') return null
  const price = Number(
    sw.price ?? sw.price_pct ?? sw.price_competitiveness ?? sw.price_competitiveness_pct
  )
  const distance = Number(
    sw.distance ??
      sw.distance_pct ??
      sw.travel ??
      sw.distance_travel ??
      sw.distance_travel_pct
  )
  const rating = Number(
    sw.rating ?? sw.rating_pct ?? sw.patient_rating ?? sw.patient_rating_pct
  )
  const stock = Number(
    sw.stock ??
      sw.stock_pct ??
      sw.stock_reliability ??
      sw.stock_reliability_pct ??
      sw.reliability ??
      sw.reliability_pct
  )
  if (![price, distance, rating, stock].every((n) => Number.isFinite(n))) return null
  return {
    price: Math.round(Math.min(100, Math.max(0, price))),
    distance: Math.round(Math.min(100, Math.max(0, distance))),
    rating: Math.round(Math.min(100, Math.max(0, rating))),
    stock: Math.round(Math.min(100, Math.max(0, stock)))
  }
}

/**
 * Normalized slider weights → `layer3_algorithm.standard_weights` shape for PATCH ranking config.
 * Uses the same `_pct` field names the backend accepts alongside short aliases.
 * @param {{ price: number, distance: number, rating: number, stock: number }} w
 * @returns {object}
 */
export function mcdaNormalizedWeightsToStandardWeightsPayload(w) {
  if (!w || typeof w !== 'object') {
    return {
      price_competitiveness_pct: 0,
      distance_travel_pct: 0,
      patient_rating_pct: 0,
      stock_reliability_pct: 0
    }
  }
  const price = Math.round(Math.min(100, Math.max(0, Number(w.price) || 0)))
  const distance = Math.round(Math.min(100, Math.max(0, Number(w.distance) || 0)))
  const rating = Math.round(Math.min(100, Math.max(0, Number(w.rating) || 0)))
  const stock = Math.round(Math.min(100, Math.max(0, Number(w.stock) || 0)))
  return {
    price_competitiveness_pct: price,
    distance_travel_pct: distance,
    patient_rating_pct: rating,
    stock_reliability_pct: stock
  }
}

/**
 * `layer3.context_profiles` or ranking-config style `layer3.profiles`.
 * @param {object|null|undefined} l3
 * @returns {object[]|null}
 */
export function getLayer3ProfilesArray(l3) {
  if (!l3 || typeof l3 !== 'object') return null
  const raw = l3.context_profiles ?? l3.profiles
  return Array.isArray(raw) && raw.length > 0 ? raw : null
}

/**
 * MCDA weights from one `layer3.context_profiles[]` entry (or any row with `weights` / `weights_pct`).
 * @param {object|null|undefined} row
 * @returns {{ price: number, distance: number, rating: number, stock: number } | null}
 */
export function extractMcdaWeightsFromLayer3ProfileRow(row) {
  if (!row || typeof row !== 'object') return null
  const fromSelf = parseMcdaStandardWeightsObject(row)
  if (fromSelf) return fromSelf
  const fromWeights = parseMcdaStandardWeightsObject(row.weights)
  if (fromWeights) return fromWeights
  const pct = row.weights_pct
  if (Array.isArray(pct) && pct.length >= 4) {
    const [price, distance, rating, stock] = pct.map((x) => Number(x))
    if ([price, distance, rating, stock].every((n) => Number.isFinite(n))) {
      return {
        price: Math.round(Math.min(100, Math.max(0, price))),
        distance: Math.round(Math.min(100, Math.max(0, distance))),
        rating: Math.round(Math.min(100, Math.max(0, rating))),
        stock: Math.round(Math.min(100, Math.max(0, stock)))
      }
    }
  }
  return null
}

/**
 * Map MediBot `layer3_algorithm` / `standard_weights` into MCDA slider state (0–100 integers).
 * @param {object|null|undefined} l3
 * @returns {{ price: number, distance: number, rating: number, stock: number } | null}
 */
export function extractMcdaWeightsFromLayer3(l3) {
  if (!l3 || typeof l3 !== 'object') return null

  const fromStandard = parseMcdaStandardWeightsObject(l3.standard_weights)
  if (fromStandard) return fromStandard

  const profiles = getLayer3ProfilesArray(l3)
  const activeKey = String(l3.active_ranking_profile ?? l3.active_profile ?? '').toLowerCase()

  if (profiles) {
    const pick =
      profiles.find((p) => p && (p.active === true || p.active === 'true')) ||
      profiles.find((p) => {
        if (!p) return false
        const key = String(p.key ?? p.id ?? p.slug ?? '').toLowerCase()
        return activeKey && (key === activeKey || String(p.label ?? '').toLowerCase().replace(/\s+/g, '_') === activeKey)
      }) ||
      null

    if (pick) {
      const fromPick = extractMcdaWeightsFromLayer3ProfileRow(pick)
      if (fromPick) return fromPick
    }
  }

  const urban = l3.urban
  if (urban && typeof urban === 'object') {
    const fromUrban = parseMcdaStandardWeightsObject(urban)
    if (fromUrban) return fromUrban
  }

  if (profiles?.length) {
    const fromFirst = extractMcdaWeightsFromLayer3ProfileRow(profiles[0])
    if (fromFirst) return fromFirst
  }

  return null
}

/**
 * Labels + values for "impact" strip from `layer4_impact` (see ADMIN_DASHBOARD_BACKEND_SPEC).
 * @param {object|null|undefined} l4
 * @returns {{ items: { label: string, value: string, tone?: string }[], hint: string | null } | null}
 */
export function extractLayer4ImpactForUi(l4) {
  if (!l4 || typeof l4 !== 'object') return null

  const items = []
  const fmtPct = (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)}%` : null)
  const fmtMin = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return null
    return `${Math.round(n)} min`
  }

  const fulfil = l4.fulfilment_pct ?? l4.fulfillment_pct ?? l4.urban_fulfilment_pct
  if (fulfil != null && Number.isFinite(Number(fulfil))) {
    items.push({ label: 'Fulfilment rate', value: fmtPct(Number(fulfil) <= 1 ? Number(fulfil) * 100 : Number(fulfil)), tone: 'ok' })
  }

  const findT = l4.median_find_time_display ?? l4.median_find_time_minutes ?? l4.median_find_time
  if (findT != null) {
    const s = typeof findT === 'string' && String(findT).match(/\d/) ? String(findT) : fmtMin(findT)
    if (s) items.push({ label: 'Median find time', value: s, tone: 'ok' })
  }

  const gap = l4.equity_gap_pct ?? l4.rural_gap_pct
  if (gap != null && Number.isFinite(Number(gap))) {
    const g = Number(gap)
    const pct = g <= 1 ? g * 100 : g
    items.push({
      label: 'Rural / equity gap',
      value: `${pct.toFixed(0)}%`,
      tone: pct > 25 ? 'bad' : pct > 15 ? 'warn' : 'ok'
    })
  }

  const transport = l4.transport_savings_estimate ?? l4.transport_savings_estimate_display
  if (transport != null && String(transport).trim() !== '') {
    items.push({ label: 'Transport saved (est.)', value: String(transport), tone: 'warn' })
  }

  if (items.length === 0) return null

  const hint =
    typeof l4.equity_narrative === 'string' && l4.equity_narrative.trim()
      ? l4.equity_narrative.trim()
      : typeof l4.impact_hint === 'string'
        ? l4.impact_hint.trim()
        : null

  return { items: items.slice(0, 4), hint }
}
