/**
 * Zimbabwe-ish city bucketing helpers. Backend should own authoritative geo_region;
 * these improve client fallbacks and analytics label display.
 */

/** Concatenate common medicine-request location fields for substring city matching. */
export function haystackForZwCityBucket(request) {
  if (!request || typeof request !== 'object') return ''
  const r = request
  return [
    r.location_text,
    r.delivery_address,
    r.pickup_address,
    r.area,
    r.patient_area,
    r.location,
    r.notes,
    r.location_suburb,
    r.location_address,
    r.suburb,
    r.city,
    r.address
  ]
    .filter(Boolean)
    .join(' ')
}

/** True if the string is only two decimal numbers (typical map pin pasted as "lat, lng"). */
export function stringLooksLikeLatLngPair(s) {
  const t = String(s ?? '').trim()
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180
}

/**
 * Rough suburb/city labels from coordinates (Zimbabwe focus). Not a substitute for reverse geocoding.
 * @returns {{ city: string, suburb: string|null, label: string } | null}
 */
export function approximateZwPlaceFromCoords(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const inBox = (minLa, maxLa, minLo, maxLo) =>
    lat >= minLa && lat <= maxLa && lng >= minLo && lng <= maxLo

  /** @param {number} cLat @param {number} cLng @param {string} cityName */
  const quadrantLabel = (cLat, cLng, cityName) => {
    const dLat = lat - cLat
    const dLng = lng - cLng
    if (Math.abs(dLat) < 0.015 && Math.abs(dLng) < 0.022) {
      return { city: cityName, suburb: 'Central area', label: `Central area, ${cityName}` }
    }
    const ns = dLat > 0.01 ? 'north' : dLat < -0.01 ? 'south' : ''
    const ew = dLng > 0.018 ? 'east' : dLng < -0.018 ? 'west' : ''
    if (!ns && !ew) {
      return { city: cityName, suburb: 'Central area', label: `Central area, ${cityName}` }
    }
    if (ns && ew) {
      const suburb = `${ns.charAt(0).toUpperCase() + ns.slice(1)}-${ew} area`
      return { city: cityName, suburb, label: `${suburb}, ${cityName}` }
    }
    if (ns) {
      const suburb = `${ns.charAt(0).toUpperCase() + ns.slice(1)}ern suburbs`
      return { city: cityName, suburb, label: `${suburb}, ${cityName}` }
    }
    const suburb = `${ew.charAt(0).toUpperCase() + ew.slice(1)}ern side`
    return { city: cityName, suburb, label: `${suburb}, ${cityName}` }
  }

  if (inBox(-18.18, -17.48, 30.86, 31.32)) {
    return quadrantLabel(-17.828, 31.052, 'Harare')
  }
  if (inBox(-20.32, -19.92, 28.38, 28.92)) {
    return quadrantLabel(-20.15, 28.58, 'Bulawayo')
  }
  if (inBox(-19.08, -18.78, 32.48, 32.78)) {
    return quadrantLabel(-18.97, 32.62, 'Mutare')
  }
  if (inBox(-19.58, -19.35, 29.68, 30.02)) {
    return quadrantLabel(-19.45, 29.82, 'Gweru')
  }
  if (inBox(-20.25, -19.98, 30.68, 30.95)) {
    return quadrantLabel(-20.08, 30.83, 'Masvingo')
  }

  return {
    city: 'Zimbabwe',
    suburb: null,
    label: `Approx. area (map pin), Zimbabwe`
  }
}

/**
 * Human-readable patient / delivery location for pharmacy dashboards.
 * Prefer `location_text` when the API sends it (suburb/city label); fall back to address fields and coords.
 * Uses related fallbacks as {@link haystackForZwCityBucket}.
 *
 * @param {Record<string, unknown>|null|undefined} request
 * @param {string} [cityFallback] e.g. pharmacy city when the request has no area text
 * @returns {{ main: string, sub: string, distanceKm: number|null, pinPlaceLabel: string|null }}
 */
export function patientLocationMainSub(request, cityFallback = '') {
  const r = request && typeof request === 'object' ? request : {}
  const strip = (s) =>
    String(s ?? '')
      .replace(/^Patient in\s+/i, '')
      .replace(/^location\s*:\s*/i, '')
      .trim()

  const lat = Number(r.location_latitude ?? r.latitude ?? r.patient_latitude)
  const lng = Number(r.location_longitude ?? r.longitude ?? r.patient_longitude)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
  const inferred = hasCoords ? approximateZwPlaceFromCoords(lat, lng) : null
  const pinPlaceLabel = inferred?.label ?? null

  /** Backend-provided human area (e.g. "Mount Pleasant, Harare") — prefer over raw coords in location_address. */
  const locationText = strip(r.location_text)

  const rawStreet =
    strip(r.patient_address) ||
    strip(r.location_address) ||
    strip(r.delivery_address) ||
    strip(r.pickup_address) ||
    strip(r.address) ||
    ''

  const streetLike = stringLooksLikeLatLngPair(rawStreet) ? '' : rawStreet

  const areaLike =
    strip(r.location_suburb) ||
    strip(r.suburb) ||
    strip(r.patient_area) ||
    strip(r.pickup_area) ||
    strip(r.area) ||
    ''

  const city = strip(r.city)
  const fb = strip(cityFallback)

  let main = locationText || streetLike || areaLike || city || fb || ''
  if (!main && inferred) {
    main = inferred.label
  }
  if (!main && hasCoords) {
    main = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`
  }
  if (!main) {
    main = '—'
  }

  const subParts = []
  if (streetLike && areaLike && !streetLike.toLowerCase().includes(areaLike.toLowerCase())) {
    subParts.push(areaLike)
  }
  if (city && !main.toLowerCase().includes(city.toLowerCase())) {
    subParts.push(city)
  }

  const distanceKm =
    r.distance_km != null && !Number.isNaN(Number(r.distance_km)) ? Number(r.distance_km) : null
  if (distanceKm != null) {
    subParts.push(`${distanceKm.toFixed(1)} km away`)
  } else {
    subParts.push('Distance not shared')
  }

  return { main, sub: subParts.join(' · '), distanceKm, pinPlaceLabel }
}

/**
 * Some analytics endpoints bucket by one truncated float (often Harare metro longitude ~31.05°E).
 * Map to a readable label for the admin UI only.
 */
export function displayLabelForAnalyticsGeoRegionKey(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  if (lower === 'other' || lower === 'unknown') return s

  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return s

  if (n >= -19 && n <= -15) {
    if (n >= -17.95 && n <= -17.55) return 'Harare'
  }
  if (n >= 25 && n <= 33) {
    if (n >= 30.95 && n <= 31.18) return 'Harare'
    if (n >= 28.45 && n <= 28.85) return 'Bulawayo'
    if (n >= 32.45 && n <= 32.85) return 'Mutare'
    if (n >= 29.65 && n <= 30.05) return 'Gweru'
    if (n >= 30.55 && n <= 30.92) return 'Masvingo'
  }

  return s
}
