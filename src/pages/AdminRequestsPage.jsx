import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAdminDashboardData } from '../utils/api'
import AdminAppShell from '../components/AdminAppShell'
import { useAdminShell } from '../hooks/useAdminShell'

function AdminRequestsPage() {
  const navigate = useNavigate()
  const shell = useAdminShell('requests')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requests, setRequests] = useState([])

  useEffect(() => {
    if (localStorage.getItem('userRole') !== 'admin') {
      navigate('/login')
      return
    }
    ;(async () => {
      try {
        setLoading(true)
        const data = await getAdminDashboardData(100)
        setRequests(data?.lists?.patient_requests || [])
      } catch (e) {
        setError(e.message || 'Failed to load requests')
      } finally {
        setLoading(false)
      }
    })()
  }, [navigate])

  return (
    <AdminAppShell {...shell}>
      <div className="admin-topbar">
        <div>
          <h1>Admin Requests</h1>
          <p>Browse all patient requests.</p>
        </div>
        <Link to="/admin/dashboard?tab=requests" className="btn-light">
          Dashboard · requests
        </Link>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading ? (
        <div className="admin-loading">Loading requests...</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, idx) => (
                <tr key={r.request_id || idx}>
                  <td><span className="mono">{r.request_id || 'N/A'}</span></td>
                  <td>{r.request_type || 'N/A'}</td>
                  <td>{r.status || 'N/A'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-light"
                      onClick={() => navigate(`/admin/requests/${r.request_id}`)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminAppShell>
  )
}

export default AdminRequestsPage
