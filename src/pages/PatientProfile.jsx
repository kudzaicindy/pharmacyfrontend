import { useState, useEffect } from 'react'
import { getPatientProfile, updatePatientProfile, getPatientDashboardStats, getPatientSessionIds } from '../utils/api'
import '../components/PatientLayout.css'

export default function PatientProfile() {
  const { sessionId, conversationId, patient: localPatient } = getPatientSessionIds()
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({ display_name: '', email: '', phone: '', date_of_birth: '', home_area: '', preferred_language: 'en', allergies: [], conditions: [], max_search_radius_km: 10, sort_results_by: 'best_match' })

  useEffect(() => {
    if (!sessionId && !conversationId) {
      setForm({ ...form, display_name: localPatient?.display_name || localPatient?.name || '', email: localPatient?.email || '', phone: localPatient?.phone || '' })
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setError(null)
      try {
        const [profileRes, statsRes] = await Promise.all([
          getPatientProfile(sessionId, conversationId),
          getPatientDashboardStats(sessionId, conversationId).catch(() => null),
        ])
        if (cancelled) return
        setProfile(profileRes)
        setStats(statsRes)
        const p = profileRes?.profile || profileRes || {}
        setForm({
          display_name: p.display_name ?? localPatient?.display_name ?? '',
          email: p.email ?? localPatient?.email ?? '',
          phone: p.phone ?? localPatient?.phone ?? '',
          date_of_birth: p.date_of_birth ?? '',
          home_area: p.home_area ?? '',
          preferred_language: p.preferred_language ?? 'en',
          allergies: Array.isArray(p.allergies) ? p.allergies : [],
          conditions: Array.isArray(p.conditions) ? p.conditions : [],
          max_search_radius_km: p.max_search_radius_km ?? 10,
          sort_results_by: p.sort_results_by ?? 'best_match',
        })
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load profile')
        setForm({ ...form, display_name: localPatient?.display_name || localPatient?.name || '', email: localPatient?.email || '', phone: localPatient?.phone || '' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, conversationId])

  const handleSave = async () => {
    if (!sessionId && !conversationId) {
      setError('Register or use the chatbot to save profile to the server.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await updatePatientProfile(sessionId, conversationId, {
        display_name: form.display_name,
        email: form.email,
        phone: form.phone,
        date_of_birth: form.date_of_birth || undefined,
        home_area: form.home_area || undefined,
        preferred_language: form.preferred_language,
        allergies: form.allergies,
        conditions: form.conditions,
        max_search_radius_km: form.max_search_radius_km,
        sort_results_by: form.sort_results_by,
      })
      setSuccess('Profile saved.')
    } catch (e) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const name = form.display_name || localPatient?.display_name || localPatient?.name || 'Guest'
  const initials = name.split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2) || '?'

  return (
    <>
      <div className="topbar">
        <div><h1>My Profile</h1><p>Manage your personal information and preferences</p></div>
        <div className="topbar-right">
          {success && <span style={{ color: 'var(--teal)', marginRight: 8 }}>{success}</span>}
          <button type="button" className="btn btn-teal" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
      {error && (
        <div className="alert-pill" style={{ background: 'var(--red-light)', borderColor: '#fecaca', marginBottom: 16 }}><span>⚠️</span><p>{error}</p></div>
      )}
      {loading && <p style={{ color: 'var(--muted)' }}>Loading profile…</p>}
      {!loading && (
        <div className="profile-grid">
          <div className="profile-left">
            <div className="card card-body profile-avatar-card">
              <div className="profile-avatar">{initials}</div>
              <div className="profile-name">{name}</div>
              <div className="profile-email">{form.email || '—'}</div>
              <span className="badge b-green">Verified</span>
            </div>
            <div className="card">
              <div className="card-header"><div className="card-title">Account Stats</div></div>
              <div className="card-body profile-stats">
                <div><span>Active requests</span><span>{stats?.active_requests ?? 0}</span></div>
                <div><span>Fulfilled</span><span>{stats?.fulfilled_count ?? 0}</span></div>
                <div><span>Expired</span><span>{stats?.expired_count ?? 0}</span></div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><div className="card-title">Medical Alerts</div></div>
              <div className="card-body">
                <div className="profile-alerts">
                  {form.allergies?.length ? form.allergies.map((a, i) => <span key={i} className="badge b-red">{a}</span>) : null}
                  {form.conditions?.length ? form.conditions.map((c, i) => <span key={i} className="badge b-amber">{c}</span>) : null}
                  {(!form.allergies?.length && !form.conditions?.length) && <span style={{ color: 'var(--muted)', fontSize: 13 }}>None set</span>}
                </div>
              </div>
            </div>
          </div>
          <div className="profile-right">
            <div className="card">
              <div className="card-header"><div className="card-title">Personal Information</div></div>
              <div className="card-body">
                <div className="profile-form-grid">
                  <div className="form-group"><label className="form-label">Display Name</label><input className="form-input" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">DOB</label><input className="form-input" type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div>
                </div>
                <div className="form-group"><label className="form-label">Home Area</label><input className="form-input" value={form.home_area} onChange={e => setForm({ ...form, home_area: e.target.value })} placeholder="e.g. Avondale, Harare" /></div>
                <div className="form-group"><label className="form-label">Language</label><select className="form-input" value={form.preferred_language} onChange={e => setForm({ ...form, preferred_language: e.target.value })}><option value="en">English</option><option value="sn">Shona</option><option value="nd">Ndebele</option></select></div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><div className="card-title">Search Preferences</div></div>
              <div className="card-body">
                <div className="profile-form-grid">
                  <div className="form-group"><label className="form-label">Max Radius (km)</label><select className="form-input" value={form.max_search_radius_km} onChange={e => setForm({ ...form, max_search_radius_km: Number(e.target.value) })}><option value={5}>5 km</option><option value={10}>10 km</option><option value={20}>20 km</option><option value={50}>50 km</option></select></div>
                  <div className="form-group"><label className="form-label">Sort By</label><select className="form-input" value={form.sort_results_by} onChange={e => setForm({ ...form, sort_results_by: e.target.value })}><option value="best_match">Best Match</option><option value="nearest">Nearest</option><option value="cheapest">Cheapest</option></select></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
