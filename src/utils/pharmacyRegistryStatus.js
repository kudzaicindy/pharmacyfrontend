/**
 * Map admin pharmacy payloads to UI registry keys: verified | pending | suspended.
 * Handles common backend spellings on status, verification_status, and account_status.
 */
export function getPharmacyRegistryStatus(p) {
  const pill = String(p?.status || '').toLowerCase()
  if (pill === 'suspended') return 'suspended'
  if (pill === 'verified') return 'verified'
  if (
    pill === 'pending_review' ||
    pill === 'pending' ||
    pill === 'awaiting_approval' ||
    pill === 'awaiting_review' ||
    pill === 'unverified' ||
    pill === 'draft' ||
    pill === 'submitted'
  ) {
    return 'pending'
  }
  if (p && p.is_active === false) return 'suspended'
  const vs = String(p?.verification_status || '').toLowerCase()
  if (vs === 'suspended') return 'suspended'
  if (
    vs === 'pending_review' ||
    vs === 'pending' ||
    vs === 'awaiting_approval' ||
    vs === 'awaiting_review' ||
    vs === 'unverified' ||
    vs === 'draft'
  ) {
    return 'pending'
  }
  if (vs === 'verified') return 'verified'
  const legacy = String(p?.account_status || '').toLowerCase()
  if (legacy === 'inactive' || legacy.includes('suspend')) return 'suspended'
  if (
    legacy === 'pending' ||
    legacy === 'pending_review' ||
    legacy === 'awaiting_approval' ||
    legacy === 'unverified'
  ) {
    return 'pending'
  }
  if (legacy === 'verified' || legacy === 'active') return 'verified'
  if (p?.is_verified === false) return 'pending'
  return 'verified'
}

/** MediBot / REST may return the queue as an array or wrapped in results/items/data. */
export function normalizeVerificationQueue(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.results)) return raw.results
    if (Array.isArray(raw.items)) return raw.items
    if (Array.isArray(raw.data)) return raw.data
    if (Array.isArray(raw.pharmacies)) return raw.pharmacies
  }
  return null
}

/**
 * `GET /admin/dashboard/data/` may embed the same queue as `.../pharmacies/verification-queue/` in several places.
 * Returns the first non-null normalized list (may be empty).
 */
export function extractDashboardVerificationQueue(data) {
  if (!data || typeof data !== 'object') return null
  const paths = [
    data.verification_queue,
    data.lists?.verification_queue,
    data.registry?.verification_queue,
    data.breakdown?.verification_queue,
    data.verification_queue_results
  ]
  for (const raw of paths) {
    if (raw === undefined || raw === null) continue
    const q = normalizeVerificationQueue(raw)
    if (q) return q
  }
  return null
}

function startOfCurrentMonthMs() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

function firstTimestampMs(p, fields) {
  for (const f of fields) {
    const raw = p?.[f]
    if (raw == null || raw === '') continue
    const t = new Date(raw).getTime()
    if (Number.isFinite(t)) return t
  }
  return null
}

function pickNonNegativeInt(agg, l2, keys) {
  for (const k of keys) {
    const v = agg?.[k] ?? l2?.[k]
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) return Math.round(n)
  }
  return null
}

function pickPositiveFloat(agg, l2, keys) {
  for (const k of keys) {
    const v = agg?.[k] ?? l2?.[k]
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

/**
 * Metrics for the admin verification queue header cards.
 * Prefers `layer2_pharmacy_governance.aggregates` (and top-level l2) when the backend sends counts;
 * otherwise estimates from loaded pharmacy rows using decision timestamps (and updated_at as last resort).
 *
 * @param {Array<object>} perPharmacyRows - dashboard pharmacy rows (spread from API + __id / __name)
 * @param {object|null|undefined} layer2 - mediBot.layer2_pharmacy_governance
 * @returns {{ approvedThisMonth: number|null, rejectedThisMonth: number|null, avgProcessingLabel: string|null }}
 */
export function getVerificationQueueMonthMetrics(perPharmacyRows, layer2) {
  const l2 = layer2 && typeof layer2 === 'object' ? layer2 : null
  const agg = l2?.aggregates && typeof l2.aggregates === 'object' ? l2.aggregates : null

  let approved =
    pickNonNegativeInt(agg, l2, [
      'approved_this_month',
      'verified_this_month',
      'verifications_approved_this_month',
      'pharmacies_verified_this_month'
    ]) ?? null

  let rejected =
    pickNonNegativeInt(agg, l2, [
      'rejected_this_month',
      'suspended_this_month',
      'verifications_rejected_this_month',
      'pharmacies_suspended_this_month'
    ]) ?? null

  const monthStart = startOfCurrentMonthMs()

  const rows = Array.isArray(perPharmacyRows) ? perPharmacyRows : []

  if (approved == null) {
    approved = rows.filter((p) => {
      if (getPharmacyRegistryStatus(p) !== 'verified') return false
      const t = firstTimestampMs(p, [
        'verified_at',
        'verification_decided_at',
        'verification_reviewed_at',
        'registration_approved_at',
        'verification_approved_at',
        'updated_at'
      ])
      return t != null && t >= monthStart
    }).length
  }

  if (rejected == null) {
    rejected = rows.filter((p) => {
      if (getPharmacyRegistryStatus(p) !== 'suspended') return false
      const t = firstTimestampMs(p, [
        'suspended_at',
        'rejected_at',
        'verification_rejected_at',
        'updated_at'
      ])
      return t != null && t >= monthStart
    }).length
  }

  const avgHours = pickPositiveFloat(agg, l2, [
    'avg_verification_processing_hours',
    'avg_verification_hours',
    'avg_processing_hours',
    'avg_queue_processing_hours'
  ])

  let avgProcessingLabel = null
  if (avgHours != null) {
    if (avgHours < 48) {
      avgProcessingLabel = `${Math.round(avgHours * 10) / 10} hr`
    } else {
      avgProcessingLabel = `${Math.round((avgHours / 24) * 10) / 10} days`
    }
  }

  return {
    approvedThisMonth: approved,
    rejectedThisMonth: rejected,
    avgProcessingLabel
  }
}
