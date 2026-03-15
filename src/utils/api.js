/**
 * API Configuration
 * 
 * Backend Server: http://localhost:8000
 * API Base URL: http://localhost:8000/api/chatbot
 * 
 * All chatbot endpoints are prefixed with the API_BASE_URL
 * 
 * Common Issues:
 * - ERR_CONNECTION_REFUSED: Django server not running. Run: python manage.py runserver
 * - CORS Errors: Ensure backend allows requests from http://localhost:5173
 */

// API Base URL - Points to Django backend chatbot API
const API_BASE_URL = 'http://localhost:8000/api/chatbot';

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
};

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
 * @param {Object} options - Optional { input_type, start_new_search, language, selected_medicines }
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
      location_latitude: location?.latitude ?? null,
      location_longitude: location?.longitude ?? null,
      location_address: location?.address ?? null,
      location_suburb: location?.suburb ?? null,
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
export async function uploadPrescription(imageFile, sessionId, conversationId, location) {
  try {
    const formData = new FormData();
    formData.append('prescription_image', imageFile);
    formData.append('session_id', sessionId);
    if (conversationId) {
      formData.append('conversation_id', conversationId);
    }
    if (location) {
      formData.append('location_latitude', location.latitude);
      formData.append('location_longitude', location.longitude);
      formData.append('location_address', location.address);
    }

    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.UPLOAD_PRESCRIPTION}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      // Extract error message from error, message, or detail field
      const errorMessage = errorData.error || errorData.message || errorData.detail || 'Failed to upload prescription';
      throw new Error(errorMessage);
    }

    return await response.json();
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
export async function pollPharmacyResponses(pollUrl, conversationId = null) {
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
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Poll failed: ${response.status}`)
    }
    return await response.json()
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
 */
export async function getRankedResponses(requestId, conversationId, limit = 3) {
  try {
    if (!conversationId) {
      throw new Error('conversation_id is required for security');
    }

    const url = new URL(`${API_BASE_URL}${ENDPOINTS.GET_RANKED_RESPONSES(requestId)}`);
    url.searchParams.append('conversation_id', conversationId);
    if (limit) {
      url.searchParams.append('limit', limit.toString());
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch responses');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching ranked responses:', error);
    throw error;
  }
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
      const error = await response.json();
      throw new Error(error.error || 'Failed to register pharmacy');
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
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
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
 * Get all medicine requests for a specific pharmacist
 * 
 * @param {string|number} pharmacistId - Pharmacist ID
 * @returns {Promise<Array>} List of medicine requests
 * 
 * Endpoint: GET http://localhost:8000/api/chatbot/pharmacist/requests/?pharmacist_id={pharmacistId}
 */
export async function getPharmacistRequests(pharmacistId) {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_REQUESTS(pharmacistId)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch requests');
    }

    return await response.json();
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
    // Use new pharmacist endpoint
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_RESPONSE(requestId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(responseData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit response');
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
export async function getPharmacistInventory(pharmacistId) {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_INVENTORY(pharmacistId)}`);

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
 * Update pharmacy inventory in bulk. Price is required per item for ranking and patient display.
 *
 * @param {string} pharmacistId - Pharmacist UUID
 * @param {Array} items - [{ medicine_name, quantity, low_stock_threshold, price }, ...] — price required
 * @returns {Promise<Object>} API response
 *
 * Endpoint: POST /api/chatbot/pharmacist/inventory/
 */
export async function updatePharmacistInventory(pharmacistId, items) {
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
      throw new Error(error.error || 'Failed to update inventory');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating inventory:', error);
    throw error;
  }
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
    if (list.length < 2) return { interactions: [] };
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CHECK_INTERACTIONS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicines: list }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to check interactions');
    }
    return await response.json();
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
export async function reserveMedicine({ pharmacy_id, medicine_name, quantity, conversation_id, session_id, patient_phone }) {
  const body = { pharmacy_id, quantity: Number(quantity) || 1 };
  if (medicine_name) body.medicine_name = medicine_name;
  if (conversation_id) body.conversation_id = conversation_id;
  if (session_id) body.session_id = session_id;
  if (patient_phone) body.patient_phone = patient_phone;
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.RESERVE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `Reserve failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Get pharmacist's pending/confirmed reservations
 * GET /api/chatbot/pharmacist/reservations/?pharmacist_id=uuid
 */
export async function getPharmacistReservations(pharmacistId) {
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.PHARMACIST_RESERVATIONS(pharmacistId)}`);
  if (!res.ok) throw new Error('Failed to fetch reservations');
  return res.json();
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
