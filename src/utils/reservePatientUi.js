/**
 * Patient reserve UX: pharmacist alternatives cannot use live-inventory lock;
 * pharmacy unavailable / holiday — no online reserve; show call-to-reserve with contact.
 */

import { medicineNamesMatchRequest, normalizeMedicineName } from './chatPharmacyResults'
import { pharmacyUnavailablePatientMessage } from './pharmacySettingsStorage'

const NOT_FOUND_AT_PHARMACY_RE =
  /medicine\s+["']?[^"']+["']?\s+not found at this pharmacy/i

const UNAVAILABLE_RESERVE_RE =
  /unavailable|not accepting reservations|reservations? (are )?paused|holiday|closed for/i

export function medNameKey(name) {
  return normalizeMedicineName(name)
}

/** @param {object|null} pharmacy */
export function getPharmacyContact(pharmacy) {
  if (!pharmacy || typeof pharmacy !== 'object') return null

  const nested =
    pharmacy.pharmacy_contact ||
    pharmacy.contact ||
    pharmacy.contact_details ||
    pharmacy.pharmacist_contact ||
    null

  const pick = (...vals) => {
    for (const v of vals) {
      const s = v != null ? String(v).trim() : ''
      if (s && s.toLowerCase() !== 'n/a' && s.toLowerCase() !== 'null') return s
    }
    return null
  }

  const phone = pick(
    pharmacy.phone,
    pharmacy.pharmacy_phone,
    pharmacy.contact_phone,
    pharmacy.pharmacist_phone,
    nested?.phone,
    nested?.pharmacy_phone,
    nested?.mobile
  )
  const whatsapp = pick(pharmacy.whatsapp, pharmacy.pharmacy_whatsapp, nested?.whatsapp)
  const email = pick(pharmacy.email, pharmacy.pharmacy_email, nested?.email)

  if (!phone && !whatsapp && !email) return null
  return { phone, whatsapp, email }
}

export function getContactFromReservePayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  return getPharmacyContact({
    phone: payload.pharmacy_phone ?? payload.phone,
    whatsapp: payload.pharmacy_whatsapp ?? payload.whatsapp,
    email: payload.pharmacy_email ?? payload.email,
    pharmacy_contact: payload.pharmacy_contact ?? payload.contact,
  })
}

export function mergeContact(primary, fallback) {
  if (!primary && !fallback) return null
  return {
    phone: primary?.phone || fallback?.phone || null,
    whatsapp: primary?.whatsapp || fallback?.whatsapp || null,
    email: primary?.email || fallback?.email || null,
  }
}

export function hasAnyContact(contact) {
  if (!contact) return false
  return Boolean(contact.phone || contact.whatsapp || contact.email)
}

/** In-stock row that is not the patient's requested medicine (pharmacist suggestion). */
export function medicineRowIsPharmacistAlternative(med, requestedMedicines) {
  if (!med) return false
  if (med.from_pharmacist_only === true || med.from_pharmacist_only === 'true') return true
  if (med.is_pharmacist_alternative === true || med.is_pharmacist_alternative === 'true') return true
  if (med.pharmacist_alternative === true) return true

  const requested = (Array.isArray(requestedMedicines) ? requestedMedicines : []).filter(Boolean)
  if (requested.length === 0) return false

  const rowName = med.medicine || med.medicine_name
  if (!rowName) return false

  return !requested.some((requestedName) => medicineNamesMatchRequest(rowName, requestedName))
}

export function isPharmacyUnavailableReserveError(payload, rawMessage) {
  if (!payload || typeof payload !== 'object') {
    return UNAVAILABLE_RESERVE_RE.test(String(rawMessage || ''))
  }
  const code = String(payload.code || payload.error_code || '').toLowerCase()
  if (
    code === 'pharmacy_unavailable' ||
    code === 'holiday_mode' ||
    code === 'reservations_paused' ||
    code === 'not_accepting_reservations'
  ) {
    return true
  }
  if (payload.holiday_mode === true || payload.reservations_paused === true) return true
  return UNAVAILABLE_RESERVE_RE.test(
    String(payload.error || payload.detail || payload.message || rawMessage || '')
  )
}

export function unavailableReserveFeedback(pharmacyName, pharmacy = null) {
  const shop = String(pharmacyName || pharmacy?.pharmacy_name || 'This pharmacy').trim()
  const note = pharmacyUnavailablePatientMessage(pharmacy)
  const contact = getPharmacyContact(pharmacy)
  return {
    type: 'error',
    variant: 'pharmacy_unavailable',
    text: `**${shop}** is not accepting online reservations right now. ${note}`,
    contact: hasAnyContact(contact) ? contact : null,
    pharmacyName: shop,
  }
}

export function isPharmacistAlternativeReserveError(payload, rawMessage) {
  if (!payload || typeof payload !== 'object') {
    return NOT_FOUND_AT_PHARMACY_RE.test(String(rawMessage || ''))
  }
  const code = String(payload.code || payload.error_code || '').toLowerCase()
  if (
    code === 'pharmacist_alternative' ||
    code === 'alternative_medicine' ||
    code === 'cannot_reserve_alternative'
  ) {
    return true
  }
  if (payload.is_pharmacist_alternative === true || payload.pharmacist_alternative === true) {
    return true
  }
  return NOT_FOUND_AT_PHARMACY_RE.test(String(payload.error || payload.detail || rawMessage || ''))
}

export function alternativeReserveFeedback(medicineName, pharmacyName, pharmacy = null) {
  const contact = getPharmacyContact(pharmacy)
  return {
    type: 'error',
    variant: 'pharmacist_alternative',
    text: buildAlternativeReserveMessage(medicineName, pharmacyName),
    contact: hasAnyContact(contact) ? contact : null,
    pharmacyName,
    medicineName,
  }
}

export function buildAlternativeReserveMessage(medicineName, pharmacyName) {
  const med = String(medicineName || 'this medicine').trim() || 'this medicine'
  const shop = String(pharmacyName || 'the pharmacy').trim() || 'the pharmacy'
  return (
    `You cannot reserve **${med}** online — it is an **alternative medicine** suggested by ${shop}. ` +
    `Please call the pharmacy to arrange pickup.`
  )
}

export function buildReserveErrorFeedback({
  medicineName,
  pharmacyName,
  pharmacy = null,
  payload = null,
  rawMessage = '',
}) {
  if (isPharmacyUnavailableReserveError(payload, rawMessage)) {
    return unavailableReserveFeedback(pharmacyName, pharmacy)
  }

  const isAlt = isPharmacistAlternativeReserveError(payload, rawMessage)

  if (!isAlt) {
    const text = String(payload?.error || payload?.detail || rawMessage || 'Reserve failed.').trim()
    const contact = mergeContact(getContactFromReservePayload(payload), getPharmacyContact(pharmacy))
    return {
      type: 'error',
      text,
      variant: 'generic',
      contact: hasAnyContact(contact) ? contact : null,
      pharmacyName,
      medicineName,
    }
  }

  const contact = mergeContact(
    getContactFromReservePayload(payload),
    getPharmacyContact(pharmacy)
  )

  return {
    type: 'error',
    variant: 'pharmacist_alternative',
    text: buildAlternativeReserveMessage(medicineName, pharmacyName),
    contact: hasAnyContact(contact) ? contact : null,
    pharmacyName,
    medicineName,
  }
}

export function whatsappHref(number) {
  const digits = String(number || '').replace(/[^\d+]/g, '')
  if (!digits) return null
  return `https://wa.me/${digits.replace(/^\+/, '')}`
}

export function telHref(number) {
  const s = String(number || '').trim()
  if (!s) return null
  return `tel:${s.replace(/\s/g, '')}`
}
