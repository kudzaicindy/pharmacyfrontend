/**
 * Map GET /admin/analytics/search-volume/ (and merged widgets) into admin UI rows.
 */

const REGION_EMOJI = {
  harare: '🏙️',
  bulawayo: '🏙️',
  mutare: '🏘️',
  hwange: '🌾',
  gweru: '🌾',
  masvingo: '🌾',
  other: '🌿'
}

function inferCityKeyFromLabel(label) {
  const t = String(label || '').toLowerCase().trim()
  if (t === 'other' || t.startsWith('other /')) return 'other'
  if (t.includes('harare') || t.includes('chitungwiza') || t.includes('epworth')) return 'harare'
  if (t.includes('bulawayo') || t.includes('victoria falls') || t.includes('matabel')) return 'bulawayo'
  if (t.includes('mutare') || t.includes('rusape') || t.includes('nyanga') || t.includes('chipinge'))
    return 'mutare'
  if (t.includes('hwange')) return 'hwange'
  if (t.includes('gweru') || t.includes('kwekwe') || t.includes('kadoma') || t.includes('gokwe'))
    return 'gweru'
  if (t.includes('masvingo') || t.includes('chiredzi') || t.includes('zaka')) return 'masvingo'
  const slug = t.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  return slug.slice(0, 32) || 'other'
}

function kindForCityKey(key) {
  if (key === 'other') return 'rural'
  if (key === 'hwange' || key === 'gweru' || key === 'masvingo') return 'rural'
  return 'urban'
}

/**
 * @returns {Array<{ key: string, label: string, count: number, pct: number, kind: string, emoji: string }>|null}
 */
export function cityRowsFromSearchVolumeTopRegions(topRegions) {
  if (!Array.isArray(topRegions) || topRegions.length === 0) return null
  const parsed = topRegions
    .map((item) => {
      const label = String(
        item?.label ?? item?.city ?? item?.geo_region ?? item?.region ?? item?.name ?? ''
      ).trim()
      if (!label) return null
      const count = Number(item?.count ?? item?.volume ?? item?.requests ?? 0)
      const n = Number.isFinite(count) ? count : 0
      const key = inferCityKeyFromLabel(label)
      const kind = kindForCityKey(key)
      return { key, label, count: n, kind }
    })
    .filter(Boolean)
  if (!parsed.length) return null
  const total = parsed.reduce((s, r) => s + r.count, 0) || 1
  return parsed.map((r) => ({
    ...r,
    pct: Math.round((r.count / total) * 1000) / 10,
    emoji: REGION_EMOJI[r.key] ?? '📍'
  }))
}

/**
 * @returns {Array<{ name: string, c: number, widthPct: number }>|null}
 */
export function topMedicineBarRowsFromSearchVolume(topMedicines, { maxItems = 10 } = {}) {
  if (!Array.isArray(topMedicines) || topMedicines.length === 0) return null
  const rows = topMedicines
    .map((item) => {
      const name = String(item?.medicine ?? item?.name ?? item?.label ?? item?.query ?? '').trim()
      const c = Number(item?.count ?? item?.searches ?? item?.total ?? 0)
      return name ? { name, c: Number.isFinite(c) ? c : 0 } : null
    })
    .filter(Boolean)
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.c), 1)
  return rows.slice(0, maxItems).map((r) => ({
    ...r,
    widthPct: Math.min(100, Math.round((r.c / max) * 100))
  }))
}
