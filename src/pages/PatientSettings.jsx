import { useState, useEffect } from 'react'
import { getPatientProfile, updatePatientProfile, getPatientSessionIds } from '../utils/api'
import '../components/PatientLayout.css'

export default function PatientSettings() {
  const { sessionId, conversationId } = getPatientSessionIds()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    preferred_language: 'en',
    max_search_radius_km: 10,
    home_area: '',
    email_notifications: true,
    drug_interaction_alerts: true,
  })

  useEffect(() => {
    if (!sessionId && !conversationId) {
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setError('')
      try {
        const res = await getPatientProfile(sessionId, conversationId)
        if (cancelled) return
        setProfile(res?.profile || res)
        const p = res?.profile || res || {}
        setForm({
          preferred_language: p.preferred_language ?? 'en',
          max_search_radius_km: p.max_search_radius_km ?? 10,
          home_area: p.home_area ?? '',
          email_notifications: p.email_notifications !== false,
          drug_interaction_alerts: p.drug_interaction_alerts !== false,
        })
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load settings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, conversationId])

  const handleSave = async () => {
    if (!sessionId && !conversationId) {
      setError('Register or use the chatbot to save settings.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await updatePatientProfile(sessionId, conversationId, {
        preferred_language: form.preferred_language,
        max_search_radius_km: form.max_search_radius_km,
        home_area: form.home_area || undefined,
        email_notifications: form.email_notifications,
        drug_interaction_alerts: form.drug_interaction_alerts,
      })
      setSuccess('Settings saved.')
    } catch (e) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div><h1>Settings</h1><p>Manage your account preferences and privacy</p></div>
        <div className="topbar-right">
          {success && <span style={{ color: 'var(--teal)', marginRight: 8 }}>{success}</span>}
          <button type="button" className="btn btn-teal" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : '💾 Save Changes'}</button>
        </div>
      </div>
      {error && (
        <div className="alert-pill" style={{ background: 'var(--red-light)', borderColor: '#fecaca', marginBottom: 16 }}><span>⚠️</span><p>{error}</p></div>
      )}
      {loading && <p style={{ color: 'var(--muted)' }}>Loading settings…</p>}
      {!loading && (
        <div className="settings-layout">
          <div className="settings-nav">
            <a className="settings-nav-item active">🔔 Notifications</a>
            <a className="settings-nav-item">📍 Location</a>
            <a className="settings-nav-item">🌐 Language</a>
          </div>
          <div className="settings-content">
            <div className="card">
              <div className="card-header"><div><div className="card-title">🔔 Notification Settings</div><div className="card-sub">Saved via patient profile API</div></div></div>
              <div className="card-body">
                <div className="settings-toggle-row">
                  <div><div className="settings-toggle-title">Pharmacy response alerts</div><div className="settings-toggle-desc">Notify when a pharmacy responds</div></div>
                  <label className="settings-toggle"><input type="checkbox" checked={form.email_notifications} onChange={e => setForm({ ...form, email_notifications: e.target.checked })} /><span /></label>
                </div>
                <div className="settings-toggle-row">
                  <div><div className="settings-toggle-title">Drug interaction warnings</div><div className="settings-toggle-desc">Show warnings when searching</div></div>
                  <label className="settings-toggle"><input type="checkbox" checked={form.drug_interaction_alerts} onChange={e => setForm({ ...form, drug_interaction_alerts: e.target.checked })} /><span /></label>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><div className="card-title">📍 Location &amp; Language</div></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Home Area</label>
                  <input className="form-input" value={form.home_area} onChange={e => setForm({ ...form, home_area: e.target.value })} placeholder="e.g. Avondale, Harare" />
                </div>
                <div className="form-group">
                  <label className="form-label">Default Search Radius (km)</label>
                  <select className="form-input" value={form.max_search_radius_km} onChange={e => setForm({ ...form, max_search_radius_km: Number(e.target.value) })}>
                    <option value={5}>5 km</option>
                    <option value={10}>10 km</option>
                    <option value={20}>20 km</option>
                    <option value={50}>50 km</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Language</label>
                  <select className="form-input" value={form.preferred_language} onChange={e => setForm({ ...form, preferred_language: e.target.value })}>
                    <option value="en">English</option>
                    <option value="sn">Shona</option>
                    <option value="nd">Ndebele</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
