/**
 * API Configuration
 *
 * Production: https://pharmacybackend-qpfe.onrender.com/api/chatbot
 * Development: set VITE_API_URL in .env or defaults to production.
 *
 * All chatbot endpoints are prefixed with the API_BASE_URL.
 */

import { fetchRankedGated, rankedFetchKey } from './rankedFetchGate';
import { locationToApiFields } from './chatLocation';
import { appendRankedDrugInteractionParams } from './drugInteractions';

const PRODUCTION_API_URL = 'https://pharmacybackend-qpfe.onrender.com/api/chatbot';
const DEV_API_URL = 'http://localhost:8000/api/chatbot';

// Use VITE_API_URL if set (e.g. in .env), else production in prod build, localhost in dev
const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? DEV_API_URL : PRODUCTION_API_URL);

/** Resolved chatbot API root (for admin diagnostics; same value used by all API helpers). */
export function getChatbotApiBaseUrl() {
  return API_BASE_URL;
}

// Endpoint paths
const ENDPOINTS = {
  CHAT: '/chat/',
  UPLOAD_PRESCRIPTION: '/upload-prescription/',
  GET_RANKED_RESPONSES: (requestId) => `/request/${requestId}/ranked/`,
  GET_CONVERSATION: (conversationId) => `/conversation/${conversationId}/`,
  REGISTER_PHARMACY: '/register/pharmacy/',
  REGISTER_PHARMACIST: '/register/pharmacist/',
  REGISTER_PATIENT: '/register/patient/',
  PHARMACIST_LOGIN: '/pharmacist/login/',
  PATIENT_LOGIN: '/patient/login/',
  ADMIN_LOGIN: '/admin/login/',
  ADMIN_LOGOUT: '/admin/logout/',
  /** Session + csrfToken in JSON (@ensure_csrf_cookie on backend). */
  ADMIN_ME: '/admin/me/',
  /** Optional: sets csrftoken cookie + returns csrfToken (AllowAny). */
  ADMIN_CSRF: '/admin/csrf/',
  GET_PHARMACIES: '/pharmacies/',
  PHARMACY_REQUESTS: (pharmacyId) => `/pharmacy/requests/?pharmacy_id=${pharmacyId}`,
  PHARMACIST_REQUESTS: (pharmacistId) => `/pharmacist/requests/?pharmacist_id=${pharmacistId}`,
  PHARMACY_RESPONSE: (requestId) => `/pharmacy/response/${requestId}/`,
  PHARMACIST_RESPONSE: (requestId) => `/pharmacist/response/${requestId}/`,
  PHARMACIST_INVENTORY: (pharmacistId) => `/pharmacist/inventory/?pharmacist_id=${pharmacistId}`,
  PHARMACIST_INVENTORY_UPDATE: '/pharmacist/inventory/',
  RATE_PHARMACY: '/rate-pharmacy/',
  CHECK_INTERACTIONS: '/check-interactions/',
  RESERVE: '/reserve/',
  RECORD_PURCHASE: '/record-purchase/',
  GET_REQUEST_RESPONSES: (requestId) => `/request/${requestId}/responses/`,
  PHARMACIST_RESERVATIONS: (pharmacistId) => `/pharmacist/reservations/?pharmacist_id=${pharmacistId}`,
  /** Portal ranking card: composite score, factor %, leaderboard (see docs/ADMIN_DASHBOARD_BACKEND_SPEC.md). */
  PHARMACIST_RANKING_SUMMARY: (pharmacistId) => `/pharmacist/${pharmacistId}/ranking-summary/`,
  PHARMACIST_RESERVATION_CONFIRM: (reservationId) => `/pharmacist/reservations/${reservationId}/confirm/`,
  PHARMACIST_RESERVATION_COMPLETE: (reservationId) => `/pharmacist/reservations/${reservationId}/complete/`,
  // Patient dashboard (use session_id or conversation_id)
  PATIENT_DASHBOARD_STATS: '/patient/dashboard/stats/',
  PATIENT_REQUESTS: '/patient/requests/',
  PATIENT_REQUEST_DETAIL: (requestId) => `/patient/requests/${requestId}/`,
  PATIENT_SAVED_MEDICINES: '/patient/saved-medicines/',
  PATIENT_SAVED_MEDICINES_REMOVE: '/patient/saved-medicines/remove/',
  PATIENT_NOTIFICATIONS: '/patient/notifications/',
  PATIENT_NOTIFICATIONS_MARK_READ: '/patient/notifications/mark-read/',
  PATIENT_PROFILE: '/patient/profile/',
  /** Password reset: email a one-time code (backend must implement). */
  AUTH_PASSWORD_RESET_REQUEST: '/auth/password-reset/request/',
  AUTH_PASSWORD_RESET_CONFIRM: '/auth/password-reset/confirm/',
  /** After login returns `requires_mfa` + `mfa_token`, POST OTP to complete session. */
  AUTH_MFA_LOGIN_COMPLETE: '/auth/mfa/login/complete/',
  /** Patient TOTP 2FA (session_id or conversation_id query). */
  PATIENT_MFA_STATUS: '/patient/mfa/status/',
  PATIENT_MFA_SETUP_START: '/patient/mfa/setup/start/',
  PATIENT_MFA_SETUP_CONFIRM: '/patient/mfa/setup/confirm/',
  PATIENT_MFA_DISABLE: '/patient/mfa/disable/',
  /** Pharmacist TOTP 2FA (pharmacist_id in JSON body). */
  PHARMACIST_MFA_STATUS: '/pharmacist/mfa/status/',
  PHARMACIST_MFA_SETUP_START: '/pharmacist/mfa/setup/start/',
  PHARMACIST_MFA_SETUP_CONFIRM: '/pharmacist/mfa/setup/confirm/',
  PHARMACIST_MFA_DISABLE: '/pharmacist/mfa/disable/',
  PHARMACIST_SETTINGS: '/pharmacist/settings/',
  ADMIN_DASHBOARD_DATA: '/admin/dashboard/data/',
  /** Full MediBot dashboard payload (layers 1–5 + widgets + nav_badges). Requires admin session cookies. */
  ADMIN_MEDI_BOT_OVERVIEW: '/admin/overview/medi-bot/',
  /** Lighter bundle: system_alerts, safety_policies, chatbot_policy, generated_at. Staff/admin session. */
  ADMIN_CHATBOT_DASHBOARD_WIDGETS: '/admin/dashboard/widgets/',
  /** Per medicine request: same ranked list as patient flow (`get_ranked_pharmacy_responses`, limit≈20). Not the portal leaderboard. */
  ADMIN_REQUEST_DETAIL: (requestId) => `/admin/requests/${requestId}/`,
  ADMIN_PATIENT_OVERVIEW: (sessionId) => `/admin/patients/${sessionId}/overview/`,
  ADMIN_PATIENT_PROFILE: (sessionId) => `/admin/patients/${sessionId}/profile/`,
  ADMIN_PATIENT_SAVED: (sessionId) => `/admin/patients/${sessionId}/saved-medicines/`,
  ADMIN_PATIENT_SAVED_CLEAR: (sessionId) => `/admin/patients/${sessionId}/saved-medicines/clear/`,
  ADMIN_PATIENT_NOTIFS: (sessionId) => `/admin/patients/${sessionId}/notifications/`,
  ADMIN_PATIENT_NOTIFS_CLEAR: (sessionId) => `/admin/patients/${sessionId}/notifications/clear/`,
  ADMIN_CONTROL_CENTER: '/admin/control/center/',
  ADMIN_REQUEST_STATUS: (requestId) => `/admin/requests/${requestId}/status/`,
  ADMIN_RESERVATION_STATUS: (reservationId) => `/admin/reservations/${reservationId}/status/`,
  ADMIN_PHARMACIES: '/admin/pharmacies/',
  /** Dedicated status/governance patch (registered before generic /<id>/ on the server). */
  ADMIN_PHARMACY_STATUS: (id) => `/admin/pharmacies/${encodeURIComponent(String(id))}/status/`,
  ADMIN_PHARMACY_UPDATE: (id) => `/admin/pharmacies/${encodeURIComponent(String(id))}/`,
  ADMIN_PHARMACY_DELETE: (id) => `/admin/pharmacies/${encodeURIComponent(String(id))}/delete/`,
  ADMIN_PHARMACISTS: '/admin/pharmacists/',
  ADMIN_PHARMACIST_UPDATE: (id) => `/admin/pharmacists/${id}/`,
  ADMIN_PHARMACIST_DELETE: (id) => `/admin/pharmacists/${id}/delete/`,
  ADMIN_PHARMACIES_EXPORT: '/admin/pharmacies/export/',
  ADMIN_ANALYTICS_SEARCH_VOLUME: '/admin/analytics/search-volume/',
  ADMIN_AUDIT_LOGS: '/admin/audit/logs/',
  ADMIN_USERS_LIST: '/admin/users/',
  ADMIN_PATIENTS_LIST: '/admin/patients-list/',
  ADMIN_CHATBOT_LOGS: '/admin/chatbot/logs/',
  ADMIN_CHATBOT_LOG_DETAIL: (conversationId) => `/admin/chatbot/logs/${encodeURIComponent(String(conversationId))}/`,
  /** Merged PlatformAdminSettings + optional disclaimer / weights (staff session). */
  ADMIN_CHATBOT_POLICY: '/admin/chatbot/policy/',
  /** Ranking engine + `active_ranking_profile` / `standard_weights` (staff session). */
  ADMIN_RANKING_CONFIG: '/admin/ranking/config/',
  /** AI narrative for admin PDF/system reports. */
  ADMIN_REPORTS_GENERATE: '/admin/reports/generate/',
};

// ----- Admin Django session CSRF (X-CSRFToken + csrftoken cookie) -----
const ADMIN_CSRF_STORAGE_KEY = 'medi_admin_csrf_token'

/** Persist token from login / GET admin/me / GET admin/csrf JSON. */
export function setAdminCsrfToken(token) {
  const t = typeof token === 'string' ? token.trim() : ''
  if (t) {
    try {
      sessionStorage.setItem(ADMIN_CSRF_STORAGE_KEY, t)
    } catch {
      /* ignore */
    }
  }
}

export function clearAdminCsrfToken() {
  try {
    sessionStorage.removeItem(ADMIN_CSRF_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function getAdminCsrfToken() {
  try {
    return sessionStorage.getItem(ADMIN_CSRF_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

/**
 * When the SPA and API share an origin (e.g. Vite proxy to Django), the csrftoken cookie is readable
 * and must be mirrored to X-CSRFToken for unsafe methods. Cross-origin API hosts cannot read this cookie.
 */
function tryReadCsrfFromBrowserCookie() {
  if (typeof document === 'undefined') return ''
  try {
    const apiOrigin = new URL(API_BASE_URL).origin
    if (typeof window !== 'undefined' && apiOrigin !== window.location.origin) return ''
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)
    return m ? decodeURIComponent(String(m[1]).trim()) : ''
  } catch {
    return ''
  }
}

/** Extract csrfToken from API JSON (camelCase or snake_case). */
export function applyAdminCsrfFromResponse(data) {
  if (!data || typeof data !== 'object') return null
  const t = data.csrfToken ?? data.csrf_token ?? data.csrf
  if (typeof t === 'string' && t.trim()) {
    setAdminCsrfToken(t)
    return t.trim()
  }
  return null
}

/** Apply CSRF from any admin JSON body (GET overview, lists, etc.) when the backend includes it. */
async function parseAdminJsonResponseWithCsrf(res) {
  const data = await res.json()
  applyAdminCsrfFromResponse(data)
  return data
}

/**
 * GET /admin/me/ — refresh session info and CSRF for writes (credentials: include).
 * @returns {Promise<Object>}
 */
export async function getAdminMe() {
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_ME}`
  const res = await fetch(url, { credentials: 'include' })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!res.ok) {
    const err = new Error(data.detail || data.error || data.message || 'Admin session check failed')
    err.status = res.status
    throw err
  }
  applyAdminCsrfFromResponse(data)
  return data
}

/**
 * GET /admin/csrf/ — cookie + csrfToken when not yet logged in (optional).
 * @returns {Promise<Object>}
 */
export async function fetchAdminCsrfCookie() {
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_CSRF}`
  const res = await fetch(url, { credentials: 'include' })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!res.ok) {
    const err = new Error(data.detail || data.error || data.message || 'Failed to load CSRF cookie')
    err.status = res.status
    throw err
  }
  applyAdminCsrfFromResponse(data)
  return data
}

async function ensureAdminCsrfForWrite() {
  if (getAdminCsrfToken()) return
  const c0 = tryReadCsrfFromBrowserCookie()
  if (c0) {
    setAdminCsrfToken(c0)
    return
  }
  await getAdminMe().catch(() => {})
  if (getAdminCsrfToken()) return
  const c1 = tryReadCsrfFromBrowserCookie()
  if (c1) {
    setAdminCsrfToken(c1)
    return
  }
  await fetchAdminCsrfCookie().catch(() => {})
  if (getAdminCsrfToken()) return
  await fetchAdminCsrfCookie().catch(() => {})
}

function buildAdminWriteHeaders(includeJsonContentType) {
  const h = {}
  if (includeJsonContentType) {
    h['Content-Type'] = 'application/json'
  }
  const csrf = getAdminCsrfToken()
  if (csrf) {
    h['X-CSRFToken'] = csrf
  }
  return h
}

async function adminWriteFetch(url, { method, body, headers: extra = {} }) {
  const withJsonBody = body != null && (method === 'POST' || method === 'PATCH' || method === 'PUT')
  await ensureAdminCsrfForWrite()
  if (!getAdminCsrfToken()) {
    const c = tryReadCsrfFromBrowserCookie()
    if (c) setAdminCsrfToken(c)
  }
  const mkInit = () => ({
    method,
    credentials: 'include',
    headers: { ...buildAdminWriteHeaders(withJsonBody), ...extra },
    ...(body != null ? { body } : {})
  })
  let res = await fetch(url, mkInit())
  if (res.status === 403) {
    const t = await res.clone().text().catch(() => '')
    if (/csrf/i.test(t)) {
      await getAdminMe().catch(() => {})
      await fetchAdminCsrfCookie().catch(() => {})
      res = await fetch(url, mkInit())
    }
  }
  return res
}

/** Server-side session teardown (@csrf_exempt on backend). */
export async function adminLogoutRequest() {
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_LOGOUT}`
  try {
    await fetch(url, { method: 'POST', credentials: 'include' })
  } catch {
    /* ignore network errors */
  }
  clearAdminCsrfToken()
}

/** Normalize Django / DRF `detail` (string or validation array). */
function formatApiDetail(detail) {
  if (detail == null || detail === '') return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((x) => (typeof x === 'string' ? x : x?.message || String(x)))
      .filter(Boolean)
      .join(' ')
  }
  return String(detail)
}

/**
 * Build an Error from a non-OK chatbot API response (preserves HTTP status and optional verification_status).
 * @param {Response} response
 * @param {string} fallbackMessage
 * @returns {Promise<Error & { status: number, verification_status?: string }>}
 */
export async function chatbotErrorFromResponse(response, fallbackMessage) {
  let body = {}
  try {
    const text = await response.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    body = {}
  }
  const msg =
    (typeof body.error === 'string' && body.error.trim()) ||
    (typeof body.message === 'string' && body.message.trim()) ||
    formatApiDetail(body.detail).trim() ||
    fallbackMessage
  const err = new Error(msg)
  err.status = response.status
  if (body.verification_status != null) err.verification_status = body.verification_status
  return err
}

// Generate session ID
export function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send a chat message to the AI assistant
 * 
 * @param {string} message - User's message
 * @param {string} sessionId - Session ID for tracking conversation
 * @param {string|null} conversationId - Optional conversation ID
 * @param {Object|null} location - Optional location object {latitude, longitude, address, suburb}
 * @param {Object} options - Optional { input_type, start_new_search, language, selected_medicines, medicines,
 *   prescription_broadcast, prescription_medicines, prescription_items, prescription_confidence_percent, prescription_reading_notes }
 *   medicines: string[] — full list from interaction check / prescription; backend merges into prescription_medicines for broadcast.
 * @returns {Promise<Object>} API response with bot's reply
 * 
 * Endpoint: POST http://localhost:8000/api/chatbot/chat/
 * - start_new_search: true = fresh session, no previous results (for "New Search" button).
 * - results_for_request_id / medicine_request_id: use to confirm responses belong to current request.
 */
export async function sendChatMessage(message, sessionId, conversationId, location, options = {}) {
  try {
    const body = {
      message: message,
      session_id: sessionId,
      conversation_id: conversationId || null,
      ...locationToApiFields(location),
    };
    if (options.input_type) {
      body.input_type = options.input_type;
    }
    if (options.start_new_search === true) {
      body.start_new_search = true;
    }
    if (options.language) {
      body.language = options.language; // e.g. "en", "sn", "nd"
    }
    if (Array.isArray(options.selected_medicines) && options.selected_medicines.length > 0) {
      body.selected_medicines = options.selected_medicines;
    }
    if (Array.isArray(options.medicines) && options.medicines.length > 0) {
      body.medicines = options.medicines.map((m) => String(m).trim()).filter(Boolean);
    }
    if (options.prescription_broadcast === true) {
      body.prescription_broadcast = true;
    }
    if (Array.isArray(options.prescription_medicines) && options.prescription_medicines.length > 0) {
      body.prescription_medicines = options.prescription_medicines.map((m) => String(m).trim()).filter(Boolean);
    }
    if (Array.isArray(options.prescription_items) && options.prescription_items.length > 0) {
      body.prescription_items = options.prescription_items.map((m) => String(m).trim()).filter(Boolean);
    }
    if (options.prescription_confidence_percent != null && options.prescription_confidence_percent !== '') {
      body.prescription_confidence_percent = Number(options.prescription_confidence_percent);
    }
    if (options.prescription_reading_notes) {
      body.prescription_reading_notes = String(options.prescription_reading_notes);
    }
    if (options.prescription_image_only === true) {
      body.prescription_image_only = true;
    }
    if (options.ocr_failed === true) {
      body.ocr_failed = true;
    }
    /** When true, backend may email the patient a copy of the medicine request (requires server support). */
    if (options.notifyPatientRequestEmail === true) {
      body.notify_patient_request_email = true;
    }

    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CHAT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send message');
    }

    return await response.json();
  } catch (error) {
    console.error('Error sending chat message:', error);
    throw error;
  }
}

/**
 * Upload a prescription image for processing
 * 
 * @param {File} imageFile - Prescription image file
 * @param {string} sessionId - Session ID
 * @param {string|null} conversationId - Optional conversation ID
 * @param {Object|null} location - Optional location object
 * @returns {Promise<Object>} API response with extracted medicine information
 * 
 * Endpoint: POST http://localhost:8000/api/chatbot/upload-prescription/
 * Content-Type: multipart/form-data
 */
export async function uploadPrescription(imageFile, sessionId, conversationId, location, options = {}) {
  try {
    const formData = new FormData();
    formData.append('prescription_image', imageFile);
    formData.append('session_id', sessionId);
    if (conversationId) {
      formData.append('conversation_id', conversationId);
    }
    if (options.language) {
      formData.append('language', String(options.language));
    }
    if (options.pharmacist_review_only === true || options.skip_ocr === true) {
      formData.append('pharmacist_review_only', 'true');
      formData.append('skip_ocr', 'true');
    }
    if (options.broadcast_to_pharmacies === true || options.send_to_pharmacies === true) {
      formData.append('broadcast_to_pharmacies', 'true');
      formData.append('send_to_pharmacies', 'true');
    }
    if (location) {
      const loc = locationToApiFields(location);
      if (loc.location_latitude != null) formData.append('location_latitude', String(loc.location_latitude));
      if (loc.location_longitude != null) formData.append('location_longitude', String(loc.location_longitude));
      if (loc.location_address) formData.append('location_address', loc.location_address);
      if (loc.location_suburb) formData.append('location_suburb', loc.location_suburb);
    }

    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.UPLOAD_PRESCRIPTION}`, {
      method: 'POST',
      body: formData,
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      // Backend may still persist the image + request when OCR fails (non-fatal).
      const msg = String(data.message || data.error || '');
      const ocrSoftFail =
        data.ocr_failed ||
        data.prescription_image_only ||
        /could not extract|quota exceeded|gemini/i.test(msg);
      if (
        data.medicine_request_id ||
        data.has_prescription_image ||
        ocrSoftFail ||
        (data.conversation_id && ocrSoftFail)
      ) {
        return data;
      }
      const errorMessage =
        data.error || data.message || data.detail || 'Failed to upload prescription';
      const err = new Error(
        typeof errorMessage === 'string' ? errorMessage : 'Failed to upload prescription'
      );
      err.payload = data;
      throw err;
    }

    return data;
  } catch (error) {
    console.error('Error uploading prescription:', error);
    throw error;
  }
}

/**
 * Poll for pharmacy responses using backend-provided poll URL.
 * Used when polling_enabled: true and total_responses === 0.
 * Include conversation_id for security; backend usually includes it in poll_url.
 *
 * @param {string} pollUrl - Path from API (e.g. /api/chatbot/request/{id}/ranked/?conversation_id=...&limit=3)
 * @param {string|null} conversationId - Optional; appended to URL if pollUrl has no conversation_id
 * @returns {Promise<Array|Object>} Pharmacy responses array or object with pharmacy_responses
 */
export async function pollPharmacyResponses(pollUrl, conversationId = null, options = {}) {
  try {
    let url = pollUrl
    if (!url) throw new Error('Poll URL is required')
    if (!url.startsWith('http')) {
      const origin = new URL(API_BASE_URL).origin
      url = url.startsWith('/') ? `${origin}${url}` : `${API_BASE_URL}/${url.replace(/^\//, '')}`
    }
    if (conversationId && !url.includes('conversation_id')) {
      const sep = url.includes('?') ? '&' : '?'
      url = `${url}${sep}conversation_id=${encodeURIComponent(conversationId)}`
    }
    if (options.envelope !== false) {
      url = appendRankedDrugInteractionParams(url)
    }
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Poll failed: ${response.status}`)
    }
    const body = await response.json()
    if (Array.isArray(body)) return body
    if (body && typeof body === 'object') {
      const list = Array.isArray(body.results)
        ? body.results
        : Array.isArray(body.items)
          ? body.items
          : Array.isArray(body.pharmacy_responses)
            ? body.pharmacy_responses
            : Array.isArray(body.responses)
              ? body.responses
              : []
      if (
        list.length > 0 ||
        body.meta != null ||
        body.drug_interactions != null ||
        Array.isArray(body.results) ||
        Array.isArray(body.items)
      ) {
        return {
          ...body,
          pharmacy_responses: list.length ? list : body.pharmacy_responses ?? [],
          responses: list.length ? list : body.responses ?? [],
        }
      }
    }
    return body
  } catch (error) {
    console.error('Error polling pharmacy responses:', error)
    throw error
  }
}

/**
 * Get ranked pharmacy responses for a medicine request
 * 
 * @param {string|number} requestId - Medicine request ID
 * @param {string} conversationId - Conversation ID for security (required)
 * @param {number} limit - Number of responses to return (default: 3)
 * @returns {Promise<Array>} Ranked list of pharmacy responses
 * 
 * Endpoint: GET http://localhost:8000/api/chatbot/request/{requestId}/ranked/?conversation_id={conversationId}&limit={limit}
 *
 * Backend may return a JSON array (legacy) or, with `envelope=true`, `{ results, items, meta }`.
 * This helper normalizes envelope payloads so callers still receive a list via `pharmacy_responses` / `responses`.
 *
 * @param {{ envelope?: boolean }} [options] - Pass `{ envelope: true }` to request `envelope=true` (meta in response).
 */
export async function getRankedResponses(requestId, conversationId, limit = 3, options = {}) {
  try {
    if (!conversationId) {
      throw new Error('conversation_id is required for security');
    }

    const url = new URL(`${API_BASE_URL}${ENDPOINTS.GET_RANKED_RESPONSES(requestId)}`);
    url.searchParams.append('conversation_id', conversationId);
    if (limit) {
      url.searchParams.append('limit', limit.toString());
    }
    if (options.envelope) {
      url.searchParams.append('envelope', 'true');
    }
    if (options.include_drug_interactions) {
      url.searchParams.append('include_drug_interactions', 'true');
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch responses');
    }

    const body = await response.json();
    if (Array.isArray(body)) {
      return body;
    }
    if (body && typeof body === 'object') {
      const list = Array.isArray(body.results)
        ? body.results
        : Array.isArray(body.items)
          ? body.items
          : Array.isArray(body.pharmacy_responses)
            ? body.pharmacy_responses
            : Array.isArray(body.responses)
              ? body.responses
              : [];
      if (
        list.length > 0 ||
        body.meta != null ||
        body.count != null ||
        Array.isArray(body.results) ||
        Array.isArray(body.items)
      ) {
        return {
          ...body,
          pharmacy_responses: list.length ? list : body.pharmacy_responses ?? [],
          responses: list.length ? list : body.responses ?? []
        };
      }
    }
    return body;
  } catch (error) {
    console.error('Error fetching ranked responses:', error);
    throw error;
  }
}

/**
 * Single entry for patient ranked list + poll URL (deduped, min gap between calls).
 * @returns {Promise<object|array|null>} null if skipped by gate
 */
const RANKED_DDI_OPTS = { envelope: true, include_drug_interactions: true }

export async function fetchRankedForPatientRequest(
  requestId,
  conversationId,
  { pollUrl = null, limit = 10, force = false } = {}
) {
  const key = rankedFetchKey(requestId, conversationId, pollUrl)
  return fetchRankedGated(
    key,
    () =>
      pollUrl
        ? pollPharmacyResponses(pollUrl, conversationId, RANKED_DDI_OPTS)
        : getRankedResponses(requestId, conversationId, limit, RANKED_DDI_OPTS),
    { force }
  )
}

/**
 * Pharmacy portal ranking summary (aligned with backend MCDA-style composite).
 *
 * GET /api/chatbot/pharmacist/{pharmacist_id}/ranking-summary/
 *
 * **Live algorithm:** use top-level `formula` and `composite_weights` (and `composite_breakdown` for this pharmacy).
 * Do **not** treat `score_history[]` / snapshot rows as the current formula string — those may stay on legacy text
 * until new DB rows are written. **`ranking_summary_payload_version === 2`** indicates the admin-aligned payload shape.
 *
 * Backend note: `response_rate_pct` is the **reliability** factor for the portal — typically an
 * activity-based match rate (answered ÷ opportunities within the server window/radius, e.g. 90d / 50km)
 * when patient requests have valid coordinates; otherwise it falls back to stored `Pharmacy.response_rate`.
 * Same family of logic as admin analytics / effective rates for ranking.
 *
 * @returns {Promise<{
 *   ranking_score_0_100?: number,
 *   formula?: string,
 *   ranking_summary_payload_version?: number,
 *   active_ranking_profile?: string,
 *   algorithm_source?: string,
 *   reliability_composite_pct?: number,
 *   price_competitiveness_pct?: number,
 *   response_rate_pct?: number,
 *   stock_reliability_pct?: number,
 *   patient_rating_pct?: number,
 *   distance_pct?: number,
 *   composite_weights?: object,
 *   composite_breakdown?: object,
 *   leaderboard_rank?: number,
 *   leaderboard_total?: number,
 *   leaderboard_area?: string,
 *   leaderboard_area_key?: string,
 *   definitions?: Record<string, string>
 * }>}
 * @param {RequestInit} [fetchOptions] - e.g. `{ credentials: 'include' }` for admin session cookies
 */
export async function getPharmacistRankingSummary(pharmacistId, fetchOptions = {}) {
  if (!pharmacistId) throw new Error('pharmacistId is required');
  const url = `${API_BASE_URL}${ENDPOINTS.PHARMACIST_RANKING_SUMMARY(pharmacistId)}`;
  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.message || err.detail || 'Failed to fetch ranking summary');
  }
  return response.json();
}

/**
 * Register a new pharmacy
 * 
 * @param {Object} pharmacyData - Pharmacy registration data
 * @returns {Promise<Object>} Registration response
 * 
 * Endpoint: POST http://localhost:8000/api/chatbot/register/pharmacy/
 */
export async function registerPharmacy(pharmacyData) {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.REGISTER_PHARMACY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pharmacyData),
    });

    if (!response.ok) {
      throw await chatbotErrorFromResponse(response, 'Failed to register pharmacy');
    }

    return await response.json();
  } catch (error) {
    console.error('Error registering pharmacy:', error);
    throw error;
  }
}

/**
 * Register a new pharmacist
 * 
 * @param {Object} pharmacistData - Pharmacist registration data
 * @returns {Promise<Object>} Registration response
 * 
 * Endpoint: POST http://localhost:8000/api/chatbot/register/pharmacist/
 */
export async function registerPharmacist(pharmacistData) {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.REGISTER_PHARMACIST}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pharmacistData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to register pharmacist');
    }

    return await response.json();
  } catch (error) {
    console.error('Error registering pharmacist:', error);
    throw error;
  }
}

/**
 * Authenticate a pharmacist
 * 
 * @param {string} email - Pharmacist email
 * @param {string} password - Pharmacist password
 * @returns {Promise<Object>} Login response with token and pharmacist data
 * 
 * Endpoint: POST http://localhost:8000/api/chatbot/pharmacist/login/
 */
export async function pharmacistLogin(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_LOGIN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || data.detail || 'Login failed');
    }

    storeAuthTokenFromLoginResponse(data);
    return data;
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
}

/**
 * Authenticate a patient
 *
 * @param {string} email - Patient email
 * @param {string} password - Patient password
 * @returns {Promise<Object>} Login response with patient/session info
 *
 * Endpoint: POST /api/chatbot/patient/login/
 */
export async function patientLogin(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_LOGIN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || data.detail || 'Patient login failed');
    }

    return data;
  } catch (error) {
    console.error('Error logging in patient:', error);
    throw error;
  }
}

/**
 * Authenticate admin (server endpoint configurable)
 *
 * Uses VITE_ADMIN_LOGIN_PATH when provided; defaults to /admin/login/.
 * If your backend exposes admin auth at another path, set:
 * VITE_ADMIN_LOGIN_PATH=/api/chatbot/admin/login/
 */
export async function adminLogin(email, password) {
  try {
    const adminPath = import.meta.env.VITE_ADMIN_LOGIN_PATH || ENDPOINTS.ADMIN_LOGIN;
    const loginUrl = adminPath.startsWith('http')
      ? adminPath
      : `${API_BASE_URL.replace(/\/$/, '')}${adminPath.startsWith('/') ? '' : '/'}${adminPath}`;

    const response = await fetch(loginUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const baseMessage = data.error || data.message || data.detail || 'Admin login failed';
      if (response.status === 404) {
        throw new Error('Admin login endpoint not found. Set VITE_ADMIN_LOGIN_PATH to your backend admin auth endpoint.');
      }
      throw new Error(baseMessage);
    }

    applyAdminCsrfFromResponse(data);
    if (!getAdminCsrfToken()) {
      const c = tryReadCsrfFromBrowserCookie()
      if (c) setAdminCsrfToken(c)
    }
    if (!getAdminCsrfToken()) {
      await getAdminMe().catch(() => {})
    }
    if (!getAdminCsrfToken()) {
      await fetchAdminCsrfCookie().catch(() => {})
    }
    return data;
  } catch (error) {
    console.error('Error logging in admin:', error);
    throw error;
  }
}

/**
 * Request password-reset code by email.
 * Backend: POST body `{ email, user_type }` where user_type is `patient` | `pharmacist` | `admin`.
 * @param {{ email: string, userType: 'patient'|'pharmacist'|'admin' }} p
 */
export async function requestPasswordResetCode({ email, userType }) {
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH_PASSWORD_RESET_REQUEST}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: String(email || '').trim(),
      user_type: userType,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || data.detail || 'Could not send reset code');
  }
  return data;
}

/**
 * Confirm password reset with emailed code.
 * Backend: POST `{ email, code, new_password, user_type }`.
 */
export async function confirmPasswordReset({ email, code, newPassword, userType }) {
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH_PASSWORD_RESET_CONFIRM}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: String(email || '').trim(),
      code: String(code || '').trim(),
      new_password: String(newPassword || ''),
      user_type: userType,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || data.detail || 'Could not reset password');
  }
  return data;
}

/**
 * Complete login after MFA challenge.
 * Backend: POST `{ user_type, mfa_token, otp_code }` (and optionally `email` + `password` if your API requires).
 */
export async function completeMfaLogin({ userType, mfaToken, otpCode, email, password }) {
  const body = {
    user_type: userType,
    mfa_token: String(mfaToken || '').trim(),
    otp_code: String(otpCode || '').trim().replace(/\s/g, ''),
  };
  if (email) body.email = String(email).trim();
  if (password != null) body.password = String(password);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH_MFA_LOGIN_COMPLETE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: userType === 'admin' ? 'include' : 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || data.detail || 'Invalid verification code');
  }
  if (userType === 'pharmacist' || userType === 'patient') {
    storeAuthTokenFromLoginResponse(data);
  }
  return data;
}

/** JWT / API token from login or MFA-complete payloads (several backend shapes). */
export function extractAuthTokenFromPayload(data) {
  if (!data || typeof data !== 'object') return '';
  const candidates = [
    data.token,
    data.access_token,
    data.access,
    data.jwt,
    data.auth_token,
    data.key,
    data.pharmacist?.token,
    data.pharmacist?.access_token,
    data.patient?.token,
    data.patient?.access_token,
  ];
  for (const c of candidates) {
    const t = String(c ?? '').trim();
    if (t && t !== 'authenticated' && t.length > 8) return t;
  }
  return '';
}

export function getStoredAuthToken() {
  if (typeof localStorage === 'undefined') return '';
  const direct = String(localStorage.getItem('token') || '').trim();
  if (direct && direct !== 'authenticated' && direct.length > 8) return direct;
  try {
    const ph = JSON.parse(localStorage.getItem('pharmacist') || 'null');
    const fromPh = extractAuthTokenFromPayload(ph);
    if (fromPh) return fromPh;
  } catch {
    /* ignore */
  }
  return '';
}

/** Persist token from login/MFA response; returns true when a real token was stored. */
export function storeAuthTokenFromLoginResponse(data) {
  const token = extractAuthTokenFromPayload(data);
  if (!token) return false;
  localStorage.setItem('token', token);
  try {
    if (data?.pharmacist && typeof data.pharmacist === 'object') {
      localStorage.setItem(
        'pharmacist',
        JSON.stringify({ ...data.pharmacist, token })
      );
    }
  } catch {
    /* ignore */
  }
  return true;
}

export function hasPharmacistApiAuth() {
  return Boolean(getStoredAuthToken());
}

function authBearerHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const t = getStoredAuthToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function pharmacistAuthenticatedFetchInit(init = {}) {
  return {
    credentials: 'include',
    ...init,
    headers: {
      ...authBearerHeaders(),
      ...(init.headers || {}),
    },
  };
}

/** GET pharmacist MFA status. */
export async function getPharmacistMfaStatus(pharmacistId) {
  const params = new URLSearchParams({ pharmacist_id: String(pharmacistId || '').trim() });
  const res = await fetch(
    `${API_BASE_URL}${ENDPOINTS.PHARMACIST_MFA_STATUS}?${params}`,
    pharmacistAuthenticatedFetchInit()
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || 'MFA status unavailable');
  }
  return res.json();
}

export async function startPharmacistMfaSetup(pharmacistId) {
  const res = await fetch(
    `${API_BASE_URL}${ENDPOINTS.PHARMACIST_MFA_SETUP_START}`,
    pharmacistAuthenticatedFetchInit({
      method: 'POST',
      body: JSON.stringify({ pharmacist_id: String(pharmacistId || '').trim() }),
    })
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || 'Could not start 2FA setup');
  return data;
}

export async function confirmPharmacistMfaSetup(pharmacistId, otpCode) {
  const res = await fetch(
    `${API_BASE_URL}${ENDPOINTS.PHARMACIST_MFA_SETUP_CONFIRM}`,
    pharmacistAuthenticatedFetchInit({
      method: 'POST',
      body: JSON.stringify({
        pharmacist_id: String(pharmacistId || '').trim(),
        otp_code: String(otpCode || '').trim().replace(/\s/g, ''),
      }),
    })
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || 'Invalid code');
  return data;
}

export async function disablePharmacistMfa(pharmacistId, otpCode) {
  const res = await fetch(
    `${API_BASE_URL}${ENDPOINTS.PHARMACIST_MFA_DISABLE}`,
    pharmacistAuthenticatedFetchInit({
      method: 'POST',
      body: JSON.stringify({
        pharmacist_id: String(pharmacistId || '').trim(),
        ...(otpCode ? { otp_code: String(otpCode).trim().replace(/\s/g, '') } : {}),
      }),
    })
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || 'Could not disable 2FA');
  return data;
}

/**
 * GET /api/chatbot/pharmacist/settings/?pharmacist_id=…
 * @returns {Promise<{ operations?: object, profile?: object, notifications?: object, service?: object }>}
 */
export async function getPharmacistSettings(pharmacistId) {
  const params = new URLSearchParams({ pharmacist_id: String(pharmacistId || '').trim() });
  const res = await fetch(
    `${API_BASE_URL}${ENDPOINTS.PHARMACIST_SETTINGS}?${params}`,
    pharmacistAuthenticatedFetchInit()
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.detail || 'Failed to load settings');
    err.status = res.status;
    throw err;
  }
  return data.settings && typeof data.settings === 'object' ? data.settings : data;
}

/**
 * PATCH /api/chatbot/pharmacist/settings/?pharmacist_id=…
 * @param {object} patch — e.g. `{ operations: { … } }`
 */
export async function patchPharmacistSettings(pharmacistId, patch) {
  const params = new URLSearchParams({ pharmacist_id: String(pharmacistId || '').trim() });
  const res = await fetch(
    `${API_BASE_URL}${ENDPOINTS.PHARMACIST_SETTINGS}?${params}`,
    pharmacistAuthenticatedFetchInit({
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.detail || 'Failed to save settings');
    err.status = res.status;
    throw err;
  }
  return data.settings && typeof data.settings === 'object' ? data.settings : data;
}

/**
 * Get all registered pharmacies
 * 
 * @returns {Promise<Array>} List of pharmacies
 * 
 * Endpoint: GET http://localhost:8000/api/chatbot/pharmacies/
 */
export async function getAllPharmacies() {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.GET_PHARMACIES}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch pharmacies');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching pharmacies:', error);
    throw error;
  }
}

/**
 * Get all medicine requests for a specific pharmacy
 * 
 * @param {string|number} pharmacyId - Pharmacy ID
 * @returns {Promise<Array>} List of medicine requests
 * 
 * Endpoint: GET http://localhost:8000/api/chatbot/pharmacy/requests/?pharmacy_id={pharmacyId}
 */
export async function getPharmacyRequests(pharmacyId) {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACY_REQUESTS(pharmacyId)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch requests');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching pharmacy requests:', error);
    throw error;
  }
}

/**
 * Unwrap list + normalize `has_responded` so the dashboard shows past responses after refresh/poll
 * even when the API uses different shapes or field names.
 */
function normalizePharmacistRequestRow(r) {
  if (!r || typeof r !== 'object') return r
  let has = r.has_responded
  if (has === true || has === 'true' || has === 1) has = true
  else if (has === false || has === 'false' || has === 0) has = false
  else {
    has = Boolean(
      r.hasResponded === true ||
      r.responded === true ||
      (typeof r.status === 'string' && /responded|completed|answered|filled|partial/i.test(r.status)) ||
      (Number(r.response_count) > 0) ||
      (Number(r.responses_count) > 0) ||
      (Number(r.pharmacy_response_count) > 0) ||
      (Array.isArray(r.pharmacy_responses) && r.pharmacy_responses.length > 0) ||
      (r.responded_at != null && String(r.responded_at).trim() !== '') ||
      (r.first_response_at != null && String(r.first_response_at).trim() !== '')
    )
  }
  return { ...r, has_responded: Boolean(has) }
}

function parsePharmacistRequestsResponse(data) {
  if (data == null) return []
  if (Array.isArray(data)) return data.map(normalizePharmacistRequestRow)
  const arr = data.results ?? data.requests ?? data.items ?? data.data
  if (Array.isArray(arr)) return arr.map(normalizePharmacistRequestRow)
  return []
}

/**
 * Get medicine requests for a pharmacist.
 *
 * @param {string|number} pharmacistId
 * @param {{ includeHistory?: boolean }} [options] — when `includeHistory` is true, adds `include_history=1` (ignored by backends that do not support it).
 * @returns {Promise<Array>}
 *
 * Endpoint: GET /api/chatbot/pharmacist/requests/?pharmacist_id={id}
 */
export async function getPharmacistRequests(pharmacistId, options = {}) {
  try {
    const params = new URLSearchParams()
    params.set('pharmacist_id', String(pharmacistId ?? '').trim())
    if (options.includeHistory === true) {
      params.set('include_history', '1')
    }
    const url = `${API_BASE_URL}/pharmacist/requests/?${params.toString()}`
    const response = await fetch(url)

    if (!response.ok) {
      throw await chatbotErrorFromResponse(response, 'Failed to fetch requests');
    }

    const raw = await response.json()
    return parsePharmacistRequestsResponse(raw)
  } catch (error) {
    console.error('Error fetching pharmacist requests:', error);
    throw error;
  }
}

/**
 * Register or update a patient profile.
 * POST /api/chatbot/register/patient/
 * Body: display_name, email, phone, date_of_birth?, home_area?, preferred_language?, allergies?, conditions?,
 *       and optionally session_id or conversation_id (if omitted, backend creates a new session_id).
 * Response: { message, session_id, profile }. Store session_id for /chat/ and /patient/... calls.
 *
 * @param {Object} patientData - { display_name, email, phone?, date_of_birth?, home_area?, preferred_language?, allergies?, conditions?, session_id?, conversation_id? }
 * @returns {Promise<Object>} { message, session_id, profile }
 */
export async function registerPatient(patientData) {
  try {
    const body = {};
    if (patientData.display_name != null) body.display_name = patientData.display_name;
    if (patientData.email != null) body.email = patientData.email;
    if (patientData.phone != null) body.phone = patientData.phone;
    if (patientData.date_of_birth != null) body.date_of_birth = patientData.date_of_birth;
    if (patientData.home_area != null) body.home_area = patientData.home_area;
    if (patientData.preferred_language != null) body.preferred_language = patientData.preferred_language;
    if (Array.isArray(patientData.allergies)) body.allergies = patientData.allergies;
    if (Array.isArray(patientData.conditions)) body.conditions = patientData.conditions;
    if (patientData.session_id != null) body.session_id = patientData.session_id;
    if (patientData.conversation_id != null) body.conversation_id = patientData.conversation_id;
    // Legacy: allow name → display_name
    if (body.display_name == null && patientData.name != null) body.display_name = patientData.name;

    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.REGISTER_PATIENT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const msg = data.error || data.message || data.detail || (response.status === 404 ? 'Patient registration is not available on this server.' : 'Failed to register patient');
      const err = new Error(msg);
      err.status = response.status;
      err.code = response.status === 404 ? 'NOT_FOUND' : undefined;
      throw err;
    }

    return data;
  } catch (error) {
    console.error('Error registering patient:', error);
    throw error;
  }
}

/**
 * Submit a pharmacy's response to a medicine request (for pharmacist dashboard)
 * 
 * @param {string|number} requestId - Medicine request ID
 * @param {Object} responseData - Response data (pharmacist_id, medicine_available, price, preparation_time, alternative_medicines, notes)
 * @returns {Promise<Object>} Submission response with distance_km, estimated_travel_time auto-calculated
 * 
 * Endpoint: POST http://localhost:8000/api/chatbot/pharmacist/response/{requestId}/
 */
export async function submitPharmacyResponse(requestId, responseData) {
  try {
    const body = { ...responseData }
    /** Backend may email the patient a summary when a pharmacy responds (ignored if unsupported). */
    if (body.notify_patient_by_email === undefined) body.notify_patient_by_email = true
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_RESPONSE(requestId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw await chatbotErrorFromResponse(response, 'Failed to submit response');
    }

    return await response.json();
  } catch (error) {
    console.error('Error submitting pharmacy response:', error);
    throw error;
  }
}

/**
 * Get inventory for the pharmacist's pharmacy
 *
 * @param {string} pharmacistId - Pharmacist UUID
 * @returns {Promise<Object>} { summary: { total_medicines, in_stock, low_stock, out_of_stock }, items: [...] }
 *
 * Endpoint: GET /api/chatbot/pharmacist/inventory/?pharmacist_id={uuid}
 */
export async function getPharmacistInventory(pharmacistId, { credentials } = {}) {
  try {
    const fetchOpts = credentials === 'include' ? { credentials: 'include' } : undefined;
    const response = await fetch(
      `${API_BASE_URL}${ENDPOINTS.PHARMACIST_INVENTORY(pharmacistId)}`,
      fetchOpts
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch inventory');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching inventory:', error);
    throw error;
  }
}

/**
 * Create / upsert new inventory lines in bulk (add medicines only).
 *
 * @param {string} pharmacistId - Pharmacist UUID
 * @param {Array} items - [{ medicine_name, quantity, low_stock_threshold, price }, ...] — price required
 * @returns {Promise<Object>} Full inventory snapshot
 *
 * Endpoint: POST /api/chatbot/pharmacist/inventory/
 */
export async function postPharmacistInventoryBulk(pharmacistId, items) {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_INVENTORY_UPDATE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pharmacist_id: pharmacistId,
        items,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add inventory');
    }

    return await response.json();
  } catch (error) {
    console.error('Error posting inventory:', error);
    throw error;
  }
}

/** @deprecated Use patchPharmacistInventoryItem for updates; postPharmacistInventoryBulk for new lines */
export const updatePharmacistInventory = postPharmacistInventoryBulk;

/**
 * Update a single inventory line (stock, threshold, price, optional rename).
 * PATCH /api/chatbot/pharmacist/inventory/
 */
export async function patchPharmacistInventoryItem(pharmacistId, payload) {
  const { medicine_name, new_medicine_name, ...fields } = payload;
  if (!medicine_name?.trim()) {
    throw new Error('medicine_name is required');
  }
  const body = { pharmacist_id: pharmacistId, medicine_name: medicine_name.trim() };
  if (new_medicine_name?.trim()) {
    body.new_medicine_name = new_medicine_name.trim();
  }
  if (fields.quantity != null) body.quantity = fields.quantity;
  if (fields.low_stock_threshold != null) body.low_stock_threshold = fields.low_stock_threshold;
  if (fields.price != null) body.price = fields.price;

  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_INVENTORY_UPDATE}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = 'Failed to update inventory item';
    try {
      const err = await response.json();
      message = err.error || err.detail || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  return response.json();
}

/**
 * Delete one inventory line.
 * DELETE /api/chatbot/pharmacist/inventory/?pharmacist_id=&medicine_name=
 */
export async function deletePharmacistInventoryItem(pharmacistId, medicineName) {
  const name = String(medicineName || '').trim();
  if (!name) throw new Error('medicine_name is required');

  const params = new URLSearchParams({
    pharmacist_id: pharmacistId,
    medicine_name: name,
  });
  const response = await fetch(
    `${API_BASE_URL}${ENDPOINTS.PHARMACIST_INVENTORY_UPDATE}?${params.toString()}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    let message = 'Failed to delete inventory item';
    try {
      const err = await response.json();
      message = err.error || err.detail || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  return response.json();
}

/** Normalize inventory API responses (GET/POST/PATCH/DELETE) to { summary, items }. */
export function normalizePharmacistInventoryResponse(data) {
  if (!data || typeof data !== 'object') return { summary: {}, items: [] };
  if (Array.isArray(data.items)) {
    return { summary: data.summary || {}, items: data.items };
  }
  return data;
}

/**
 * Rate a pharmacy (UC-P12)
 *
 * @param {string} pharmacyId - Pharmacy ID
 * @param {number} rating - 1-5
 * @param {string|null} responseId - Optional response ID to link rating to a visit
 * @param {string|null} notes - Optional notes
 * @returns {Promise<Object>} API response
 */
export async function ratePharmacy(pharmacyId, rating, responseId = null, notes = null) {
  try {
    const body = { pharmacy_id: pharmacyId, rating: Math.min(5, Math.max(1, rating)) };
    if (responseId) body.response_id = responseId;
    if (notes) body.notes = notes;
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.RATE_PHARMACY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to rate pharmacy');
    }
    return await response.json();
  } catch (error) {
    console.error('Error rating pharmacy:', error);
    throw error;
  }
}

/**
 * Check drug interactions (UC-P08 / UC-S05)
 *
 * @param {string[]} medicines - List of medicine names
 * @returns {Promise<Object>} { interactions: [{ medicine_a, medicine_b, severity, description }] }
 */
export async function checkDrugInteractions(medicines) {
  try {
    const list = Array.isArray(medicines) ? medicines.filter(Boolean).map(m => String(m).trim()) : [];
    if (list.length < 2) {
      return { interactions: [], medicines_checked: list, drug_interactions: { interactions: [] } };
    }
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CHECK_INTERACTIONS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicines: list }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to check interactions');
    }
    const body = await response.json();
    return body;
  } catch (error) {
    console.error('Error checking interactions:', error);
    throw error;
  }
}

/**
 * Get pharmacy responses for a request (with total_time_minutes).
 * GET /api/chatbot/request/{request_id}/responses/?conversation_id=...
 */
export async function getRequestResponses(requestId, conversationId) {
  if (!conversationId) throw new Error('conversation_id is required for security');
  const url = new URL(`${API_BASE_URL}${ENDPOINTS.GET_REQUEST_RESPONSES(requestId)}`);
  url.searchParams.append('conversation_id', conversationId);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch responses');
  }
  return res.json();
}

/**
 * Record purchase (decrement stock when user collects/buys).
 * POST /api/chatbot/record-purchase/
 * Body: { pharmacy_id, items: [{ medicine_name, quantity }], optional: response_id, medicine_request_id, conversation_id }
 */
export async function recordPurchase({ pharmacy_id, items, response_id, medicine_request_id, conversation_id }) {
  const body = { pharmacy_id, items };
  if (response_id) body.response_id = response_id;
  if (medicine_request_id) body.medicine_request_id = medicine_request_id;
  if (conversation_id) body.conversation_id = conversation_id;
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.RECORD_PURCHASE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `Record purchase failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Reserve medicine at a pharmacy (live inventory) – locks stock for 2 hours.
 * POST /api/chatbot/reserve/
 * medicine_name can be omitted when conversation_id is sent: backend uses first medicine from that conversation.
 */
export async function reserveMedicine({
  pharmacy_id,
  medicine_name,
  quantity,
  conversation_id,
  session_id,
  patient_phone,
  request_id,
  medicine_request_id,
}) {
  const body = { pharmacy_id, quantity: Number(quantity) || 1 };
  if (medicine_name) body.medicine_name = medicine_name;
  if (conversation_id) body.conversation_id = conversation_id;
  if (session_id) body.session_id = session_id;
  if (patient_phone) body.patient_phone = patient_phone;
  const reqId = request_id ?? medicine_request_id;
  if (reqId != null && reqId !== '') {
    body.request_id = String(reqId);
    body.medicine_request_id = String(reqId);
  }
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.RESERVE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err.error || err.detail || `Reserve failed: ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.code = err.code || err.error_code;
    error.payload = err;
    return Promise.reject(error);
  }
  return res.json();
}

/**
 * Get pharmacist reservations.
 *
 * GET /api/chatbot/pharmacist/reservations/?pharmacist_id=…&scope=…&limit=…&include_meta=…
 *
 * - **scope=active** (default): pending/confirmed that are not expired — for “current” queue only.
 * - **scope=recent**: last `limit` rows (default 50, max 200), any status, newest first — for history,
 *   earnings, and fulfilment log. Response JSON may include **`scope`** and **`pharmacy_id`**.
 * - **include_meta=1**: response may include **`meta`** (`total_reservations`, **`by_status`**, **`active_non_expired_pending_or_confirmed`**, **`hint`** when empty — e.g. try `scope=recent` or no rows yet).
 *
 * @param {string|number} pharmacistId
 * @param {{ scope?: 'active' | 'recent', limit?: number, includeMeta?: boolean }} [options]
 * @returns {Promise<{ reservations?: unknown[], scope?: string, pharmacy_id?: string, meta?: Record<string, unknown> } | unknown[]>}
 */
export async function getPharmacistReservations(pharmacistId, options = {}) {
  const scope = options.scope === 'recent' ? 'recent' : 'active'
  const params = new URLSearchParams()
  params.set('pharmacist_id', String(pharmacistId ?? '').trim())
  params.set('scope', scope)
  if (scope === 'recent') {
    const lim = Math.max(1, Math.min(200, Number(options.limit) || 50))
    params.set('limit', String(lim))
  }
  if (options.includeMeta === true) {
    params.set('include_meta', '1')
  }
  const url = `${API_BASE_URL}/pharmacist/reservations/?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch reservations')
  return res.json()
}

/**
 * Confirm reservation (ready for pickup)
 * POST /api/chatbot/pharmacist/reservations/{id}/confirm/
 */
export async function confirmReservation(reservationId, pharmacistId) {
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_RESERVATION_CONFIRM(reservationId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pharmacist_id: pharmacistId }),
  });
  if (!res.ok) throw new Error('Failed to confirm reservation');
  return res.json();
}

/**
 * Complete reservation (pick-up done – decrements stock)
 * POST /api/chatbot/pharmacist/reservations/{id}/complete/
 */
export async function completeReservation(reservationId, pharmacistId) {
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_RESERVATION_COMPLETE(reservationId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pharmacist_id: pharmacistId }),
  });
  if (!res.ok) throw new Error('Failed to complete reservation');
  return res.json();
}

// ----- Patient dashboard (session_id or conversation_id required) -----

/** Get session identifiers for patient API calls (from localStorage). */
export function getPatientSessionIds() {
  const patient = JSON.parse(localStorage.getItem('patient') || '{}');
  const sessionId = patient?.session_id || localStorage.getItem('chatbot_session_id');
  const conversationId = localStorage.getItem('chatbot_conversation_id');
  return { sessionId, conversationId, patient };
}

function patientParams(sessionId, conversationId) {
  const p = new URLSearchParams();
  if (sessionId) p.append('session_id', sessionId);
  if (conversationId) p.append('conversation_id', conversationId);
  return p.toString();
}

export async function getPatientDashboardStats(sessionId, conversationId) {
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_DASHBOARD_STATS}?${q}`);
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
}

export async function getPatientRequests(sessionId, conversationId, options = {}) {
  const p = new URLSearchParams(patientParams(sessionId, conversationId));
  if (options.status) p.append('status', options.status);
  if (options.limit) p.append('limit', String(options.limit));
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_REQUESTS}?${p}`);
  if (!res.ok) throw new Error('Failed to fetch requests');
  return res.json();
}

export async function getPatientRequestDetail(requestId, sessionId, conversationId) {
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_REQUEST_DETAIL(requestId)}?${q}`);
  if (!res.ok) throw new Error('Failed to fetch request detail');
  return res.json();
}

export async function getPatientSavedMedicines(sessionId, conversationId) {
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_SAVED_MEDICINES}?${q}`);
  if (!res.ok) throw new Error('Failed to fetch saved medicines');
  return res.json();
}

export async function addPatientSavedMedicine(sessionId, conversationId, { medicine_name, display_name }) {
  const body = { medicine_name, display_name };
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_SAVED_MEDICINES}?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to add saved medicine');
  return res.json();
}

export async function removePatientSavedMedicine(sessionId, conversationId, medicine_name) {
  const p = new URLSearchParams(patientParams(sessionId, conversationId));
  p.append('medicine_name', medicine_name);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_SAVED_MEDICINES_REMOVE}?${p}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to remove saved medicine');
  return res.json();
}

export async function getPatientNotifications(sessionId, conversationId, options = {}) {
  const p = new URLSearchParams(patientParams(sessionId, conversationId));
  if (options.type) p.append('type', options.type);
  if (options.unread_only) p.append('unread_only', 'true');
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_NOTIFICATIONS}?${p}`);
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function markPatientNotificationsRead(sessionId, conversationId, payload = {}) {
  const body = { ...payload };
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_NOTIFICATIONS_MARK_READ}?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to mark notifications read');
  return res.json();
}

export async function getPatientProfile(sessionId, conversationId) {
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_PROFILE}?${q}`);
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

export async function updatePatientProfile(sessionId, conversationId, patch) {
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_PROFILE}?${q}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

/** GET patient MFA status (enabled, method). Requires session_id or conversation_id. */
export async function getPatientMfaStatus(sessionId, conversationId) {
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_MFA_STATUS}?${q}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || 'MFA status unavailable');
  }
  return res.json();
}

export async function startPatientMfaSetup(sessionId, conversationId) {
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_MFA_SETUP_START}?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || 'Could not start 2FA setup');
  return data;
}

export async function confirmPatientMfaSetup(sessionId, conversationId, otpCode) {
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_MFA_SETUP_CONFIRM}?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp_code: String(otpCode || '').trim().replace(/\s/g, '') }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || 'Invalid code');
  return data;
}

export async function disablePatientMfa(sessionId, conversationId, otpCode) {
  const q = patientParams(sessionId, conversationId);
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PATIENT_MFA_DISABLE}?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      otpCode ? { otp_code: String(otpCode).trim().replace(/\s/g, '') } : {}
    ),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || 'Could not disable 2FA');
  return data;
}

/**
 * Get all admin dashboard data in one call
 *
 * @param {number} limit - Optional list limit (default 50, max 200)
 * @param {number} [verificationQueueLimit] - Optional cap for embedded verification queue (backend default often 100, max 500)
 * @returns {Promise<Object>} { overview, breakdown, lists, meta, verification_queue?, ... }
 *
 * Endpoint: GET /api/chatbot/admin/dashboard/data/?limit={limit}&verification_queue_limit={n}
 */
export async function getAdminDashboardData(limit = 50, verificationQueueLimit) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const params = new URLSearchParams({ limit: String(safeLimit) });
  if (verificationQueueLimit != null) {
    const vq = Math.max(1, Math.min(500, Number(verificationQueueLimit)));
    if (Number.isFinite(vq)) params.set('verification_queue_limit', String(vq));
  }
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_DASHBOARD_DATA}?${params}`;
  const res = await fetch(url, {
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || err.detail || 'Failed to fetch admin dashboard data');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * MediBot consolidated overview: layers 1–5, widgets, nav_badges, open_alerts_count, generated_at.
 *
 * Endpoint: GET /api/chatbot/admin/overview/medi-bot/
 * @returns {Promise<Object>}
 */
export async function getAdminMediBotOverview() {
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_MEDI_BOT_OVERVIEW}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || err.detail || 'Failed to fetch MediBot overview');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * GET /api/chatbot/admin/dashboard/widgets/?no_response_minutes=…
 * Alerts + safety policy rows + merged chatbot_policy (lighter than full MediBot overview).
 *
 * @param {{ noResponseMinutes?: number }} [options] — default 10, clamped 1–120
 * @returns {Promise<{ generated_at?: string, system_alerts?: unknown[], safety_policies?: unknown[], chatbot_policy?: object }>}
 */
export async function getAdminChatbotDashboardWidgets(options = {}) {
  const raw = options.noResponseMinutes ?? options.no_response_minutes ?? 10;
  const clamped = Math.max(1, Math.min(120, Number(raw) || 10));
  const params = new URLSearchParams({ no_response_minutes: String(clamped) });
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_CHATBOT_DASHBOARD_WIDGETS}?${params}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || err.detail || 'Failed to fetch admin dashboard widgets');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * GET /api/chatbot/admin/chatbot/policy/
 * @returns {Promise<object>}
 */
export async function getAdminChatbotPolicy() {
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_CHATBOT_POLICY}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || err.detail || 'Failed to fetch chatbot policy');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * PATCH /api/chatbot/admin/chatbot/policy/
 * Send partial fields (e.g. `chatbot_policy`, `patient_disclaimer_text` — backend decides).
 * Ranking weights / `active_ranking_profile` belong on {@link patchAdminRankingConfig}.
 * @param {object} patch
 * @returns {Promise<object>}
 */
export async function patchAdminChatbotPolicy(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('patch object required');
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_CHATBOT_POLICY}`;
  const res = await adminWriteFetch(url, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || err.detail || 'Failed to update chatbot policy');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * PATCH /api/chatbot/admin/ranking/config/
 * Partial JSON: e.g. `{ active_ranking_profile }`, `{ standard_weights }` (layer3-style keys), or both.
 * @param {object} patch
 * @returns {Promise<object>}
 */
export async function patchAdminRankingConfig(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('patch object required');
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_RANKING_CONFIG}`;
  const res = await adminWriteFetch(url, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || err.detail || 'Failed to update ranking config');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * POST /api/chatbot/admin/reports/generate/
 * @param {{
 *   report_type?: string,
 *   title?: string,
 *   timeframe?: string,
 *   dashboard_snapshot: object,
 *   custom_instruction?: string,
 *   tone?: 'executive'|'technical'|'neutral'
 * }} payload
 * @returns {Promise<{ narrative?: string, report_type?: string, timeframe?: string, tone?: string, generated_at?: string }>}
 */
export async function generateAdminReportNarrative(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('payload object required');
  if (!payload.dashboard_snapshot || typeof payload.dashboard_snapshot !== 'object') {
    throw new Error('dashboard_snapshot object is required');
  }
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_REPORTS_GENERATE}`;
  const res = await adminWriteFetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || err.detail || 'Failed to generate admin report narrative');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * Overlay {@link getAdminChatbotDashboardWidgets} onto a MediBot overview payload so
 * `widgets.system_alerts` and `layer5_ai_safety` stay fresh without replacing layers 1–4.
 *
 * @param {object|null|undefined} mediBot
 * @param {object|null|undefined} bundle
 * @returns {object|null}
 */
export function mergeMediBotOverviewWithWidgetsBundle(mediBot, bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return mediBot && typeof mediBot === 'object' ? mediBot : null;
  }
  const base = mediBot && typeof mediBot === 'object' ? { ...mediBot } : {};
  const widgets = { ...(base.widgets || {}) };
  if (Array.isArray(bundle.system_alerts)) {
    widgets.system_alerts = bundle.system_alerts;
  }
  const l5 = { ...(base.layer5_ai_safety || {}) };
  if (bundle.safety_policies != null) {
    l5.safety_policies = bundle.safety_policies;
  }
  if (bundle.chatbot_policy != null && typeof bundle.chatbot_policy === 'object') {
    l5.chatbot_policy = bundle.chatbot_policy;
  }
  const generatedAt = bundle.generated_at ?? base.generated_at;
  return {
    ...base,
    widgets,
    layer5_ai_safety: l5,
    ...(generatedAt != null ? { generated_at: generatedAt } : {})
  };
}

/**
 * Get full admin view of a single medicine request (staff).
 *
 * Backend aligns with patient-side ranking for that request (same engine as
 * `GET .../request/<id>/ranked/`). Urban/rural weights come from
 * `GET .../admin/ranking/config/` — that endpoint is weights only, not a ranked list.
 *
 * Returns { request, pharmacy_responses, reservations, ratings, notifications, summary } (shape per backend).
 */
export async function getAdminRequestDetail(requestId) {
  if (!requestId) throw new Error('requestId is required');
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_REQUEST_DETAIL(requestId)}`;
  const res = await fetch(url, {
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || 'Failed to fetch admin request detail');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

// ----- Admin patient control (patient dashboard CRUD) -----

export async function getAdminPatientOverview(sessionId) {
  if (!sessionId) throw new Error('sessionId is required');
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_PATIENT_OVERVIEW(sessionId)}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || 'Failed to fetch patient overview');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

export async function patchAdminPatientProfile(sessionId, patch) {
  if (!sessionId) throw new Error('sessionId is required');
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_PATIENT_PROFILE(sessionId)}`;
  const res = await adminWriteFetch(url, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || 'Failed to update patient profile');
  }
  return res.json();
}

export async function getAdminPatientSaved(sessionId) {
  if (!sessionId) throw new Error('sessionId is required');
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_PATIENT_SAVED(sessionId)}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || 'Failed to fetch saved medicines');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

export async function clearAdminPatientSaved(sessionId) {
  if (!sessionId) throw new Error('sessionId is required');
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_PATIENT_SAVED_CLEAR(sessionId)}`;
  const res = await adminWriteFetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || 'Failed to clear saved medicines');
  }
  return res.json();
}

export async function getAdminPatientNotifications(sessionId) {
  if (!sessionId) throw new Error('sessionId is required');
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_PATIENT_NOTIFS(sessionId)}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || 'Failed to fetch notifications');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

export async function clearAdminPatientNotifications(sessionId) {
  if (!sessionId) throw new Error('sessionId is required');
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_PATIENT_NOTIFS_CLEAR(sessionId)}`;
  const res = await adminWriteFetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || 'Failed to clear notifications');
  }
  return res.json();
}

// ----- Generic admin API helpers -----
export async function adminGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || 'Admin GET failed');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

export async function adminPost(path, body) {
  const res = await adminWriteFetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    let msg = err.error || err.detail || err.message || 'Admin POST failed';
    if (err.details && typeof err.details === 'object') {
      const parts = Object.entries(err.details).map(([k, v]) => {
        const val = Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `${k}: ${val}`;
      });
      if (parts.length) msg = `${msg} — ${parts.join('; ')}`;
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function adminPatch(path, body) {
  const res = await adminWriteFetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      (typeof err.error === 'string' && err.error.trim()) ||
      formatApiDetail(err.detail).trim() ||
      (typeof err.message === 'string' && err.message.trim()) ||
      'Admin PATCH failed';
    throw new Error(msg);
  }
  return res.json();
}

export async function adminDelete(path) {
  const res = await adminWriteFetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || 'Admin DELETE failed');
  }
  return res.json();
}

export const getAdminControlCenter = () => adminGet(ENDPOINTS.ADMIN_CONTROL_CENTER);

export const updateAdminRequestStatus = (requestId, body) =>
  adminPatch(ENDPOINTS.ADMIN_REQUEST_STATUS(requestId), body);

export const updateAdminReservationStatus = (reservationId, body) =>
  adminPatch(ENDPOINTS.ADMIN_RESERVATION_STATUS(reservationId), body);

export const createAdminPharmacy = (body) => adminPost(ENDPOINTS.ADMIN_PHARMACIES, body);

/** True when body should use PATCH .../pharmacies/&lt;id&gt;/status/ (verification + active only). */
function isAdminPharmacyStatusOnlyPatch(patch) {
  if (!patch || typeof patch !== 'object') return false
  const keys = Object.keys(patch)
  if (keys.length === 0) return false
  return keys.every((k) => k === 'verification_status' || k === 'is_active')
}

/**
 * Update pharmacy fields. Bodies that only include `verification_status` and/or `is_active` are sent to
 * PATCH /admin/pharmacies/&lt;id&gt;/status/; all other fields use PATCH /admin/pharmacies/&lt;id&gt;/.
 */
export function updateAdminPharmacy(id, body) {
  const path = isAdminPharmacyStatusOnlyPatch(body)
    ? ENDPOINTS.ADMIN_PHARMACY_STATUS(id)
    : ENDPOINTS.ADMIN_PHARMACY_UPDATE(id)
  return adminPatch(path, body)
}

/** PATCH /admin/pharmacies/&lt;id&gt;/status/ — at least one of verification_status, is_active. */
export function updateAdminPharmacyStatus(id, body) {
  return adminPatch(ENDPOINTS.ADMIN_PHARMACY_STATUS(id), body)
}

/**
 * DELETE /admin/pharmacies/&lt;id&gt;/delete/
 * If the server returns 400 with `linked_counts`, call again with `{ force: true }` to cascade delete.
 */
export async function deleteAdminPharmacy(id, { force = false } = {}) {
  const qs = force ? '?force=true' : ''
  const res = await adminWriteFetch(`${API_BASE_URL}${ENDPOINTS.ADMIN_PHARMACY_DELETE(id)}${qs}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      (typeof err.error === 'string' && err.error.trim()) ||
      formatApiDetail(err.detail).trim() ||
      (typeof err.message === 'string' && err.message.trim()) ||
      'Admin DELETE failed'
    const e = new Error(msg)
    e.status = res.status
    if (err.linked_counts != null && typeof err.linked_counts === 'object') {
      e.linked_counts = err.linked_counts
    }
    throw e
  }
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export const createAdminPharmacist = (body) => adminPost(ENDPOINTS.ADMIN_PHARMACISTS, body);
export const updateAdminPharmacist = (id, body) => adminPatch(ENDPOINTS.ADMIN_PHARMACIST_UPDATE(id), body);
export const deleteAdminPharmacist = (id) => adminDelete(ENDPOINTS.ADMIN_PHARMACIST_DELETE(id));

/** Download pharmacies registry CSV (session auth). */
export async function exportAdminPharmaciesRegistry() {
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_PHARMACIES_EXPORT}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || 'Export failed');
  }
  const blob = await res.blob();
  let filename = 'pharmacies_registry.csv';
  const cd = res.headers.get('Content-Disposition');
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(cd) || /filename="([^"]+)"/i.exec(cd);
    if (m?.[1]) filename = decodeURIComponent(m[1].trim());
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

/**
 * Aggregated search/request volume for admin charts.
 * @param {number} days - window length (e.g. 7 or 30)
 */
export async function getAdminSearchVolumeAnalytics(days = 30) {
  const d = Math.max(1, Math.min(90, Number(days) || 30));
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_ANALYTICS_SEARCH_VOLUME}?days=${d}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || 'Failed to load analytics');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * Paged audit trail for staff.
 * @param {{ page?: number, pageSize?: number }} opts
 */
export async function getAdminAuditLogs({ page = 1, pageSize = 50 } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(100, Number(pageSize) || 50));
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_AUDIT_LOGS}?page=${p}&page_size=${ps}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || 'Failed to load audit logs');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/** Normalize DRF-style or ad-hoc list responses */
export function normalizeAdminPaginatedResponse(data) {
  const results =
    data?.results ??
    data?.items ??
    data?.users ??
    data?.patients ??
    data?.conversations ??
    data?.logs ??
    (Array.isArray(data?.data) ? data.data : null) ??
    (Array.isArray(data) ? data : []);
  const arr = Array.isArray(results) ? results : [];
  const count = Number(data?.count ?? data?.total);
  return { results: arr, count: Number.isFinite(count) ? count : arr.length };
}

/**
 * Paginated Django users (staff portal accounts).
 * @param {{ page?: number, pageSize?: number, search?: string }} opts
 */
export async function getAdminUsersList({ page = 1, pageSize = 25, search = '' } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(100, Number(pageSize) || 25));
  const params = new URLSearchParams({ page: String(p), page_size: String(ps) });
  const q = String(search || '').trim();
  if (q) params.set('search', q);
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_USERS_LIST}?${params}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || 'Failed to load users');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * Paginated patient session list (search matches session_id).
 * @param {{ page?: number, pageSize?: number, search?: string }} opts
 */
export async function getAdminPatientsList({ page = 1, pageSize = 25, search = '' } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(100, Number(pageSize) || 25));
  const params = new URLSearchParams({ page: String(p), page_size: String(ps) });
  const q = String(search || '').trim();
  if (q) params.set('search', q);
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_PATIENTS_LIST}?${params}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || 'Failed to load patients list');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/**
 * Paginated chatbot conversation index.
 * @param {{ page?: number, pageSize?: number, search?: string, sessionId?: string }} opts
 */
export async function getAdminChatbotLogs({ page = 1, pageSize = 25, search = '', sessionId = '', signal } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(100, Number(pageSize) || 25));
  const params = new URLSearchParams({ page: String(p), page_size: String(ps) });
  const q = String(search || '').trim();
  if (q) params.set('search', q);
  const sid = String(sessionId || '').trim();
  if (sid) params.set('session_id', sid);
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_CHATBOT_LOGS}?${params}`;
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || 'Failed to load chatbot logs');
  }
  return parseAdminJsonResponseWithCsrf(res);
}

/** Full transcript for one conversation (JSON body shape is backend-defined). */
export async function getAdminChatbotConversationLogs(conversationId) {
  if (conversationId == null || String(conversationId).trim() === '') {
    throw new Error('conversationId is required');
  }
  const url = `${API_BASE_URL}${ENDPOINTS.ADMIN_CHATBOT_LOG_DETAIL(conversationId)}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || 'Failed to load conversation');
  }
  return parseAdminJsonResponseWithCsrf(res);
}
