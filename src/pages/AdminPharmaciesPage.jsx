import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createAdminPharmacy,
  deleteAdminPharmacy,
  getAdminDashboardData,
  updateAdminPharmacy
} from '../utils/api'
import AdminAppShell from '../components/AdminAppShell'
import { useAdminShell } from '../hooks/useAdminShell'

function AdminPharmaciesPage() {
  const navigate = useNavigate()
  const shell = useAdminShell('pharmacies')
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const data = await getAdminDashboardData(100)
    setItems(data?.lists?.pharmacies || [])
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
        setError(e.message || 'Failed to load pharmacies')
      } finally {
        setLoading(false)
      }
    })()
  }, [navigate])

  return (
    <AdminAppShell {...shell}>
      <div className="admin-topbar">
        <div><h1>Pharmacies</h1><p>Create, update, delete pharmacies.</p></div>
        <Link to="/admin/dashboard?tab=pharmacies" className="btn-light">
          Registry (dashboard)
        </Link>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-request-card" style={{ marginBottom: 16 }}>
        <h3>Create pharmacy</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pharmacy name" />
        <button
          type="button"
          className="btn-light"
          onClick={async () => {
            try {
              await createAdminPharmacy({ name })
              setName('')
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
            <thead><tr><th>Name</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((p, i) => (
                <tr key={p.pharmacy_id || i}>
                  <td>{p.name || p.pharmacy_name || 'N/A'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-light" onClick={async () => {
                      try {
                        const newName = window.prompt('New pharmacy name', p.name || p.pharmacy_name || '')
                        if (!newName) return
                        await updateAdminPharmacy(p.pharmacy_id || p.id, { name: newName })
                        await refresh()
                      } catch (e) {
                        setError(e.message || 'Update failed')
                      }
                    }}>Rename</button>
                    <button type="button" className="btn-light" onClick={async () => {
                      try {
                        await deleteAdminPharmacy(p.pharmacy_id || p.id)
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

export default AdminPharmaciesPage
