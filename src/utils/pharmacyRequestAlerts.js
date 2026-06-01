/**
 * Pharmacist portal alerts: new patient requests + new reservations (sound + optional notification).
 * Sounds are loaded from /public/sounds/ (Vite serves public/ at site root).
 */

const SEEN_REQUEST_IDS_PREFIX = 'pharmacy_seen_request_ids_'
const SEEN_RESERVATION_IDS_PREFIX = 'pharmacy_seen_reservation_ids_'
const SOUNDS_ENABLED_KEY = 'pharmacy_request_sounds'
const SOUNDS_UNLOCKED_KEY = 'pharmacy_sounds_unlocked'

/** Files in public/sounds/ */
export const SOUND_URL_REQUEST = '/sounds/new-request.mp3'
export const SOUND_URL_RESERVATION = '/sounds/new-reservation.mp3'

let requestAudio = null
let reservationAudio = null

function createPublicAudio(src) {
  const el = new Audio(src)
  el.preload = 'auto'
  return el
}

function getRequestAudio() {
  if (!requestAudio) requestAudio = createPublicAudio(SOUND_URL_REQUEST)
  return requestAudio
}

function getReservationAudio() {
  if (!reservationAudio) reservationAudio = createPublicAudio(SOUND_URL_RESERVATION)
  return reservationAudio
}

async function playPublicAudio(el) {
  if (!el) return
  try {
    el.currentTime = 0
    await el.play()
  } catch {
    /* autoplay blocked or missing file */
  }
}

export function getMedicineRequestId(request) {
  if (!request || typeof request !== 'object') return ''
  const id = request.request_id ?? request.id ?? request.medicine_request_id
  return id != null ? String(id) : ''
}

export function getReservationId(reservation) {
  if (!reservation || typeof reservation !== 'object') return ''
  const id = reservation.reservation_id ?? reservation.id
  return id != null ? String(id) : ''
}

export function isRequestExpired(expiresAt) {
  if (!expiresAt) return false
  const t = new Date(expiresAt).getTime()
  return Number.isFinite(t) && t < Date.now()
}

export function isActionableNewRequest(request) {
  const id = getMedicineRequestId(request)
  if (!id) return false
  if (request.declined === true) return false
  if (request.has_responded === true) return false
  if (isRequestExpired(request.expires_at)) return false
  const status = String(request.status || '').toLowerCase()
  if (status === 'expired' || status === 'cancelled' || status === 'canceled') return false
  return true
}

export function isActionableNewReservation(reservation) {
  const id = getReservationId(reservation)
  if (!id) return false
  const s = String(reservation.status || 'pending').toLowerCase()
  if (['completed', 'picked_up', 'collected', 'fulfilled', 'cancelled', 'canceled', 'expired'].includes(s)) {
    return false
  }
  return s === 'pending' || s === 'reserved' || s === 'active' || s === 'awaiting_confirmation'
}

export function loadSeenRequestIds(pharmacistId) {
  if (!pharmacistId) return new Set()
  try {
    const raw = localStorage.getItem(`${SEEN_REQUEST_IDS_PREFIX}${pharmacistId}`)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

export function saveSeenRequestIds(pharmacistId, idSet) {
  if (!pharmacistId || !idSet) return
  const arr = [...idSet].slice(-500)
  localStorage.setItem(`${SEEN_REQUEST_IDS_PREFIX}${pharmacistId}`, JSON.stringify(arr))
}

export function loadSeenReservationIds(pharmacistId) {
  if (!pharmacistId) return new Set()
  try {
    const raw = localStorage.getItem(`${SEEN_RESERVATION_IDS_PREFIX}${pharmacistId}`)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

export function saveSeenReservationIds(pharmacistId, idSet) {
  if (!pharmacistId || !idSet) return
  const arr = [...idSet].slice(-500)
  localStorage.setItem(`${SEEN_RESERVATION_IDS_PREFIX}${pharmacistId}`, JSON.stringify(arr))
}

export function isRequestSoundsEnabled() {
  try {
    return localStorage.getItem(SOUNDS_ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setRequestSoundsEnabled(enabled) {
  try {
    localStorage.setItem(SOUNDS_ENABLED_KEY, enabled ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

export function isRequestSoundsUnlocked() {
  try {
    return localStorage.getItem(SOUNDS_UNLOCKED_KEY) === '1'
  } catch {
    return false
  }
}

export function markRequestSoundsUnlocked() {
  try {
    localStorage.setItem(SOUNDS_UNLOCKED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function shouldPlayPharmacyAlerts({ acceptingRequests, soundsEnabled }) {
  return Boolean(acceptingRequests && soundsEnabled !== false)
}

/** Preload public/sounds MP3s (after unlock). */
export function primePharmacyAlertSounds() {
  if (!isRequestSoundsUnlocked()) return
  try {
    getRequestAudio().load()
    getReservationAudio().load()
  } catch {
    /* ignore */
  }
}

/** Call once after user interaction to satisfy autoplay policy. */
export async function unlockRequestSounds() {
  markRequestSoundsUnlocked()
  const req = getRequestAudio()
  const res = getReservationAudio()
  for (const el of [req, res]) {
    try {
      const prevVol = el.volume
      el.volume = 0.01
      el.currentTime = 0
      await el.play()
      el.pause()
      el.currentTime = 0
      el.volume = prevVol
    } catch {
      /* first play may fail until gesture — ok */
    }
  }
}

export async function playNewRequestSound() {
  await playPublicAudio(getRequestAudio())
}

export async function playNewReservationSound() {
  await playPublicAudio(getReservationAudio())
}

export function getRequestAlertSummary(request) {
  const meds = request.medicine_names || request.medicines || request.medicine_name
  const medLine = Array.isArray(meds) ? meds.join(', ') : meds || 'Medicine request'
  const loc = request.location_address || request.patient_location || ''
  return { medLine: String(medLine), loc: loc ? String(loc) : '' }
}

export function getReservationAlertSummary(reservation) {
  const med = reservation.medicine_name || reservation.medicine || 'Medicine'
  const qty = reservation.quantity != null ? ` × ${reservation.quantity}` : ''
  const patient = reservation.patient_name || reservation.patient_phone || ''
  return {
    medLine: `${med}${qty}`,
    patient: patient ? String(patient) : '',
  }
}

export function showNewRequestNotification(request) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const { medLine, loc } = getRequestAlertSummary(request)
  const body = loc ? `${medLine} · ${loc}` : medLine
  try {
    const n = new Notification('New patient request', {
      body,
      tag: `mediconnect-request-${getMedicineRequestId(request)}`,
      requireInteraction: false,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* ignore */
  }
}

export function showNewReservationNotification(reservation) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const { medLine, patient } = getReservationAlertSummary(reservation)
  const body = patient ? `${medLine} · ${patient}` : medLine
  try {
    const n = new Notification('New reservation', {
      body,
      tag: `mediconnect-reservation-${getReservationId(reservation)}`,
      requireInteraction: false,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* ignore */
  }
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function collectNewActionableRequests(requests, seenSet, { seedOnly = false } = {}) {
  const list = Array.isArray(requests) ? requests : []
  const fresh = []
  for (const r of list) {
    const id = getMedicineRequestId(r)
    if (!id) continue
    const alreadySeen = seenSet.has(id)
    seenSet.add(id)
    if (!seedOnly && !alreadySeen && isActionableNewRequest(r)) {
      fresh.push(r)
    }
  }
  return fresh
}

export function collectNewActionableReservations(reservations, seenSet, { seedOnly = false } = {}) {
  const list = Array.isArray(reservations) ? reservations : []
  const fresh = []
  for (const r of list) {
    const id = getReservationId(r)
    if (!id) continue
    const alreadySeen = seenSet.has(id)
    seenSet.add(id)
    if (!seedOnly && !alreadySeen && isActionableNewReservation(r)) {
      fresh.push(r)
    }
  }
  return fresh
}

export const REQUEST_POLL_MS_ACTIVE = 25000
export const REQUEST_POLL_MS_PAUSED = 180000
