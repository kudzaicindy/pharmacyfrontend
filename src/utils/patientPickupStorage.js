/**

 * Browser persistence for guest/logged-in patient medicine searches (no dashboard required).

 */



import { getPatientRequestDetail, getPatientSessionIds } from './api'
import { formatReservationStatusForPatient as formatReservationStatusI18n } from './i18n'



export const PICKUP_STORAGE_KEYS = {

  LAST_REQUEST_ID: 'last_medicine_request_id',

  PICKUP_SNAPSHOT: 'last_pickup_snapshot',

}



const ACTIVE_RESERVATION_STATUSES = new Set(['pending', 'confirmed', 'active', 'reserved', 'awaiting_confirmation'])



export function isActiveReservationStatus(status) {

  const s = String(status || '').toLowerCase().trim()

  if (!s) return false

  if (['completed', 'picked_up', 'collected', 'fulfilled', 'cancelled', 'canceled', 'expired', 'declined'].includes(s)) {

    return false

  }

  return ACTIVE_RESERVATION_STATUSES.has(s) || s.includes('pending') || s.includes('confirm')

}



export function formatReservationStatusForPatient(status, uiLang) {
  let lang = uiLang
  if (!lang) {
    try {
      lang = localStorage.getItem('healthconnect_language') || 'EN'
    } catch {
      lang = 'EN'
    }
  }
  return formatReservationStatusI18n(status, lang)
}



/** Normalize reservation from POST /reserve/, request detail, or ranked row. */

export function normalizePatientReservation(raw, fallback = {}) {

  if (!raw || typeof raw !== 'object') return null

  const nested = raw.reservation && typeof raw.reservation === 'object' ? raw.reservation : null

  const src = nested || raw

  const pharmacy_id = src.pharmacy_id ?? raw.pharmacy_id ?? fallback.pharmacy_id ?? null

  const pharmacy_name =

    src.pharmacy_name ?? raw.pharmacy_name ?? fallback.pharmacy_name ?? null

  const reservation_id =

    src.reservation_id ?? src.id ?? raw.reservation_id ?? raw.id ?? null

  if (!pharmacy_id && !pharmacy_name && !reservation_id) return null

  const status = String(src.status ?? raw.status ?? 'pending').toLowerCase()

  return {

    reservation_id: reservation_id != null ? String(reservation_id) : undefined,

    request_id:

      src.request_id ?? src.medicine_request_id ?? raw.request_id ?? raw.medicine_request_id ?? fallback.request_id,

    pharmacy_id: pharmacy_id != null ? String(pharmacy_id) : undefined,

    pharmacy_name: pharmacy_name || undefined,

    medicine_name: src.medicine_name ?? raw.medicine_name ?? fallback.medicine_name,

    quantity: src.quantity ?? raw.quantity ?? fallback.quantity ?? 1,

    status,

    confirmed_at: src.confirmed_at ?? raw.confirmed_at ?? null,

    created_at: src.created_at ?? src.reserved_at ?? raw.created_at ?? raw.reserved_at ?? null,

    expires_at: src.expires_at ?? raw.expires_at ?? null,

    updated_at: new Date().toISOString(),

  }

}



export function getSnapshotReservations(snapshot) {

  if (!snapshot || typeof snapshot !== 'object') return []

  if (Array.isArray(snapshot.reservations) && snapshot.reservations.length > 0) {

    return snapshot.reservations.filter(Boolean)

  }

  if (snapshot.reservation_id || snapshot.reserved_pharmacy_id || snapshot.reservation_status) {

    const one = normalizePatientReservation(

      {

        reservation_id: snapshot.reservation_id,

        pharmacy_id: snapshot.reserved_pharmacy_id || snapshot.pharmacy_id,

        pharmacy_name: snapshot.pharmacy_name,

        medicine_name: snapshot.reserved_medicine_name,

        quantity: snapshot.reserved_quantity,

        status: snapshot.reservation_status,

        confirmed_at: snapshot.reservation_confirmed_at,

      },

      snapshot

    )

    return one ? [one] : []

  }

  return []

}



export function getReservedPharmacyIdSet(snapshot) {

  const ids = new Set()

  for (const r of getSnapshotReservations(snapshot)) {

    if (r.pharmacy_id && isActiveReservationStatus(r.status)) ids.add(String(r.pharmacy_id))

  }

  return ids

}



export function getPrimaryActiveReservation(snapshot) {

  const active = getSnapshotReservations(snapshot).filter((r) => isActiveReservationStatus(r.status))

  if (active.length === 0) return null

  active.sort((a, b) => {

    const da = new Date(b.updated_at || b.confirmed_at || b.created_at || 0).getTime()

    const db = new Date(a.updated_at || a.confirmed_at || a.created_at || 0).getTime()

    return da - db

  })

  return active[0]

}



export function findPharmacyReservation(snapshot, pharmacyId) {

  if (!pharmacyId) return null

  const id = String(pharmacyId)

  return (

    getSnapshotReservations(snapshot).find(

      (r) => String(r.pharmacy_id) === id && isActiveReservationStatus(r.status)

    ) || null

  )

}



export function extractReservationsFromPayload(payload) {

  if (!payload || typeof payload !== 'object') return []

  const lists = []

  if (Array.isArray(payload.reservations)) lists.push(...payload.reservations)

  if (Array.isArray(payload.active_reservations)) lists.push(...payload.active_reservations)

  if (payload.active_reservation) lists.push(payload.active_reservation)

  if (payload.reservation) lists.push(payload.reservation)

  const responses =

    payload.pharmacy_responses || payload.responses || payload.pharmacy_names || []

  if (Array.isArray(responses)) {

    for (const row of responses) {

      if (!row || typeof row !== 'object') continue

      if (row.patient_reservation) lists.push(row.patient_reservation)

      if (row.reservation) lists.push(row.reservation)

      if (row.has_reservation || row.reservation_status || row.reservation_id) {

        lists.push({

          reservation_id: row.reservation_id,

          pharmacy_id: row.pharmacy_id,

          pharmacy_name: row.pharmacy_name,

          status: row.reservation_status || row.patient_reservation_status,

          medicine_name: row.reserved_medicine_name || row.medicine_name,

        })

      }

    }

  }

  const normalized = []

  const seen = new Set()

  for (const raw of lists) {

    const r = normalizePatientReservation(raw)

    if (!r) continue

    const key = `${r.reservation_id || ''}:${r.pharmacy_id || ''}:${r.status}`

    if (seen.has(key)) continue

    seen.add(key)

    normalized.push(r)

  }

  return normalized

}



export function mergeReservationsIntoSnapshot(snapshot, incoming) {

  const base = snapshot && typeof snapshot === 'object' ? { ...snapshot } : {}

  const existing = getSnapshotReservations(base)

  const byKey = new Map()

  for (const r of existing) {

    const k = r.reservation_id || `${r.pharmacy_id}:${r.medicine_name}`

    if (k) byKey.set(k, r)

  }

  for (const raw of incoming || []) {

    const r = normalizePatientReservation(raw)

    if (!r) continue

    const k = r.reservation_id || `${r.pharmacy_id}:${r.medicine_name}`

    if (!k) continue

    const prev = byKey.get(k)

    byKey.set(k, prev ? { ...prev, ...r, updated_at: r.updated_at } : r)

  }

  const reservations = [...byKey.values()]

  const primary = pickDisplayReservation(reservations, base)

  return {

    ...base,

    reservations,

    active_reservation: primary || undefined,

    reservation_id: primary?.reservation_id ?? base.reservation_id,

    reserved_pharmacy_id: primary?.pharmacy_id ?? base.reserved_pharmacy_id,

    reservation_status: primary?.status ?? base.reservation_status,

    reservation_confirmed_at: primary?.confirmed_at ?? base.reservation_confirmed_at,

    reserved_medicine_name: primary?.medicine_name ?? base.reserved_medicine_name,

    pharmacy_id: primary?.pharmacy_id ?? base.pharmacy_id,

    pharmacy_name: primary?.pharmacy_name ?? base.pharmacy_name,

  }

}



function pickDisplayReservation(reservations, snapshot) {

  const active = (reservations || []).filter((r) => isActiveReservationStatus(r.status))

  if (active.length > 0) return getPrimaryActiveReservation({ reservations: active })

  return reservations[0] || getPrimaryActiveReservation(snapshot) || null

}



export function getResumeContext() {

  return {

    requestId: localStorage.getItem(PICKUP_STORAGE_KEYS.LAST_REQUEST_ID) || null,

    conversationId: localStorage.getItem('chatbot_conversation_id') || null,

    sessionId: localStorage.getItem('chatbot_session_id') || null,

  }

}



export function persistResumeContext({ requestId, conversationId, shortRequestId, medicines, locationAddress }) {

  if (requestId != null && requestId !== '') {

    localStorage.setItem(PICKUP_STORAGE_KEYS.LAST_REQUEST_ID, String(requestId))

  }

  if (conversationId) {

    localStorage.setItem('chatbot_conversation_id', conversationId)

  }

  const snap = getPickupSnapshot()

  if (snap || shortRequestId || medicines || locationAddress) {

    savePickupSnapshot({

      ...(snap || {}),

      request_id: requestId != null ? String(requestId) : snap?.request_id,

      conversation_id: conversationId || snap?.conversation_id,

      short_request_id: shortRequestId ?? snap?.short_request_id,

      medicines: medicines ?? snap?.medicines,

      location_address: locationAddress ?? snap?.location_address,

    })

  }

}



export function clearResumeContext() {

  localStorage.removeItem(PICKUP_STORAGE_KEYS.LAST_REQUEST_ID)

  localStorage.removeItem(PICKUP_STORAGE_KEYS.PICKUP_SNAPSHOT)

  localStorage.removeItem('chatbot_conversation_id')

}



export function savePickupSnapshot(snapshot) {

  if (!snapshot || typeof snapshot !== 'object') return

  localStorage.setItem(

    PICKUP_STORAGE_KEYS.PICKUP_SNAPSHOT,

    JSON.stringify({ ...snapshot, updated_at: new Date().toISOString() })

  )

}



export function getPickupSnapshot() {

  try {

    const raw = localStorage.getItem(PICKUP_STORAGE_KEYS.PICKUP_SNAPSHOT)

    if (!raw) return null

    return JSON.parse(raw)

  } catch {

    return null

  }

}



function pharmacyHasStock(pharmacy) {

  if (!pharmacy) return false

  if (pharmacy.medicine_available === true || pharmacy.medicine_available === 'true') return true

  const rows = [

    ...(Array.isArray(pharmacy.medicine_responses) ? pharmacy.medicine_responses : []),

    ...(Array.isArray(pharmacy.medicines_breakdown) ? pharmacy.medicines_breakdown : []),

    ...(Array.isArray(pharmacy.medicines) ? pharmacy.medicines : []),

  ]

  return rows.some((m) => {

    if (m?.available === false || m?.available === 'false') return false

    if (m?.available === true || m?.available === 'true') return true

    const p = m?.price

    return p != null && String(p).trim() !== '' && String(p).toLowerCase() !== 'n/a'

  })

}



/** Pick best pharmacy row for directions banner / snapshot. */

export function pickRecommendedPharmacy(responses, recommendation) {

  const list = Array.isArray(responses) ? responses : []

  const recName = recommendation?.recommended_pharmacy

  if (recName) {

    const match = list.find((p) => p.pharmacy_name === recName)

    if (match) return match

  }

  const useful = list.filter(pharmacyHasStock)

  const sorted = [...(useful.length ? useful : list)].sort(

    (a, b) => (a.rank ?? 999) - (b.rank ?? 999) || Number(a.distance_km ?? 999) - Number(b.distance_km ?? 999)

  )

  return sorted[0] || null

}



export function buildPickupSnapshot({

  requestId,

  conversationId,

  shortRequestId,

  medicines,

  locationAddress,

  responses,

  recommendation,

  pharmacy,

}) {

  const prev = getPickupSnapshot()

  const reqStr = requestId != null ? String(requestId) : undefined

  const prevReq = prev?.request_id != null ? String(prev.request_id) : undefined

  const keepReservations = reqStr && prevReq && reqStr === prevReq ? getSnapshotReservations(prev) : []



  const top = pharmacy || pickRecommendedPharmacy(responses, recommendation)

  const primaryRes = pickDisplayReservation(keepReservations, prev)

  const displayPharmacy =

    primaryRes?.pharmacy_id || primaryRes?.pharmacy_name

      ? {

          pharmacy_id: primaryRes.pharmacy_id,

          pharmacy_name: primaryRes.pharmacy_name,

          location_address: top?.location_address || top?.address,

          distance_km: top?.distance_km,

        }

      : top



  if (!displayPharmacy && !top && !requestId) return null

  const address =

    displayPharmacy?.location_address ||

    top?.location_address ||

    top?.address ||

    top?.location_suburb ||

    top?.suburb ||

    locationAddress ||

    ''



  const base = {

    request_id: reqStr,

    conversation_id: conversationId || undefined,

    short_request_id: shortRequestId || undefined,

    medicines: Array.isArray(medicines) ? medicines : [],

    location_address: locationAddress || undefined,

    pharmacy_id: displayPharmacy?.pharmacy_id ?? top?.pharmacy_id,

    pharmacy_name: displayPharmacy?.pharmacy_name || top?.pharmacy_name || undefined,

    address,

    distance_km: displayPharmacy?.distance_km ?? top?.distance_km,

    status: 'active',

    reservations: keepReservations,

  }

  return primaryRes ? mergeReservationsIntoSnapshot(base, []) : base

}



export function recordReservationInSnapshot(reserveResult, { pharmacyId, pharmacyName, medicineName, quantity, requestId, conversationId }) {

  const snap = getPickupSnapshot() || {}

  const reservation = normalizePatientReservation(reserveResult, {

    pharmacy_id: pharmacyId,

    pharmacy_name: pharmacyName,

    medicine_name: medicineName,

    quantity,

    request_id: requestId,

  })

  const merged = mergeReservationsIntoSnapshot(

    {

      ...snap,

      request_id: requestId != null ? String(requestId) : snap.request_id,

      conversation_id: conversationId || snap.conversation_id,

      pharmacy_id: pharmacyId,

      pharmacy_name: pharmacyName,

      reserved_medicine_name: medicineName,

    },

    reservation ? [reservation] : []

  )

  if (reserveResult?.message) merged.reservation_message = reserveResult.message

  savePickupSnapshot(merged)

  return merged

}



/** GET /patient/requests/{id}/ — merge reservations into local snapshot. */

export async function refreshPickupReservationsFromBackend(requestId) {

  const ctx = getResumeContext()

  const rid = requestId || ctx.requestId

  if (!rid) return getPickupSnapshot()



  const { sessionId, conversationId } = getPatientSessionIds()

  const sid = sessionId || ctx.sessionId

  const cid = conversationId || ctx.conversationId

  if (!sid && !cid) return getPickupSnapshot()



  try {

    const detail = await getPatientRequestDetail(rid, sid, cid)

    const incoming = extractReservationsFromPayload(detail)

    const snap = getPickupSnapshot() || {}

    const merged = mergeReservationsIntoSnapshot(

      {

        ...snap,

        request_id: String(rid),

        conversation_id: cid || snap.conversation_id,

        short_request_id: detail.short_request_id ?? snap.short_request_id,

        medicines: detail.medicine_names ?? snap.medicines,

        location_address: detail.location_address ?? snap.location_address,

      },

      incoming

    )

    savePickupSnapshot(merged)

    return merged

  } catch {

    return getPickupSnapshot()

  }

}



export function hasActivePickup() {

  const snap = getPickupSnapshot()

  const ctx = getResumeContext()

  const hasReservation = Boolean(getPrimaryActiveReservation(snap))

  return Boolean(

    hasReservation ||

    (snap?.pharmacy_name && snap?.request_id) ||

    (ctx.requestId && ctx.conversationId)

  )

}



export function hasActiveReservation(snapshot = getPickupSnapshot()) {

  return Boolean(getPrimaryActiveReservation(snapshot))

}


