import { useState, useEffect } from 'react'
import { getPatientNotifications, markPatientNotificationsRead, getPatientSessionIds } from '../utils/api'
import '../components/PatientLayout.css'

export default function PatientNotifications() {
  const { sessionId, conversationId } = getPatientSessionIds()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')

  const load = async () => {
    if (!sessionId && !conversationId) {
      setLoading(false)
      return
    }
    setError(null)
    try {
      const res = await getPatientNotifications(sessionId, conversationId, { type: typeFilter === 'all' ? undefined : typeFilter })
      setList(Array.isArray(res) ? res : res.notifications || res.results || [])
    } catch (e) {
      setError(e.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [sessionId, conversationId, typeFilter])

  const handleMarkAllRead = async () => {
    if (!sessionId && !conversationId) return
    try {
      await markPatientNotificationsRead(sessionId, conversationId, {})
      load()
    } catch (e) {
      setError(e.message || 'Failed to mark read')
    }
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    const now = new Date()
    const diff = (now - d) / 60000
    if (diff < 60) return 'Just now'
    if (diff < 1440) return `${Math.round(diff / 60)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <>
      <div className="topbar">
        <div><h1>Notifications</h1><p>Pharmacy responses and alerts</p></div>
        <div className="topbar-right">
          <button type="button" className="btn btn-ghost" onClick={handleMarkAllRead}>Mark all read</button>
        </div>
      </div>
      {error && (
        <div className="alert-pill" style={{ background: 'var(--red-light)', borderColor: '#fecaca', marginBottom: 16 }}><span>⚠️</span><p>{error}</p></div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'pharmacy_response', 'reminder'].map((t) => (
          <button key={t} type="button" className={`btn btn-ghost ${typeFilter === t ? 'active' : ''}`} style={{ fontSize: 13 }} onClick={() => setTypeFilter(t)}>{t === 'all' ? 'All' : t.replace('_', ' ')}</button>
        ))}
      </div>
      <div className="card">
        <div className="card-body">
          {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          {!loading && !sessionId && !conversationId && <p style={{ color: 'var(--muted)' }}>Use the chatbot or register to see notifications.</p>}
          {!loading && (sessionId || conversationId) && list.length === 0 && <p style={{ color: 'var(--muted)' }}>No notifications yet.</p>}
          {!loading && list.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {list.map((n, i) => (
                <li key={n.id || n.notification_id || i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title || n.message || n.type || 'Notification'}</div>
                    {n.body && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{n.body}</div>}
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{formatDate(n.created_at || n.sent_at)}</div>
                  </div>
                  {n.unread && <span className="badge b-teal" style={{ fontSize: 10 }}>New</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
