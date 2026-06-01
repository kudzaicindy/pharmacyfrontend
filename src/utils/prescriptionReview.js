/**
 * Prescription OCR snapshot + image helpers (patient upload → pharmacist broadcast).
 */

import { getChatbotApiBaseUrl } from './api'

/** @returns {object|null} Normalized review snapshot from API row or upload/chat payload. */
export function normalizePrescriptionReview(source) {
  if (!source || typeof source !== 'object') return null
  const raw =
    source.prescription_review ??
    source.prescription_review_snapshot ??
    (Array.isArray(source.items) || source.summary_markdown || source.raw_text_excerpt
      ? source
      : null)
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) return null
  return raw
}

export function prescriptionConfidencePercent(source) {
  if (!source || typeof source !== 'object') return null
  const p =
    source.prescription_confidence_percent ??
    source.confidence_percent ??
    source.confidence
  if (typeof p === 'number' && Number.isFinite(p)) {
    return p <= 1 && p > 0 ? Math.round(p * 100) : Math.round(p)
  }
  if (typeof p === 'string' && p.trim() !== '') {
    const n = parseFloat(p.replace('%', ''))
    return Number.isFinite(n) ? Math.round(n <= 1 && n > 0 ? n * 100 : n) : null
  }
  return null
}

/** Medicine names from review items + optional fallback list. */
export function prescriptionMedicineNames(review, fallbackMedicines = []) {
  const names = []
  const push = (v) => {
    const s = String(v || '').trim()
    if (s && !names.some((x) => x.toLowerCase() === s.toLowerCase())) names.push(s)
  }
  const rev = normalizePrescriptionReview(review)
  if (rev) {
    const items = rev.items
    if (Array.isArray(items)) {
      for (const it of items) {
        if (typeof it === 'string') push(it)
        else if (it && typeof it === 'object') push(it.medicine ?? it.name ?? it.medicine_name)
      }
    }
    if (Array.isArray(rev.medicines)) rev.medicines.forEach(push)
    if (Array.isArray(rev.prescription_medicines)) rev.prescription_medicines.forEach(push)
  }
  if (Array.isArray(fallbackMedicines)) fallbackMedicines.forEach(push)
  return names
}

export function prescriptionDosagesMap(review) {
  const rev = normalizePrescriptionReview(review)
  const d = rev?.dosages
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {}
}

export function requestHasPrescriptionImage(request) {
  return Boolean(
    request?.has_prescription_image === true ||
      request?.has_prescription_image === 'true' ||
      request?.prescription_image_url
  )
}

export function requestHasPrescriptionReview(request) {
  const rev = normalizePrescriptionReview(request)
  if (!rev) return false
  return (
    prescriptionMedicineNames(rev).length > 0 ||
    Boolean(rev.summary_markdown) ||
    Boolean(rev.raw_text_excerpt) ||
    Boolean(rev.reading_notes)
  )
}

export function requestHasPrescriptionAssets(request) {
  return requestHasPrescriptionImage(request) || requestHasPrescriptionReview(request)
}

/** Absolute image URL from list row, or build downloader path. */
export function getPrescriptionImageUrl(request, pharmacistId) {
  const direct = request?.prescription_image_url
  if (direct && typeof direct === 'string') return direct
  if (!requestHasPrescriptionImage(request)) return null
  const rid = request?.request_id ?? request?.medicine_request_id
  if (!rid || pharmacistId == null || String(pharmacistId).trim() === '') return null
  return pharmacistPrescriptionImageUrl(rid, pharmacistId)
}

export function pharmacistPrescriptionImageUrl(requestId, pharmacistId) {
  const base = getChatbotApiBaseUrl().replace(/\/$/, '')
  const params = new URLSearchParams()
  params.set('pharmacist_id', String(pharmacistId).trim())
  return `${base}/pharmacist/requests/${encodeURIComponent(String(requestId))}/prescription-image/?${params.toString()}`
}

/** Build review snapshot from upload-prescription JSON for verify / broadcast. */
export function prescriptionReviewFromUploadResult(result) {
  if (!result || typeof result !== 'object') return null
  const existing = normalizePrescriptionReview(result)
  if (existing) return existing
  if (prescriptionOcrExtractionUnavailable(result)) {
    return {
      items: [],
      dosages: {},
      reading_notes:
        result.prescription_reading_notes ??
        result.reading_notes ??
        'OCR could not read medicines; pharmacist review from prescription image.',
      source: 'upload_prescription_ocr_failed',
    }
  }
  const medicines = Array.isArray(result.medicines) ? result.medicines : []
  if (medicines.length === 0 && !result.dosages && !result.reading_notes) return null
  const pct = prescriptionConfidencePercent(result)
  return {
    items: medicines,
    dosages: result.dosages && typeof result.dosages === 'object' ? result.dosages : {},
    confidence_percent: pct,
    reading_notes:
      result.prescription_reading_notes ??
      result.reading_notes ??
      result.prescription_review?.reading_notes,
    summary_markdown: result.summary_markdown ?? result.summary,
    raw_text_excerpt: result.raw_text_excerpt ?? result.raw_text,
    source: 'upload_prescription',
  }
}

const OCR_FAIL_TEXT =
  /could not extract|quota exceeded|rate.limit|rate-limit|gemini|generativelanguage|ocr|unable to read|failed to extract|try again or enter|billing details/i

/** OCR/Gemini did not return medicines (incl. quota 429, empty items, confidence 0). */
export function prescriptionOcrExtractionUnavailable(result) {
  if (!result || typeof result !== 'object') return false
  if (
    result.ocr_failed === true ||
    result.ocr_failed === 'true' ||
    result.ocr_success === false ||
    result.requires_pharmacist_review === true ||
    result.prescription_image_only === true ||
    result.pharmacist_review_only === true
  ) {
    return true
  }
  const meds = prescriptionMedicineNames(result, result.medicines)
  if (meds.length > 0) return false

  const confLabel = String(result.confidence || '').trim().toLowerCase()
  if (confLabel === 'low' || result.confidence_percent === 0) return true

  const errText = String(result.error || result.message || result.detail || '')
  if (errText && OCR_FAIL_TEXT.test(errText)) return true

  const items = result.items
  const hasEmptyItems = Array.isArray(items) && items.length === 0
  const hasEmptyMeds = !Array.isArray(result.medicines) || result.medicines.length === 0
  if (hasEmptyMeds && hasEmptyItems && (result.conversation_id || errText)) return true

  return false
}

/** Image/request exists for pharmacist review (OCR empty). */
export function prescriptionOcrFailed(result) {
  if (!prescriptionOcrExtractionUnavailable(result)) return false
  const meds = prescriptionMedicineNames(result, result.medicines)
  if (meds.length > 0) return false
  return Boolean(
    result.has_prescription_image === true ||
      result.has_prescription_image === 'true' ||
      result.prescription_image_saved === true ||
      result.medicine_request_id ||
      result.request_sent_to_pharmacies === true
  )
}

/** Use pharmacist image-review path (OCR failed or skipped). */
export function prescriptionNeedsPharmacistReviewPath(result) {
  return prescriptionOcrExtractionUnavailable(result)
}

/** Patient-facing text — never show raw Gemini quota errors. */
export function prescriptionUploadUserMessage(result, tChat, language) {
  if (!result || typeof result !== 'object') return ''
  const errText = String(result.error || '')
  if (errText && OCR_FAIL_TEXT.test(errText)) {
    return tChat(language, 'rx.ocrServiceUnavailable')
  }
  const msg = String(result.message || '').trim()
  if (msg && /could not extract|try again or enter/i.test(msg)) {
    return tChat(language, 'rx.ocrFailedSent')
  }
  if (typeof result.response === 'string' && result.response.trim()) return result.response.trim()
  return ''
}

export function prescriptionRequestAlreadyBroadcast(result) {
  if (!result || typeof result !== 'object') return false
  return Boolean(
    result.request_sent_to_pharmacies === true ||
      (Array.isArray(result.pharmacy_responses) && result.pharmacy_responses.length > 0) ||
      (Number(result.total_responses) > 0 && result.polling_enabled)
  )
}

/** Pharmacist must read the Rx image and type medicines (no OCR lines). */
export function requestNeedsPharmacistMedicineEntry(request) {
  if (!request || typeof request !== 'object') return false
  const meds = prescriptionMedicineNames(request, request.medicine_names)
  if (meds.length > 0) return false
  return (
    requestHasPrescriptionImage(request) ||
    request.ocr_failed === true ||
    request.prescription_image_only === true ||
    request.pharmacist_review_only === true
  )
}

/** POST /chat/ — broadcast Rx image to pharmacies when OCR could not read medicines. */
export function buildPrescriptionImageOnlyBroadcastOptions(result, review = null) {
  const notes =
    result?.prescription_reading_notes ??
    result?.reading_notes ??
    'Prescription image uploaded; OCR could not read medicines. Pharmacist review required.'
  const rev =
    normalizePrescriptionReview(review) ||
    normalizePrescriptionReview(result) || {
      items: [],
      dosages: {},
      reading_notes: notes,
      source: 'upload_prescription_ocr_failed',
    }
  return {
    ...buildPrescriptionBroadcastChatOptions(rev, []),
    prescription_image_only: true,
    ocr_failed: true,
  }
}

/** Options for POST /chat/ when patient confirms OCR medicines (locks Rx on broadcast). */
export function buildPrescriptionBroadcastChatOptions(review, medicines) {
  const meds = (Array.isArray(medicines) ? medicines : [])
    .map((m) => String(m || '').trim())
    .filter(Boolean)
  const rev = normalizePrescriptionReview(review) || {}
  const pct = prescriptionConfidencePercent(rev) ?? prescriptionConfidencePercent({ confidence: rev.confidence })
  const notes = rev.reading_notes ?? rev.prescription_reading_notes
  const opts = {
    input_type: 'prescription_broadcast',
    prescription_broadcast: true,
    medicines: meds,
    prescription_medicines: meds,
    prescription_items: meds,
  }
  if (pct != null) opts.prescription_confidence_percent = pct
  if (notes) opts.prescription_reading_notes = String(notes)
  return opts
}
