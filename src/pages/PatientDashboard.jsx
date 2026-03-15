import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Chatbot from '../components/Chatbot'
import { getPatientDashboardStats, getPatientRequests, getPatientSessionIds } from '../utils/api'
import '../components/PatientLayout.css'

function PatientDashboard() {
  const navigate = useNavigate()
  const [showChatbot, setShowChatbot] = useState(false)
  const [stats, setStats] = useState(null)
  const [activeRequests, setActiveRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { patient, sessionId, conversationId } = getPatientSessionIds()
  const name = patient?.display_name || patient?.name || 'Guest'
  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  useEffect(() => {
    if (!sessionId && !conversationId) {
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setError(null)
      try {
        const [statsRes, requestsRes] = await Promise.all([
          getPatientDashboardStats(sessionId, conversationId),
          getPatientRequests(sessionId, conversationId, { status: 'active', limit: 10 }),
        ])
        if (cancelled) return
        setStats(statsRes)
        setActiveRequests(Array.isArray(requestsRes) ? requestsRes : requestsRes.requests || requestsRes.results || [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, conversationId])

  const formatAgo = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 60000
    if (diff < 60) return `${Math.round(diff)} min ago`
    if (diff < 1440) return `${Math.round(diff / 60)} hrs ago`
    return `${Math.round(diff / 1440)} day(s) ago`
  }
  const firstRequestWithResponses = activeRequests.find(r => (r.response_count || 0) > 0)

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{greeting()}, {name.split(' ')[0] || name} 👋</h1>
          <p>{today} · Here&apos;s your medicine activity</p>
        </div>
        <div className="topbar-right">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/patient/notifications')}>🔔 Notifications</button>
          <button type="button" className="btn btn-teal" onClick={() => navigate('/patient/search')}>🔍 New Search</button>
        </div>
      </div>

      {error && (
        <div className="alert-pill" style={{ background: 'var(--red-light)', borderColor: '#fecaca' }}>
          <span>⚠️</span>
          <p>{error}</p>
        </div>
      )}
      {loading && (
        <div className="alert-pill" style={{ background: 'var(--gray-1)' }}><p>Loading your dashboard…</p></div>
      )}
      {!loading && firstRequestWithResponses && (
        <div className="alert-pill">
          <span style={{ fontSize: 18 }}>💊</span>
          <p><strong>{firstRequestWithResponses.response_count} pharmacies responded</strong> to your {firstRequestWithResponses.medicine_names?.[0] || 'request'} — best price is <strong>${firstRequestWithResponses.best_price ?? '—'}</strong> {firstRequestWithResponses.pharmacy_names?.[0] ? `at ${firstRequestWithResponses.pharmacy_names[0]}` : ''}.</p>
          <span className="al-act" onClick={() => navigate('/patient/requests')}>View Results →</span>
        </div>
      )}

      <div className="stats-grid sg-4" style={{ marginBottom: 20 }}>
        <div className="sc teal fade-in" style={{ animationDelay: '.05s' }}>
          <div className="sc-icon">📋</div>
          <div className="sc-label">Active Requests</div>
          <div className="sc-val">{stats?.active_requests ?? 0}</div>
          <div className="sc-sub">{activeRequests.filter(r => (r.response_count || 0) > 0).length} with responses</div>
        </div>
        <div className="sc green fade-in" style={{ animationDelay: '.1s' }}>
          <div className="sc-icon">✅</div>
          <div className="sc-label">Fulfilled</div>
          <div className="sc-val">{stats?.fulfilled_count ?? 0}</div>
          <div className="sc-sub">This month</div>
        </div>
        <div className="sc amber fade-in" style={{ animationDelay: '.15s' }}>
          <div className="sc-icon">💰</div>
          <div className="sc-label">Avg Savings</div>
          <div className="sc-val">{stats?.avg_savings != null ? `$${Number(stats.avg_savings).toFixed(2)}` : '—'}</div>
          <div className="sc-sub">Per request vs calling</div>
        </div>
        <div className="sc blue fade-in" style={{ animationDelay: '.2s' }}>
          <div className="sc-icon">⏱️</div>
          <div className="sc-label">Time Saved</div>
          <div className="sc-val">{stats?.time_saved_hrs != null ? `${stats.time_saved_hrs}hrs` : '—'}</div>
          <div className="sc-sub">This month</div>
        </div>
      </div>

      <div className="quick-actions">
        <div className="qa" onClick={() => setShowChatbot(true)}>
          <div className="qa-icon">📸</div>
          <div className="qa-label">Upload Prescription</div>
          <div className="qa-sub">OCR reads it instantly</div>
        </div>
        <div className="qa" onClick={() => setShowChatbot(true)}>
          <div className="qa-icon">🧠</div>
          <div className="qa-label">Describe Symptoms</div>
          <div className="qa-sub">AI suggests medicines</div>
        </div>
        <div className="qa" onClick={() => navigate('/patient/search')}>
          <div className="qa-icon">🔍</div>
          <div className="qa-label">Search by Name</div>
          <div className="qa-sub">Brand or generic</div>
        </div>
      </div>

      <div className="grid2">
        <div>
          <div className="card-header" style={{ background: 'transparent', padding: '0 0 14px', border: 'none' }}>
            <div>
              <div className="card-title" style={{ fontSize: 15 }}>Active Requests</div>
              <div className="card-sub">Your current medicine searches</div>
            </div>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => navigate('/patient/requests')}>View All</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeRequests.length === 0 && !loading && (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No active requests. Start a search from the chatbot or search page.</p>
            )}
            {activeRequests.map((r) => (
              <div key={r.request_id || r.id} className="req-card" onClick={() => navigate('/patient/requests')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate('/patient/requests')}>
                <div className="req-icon" style={{ background: (r.response_count || 0) > 0 ? 'var(--teal-light)' : 'var(--amber-light)' }}>{(r.response_count || 0) > 0 ? '💊' : '📋'}</div>
                <div style={{ flex: 1 }}>
                  <div className="req-med">{(r.medicine_names && r.medicine_names.length) ? r.medicine_names.join(', ') : r.symptoms || 'Request'}</div>
                  <div className="req-sub">📍 {r.location_address || '—'} · Submitted {formatAgo(r.submitted_at)}</div>
                  <div className="req-meta">
                    <span className={`badge ${(r.response_count || 0) > 0 ? 'b-teal' : 'b-amber'}`}>{(r.response_count || 0) > 0 ? '🔵 Active' : '⏳ Pending'}</span>
                    {(r.response_count || 0) > 0 && <span className="responses-count">💬 {r.response_count} responses</span>}
                    {(r.response_count || 0) === 0 && <span className="badge b-gray">No responses yet</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="card-header" style={{ background: 'transparent', padding: '0 0 14px', border: 'none' }}>
            <div>
              <div className="card-title" style={{ fontSize: 15 }}>Best Results{firstRequestWithResponses?.medicine_names?.[0] ? ` — ${firstRequestWithResponses.medicine_names[0]}` : ''}</div>
              <div className="card-sub">AI-ranked by distance & price</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body" style={{ padding: '8px 16px' }}>
              {firstRequestWithResponses ? (
                <div className="pharm-row">
                  <div style={{ flex: 1 }}>
                    <div className="pharm-name">{firstRequestWithResponses.pharmacy_names?.[0] || '—'}</div>
                    <div className="pharm-dist">Best price ${firstRequestWithResponses.best_price ?? '—'} · {firstRequestWithResponses.response_count} response(s)</div>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>Complete a search to see ranked pharmacy results here.</p>
              )}
            </div>
            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-teal" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate('/patient/requests')}>👁 View All Requests</button>
            </div>
          </div>
          <div style={{ background: 'var(--amber-light)', border: '1px solid #fde68a', borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e', marginBottom: 4 }}>⚠️ Drug Interaction Alert</div>
            <div style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>Amoxicillin may interact with Warfarin. Consult your doctor before taking both.</div>
          </div>
        </div>
      </div>

      <Chatbot isOpen={showChatbot} onClose={() => setShowChatbot(false)} />
    </>
  )
}

export default PatientDashboard
