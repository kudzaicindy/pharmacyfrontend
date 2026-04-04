import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getAdminRequestDetail } from '../utils/api'
import AdminAppShell from '../components/AdminAppShell'
import { useAdminShell } from '../hooks/useAdminShell'

function AdminRequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const shell = useAdminShell('requests')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    if (localStorage.getItem('userRole') !== 'admin') {
      navigate('/login')
      return
    }
    ;(async () => {
      try {
        setLoading(true)
        const resp = await getAdminRequestDetail(id)
        setData(resp)
      } catch (e) {
        setError(e.message || 'Failed to load request detail')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, navigate])

  const req = data?.request || {}

  return (
    <AdminAppShell {...shell}>
      <div className="admin-topbar">
        <div>
          <h1>Request Detail</h1>
          <p>{req.request_id || id}</p>
        </div>
        <Link to="/admin/dashboard?tab=requests" className="btn-light">
          Patient requests
        </Link>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading ? (
        <div className="admin-loading">Loading request...</div>
      ) : (
        <div className="admin-request-grid">
          <section className="admin-request-card">
            <h3>Patient request</h3>
            <p className="cell-muted">{req.request_type || 'N/A'} · {req.status || 'N/A'}</p>
            <p>{Array.isArray(req.medicine_names) ? req.medicine_names.join(', ') : 'No medicines'}</p>
            <p className="cell-muted">{req.symptoms || 'No symptoms text'}</p>
          </section>
          <section className="admin-request-card">
            <h3>Pharmacy responses</h3>
            <p className="cell-muted">{(data?.pharmacy_responses || []).length} responses</p>
          </section>
          <section className="admin-request-card">
            <h3>Post-broadcast actions</h3>
            <p className="cell-muted">
              Reservations: {(data?.reservations || []).length} · Ratings: {(data?.ratings || []).length}
            </p>
            <p className="cell-muted">Notifications: {(data?.notifications || []).length}</p>
          </section>
        </div>
      )}
    </AdminAppShell>
  )
}

export default AdminRequestDetailPage
