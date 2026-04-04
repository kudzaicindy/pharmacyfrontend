import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createAdminPharmacist,
  deleteAdminPharmacist,
  getAdminDashboardData,
  updateAdminPharmacist
} from '../utils/api'
import AdminAppShell from '../components/AdminAppShell'
import { useAdminShell } from '../hooks/useAdminShell'

function AdminPharmacistsPage() {
  const navigate = useNavigate()
  const shell = useAdminShell('pharmacists')
  const [items, setItems] = useState([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const data = await getAdminDashboardData(100)
    setItems(data?.lists?.pharmacists || [])
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
        setError(e.message || 'Failed to load pharmacists')
      } finally {
        setLoading(false)
      }
    })()
  }, [navigate])

  return (
    <AdminAppShell {...shell}>
      <div className="admin-topbar">
        <div><h1>Pharmacists</h1><p>Create, update, delete pharmacists.</p></div>
        <Link to="/admin/dashboard?tab=pharmacists" className="btn-light">
          Dashboard · pharmacists
        </Link>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-request-card" style={{ marginBottom: 16 }}>
        <h3>Create pharmacist</h3>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Pharmacist email" />
        <button
          type="button"
          className="btn-light"
          onClick={async () => {
            try {
              await createAdminPharmacist({ email })
              setEmail('')
              await refresh()
            } catch (e) {
              setError(e.message || 'Create failed')
            }
          }}
        >
          Create
        </button>
      </div>
      {loading ? <div className="admin-loading">Loading...</div> : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((p, i) => (
                <tr key={p.pharmacist_id || i}>
                  <td>{p.full_name || p.name || 'N/A'}</td>
                  <td>{p.email || 'N/A'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-light" onClick={async () => {
                      try {
                        const newEmail = window.prompt('New email', p.email || '')
                        if (!newEmail) return
                        await updateAdminPharmacist(p.pharmacist_id || p.id, { email: newEmail })
                        await refresh()
                      } catch (e) {
                        setError(e.message || 'Update failed')
                      }
                    }}>Update</button>
                    <button type="button" className="btn-light" onClick={async () => {
                      try {
                        await deleteAdminPharmacist(p.pharmacist_id || p.id)
                        await refresh()
                      } catch (e) {
                        setError(e.message || 'Delete failed')
                      }
                    }}>Delete</button>
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

export default AdminPharmacistsPage
