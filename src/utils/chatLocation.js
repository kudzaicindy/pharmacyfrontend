/**
 * Patient chat location payloads for backend geocoding (address, suburb, GPS).
 */

const SUBURB_HINT =
  /\b(mt\s+pleasant|mount\s+pleasant|st\s+kilda|avondale|borrowdale|mbare|highfield|greendale|hatfield|waterfalls|chitungwiza|harare|bulawayo)\b/i

/** @returns {{ address: string, suburb: string|null }} */
export function parseManualLocationInput(text) {
  const raw = String(text || '').trim()
  if (!raw) return { address: '', suburb: null }

  const commaParts = raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
  if (commaParts.length >= 2) {
    return {
      address: commaParts[0],
      suburb: commaParts.slice(1).join(', '),
    }
  }

  const match = raw.match(SUBURB_HINT)
  if (match) {
    return { address: raw, suburb: match[1].trim() }
  }

  return { address: raw, suburb: null }
}

export function hasUsableLocation(location) {
  if (!location || typeof location !== 'object') return false
  const lat = Number(location.latitude)
  const lng = Number(location.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) return true
  if (String(location.address || '').trim()) return true
  if (String(location.suburb || '').trim()) return true
  return false
}

/** Merge API geocode fields into a location object for state + later requests. */
export function mergeLocationFromResponse(response, base = {}) {
  const next = { ...(base || {}) }
  if (!response || typeof response !== 'object') return next

  const lat = response.location_latitude ?? response.latitude
  const lng = response.location_longitude ?? response.longitude
  if (lat != null && lng != null) {
    const la = Number(lat)
    const ln = Number(lng)
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      next.latitude = la
      next.longitude = ln
    }
  }
  if (response.location_address != null && String(response.location_address).trim()) {
    next.address = String(response.location_address).trim()
  }
  if (response.location_suburb != null && String(response.location_suburb).trim()) {
    next.suburb = String(response.location_suburb).trim()
  }
  return next
}

/** Fields for POST /api/chatbot/chat/ JSON body. */
export function locationToApiFields(location) {
  const fields = {
    location_latitude: null,
    location_longitude: null,
    location_address: null,
    location_suburb: null,
  }
  if (!location || typeof location !== 'object') return fields

  const lat = Number(location.latitude)
  const lng = Number(location.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    fields.location_latitude = lat
    fields.location_longitude = lng
  }

  const address = String(location.address || '').trim()
  if (address) fields.location_address = address

  const suburb = String(location.suburb || '').trim()
  if (suburb) fields.location_suburb = suburb

  return fields
}

export function formatLocationLabel(location) {
  if (!location) return ''
  const parts = []
  if (location.address) parts.push(String(location.address))
  else if (location.suburb) parts.push(String(location.suburb))
  const lat = Number(location.latitude)
  const lng = Number(location.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    parts.push(`(${lat.toFixed(4)}, ${lng.toFixed(4)})`)
  }
  return parts.join(' ') || 'your area'
}

/**
 * Browser GPS with timeout (does not prompt again if already granted).
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ latitude: number, longitude: number }|null>}
 */
export function tryGetBrowserCoords(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10000
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const timer = setTimeout(() => done(null), timeoutMs)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        done({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
      },
      () => {
        clearTimeout(timer)
        done(null)
      },
      { enableHighAccuracy: false, maximumAge: 120000, timeout: Math.min(timeoutMs, 8000) }
    )
  })
}

/** Address + optional suburb + optional GPS merged for sending to chat API. */
export async function buildLocationForChat(manualText, existing = null) {
  const parsed = parseManualLocationInput(manualText)
  const coords = await tryGetBrowserCoords({ timeoutMs: 8000 })

  const location = {
    ...(existing || {}),
    address: parsed.address || String(manualText || '').trim() || existing?.address || null,
    suburb: parsed.suburb || existing?.suburb || null,
  }

  if (coords) {
    location.latitude = coords.latitude
    location.longitude = coords.longitude
  }

  return location
}
