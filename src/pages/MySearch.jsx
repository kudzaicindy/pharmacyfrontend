import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MapPin, MessageSquare, Navigation } from 'lucide-react'
import {
  getPatientRequests,
  getPatientRequestDetail,
  getRankedResponses,
  getPatientSessionIds,
} from '../utils/api'
import { openDirections, pharmacyAddressLine } from '../utils/directions'
import {
  getPickupSnapshot,
  getResumeContext,
  pickRecommendedPharmacy,
  savePickupSnapshot,
  buildPickupSnapshot,
  mergeReservationsIntoSnapshot,
  extractReservationsFromPayload,
  getPrimaryActiveReservation,
  formatReservationStatusForPatient,
  refreshPickupReservationsFromBackend,
} from '../utils/patientPickupStorage'
import './MySearch.css'

function normalizeRequestsList(res) {
  if (Array.isArray(res)) return res
  return res?.requests || res?.results || []
}

function formatStatus(status) {
  if (!status) return 'In progress'
  return String(status).replace(/_/g, ' ')
}

export default function MySearch() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [snapshot, setSnapshot] = useState(() => getPickupSnapshot())
  const [request, setRequest] = useState(null)
  const [pharmacies, setPharmacies] = useState([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setError(null)
      const ctx = getResumeContext()
      const { sessionId, conversationId } = getPatientSessionIds()
      const sid = sessionId || ctx.sessionId
      const cid = conversationId || ctx.conversationId
      const requestId = ctx.requestId || snapshot?.request_id

      if (!sid && !cid && !snapshot?.pharmacy_name) {
        setLoading(false)
        return
      }

      try {
        if (requestId && cid) {
          try {
            const detail = await getPatientRequestDetail(requestId, sid, cid)
            if (cancelled) return
            setRequest(detail)
            const rec = detail.recommended_pharmacy || detail.recommendation
            const responses =
              detail.pharmacy_responses ||
              detail.responses ||
              detail.pharmacy_names?.map((name) => ({ pharmacy_name: name })) ||
              []
            setPharmacies(Array.isArray(responses) ? responses : [])

            const top = pickRecommendedPharmacy(responses, rec)
            const meds = detail.medicine_names || snapshot?.medicines || []
            const built = buildPickupSnapshot({
              requestId,
              conversationId: cid,
              shortRequestId: detail.short_request_id,
              medicines: meds,
              locationAddress: detail.location_address,
              responses,
              recommendation: rec,
              pharmacy: top,
            })
            const withRes = mergeReservationsIntoSnapshot(
              built || snapshot || {},
              extractReservationsFromPayload(detail)
            )
            if (withRes) {
              savePickupSnapshot(withRes)
              setSnapshot(withRes)
            }
            setLoading(false)
            return
          } catch {
            /* fall through to ranked + list */
          }

          try {
            const ranked = await getRankedResponses(requestId, cid, 10)
            if (cancelled) return
            const list = Array.isArray(ranked)
              ? ranked
              : ranked?.pharmacy_responses || ranked?.responses || ranked?.results || []
            setPharmacies(list)
            const top = pickRecommendedPharmacy(list, ranked?.recommendation)
            const built = buildPickupSnapshot({
              requestId,
              conversationId: cid,
              medicines: ranked?.medicine_names || snapshot?.medicines,
              responses: list,
              recommendation: ranked?.recommendation,
              pharmacy: top,
            })
            if (built) {
              savePickupSnapshot(built)
              setSnapshot(built)
            }
            setLoading(false)
            return
          } catch {
            /* fall through */
          }
        }

        if (requestId) {
          const refreshed = await refreshPickupReservationsFromBackend(requestId)
          if (!cancelled && refreshed) setSnapshot(refreshed)
        }

        if (sid || cid) {
          const listRes = await getPatientRequests(sid, cid, { limit: 10 })
          if (cancelled) return
          const list = normalizeRequestsList(listRes)
          const active =
            list.find((r) => r.status === 'responses_received' || r.status === 'active') || list[0]
          if (active) {
            setRequest(active)
            const names = active.pharmacy_names || []
            if (names.length) {
              setPharmacies(names.map((name) => ({ pharmacy_name: name })))
            }
            const built = buildPickupSnapshot({
              requestId: active.request_id,
              conversationId: cid,
              shortRequestId: active.short_request_id,
              medicines: active.medicine_names,
              locationAddress: active.location_address,
              pharmacy: active.recommended_pharmacy
                ? {
                    pharmacy_name: active.recommended_pharmacy.pharmacy_name || active.recommended_pharmacy,
                    location_address: active.recommended_pharmacy.location_address,
                    location_suburb: active.recommended_pharmacy.location_suburb,
                  }
                : names[0]
                  ? { pharmacy_name: names[0] }
                  : null,
            })
            if (built) {
              savePickupSnapshot(built)
              setSnapshot(built)
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load your search')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const displaySnapshot = snapshot
  const activeReservation = getPrimaryActiveReservation(displaySnapshot)
  const meds =
    (Array.isArray(displaySnapshot?.medicines) && displaySnapshot.medicines.length > 0
      ? displaySnapshot.medicines
      : request?.medicine_names) || []
  const pharmacyName = activeReservation?.pharmacy_name || displaySnapshot?.pharmacy_name
  const address = displaySnapshot?.address || request?.location_address

  const openChat = () => {
    navigate('/', { state: { openChatbot: true } })
  }

  return (
    <div className="my-search-page">
      <header className="my-search-header">
        <Link to="/" className="logo">
          Medi<span>Connect</span>
        </Link>
        <Link to="/" className="my-search-btn my-search-btn-ghost" style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}>
          Home
        </Link>
      </header>

      <main className="my-search-main">
        <h1>Your medicine search</h1>
        <p className="my-search-sub">Where to pick up — saved on this device and from your last search.</p>

        {error && <div className="my-search-error">{error}</div>}

        {loading && <p className="my-search-loading">Loading your pickup details…</p>}

        {!loading && !pharmacyName && !meds.length && !request && (
          <div className="my-search-card my-search-empty">
            <p>No active search found on this device.</p>
            <Link to="/" className="my-search-btn my-search-btn-primary" style={{ marginTop: '1rem' }}>
              Search for medicine
            </Link>
          </div>
        )}

        {!loading && (pharmacyName || meds.length > 0 || request) && (
          <>
            <div className="my-search-card">
              {request?.status && (
                <span className="my-search-status">{formatStatus(request.status)}</span>
              )}
              {displaySnapshot?.short_request_id && (
                <p className="my-search-meta">Request #{displaySnapshot.short_request_id}</p>
              )}
              {meds.length > 0 && (
                <>
                  <h2>Medicine</h2>
                  <p className="my-search-meds">{meds.join(', ')}</p>
                </>
              )}
              {activeReservation && (
                <p className={`my-search-reservation-status my-search-reservation-status--${activeReservation.status || 'pending'}`}>
                  {formatReservationStatusForPatient(activeReservation.status)}
                </p>
              )}
              {pharmacyName ? (
                <>
                  <h2>{activeReservation ? 'Reserved at' : 'Go to'}</h2>
                  <p className="my-search-pharmacy">{pharmacyName}</p>
                  {address && <p className="my-search-address">{address}</p>}
                  {displaySnapshot?.distance_km != null && (
                    <p className="my-search-meta">About {Number(displaySnapshot.distance_km).toFixed(1)} km away</p>
                  )}
                  <div className="my-search-actions">
                    <button
                      type="button"
                      className="my-search-btn my-search-btn-primary"
                      onClick={() => openDirections(pharmacyName, address)}
                    >
                      <Navigation size={18} aria-hidden />
                      Get directions
                    </button>
                    <button type="button" className="my-search-btn my-search-btn-ghost" onClick={openChat}>
                      <MessageSquare size={18} aria-hidden />
                      Open chat
                    </button>
                  </div>
                </>
              ) : (
                <p className="my-search-meta">
                  Pharmacies are still responding. Open the chat to see updates.
                </p>
              )}
            </div>

            {pharmacies.length > 1 && (
              <div className="my-search-card">
                <h2>Other pharmacies</h2>
                <ul className="my-search-pharmacy-list">
                  {pharmacies.slice(0, 8).map((p, i) => {
                    const name = p.pharmacy_name || p.name || `Pharmacy ${i + 1}`
                    const addr = pharmacyAddressLine(p)
                    return (
                      <li key={p.pharmacy_id || name || i} className="my-search-pharmacy-item">
                        <strong>{name}</strong>
                        {addr && <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{addr}</span>}
                        <button
                          type="button"
                          className="my-search-btn my-search-btn-ghost"
                          style={{ marginTop: '0.5rem', width: '100%' }}
                          onClick={() => openDirections(name, addr)}
                        >
                          <MapPin size={16} aria-hidden />
                          Directions
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
