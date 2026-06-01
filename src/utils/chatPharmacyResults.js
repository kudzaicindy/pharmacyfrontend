/**
 * Normalize pharmacy rows from chat/ranked API for patient results (incl. live inventory).
 */

const MEDICINE_STRENGTH_RE =
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|μg|ug|g|kg|ml|l|iu|units?)\b/gi

const MEDICINE_FORM_RE =
  /\b(?:tablet|tablets|tab|tabs|capsule|capsules|cap|caps|syrup|suspension|solution|drops?|cream|ointment|gel|spray|patch|inhaler|injection|ampoules?|vials?|sachets?|packet|pack|bottle)\b/gi

const MEDICINE_BASE_ALIASES = {
  ibrufen: 'ibuprofen',
  acetaminophen: 'paracetamol',
  panadol: 'paracetamol',
}

export function normalizeMedicineName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[()_,/+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalMedicineBase(name) {
  const base = normalizeMedicineName(name)
    .replace(MEDICINE_STRENGTH_RE, ' ')
    .replace(MEDICINE_FORM_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return MEDICINE_BASE_ALIASES[base] || base
}

function medicineStrengthKey(name) {
  const strengthMatches = normalizeMedicineName(name).match(MEDICINE_STRENGTH_RE)
  if (!strengthMatches || strengthMatches.length === 0) return ''
  return strengthMatches.join(' ').replace(/\s+/g, ' ').trim()
}

export function medicineNamesMatchRequest(candidateName, requestedName) {
  const candidate = normalizeMedicineName(candidateName)
  const requested = normalizeMedicineName(requestedName)
  if (!candidate || !requested) return false
  if (candidate === requested) return true

  const candidateBase = canonicalMedicineBase(candidate)
  const requestedBase = canonicalMedicineBase(requested)
  if (!candidateBase || !requestedBase || candidateBase !== requestedBase) return false

  const candidateStrength = medicineStrengthKey(candidate)
  const requestedStrength = medicineStrengthKey(requested)

  // If one side omits dosage, treat it as the same medicine family.
  if (!candidateStrength || !requestedStrength) return true

  return candidateStrength === requestedStrength
}

export function medRowKey(item) {
  return normalizeMedicineName(item?.medicine || item?.medicine_name)
}

export function mergeMedicineRows(...lists) {
  const map = new Map()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (item == null) continue
      if (typeof item === 'string') {
        const k = item.trim().toLowerCase()
        if (!k) continue
        map.set(k, { medicine: item, medicine_name: item, available: true })
        continue
      }
      const k = medRowKey(item)
      if (!k) continue
      const old = map.get(k)
      if (!old) {
        map.set(k, { ...item })
      } else {
        const oF = old.available === false || old.available === 'false'
        const iF = item.available === false || item.available === 'false'
        const oT = old.available === true || old.available === 'true'
        const iT = item.available === true || item.available === 'true'
        let mergedAvailable
        if (oF || iF) mergedAvailable = false
        else if (oT || iT) mergedAvailable = true
        else mergedAvailable = item.available !== undefined ? item.available : old.available

        map.set(k, {
          ...old,
          ...item,
          price:
            item.price != null && String(item.price).trim() !== '' ? item.price : old.price,
          quantity:
            item.quantity != null && String(item.quantity).trim() !== ''
              ? item.quantity
              : old.quantity,
          available: mergedAvailable,
        })
      }
    }
  }
  return Array.from(map.values())
}

function hasMeaningfulPrice(price) {
  if (price == null) return false
  const s = String(price).trim()
  if (!s || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'null') return false
  return true
}

/** Union medicine lines + live-inventory top-level price/qty synthesis. */
export function getCombinedPharmacyMedicines(pharmacy, requestedMedicines = null) {
  if (!pharmacy || typeof pharmacy !== 'object') return []

  const rows = mergeMedicineRows(
    pharmacy.medicine_responses,
    pharmacy.medicines_breakdown,
    pharmacy.medicines,
    pharmacy.live_stock,
    pharmacy.in_stock_medicines,
    pharmacy.inventory_matches,
    pharmacy.stock_lines
  )
  if (rows.length > 0) return rows

  const price = pharmacy.price
  if (!hasMeaningfulPrice(price)) return rows

  const names = new Set()
  if (pharmacy.medicine_name) names.add(String(pharmacy.medicine_name).trim())
  if (pharmacy.matched_medicine) names.add(String(pharmacy.matched_medicine).trim())
  if (Array.isArray(requestedMedicines)) {
    for (const m of requestedMedicines) {
      const s = typeof m === 'string' ? m : m?.medicine || m?.medicine_name
      if (s) names.add(String(s).trim())
    }
  }

  if (names.size === 0 && pharmacy.from_live_inventory !== true && pharmacy.has_live_stock !== true) {
    return rows
  }

  if (names.size === 0) return rows

  return [...names].map((name) => ({
    medicine: name,
    medicine_name: name,
    price,
    quantity: pharmacy.quantity ?? pharmacy.stock_quantity ?? pharmacy.qty,
    available: pharmacy.medicine_available !== false && pharmacy.medicine_available !== 'false',
  }))
}

export function medicineRowInStock(m) {
  if (m == null) return false
  if (m.available === false || m.available === 'false') return false
  if (m.available === true || m.available === 'true') return true
  return hasMeaningfulPrice(m.price)
}

export function pharmacyProvidesUsefulResponse(pharmacy, options = {}) {
  if (!pharmacy || typeof pharmacy !== 'object') return false
  const { fromLiveInventory = false, requestedMedicines = null } = options

  if (pharmacy.medicine_available === true || pharmacy.medicine_available === 'true') return true
  if (pharmacy.from_live_inventory === true || pharmacy.has_live_stock === true) return true

  const meds = getCombinedPharmacyMedicines(pharmacy, requestedMedicines)
  if (meds.some((m) => medicineRowInStock(m))) return true

  if (
    fromLiveInventory &&
    pharmacy.rank != null &&
    hasMeaningfulPrice(pharmacy.price)
  ) {
    return true
  }

  return false
}
