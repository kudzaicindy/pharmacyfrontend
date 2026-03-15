import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPatientSavedMedicines, addPatientSavedMedicine, removePatientSavedMedicine, getPatientSessionIds } from '../utils/api'
import '../components/PatientLayout.css'

export default function PatientSaved() {
  const navigate = useNavigate()
  const { sessionId, conversationId } = getPatientSessionIds()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    if (!sessionId && !conversationId) {
      setLoading(false)
      return
    }
    setError(null)
    try {
      const res = await getPatientSavedMedicines(sessionId, conversationId)
      setList(Array.isArray(res) ? res : res.items || res.saved_medicines || [])
    } catch (e) {
      setError(e.message || 'Failed to load saved medicines')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [sessionId, conversationId])

  const handleRemove = async (medicine_name) => {
    if (!sessionId && !conversationId) return
    try {
      await removePatientSavedMedicine(sessionId, conversationId, medicine_name)
      setList(prev => prev.filter(m => (m.medicine_name || m.name) !== medicine_name))
    } catch (e) {
      setError(e.message || 'Failed to remove')
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const name = addName.trim()
    if (!name || !sessionId && !conversationId) return
    setAdding(true)
    setError(null)
    try {
      await addPatientSavedMedicine(sessionId, conversationId, { medicine_name: name, display_name: name })
      setList(prev => [...prev, { medicine_name: name, display_name: name }])
      setAddName('')
    } catch (e) {
      setError(e.message || 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div><h1>Saved Medicines</h1><p>Your medicine shortlist — quick reorder anytime</p></div>
        <div className="topbar-right">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/patient/search')}>🔍 Browse All</button>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="Medicine name" value={addName} onChange={e => setAddName(e.target.value)} className="form-input" style={{ width: 160 }} />
            <button type="submit" className="btn btn-teal" disabled={adding || !addName.trim()}>{adding ? 'Adding…' : '+ Add'}</button>
          </form>
        </div>
      </div>

      {error && (
        <div className="alert-pill" style={{ background: 'var(--red-light)', borderColor: '#fecaca', marginBottom: 16 }}><span>⚠️</span><p>{error}</p></div>
      )}

      <div style={{ background: 'var(--teal-light)', border: '1px solid var(--teal-mid)', borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>💡</span>
        <p style={{ fontSize: 13.5, color: 'var(--teal-dark)', margin: 0 }}><strong>Tip:</strong> Saved medicines let you request a search with one click — no re-typing needed. Great for regular prescriptions.</p>
      </div>

      {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {!loading && !sessionId && !conversationId && <p style={{ color: 'var(--muted)' }}>Use the chatbot or register so your saved medicines are stored.</p>}
      {!loading && (sessionId || conversationId) && list.length === 0 && <p style={{ color: 'var(--muted)' }}>No saved medicines yet. Add one above or save from search results.</p>}
      {!loading && list.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {list.map((m, i) => {
            const medName = m.medicine_name || m.name || m.display_name || '—'
            return (
              <div key={m.medicine_name || m.name || i} className="saved-card" style={{ background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 22, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>💊</div>
                  <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: 4 }} title="Remove" onClick={() => handleRemove(medName)}>✕</button>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)', marginBottom: 8 }}>{m.display_name || medName}</div>
                <button type="button" className="btn btn-teal" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }} onClick={() => navigate('/patient/search')}>🔍 Search Now</button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
