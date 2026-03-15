import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPatientRequests, getPatientDashboardStats, getPatientSessionIds } from '../utils/api'
import '../components/PatientLayout.css'

function formatAgo(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 60000
  if (diff < 60) return `${Math.round(diff)} min ago`
  if (diff < 1440) return `${Math.round(diff / 60)} hrs ago`
  return `${Math.round(diff / 1440)} day(s) ago`
}

function openDirections(pharmacyName, suburbOrAddress) {
  if (!pharmacyName) return
  const query = encodeURIComponent(`${pharmacyName} ${suburbOrAddress || ''}`)
  window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
}

export default function PatientRequests() {
  const navigate = useNavigate()
  const { sessionId, conversationId } = getPatientSessionIds()
  const [statusFilter, setStatusFilter] = useState('all')
  const [requests, setRequests] = useState([])
  const [stats, setStats] = useState(null)
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
        const [listRes, statsRes] = await Promise.all([
          getPatientRequests(sessionId, conversationId, { status: statusFilter, limit: 50 }),
          getPatientDashboardStats(sessionId, conversationId),
        ])
        if (cancelled) return
        setRequests(Array.isArray(listRes) ? listRes : listRes.requests || listRes.results || [])
        setStats(statsRes)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load requests')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, conversationId, statusFilter])

  return (
    <>
      <div className="topbar">
        <div><h1>My Requests</h1><p>Track your medicine requests and pharmacy responses</p></div>
        <div className="topbar-right">
          <button type="button" className="btn btn-teal" onClick={() => navigate('/patient/search')}>New Request</button>
        </div>
      </div>
      {error && (
        <div className="alert-pill" style={{ background: 'var(--red-light)', borderColor: '#fecaca', marginBottom: 16 }}>
          <span>⚠️</span><p>{error}</p>
        </div>
      )}
      <div className="stats-grid sg-3">
        <div className="sc teal"><div className="sc-icon">📋</div><div className="sc-label">Active</div><div className="sc-val">{stats?.active_requests ?? 0}</div><div className="sc-sub">Awaiting responses</div></div>
        <div className="sc green"><div className="sc-icon">✅</div><div className="sc-label">Fulfilled</div><div className="sc-val">{stats?.fulfilled_count ?? 0}</div><div className="sc-sub">This month</div></div>
        <div className="sc amber"><div className="sc-icon">⏳</div><div className="sc-label">Expired</div><div className="sc-val">{stats?.expired_count ?? 0}</div><div className="sc-sub">No response</div></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">All Requests</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['all', 'active', 'fulfilled', 'expired'].map((s) => (
              <button key={s} type="button" className={`btn btn-ghost ${statusFilter === s ? 'active' : ''}`} style={{ fontSize: 12 }} onClick={() => setStatusFilter(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="card-body">
          {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          {!loading && !sessionId && !conversationId && <p style={{ color: 'var(--muted)' }}>Use the chatbot or search to create requests. Your session will be stored for this list.</p>}
          {!loading && (sessionId || conversationId) && requests.length === 0 && <p style={{ color: 'var(--muted)' }}>No requests yet. Start a search from the dashboard or search page.</p>}
          {!loading && requests.length > 0 && (
            <table className="requests-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Location</th>
                  <th>Submitted</th>
                  <th>Responses</th>
                  <th>Best price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.request_id} style={{ cursor: 'pointer' }} onClick={() => navigate('/patient/requests')}>
                    <td>
                      <span style={{ fontWeight: 600 }}>#{r.short_request_id || (r.request_id || '').slice(0, 8)}</span>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{(r.medicine_names && r.medicine_names.length) ? r.medicine_names.join(', ') : r.symptoms || '—'}</div>
                    </td>
                    <td>{r.location_address || '—'}</td>
                    <td>{formatAgo(r.submitted_at)}</td>
                    <td>{r.response_count ?? 0}</td>
                    <td>{r.best_price != null ? `$${r.best_price}` : '—'}</td>
                    <td><span className={`badge ${r.status === 'responses_received' || r.status === 'fulfilled' ? 'b-teal' : r.status === 'expired' ? 'b-amber' : 'b-gray'}`}>{r.status || '—'}</span></td>
                    <td>
                      {Array.isArray(r.pharmacy_names) && r.pharmacy_names.length > 0 && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {/* Reserve only for requests that are not completed or expired */}
                          {r.status !== 'fulfilled' && r.status !== 'expired' && (
                            <button
                              type="button"
                              className="btn btn-teal"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                // Open AI assistant so the patient can see pharmacy responses and reserve
                                navigate('/patient/ai-assistant')
                              }}
                            >
                              Reserve
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              openDirections(r.pharmacy_names[0], r.location_address)
                            }}
                          >
                            📍 Get directions
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
