/**
 * Heuristics for admin "chatbot audit" / AI safety: keyword scan on conversation index rows
 * ({@link getAdminChatbotLogs}) — aligned with sidebar badge and command center.
 */

const KEYWORDS = [
  'emergency',
  'dosage',
  'prescription',
  'not a doctor',
  'diagnos',
  'unsafe',
  'not sure',
  'not certain',
  'consult a doctor',
  'consult your doctor',
  'see a doctor',
  'cannot diagnose',
  "can't diagnose",
  'seek immediate',
  'disclaimer',
  'not medical advice',
  'verify with',
  'professional advice'
]

function haystackFromChatbotLogRow(row) {
  if (!row || typeof row !== 'object') return ''
  return `${row.summary || ''} ${row.last_message || ''} ${row.last_message_preview || ''} ${row.preview || ''} ${row.title || ''} ${row.user_message_preview || ''}`.toLowerCase()
}

/** True when the conversation index row text matches audit keyword heuristics. */
export function chatbotLogRowNeedsReview(row) {
  const t = haystackFromChatbotLogRow(row)
  return KEYWORDS.some((k) => t.includes(k))
}

/**
 * @param {Array<object>} logs - {@link getAdminChatbotLogs} results page
 * @param {number} [limit]
 * @returns {Array<{ tone: 'bad'|'warn', q: string, when: string, resp: string, actions: string[], conversationId?: string }>}
 */
export function mapChatbotLogsToAuditPreview(logs, limit = 5) {
  if (!Array.isArray(logs) || !logs.length) return []
  const out = []
  for (const row of logs) {
    if (!chatbotLogRowNeedsReview(row)) continue
    const cid =
      row.conversation_id ?? row.conversationId ?? row.id ?? row.pk ?? ''
    const q = String(
      row.title || row.summary || row.last_message_preview || row.preview || row.last_message || 'Conversation'
    ).trim()
    const when = String(
      row.updated_at ?? row.last_message_at ?? row.modified_at ?? row.created_at ?? '—'
    )
    const preview = String(row.last_message_preview || row.last_message || row.summary || '').trim()
    const t = haystackFromChatbotLogRow(row)
    const tone = /emergency|unsafe|diagnos/i.test(t) ? 'bad' : 'warn'
    out.push({
      tone,
      q: q || '—',
      when: when === '—' ? when : formatWhenShort(when),
      resp: preview ? preview.slice(0, 220) + (preview.length > 220 ? '…' : '') : '—',
      actions: ['Review'],
      conversationId: cid ? String(cid) : undefined
    })
    if (out.length >= limit) break
  }
  return out
}

function formatWhenShort(raw) {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}
