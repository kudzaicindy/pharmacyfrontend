import {
  normalizePrescriptionReview,
  prescriptionConfidencePercent,
  prescriptionDosagesMap,
  prescriptionMedicineNames,
  getPrescriptionImageUrl,
  requestHasPrescriptionImage,
  requestHasPrescriptionReview,
} from '../utils/prescriptionReview'

/**
 * Pharmacist-facing Rx OCR + image (from medicine request row).
 */
export default function PrescriptionReviewPanel({ request, pharmacistId, compact = false }) {
  const review = normalizePrescriptionReview(request)
  const hasReview = requestHasPrescriptionReview(request)
  const hasImage = requestHasPrescriptionImage(request)
  const imageUrl = getPrescriptionImageUrl(request, pharmacistId)
  const medicines = prescriptionMedicineNames(review, request?.medicine_names)
  const dosages = prescriptionDosagesMap(review)
  const confidence = prescriptionConfidencePercent(review ?? request)
  const readingNotes = review?.reading_notes
  const summary = review?.summary_markdown
  const rawExcerpt = review?.raw_text_excerpt

  if (!hasReview && !hasImage) return null

  return (
    <section
      className={`prescription-review-panel${compact ? ' prescription-review-panel--compact' : ''}`}
      aria-label="Prescription verification"
    >
      <div className="prescription-review-panel-head">
        <span className="prescription-badge" aria-hidden>
          📋 Prescription
        </span>
        {confidence != null ? (
          <span
            className={`prescription-review-confidence${
              confidence < 90 ? ' prescription-review-confidence--low' : ''
            }`}
          >
            OCR {confidence}%
          </span>
        ) : null}
      </div>

      {hasImage && imageUrl ? (
        <div className="prescription-review-image-wrap">
          <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="prescription-review-image-link">
            View full image
          </a>
          <img
            src={imageUrl}
            alt="Uploaded prescription"
            className="prescription-review-image"
            loading="lazy"
          />
        </div>
      ) : hasImage ? (
        <p className="prescription-notice">Prescription image on file — reload requests if the preview does not appear.</p>
      ) : null}

      {readingNotes ? (
        <p className="prescription-review-notes">
          <strong>Reading notes:</strong> {readingNotes}
        </p>
      ) : null}

      {medicines.length > 0 ? (
        <div className="prescription-review-meds">
          <strong className="prescription-review-meds-title">Extracted medicines</strong>
          <ul className="prescription-review-med-list">
            {medicines.map((med) => (
              <li key={med}>
                {med}
                {dosages[med] != null && String(dosages[med]).trim() !== '' ? (
                  <span className="prescription-review-dose"> — {dosages[med]}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary ? (
        <div className="prescription-review-summary">
          <strong>Summary</strong>
          <pre className="prescription-review-pre">{summary}</pre>
        </div>
      ) : null}

      {rawExcerpt && !compact ? (
        <details className="prescription-review-raw">
          <summary>OCR text excerpt</summary>
          <pre className="prescription-review-pre">{rawExcerpt}</pre>
        </details>
      ) : null}
    </section>
  )
}
