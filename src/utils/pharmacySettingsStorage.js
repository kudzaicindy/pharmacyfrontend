/**
 * Pharmacy portal settings — form fields + API operations shape from GET/PATCH /pharmacist/settings/
 */

export const DEFAULT_OPERATIONS_FORM = {
  opening_hours_text: '',
  weekday_open: '08:00',
  weekday_close: '18:00',
  holiday_notes: '',
  holiday_mode: false,
}

/** @deprecated alias */
export const DEFAULT_OPERATIONS_SETTINGS = DEFAULT_OPERATIONS_FORM

const UNAVAILABLE_NOTE_DEFAULT = 'We are currently unavailable'

/** True when closure notes mean the pharmacy is not taking reservations. */
export function isUnavailableHolidayNotes(notes) {
  const t = String(notes || '').trim().toLowerCase()
  if (!t) return false
  return /\bunavailable\b/.test(t) || /\bclosed\b/.test(t) || /\bnot accepting\b/.test(t)
}

/** Pharmacist operations / settings: reservations paused. */
export function pharmacyBlocksReservations(ops) {
  if (!ops || typeof ops !== 'object') return false
  if (ops.holiday_mode === true) return true
  if (ops.accepting_reservations === false) return true
  if (ops.reservations_paused === true) return true
  return isUnavailableHolidayNotes(ops.holiday_notes)
}

/**
 * Ranked `pharmacy_responses[]` row — block patient "Reserve" when pharmacy is closed/unavailable.
 * Backend should set `holiday_mode`, `holiday_notes`, and/or nest under `operations`.
 */
export function pharmacyRowBlocksPatientReserve(pharmacy) {
  if (!pharmacy || typeof pharmacy !== 'object') return false

  if (pharmacy.holiday_mode === true) return true
  if (pharmacy.reservations_paused === true) return true
  if (pharmacy.reservations_enabled === false) return true
  if (pharmacy.accepting_reservations === false) return true
  if (pharmacy.online_reservations === false) return true

  for (const key of [
    'holiday_notes',
    'closure_note',
    'public_notice',
    'status_message',
    'availability_note',
  ]) {
    if (isUnavailableHolidayNotes(pharmacy[key])) return true
  }

  if (pharmacy.operations) return pharmacyBlocksReservations(pharmacy.operations)

  return false
}

export function pharmacyUnavailablePatientMessage(pharmacy) {
  if (!pharmacy) return 'This pharmacy is currently unavailable.'
  const note =
    pharmacy.holiday_notes ||
    pharmacy.closure_note ||
    pharmacy.public_notice ||
    pharmacy.status_message ||
    pharmacy.operations?.holiday_notes
  return String(note || '').trim() || 'This pharmacy is currently unavailable.'
}

/** Map API `operations` (nested opening_hours) → flat form for the UI. */
export function operationsFormFromApi(raw) {
  const d = DEFAULT_OPERATIONS_FORM
  if (!raw || typeof raw !== 'object') return { ...d }

  const oh =
    raw.opening_hours && typeof raw.opening_hours === 'object' ? raw.opening_hours : raw

  const notes = String(raw.holiday_notes ?? oh.holiday_notes ?? d.holiday_notes).trim()
  let holiday_mode = raw.holiday_mode === true
  if (!holiday_mode && isUnavailableHolidayNotes(notes)) holiday_mode = true

  return {
    opening_hours_text: String(
      oh.opening_hours_text ?? raw.opening_hours_text ?? d.opening_hours_text
    ),
    weekday_open:
      String(oh.weekday_open ?? raw.weekday_open ?? d.weekday_open).slice(0, 5) || d.weekday_open,
    weekday_close:
      String(oh.weekday_close ?? raw.weekday_close ?? d.weekday_close).slice(0, 5) ||
      d.weekday_close,
    holiday_notes: notes,
    holiday_mode,
  }
}

/** @deprecated use operationsFormFromApi */
export function normalizeOperationsSettings(raw) {
  return operationsFormFromApi(raw)
}

/** Build PATCH `operations` body matching backend shape. */
export function buildOperationsApiPatch(form, opts = {}) {
  const base =
    opts.mergeFrom && typeof opts.mergeFrom === 'object' ? { ...opts.mergeFrom } : {}
  const flat = operationsFormFromApi(form)
  const notes = flat.holiday_notes.trim()
  const unavailable = flat.holiday_mode || isUnavailableHolidayNotes(notes)

  const opening_hours = {
    ...(base.opening_hours && typeof base.opening_hours === 'object' ? base.opening_hours : {}),
    weekday_open: flat.weekday_open,
    weekday_close: flat.weekday_close,
    opening_hours_text: flat.opening_hours_text,
  }

  const patch = {
    ...base,
    opening_hours,
    holiday_notes: notes || (unavailable ? UNAVAILABLE_NOTE_DEFAULT : ''),
    holiday_mode: unavailable,
    auto_accept_reservations: unavailable ? false : base.auto_accept_reservations ?? false,
  }

  if (opts.acceptingRequests !== undefined) {
    patch.accepting_requests = Boolean(opts.acceptingRequests)
  }

  return patch
}

export function readPharmacistStorage() {
  try {
    const raw = localStorage.getItem('pharmacist')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writePharmacistStorage(parsed) {
  if (!parsed || typeof parsed !== 'object') return
  localStorage.setItem('pharmacist', JSON.stringify(parsed))
}

export function loadOperationsFromStorage() {
  const parsed = readPharmacistStorage()
  const ops =
    parsed?.pharmacy?.operations ??
    parsed?.operations ??
    parsed?.settings?.operations
  return operationsFormFromApi(ops)
}

export function saveOperationsToStorage(form, opts = {}) {
  const parsed = readPharmacistStorage() || {}
  const next = buildOperationsApiPatch(form, {
    mergeFrom: parsed?.pharmacy?.operations ?? parsed?.operations,
    ...opts,
  })
  const pharmacy = { ...(parsed.pharmacy || {}), operations: next }
  writePharmacistStorage({ ...parsed, pharmacy, operations: next })
  return next
}

const PROFILE_KEYS = [
  'name',
  'display_name',
  'license_number',
  'tax_number',
  'address',
  'phone',
  'whatsapp',
  'email',
  'website',
  'description',
]

/** @param {object|null|undefined} raw */
export function normalizeProfileSettings(raw) {
  const empty = Object.fromEntries(PROFILE_KEYS.map((k) => [k, '']))
  if (!raw || typeof raw !== 'object') return empty
  const out = { ...empty }
  for (const key of PROFILE_KEYS) {
    if (raw[key] != null) out[key] = String(raw[key]).trim()
  }
  return out
}

export function loadProfileFromStorage() {
  const parsed = readPharmacistStorage()
  const fromPharmacy = parsed?.pharmacy
  const fromProfile = parsed?.profile ?? parsed?.settings?.profile
  return normalizeProfileSettings({ ...fromPharmacy, ...fromProfile })
}

export function saveProfileToStorage(profile) {
  const parsed = readPharmacistStorage() || {}
  const next = normalizeProfileSettings(profile)
  const pharmacy = { ...(parsed.pharmacy || {}), ...next }
  writePharmacistStorage({ ...parsed, pharmacy, profile: next })
  return next
}
