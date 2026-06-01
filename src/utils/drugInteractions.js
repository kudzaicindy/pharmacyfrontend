/**
 * Normalize backend drug_interactions payloads (embedded_rules_v1 / check-interactions / chat / ranked).
 */

export function patientDrugInteractionAlertsEnabled() {
  try {
    const patient = JSON.parse(localStorage.getItem('patient') || '{}')
    return patient.drug_interaction_alerts !== false
  } catch {
    return true
  }
}

/** @returns {{ interactions: object[], disclaimer?: string, source?: string, medicines_checked?: string[] } | null} */
export function normalizeDrugInteractionsPayload(raw) {
  if (raw == null) return null
  const ddi = raw.drug_interactions != null && typeof raw.drug_interactions === 'object'
    ? raw.drug_interactions
    : raw
  if (!ddi || typeof ddi !== 'object') return null

  const interactions = Array.isArray(ddi.interactions) ? ddi.interactions : []
  return {
    interactions,
    disclaimer:
      (typeof ddi.disclaimer === 'string' && ddi.disclaimer.trim()) ||
      (typeof raw.disclaimer === 'string' && raw.disclaimer.trim()) ||
      undefined,
    source: ddi.source ?? raw.source,
    medicines_checked: Array.isArray(ddi.medicines_checked)
      ? ddi.medicines_checked
      : Array.isArray(raw.medicines_checked)
        ? raw.medicines_checked
        : undefined,
  }
}

/** Read drug_interactions from chat, ranked envelope, upload, or check-interactions response. */
export function extractDrugInteractionsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  if (payload.drug_interactions != null) {
    return normalizeDrugInteractionsPayload(payload)
  }
  if (payload.meta?.drug_interactions != null) {
    return normalizeDrugInteractionsPayload({
      drug_interactions: payload.meta.drug_interactions,
      disclaimer: payload.meta.disclaimer ?? payload.disclaimer,
    })
  }
  return null
}

export function hasDrugInteractionWarnings(ddi) {
  return Boolean(ddi?.interactions?.length > 0)
}

/** Append ranked DDI query params when missing (backend v7 cache / meta.drug_interactions). */
export function appendRankedDrugInteractionParams(url) {
  if (!url || typeof url !== 'string') return url
  let next = url
  const add = (key, value) => {
    if (next.includes(`${key}=`)) return
    next += next.includes('?') ? '&' : '?'
    next += `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  }
  add('envelope', 'true')
  add('include_drug_interactions', 'true')
  return next
}
