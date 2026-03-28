import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, ClipboardList, CalendarCheck2, LogOut, RefreshCw, ShieldCheck, LayoutDashboard, Bell } from 'lucide-react'
import { getAdminDashboardData } from '../utils/api'
import './AdminDashboard.css'

function AdminDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [pharmacies, setPharmacies] = useState([])
  const [pharmacists, setPharmacists] = useState([])
  const [allRequests, setAllRequests] = useState([])
  const [allReservations, setAllReservations] = useState([])

  const [overview, setOverview] = useState(null)
  const [requestsByStatus, setRequestsByStatus] = useState({})

  const normalizeList = (data) => {
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.results)) return data.results
    if (Array.isArray(data?.pharmacies)) return data.pharmacies
    if (Array.isArray(data?.pharmacists)) return data.pharmacists
    if (Array.isArray(data?.patient_requests)) return data.patient_requests
    if (Array.isArray(data?.reservations)) return data.reservations
    if (Array.isArray(data?.items)) return data.items
    return []
  }

  const fetchDashboard = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const data = await getAdminDashboardData(100)
      const pharmacyList = normalizeList(data?.lists?.pharmacies || [])
      const pharmacistList = normalizeList(data?.lists?.pharmacists || [])
      const requests = normalizeList(data?.lists?.patient_requests || [])
      const reservations = normalizeList(data?.lists?.reservations || [])

      setPharmacies(pharmacyList)
      setPharmacists(pharmacistList)
      setAllRequests(requests)
      setAllReservations(reservations)
      setOverview(data?.overview || null)
      setRequestsByStatus(data?.breakdown?.requests_by_status || {})
    } catch (err) {
      setError(err?.message || 'Failed to load admin dashboard data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const role = localStorage.getItem('userRole')
    if (role !== 'admin') {
      navigate('/login')
      return
    }
    fetchDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const requestStats = useMemo(() => {
    if (overview && typeof overview === 'object') {
      return {
        total: overview.total_patient_requests ?? allRequests.length,
        pending:
          overview.pending_requests ??
          overview.requests_pending ??
          requestsByStatus.pending ??
          requestsByStatus.sent ??
          0,
        responded:
          overview.responded_requests ??
          overview.requests_responded ??
          requestsByStatus.responded ??
          0
      }
    }
    const total = allRequests.length
    const pending = allRequests.filter((r) => {
      const status = String(r?.status || '').toLowerCase()
      return status === 'pending' || status === 'sent'
    }).length
    const responded = allRequests.filter((r) => String(r?.status || '').toLowerCase() === 'responded').length
    return { total, pending, responded }
  }, [allRequests])

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userRole')
    navigate('/login')
  }

  return (
    <div className="admin-dashboard">
      <aside className="admin-sidebar">
        <div className="admin-sb-logo">Medi<span>Connect</span></div>
        <div className="admin-sb-profile">
          <div className="admin-sb-avatar"><ShieldCheck size={16} /></div>
          <div>
            <div className="admin-sb-name">Platform Admin</div>
            <div className="admin-sb-status">System Control</div>
          </div>
        </div>

        <div className="admin-sb-section">Navigation</div>
        <nav className="admin-sb-nav">
          <button className={`admin-sb-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <LayoutDashboard size={17} /> Overview
          </button>
          <button className={`admin-sb-item ${activeTab === 'pharmacies' ? 'active' : ''}`} onClick={() => setActiveTab('pharmacies')}>
            <Building2 size={17} /> Pharmacies
          </button>
          <button className={`admin-sb-item ${activeTab === 'pharmacists' ? 'active' : ''}`} onClick={() => setActiveTab('pharmacists')}>
            <Users size={17} /> Pharmacists
          </button>
          <button className={`admin-sb-item ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
            <ClipboardList size={17} /> Requests
          </button>
          <button className={`admin-sb-item ${activeTab === 'reservations' ? 'active' : ''}`} onClick={() => setActiveTab('reservations')}>
            <CalendarCheck2 size={17} /> Reservations
          </button>
        </nav>

        <div className="admin-sb-footer">
          <button className="logout-btn" type="button" onClick={logout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <h1>Admin Dashboard</h1>
            <p>Manage registered pharmacies, pharmacists, requests, and reservations.</p>
          </div>
          <div className="admin-topbar-actions">
            <button className="btn-light" type="button" onClick={() => fetchDashboard({ silent: true })} disabled={refreshing}>
              <RefreshCw size={16} /> {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="btn-notify" type="button">
              <Bell size={16} /> Alerts
            </button>
          </div>
        </header>

        {error && <div className="admin-error">{error}</div>}
        {loading ? (
          <div className="admin-loading">Loading admin data...</div>
        ) : (
          <>
            {(activeTab === 'overview' || activeTab === 'pharmacies' || activeTab === 'pharmacists' || activeTab === 'requests' || activeTab === 'reservations') && (
              <section className="admin-stats-grid">
                <div className="admin-stat-card">
                  <div className="icon-wrap teal"><Building2 size={18} /></div>
                  <div>
                    <p className="label">Registered Pharmacies</p>
                    <h3>{overview?.total_pharmacies ?? pharmacies.length}</h3>
                  </div>
                </div>
                <div className="admin-stat-card">
                  <div className="icon-wrap blue"><Users size={18} /></div>
                  <div>
                    <p className="label">Registered Pharmacists</p>
                    <h3>{overview?.total_pharmacists ?? pharmacists.length}</h3>
                  </div>
                </div>
                <div className="admin-stat-card">
                  <div className="icon-wrap amber"><ClipboardList size={18} /></div>
                  <div>
                    <p className="label">Patient Requests</p>
                    <h3>{requestStats.total}</h3>
                    <p className="sub">Pending: {requestStats.pending} | Responded: {requestStats.responded}</p>
                  </div>
                </div>
                <div className="admin-stat-card">
                  <div className="icon-wrap green"><CalendarCheck2 size={18} /></div>
                  <div>
                    <p className="label">Reserved Through Platform</p>
                    <h3>{overview?.total_reservations ?? allReservations.length}</h3>
                  </div>
                </div>
              </section>
            )}

            {(activeTab === 'overview' || activeTab === 'pharmacies') && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Pharmacies</h2>
                  <span className="admin-count-chip">{pharmacies.length}</span>
                </div>
                {pharmacies.length === 0 ? (
                  <p className="muted">No pharmacies found.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="admin-table compact-table">
                      <thead>
                        <tr>
                          <th>Pharmacy</th>
                          <th>Address</th>
                          <th>Rating</th>
                          <th>Ratings</th>
                          <th>Response Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pharmacies.slice(0, 12).map((p, idx) => (
                          <tr key={p.pharmacy_id || p.id || idx}>
                            <td><span className="cell-strong truncate">{p.pharmacy_name || p.name || 'N/A'}</span></td>
                            <td><span className="truncate cell-muted">{p.address || p.location_address || p.location_suburb || 'N/A'}</span></td>
                            <td><span className="score-chip">{p.rating ?? p.pharmacy_rating ?? 'N/A'}</span></td>
                            <td><span className="cell-muted">{p.rating_count ?? '0'}</span></td>
                            <td><span className="cell-muted">{p.response_rate != null ? `${p.response_rate}%` : 'N/A'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {(activeTab === 'overview' || activeTab === 'pharmacists') && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Pharmacists</h2>
                  <span className="admin-count-chip">{pharmacists.length}</span>
                </div>
                {pharmacists.length === 0 ? (
                  <p className="muted">No pharmacist records in current pharmacy payload.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="admin-table compact-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Pharmacy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pharmacists.slice(0, 12).map((p, idx) => (
                          <tr key={p.pharmacist_id || `${p.email}-${idx}`}>
                            <td><span className="cell-strong truncate">{p.full_name || p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'N/A'}</span></td>
                            <td><span className="truncate cell-muted">{p.email}</span></td>
                            <td><span className="truncate">{p.pharmacy_name}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {(activeTab === 'overview' || activeTab === 'requests') && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Recent Patient Requests</h2>
                  <span className="admin-count-chip">{allRequests.length}</span>
                </div>
                {allRequests.length === 0 ? (
                  <p className="muted">No request records available for discovered pharmacists.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="admin-table compact-table">
                      <thead>
                        <tr>
                          <th>Request ID</th>
                          <th>Medicines</th>
                          <th>Status</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allRequests.slice(0, 15).map((r, idx) => (
                          <tr key={r.request_id || r.id || idx}>
                            <td><span className="mono">{r.request_id || r.id || 'N/A'}</span></td>
                            <td><span className="truncate">{Array.isArray(r.medicine_names) ? r.medicine_names.join(', ') : (r.medicine_name || 'N/A')}</span></td>
                            <td>
                              <span className={`status-pill status-${String(r.status || '').toLowerCase() || 'unknown'}`}>
                                {r.status || 'N/A'}
                              </span>
                            </td>
                            <td><span className="cell-muted">{r.created_at ? new Date(r.created_at).toLocaleString() : 'N/A'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {(activeTab === 'overview' || activeTab === 'reservations') && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Platform Reservations</h2>
                  <span className="admin-count-chip">{allReservations.length}</span>
                </div>
                {allReservations.length === 0 ? (
                  <p className="muted">No reservation records available for discovered pharmacists.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="admin-table compact-table">
                      <thead>
                        <tr>
                          <th>Reservation ID</th>
                          <th>Status</th>
                          <th>Patient Name</th>
                          <th>Patient Phone</th>
                          <th>Reserved At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allReservations.slice(0, 15).map((r, idx) => (
                          <tr key={r.reservation_id || r.id || idx}>
                            <td><span className="mono">{r.reservation_id || r.id || 'N/A'}</span></td>
                            <td>
                              <span className={`status-pill status-${String(r.status || '').toLowerCase() || 'unknown'}`}>
                                {r.status || 'N/A'}
                              </span>
                            </td>
                            <td><span className="truncate">{r.patient_name || 'N/A'}</span></td>
                            <td><span className="truncate cell-muted">{r.patient_phone || 'N/A'}</span></td>
                            <td><span className="cell-muted">{(r.reserved_at || r.created_at) ? new Date(r.reserved_at || r.created_at).toLocaleString() : 'N/A'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default AdminDashboard
