import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getAdminPatientOverview } from '../utils/api'
import AdminAppShell from '../components/AdminAppShell'
import { useAdminShell } from '../hooks/useAdminShell'

function formatOverviewDate(raw) {
  if (raw == null || raw === '') return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function AdminPatientControlPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const shell = useAdminShell('users')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)

  const refresh = async () => {
    const data = await getAdminPatientOverview(sessionId)
    setOverview(data)
  }

  useEffect(() => {
    if (localStorage.getItem('userRole') !== 'admin') {
      navigate('/login')
      return
    }
    ;(async () => {
      try {
        setLoading(true)
        await refresh()
      } catch (e) {
        setError(e.message || 'Failed to load patient')
      } finally {
        setLoading(false)
      }
    })()
  }, [navigate, sessionId])

  const profile = overview?.profile && typeof overview.profile === 'object' ? overview.profile : null

  return (
    <AdminAppShell {...shell}>
      <div className="admin-topbar">
        <div>
          <h1>Patient Control</h1>
          <p className="mono">{sessionId}</p>
        </div>
        <Link to="/admin/dashboard?tab=users" className="btn-light">
          Users &amp; Patients
        </Link>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading ? (
        <div className="admin-loading">Loading patient overview...</div>
      ) : (
        <div className="admin-patient-layout">
          {overview?.stats && typeof overview.stats === 'object' && (
            <section className="admin-patient-stats" aria-label="Session stats">
              <div className="admin-patient-stat">
                <span className="admin-patient-stat-label">Active requests</span>
                <strong>{overview.stats.active_requests ?? '—'}</strong>
              </div>
              <div className="admin-patient-stat">
                <span className="admin-patient-stat-label">Fulfilled</span>
                <strong className="admin-metric-good">{overview.stats.fulfilled_count ?? '—'}</strong>
              </div>
              <div className="admin-patient-stat">
                <span className="admin-patient-stat-label">Expired</span>
                <strong className="admin-metric-warn">{overview.stats.expired_count ?? '—'}</strong>
              </div>
            </section>
          )}

          <section className="admin-panel admin-panel--compact">
            <div className="admin-panel-head">
              <h2>Profile</h2>
            </div>
            {profile ? (
              <>
                <p className="muted admin-patient-profile-hint">
                  Read-only. Admins do not edit patient profiles; patients manage their own account in the app.
                </p>
                <dl className="admin-patient-readonly-grid">
                  <div>
                    <dt>Name</dt>
                    <dd>{profile.display_name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{profile.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{profile.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt>Home area</dt>
                    <dd>{profile.home_area || '—'}</dd>
                  </div>
                  <div>
                    <dt>Language</dt>
                    <dd>{profile.preferred_language || '—'}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="muted">No saved profile on file for this session.</p>
            )}
          </section>

          <section className="admin-panel admin-patient-requests-panel">
            <div className="admin-panel-head">
              <h2>Requests</h2>
              <span className="admin-count-chip">{(overview?.requests || []).length}</span>
            </div>
            {(overview?.requests || []).length === 0 ? (
              <p className="muted">No medicine requests for this session.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Medicines</th>
                      <th>Submitted</th>
                      <th>Responses</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.requests || []).map((r) => {
                      const rid = r.request_id || r.id
                      const meds = Array.isArray(r.medicine_names)
                        ? r.medicine_names.join(', ')
                        : r.medicine_name || '—'
                      const sym = r.symptoms ? String(r.symptoms).slice(0, 80) : ''
                      return (
                        <tr key={rid || r.short_request_id}>
                          <td className="mono cell-strong">{r.short_request_id || String(rid || '').slice(0, 8) || '—'}</td>
                          <td>{r.request_type || '—'}</td>
                          <td>
                            <span className={`status-pill status-${String(r.status || '').toLowerCase() || 'unknown'}`}>
                              {r.status || '—'}
                            </span>
                          </td>
                          <td>
                            <span title={meds}>{meds.length > 48 ? `${meds.slice(0, 48)}…` : meds}</span>
                            {sym && (
                              <div className="muted admin-patient-symptom-preview" title={r.symptoms}>
                                {sym}
                                {String(r.symptoms).length > 80 ? '…' : ''}
                              </div>
                            )}
                          </td>
                          <td className="cell-muted admin-registry-nowrap">
                            {formatOverviewDate(r.submitted_at || r.created_at)}
                          </td>
                          <td className="mono">{r.response_count ?? '—'}</td>
                          <td>
                            {rid ? (
                              <Link
                                to={`/admin/requests/${encodeURIComponent(rid)}`}
                                className="btn-light"
                                style={{ display: 'inline-block', textDecoration: 'none' }}
                              >
                                Detail
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AdminAppShell>
  )
}

export default AdminPatientControlPage
