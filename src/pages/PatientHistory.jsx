import { useState, useEffect } from 'react'
import { getPatientRequests, getPatientSessionIds } from '../utils/api'
import '../components/PatientLayout.css'

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' }) + ' ' + d.toLocaleTimeString(undefined, { timeStyle: 'short' })
}

export default function PatientHistory() {
  const { sessionId, conversationId } = getPatientSessionIds()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!sessionId && !conversationId) {
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setError(null)
      try {
        const res = await getPatientRequests(sessionId, conversationId, { status: 'all', limit: 50 })
        setRequests(Array.isArray(res) ? res : res.requests || res.results || [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, conversationId])

  return (
    <>
      <div className="topbar">
        <div><h1>Search History</h1><p>Past medicine searches and requests</p></div>
      </div>
      {error && (
        <div className="alert-pill" style={{ background: 'var(--red-light)', borderColor: '#fecaca', marginBottom: 16 }}><span>⚠️</span><p>{error}</p></div>
      )}
      <div className="card">
        <div className="card-body">
          {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          {!loading && !sessionId && !conversationId && <p style={{ color: 'var(--muted)' }}>Use the chatbot or search to create requests. Your history will appear here.</p>}
          {!loading && (sessionId || conversationId) && requests.length === 0 && <p style={{ color: 'var(--muted)' }}>No history yet.</p>}
          {!loading && requests.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {requests.map((r) => (
                <li key={r.request_id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    #{r.short_request_id || (r.request_id || '').slice(0, 8)} — {(r.medicine_names && r.medicine_names.length) ? r.medicine_names.join(', ') : r.symptoms || 'Request'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {r.location_address || '—'} · {formatDate(r.submitted_at)}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`badge ${r.status === 'responses_received' || r.status === 'fulfilled' ? 'b-teal' : r.status === 'expired' ? 'b-amber' : 'b-gray'}`}>{r.status || '—'}</span>
                    {r.response_count != null && <span style={{ fontSize: 12 }}>{r.response_count} response(s)</span>}
                    {r.best_price != null && <span style={{ fontSize: 12 }}>Best: ${r.best_price}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
