import { useState, useEffect } from 'react'
import {
  getPatientProfile,
  updatePatientProfile,
  getPatientSessionIds,
  getPatientMfaStatus,
  startPatientMfaSetup,
  confirmPatientMfaSetup,
  disablePatientMfa,
} from '../utils/api'
import { useLanguage } from '../context/LanguageContext'
import { profileLangToUi } from '../utils/i18n'
import '../components/PatientLayout.css'

export default function PatientSettings() {
  const { t, setLanguage } = useLanguage()
  const { sessionId, conversationId } = getPatientSessionIds()
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
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaError, setMfaError] = useState('')
  const [mfaInfo, setMfaInfo] = useState('')
  const [mfaSetupUri, setMfaSetupUri] = useState('')
  const [mfaOtp, setMfaOtp] = useState('')

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
        const p = res?.profile || res || {}
        setForm({
          preferred_language: p.preferred_language ?? 'en',
          max_search_radius_km: p.max_search_radius_km ?? 10,
          home_area: p.home_area ?? '',
          email_notifications: p.email_notifications !== false,
          drug_interaction_alerts: p.drug_interaction_alerts !== false,
        })
        try {
          const patient = JSON.parse(localStorage.getItem('patient') || '{}')
          localStorage.setItem(
            'patient',
            JSON.stringify({ ...patient, drug_interaction_alerts: p.drug_interaction_alerts !== false })
          )
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load settings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, conversationId])

  useEffect(() => {
    if (!sessionId && !conversationId) return
    let cancelled = false
    setMfaLoading(true)
    setMfaError('')
    getPatientMfaStatus(sessionId, conversationId)
      .then((d) => {
        if (cancelled) return
        const on = Boolean(d?.mfa_enabled ?? d?.totp_enabled ?? d?.enabled)
        setMfaEnabled(on)
      })
      .catch(() => {
        if (!cancelled) {
          setMfaEnabled(false)
          setMfaError('')
        }
      })
      .finally(() => {
        if (!cancelled) setMfaLoading(false)
      })
    return () => { cancelled = true }
  }, [sessionId, conversationId])

  const handleMfaStart = async () => {
    if (!sessionId && !conversationId) return
    setMfaError('')
    setMfaInfo('')
    setMfaLoading(true)
    try {
      const d = await startPatientMfaSetup(sessionId, conversationId)
      const uri = d?.otpauth_uri || d?.provisioning_uri || d?.qr_uri || ''
      setMfaSetupUri(uri)
      setMfaInfo(uri ? 'Scan the QR in your authenticator app (or enter the secret manually), then enter the 6-digit code below.' : 'Enter the 6-digit code from your authenticator app to finish setup.')
    } catch (e) {
      setMfaError(e?.message || 'Two-step setup is not available yet. Ask your server team to enable /patient/mfa/… endpoints.')
    } finally {
      setMfaLoading(false)
    }
  }

  const handleMfaConfirm = async () => {
    if (!sessionId && !conversationId) return
    setMfaError('')
    setMfaInfo('')
    setMfaLoading(true)
    try {
      await confirmPatientMfaSetup(sessionId, conversationId, mfaOtp)
      setMfaEnabled(true)
      setMfaSetupUri('')
      setMfaOtp('')
      setMfaInfo('Two-step authentication is now on.')
    } catch (e) {
      setMfaError(e?.message || 'Invalid code')
    } finally {
      setMfaLoading(false)
    }
  }

  const handleMfaDisable = async () => {
    if (!sessionId && !conversationId) return
    setMfaError('')
    setMfaInfo('')
    setMfaLoading(true)
    try {
      await disablePatientMfa(sessionId, conversationId, mfaOtp)
      setMfaEnabled(false)
      setMfaOtp('')
      setMfaInfo('Two-step authentication turned off.')
    } catch (e) {
      setMfaError(e?.message || 'Could not turn off 2FA')
    } finally {
      setMfaLoading(false)
    }
  }

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
      try {
        const patient = JSON.parse(localStorage.getItem('patient') || '{}')
        localStorage.setItem(
          'patient',
          JSON.stringify({ ...patient, drug_interaction_alerts: form.drug_interaction_alerts })
        )
      } catch {
        /* ignore */
      }
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
                  <div><div className="settings-toggle-title">{t('patient.settings.drugAlerts')}</div><div className="settings-toggle-desc">{t('patient.settings.drugAlertsDesc')}</div></div>
                  <label className="settings-toggle"><input type="checkbox" checked={form.drug_interaction_alerts} onChange={e => setForm({ ...form, drug_interaction_alerts: e.target.checked })} /><span /></label>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">🔐 Two-step sign-in (2FA)</div>
                  <div className="card-sub">Authenticator app (TOTP). Requires backend routes under /patient/mfa/</div>
                </div>
              </div>
              <div className="card-body">
                {mfaError && (
                  <p style={{ color: '#b91c1c', marginTop: 0 }}>{mfaError}</p>
                )}
                {mfaInfo && (
                  <p style={{ color: '#047857', marginTop: 0 }}>{mfaInfo}</p>
                )}
                <p style={{ color: 'var(--muted)', marginTop: 0 }}>
                  Status:{' '}
                  <strong>{mfaLoading ? 'Checking…' : mfaEnabled ? 'On' : 'Off'}</strong>
                </p>
                {mfaSetupUri && (
                  <div className="form-group">
                    <label className="form-label">Setup link (paste into authenticator if needed)</label>
                    <input className="form-input" readOnly value={mfaSetupUri} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">6-digit code</label>
                  <input
                    className="form-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaOtp}
                    onChange={(e) => setMfaOtp(e.target.value.replace(/\s/g, ''))}
                    placeholder="123456"
                  />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {!mfaEnabled ? (
                    <>
                      <button type="button" className="btn btn-teal" disabled={mfaLoading} onClick={handleMfaStart}>
                        Start 2FA setup
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={mfaLoading || !mfaOtp} onClick={handleMfaConfirm}>
                        Confirm &amp; enable
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-secondary" disabled={mfaLoading || !mfaOtp} onClick={handleMfaDisable}>
                      Turn off 2FA (code required)
                    </button>
                  )}
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
                  <select
                    className="form-input"
                    value={form.preferred_language}
                    onChange={(e) => {
                      const val = e.target.value
                      setForm({ ...form, preferred_language: val })
                      setLanguage(profileLangToUi(val))
                    }}
                  >
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
