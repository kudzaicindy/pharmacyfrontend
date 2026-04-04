import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAdminControlCenter } from '../utils/api'
import AdminAppShell from '../components/AdminAppShell'
import { useAdminShell } from '../hooks/useAdminShell'

function AdminControlCenter() {
  const navigate = useNavigate()
  const shell = useAdminShell('overview')
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
        const resp = await getAdminControlCenter()
        setData(resp)
      } catch (e) {
        setError(e.message || 'Failed to load control center')
      } finally {
        setLoading(false)
      }
    })()
  }, [navigate])

  const queues = data?.queues || {}

  return (
    <AdminAppShell {...shell}>
      <div className="admin-topbar">
        <div>
          <h1>Control Center</h1>
          <p>Operational queues for admin interventions.</p>
        </div>
        <Link to="/admin/dashboard?tab=overview" className="btn-light">
          Dashboard
        </Link>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading ? (
        <div className="admin-loading">Loading queues...</div>
      ) : (
        <div className="admin-request-grid">
          <section className="admin-request-card">
            <h3>No response requests</h3>
            <p className="cell-muted">{(queues.no_response_requests || []).length} items</p>
          </section>
          <section className="admin-request-card">
            <h3>Expiring reservations</h3>
            <p className="cell-muted">{(queues.expiring_reservations || []).length} items</p>
          </section>
          <section className="admin-request-card">
            <h3>Low rated pharmacies</h3>
            <p className="cell-muted">{(queues.low_rated_pharmacies || []).length} items</p>
          </section>
        </div>
      )}
    </AdminAppShell>
  )
}

export default AdminControlCenter
