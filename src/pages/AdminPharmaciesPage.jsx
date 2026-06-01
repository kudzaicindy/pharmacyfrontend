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

function summarizeLinkedCounts(lc) {
  if (!lc || typeof lc !== 'object') return ''
  return Object.entries(lc)
    .map(([k, v]) => `${String(k).replace(/_/g, ' ')}: ${v}`)
    .join(' · ')
}

function rowApiStatus(p) {
  const vs = String(p?.verification_status || p?.status || '').toLowerCase()
  if (vs === 'suspended') return 'suspended'
  if (vs === 'pending_review' || vs === 'pending') return 'pending_review'
  return 'verified'
}

function AdminPharmaciesPage() {
  const navigate = useNavigate()
  const shell = useAdminShell('pharmacies')
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusSavingId, setStatusSavingId] = useState(null)

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
        <div>
          <h1>Pharmacies</h1>
          <p>Create, update verification status, rename, or delete pharmacies.</p>
        </div>
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
            <thead>
              <tr>
                <th>Name</th>
                <th>Verification</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => {
                const id = p.pharmacy_id || p.id
                const sel = rowApiStatus(p)
                const saving = statusSavingId === String(id)
                return (
                  <tr key={id || i}>
                    <td>{p.name || p.pharmacy_name || 'N/A'}</td>
                    <td>
                      <select
                        className="admin-filter-select"
                        style={{ minWidth: '10rem', fontSize: 13 }}
                        aria-label="Verification status"
                        value={sel}
                        disabled={saving || !id}
                        onChange={async (e) => {
                          const v = e.target.value
                          if (v === sel || !id) return
                          setStatusSavingId(String(id))
                          setError('')
                          try {
                            const patch =
                              v === 'suspended'
                                ? { verification_status: 'suspended', is_active: false }
                                : v === 'pending_review'
                                  ? { verification_status: 'pending_review', is_active: true }
                                  : { verification_status: 'verified', is_active: true }
                            await updateAdminPharmacy(id, patch)
                            await refresh()
                          } catch (err) {
                            setError(err.message || 'Status update failed')
                          } finally {
                            setStatusSavingId(null)
                          }
                        }}
                      >
                        <option value="verified">Verified</option>
                        <option value="pending_review">Pending review</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </td>
                    <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-light"
                        onClick={async () => {
                          try {
                            const newName = window.prompt(
                              'New pharmacy name',
                              p.name || p.pharmacy_name || ''
                            )
                            if (!newName) return
                            await updateAdminPharmacy(id, { name: newName })
                            await refresh()
                          } catch (e) {
                            setError(e.message || 'Update failed')
                          }
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="btn-light"
                        onClick={async () => {
                          const runDelete = async (force) => {
                            await deleteAdminPharmacy(id, force ? { force: true } : {})
                            await refresh()
                            setError('')
                          }
                          try {
                            await runDelete(false)
                          } catch (e) {
                            if (e.status === 400 && e.linked_counts) {
                              const summary = summarizeLinkedCounts(e.linked_counts)
                              const proceed = window.confirm(
                                `${e.message}\n\nLinked records: ${summary || '(see API)'}\n\nDelete anyway? This will cascade related data.`
                              )
                              if (!proceed) return
                              try {
                                await runDelete(true)
                              } catch (e2) {
                                setError(e2.message || 'Delete failed')
                              }
                            } else {
                              setError(e.message || 'Delete failed')
                            }
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminAppShell>
  )
}

export default AdminPharmaciesPage
