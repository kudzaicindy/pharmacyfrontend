import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Bell, 
  Package, 
  TrendingUp, 
  Clock, 
  MapPin, 
  DollarSign,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  LogOut,
  Settings,
  BarChart3,
  Pill,
  Cross,
  Building2,
  Award,
  HeartPulse,
  X,
  Menu,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ThumbsDown,
  Lightbulb,
  ShieldAlert
} from 'lucide-react'
import { getPharmacistRequests, submitPharmacyResponse, getPharmacistInventory, updatePharmacistInventory, getPharmacistReservations, confirmReservation, completeReservation } from '../utils/api'
import './PharmacyDashboard.css'

const PRICE_UNIT_OPTIONS = [
  { value: 'per_packet', label: 'Per packet' },
  { value: 'per_box', label: 'Per box' },
  { value: 'per_tablet', label: 'Per tablet' },
  { value: 'per_10_tablets', label: 'Per 10 tablets' },
  { value: 'per_gram', label: 'Per gram' },
  { value: 'per_100g', label: 'Per 100g' },
  { value: 'per_ml', label: 'Per ml' },
  { value: 'per_100ml', label: 'Per 100ml' },
  { value: 'per_bottle', label: 'Per bottle' },
  { value: 'each', label: 'Each' }
]

function getPriceUnitLabel(value) {
  const opt = PRICE_UNIT_OPTIONS.find(o => o.value === value)
  return opt ? opt.label : (value || '—')
}

function PharmacyDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('requests')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [pharmacist, setPharmacist] = useState(null)
  const [pharmacy, setPharmacy] = useState(null)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [requestFilter, setRequestFilter] = useState('all') // all, pending, responded, expired
  const [expandedRequests, setExpandedRequests] = useState(new Set())
  const [responseForm, setResponseForm] = useState({
    medicines: {}, // { 'medicine_name': { available: false, price: '', alternative: '' } }
    preparation_time: 0,
    notes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [inventory, setInventory] = useState(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [showInventoryModal, setShowInventoryModal] = useState(false)
  const [inventoryForm, setInventoryForm] = useState({ items: [] })
  const [reservations, setReservations] = useState([])
  const [reservationsLoading, setReservationsLoading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Load pharmacist data from localStorage
  useEffect(() => {
    const pharmacistData = localStorage.getItem('pharmacist')
    if (!pharmacistData) {
      navigate('/login')
      return
    }

    try {
      const parsed = JSON.parse(pharmacistData)
      setPharmacist(parsed)
      setPharmacy(parsed.pharmacy)
    } catch (err) {
      console.error('Error parsing pharmacist data:', err)
      navigate('/login')
    }
  }, [navigate])

  // Fetch requests
  useEffect(() => {
    if (!pharmacist?.pharmacist_id) return

    const fetchRequests = async () => {
      try {
        setLoading(true)
        const data = await getPharmacistRequests(pharmacist.pharmacist_id)
        setRequests(data || [])
      } catch (err) {
        console.error('Error fetching requests:', err)
        setError('Failed to load requests. Please refresh the page.')
      } finally {
        setLoading(false)
      }
    }

    fetchRequests()
    
    // Poll for new requests every 3 minutes (180000 milliseconds)
    const interval = setInterval(fetchRequests, 180000)
    return () => clearInterval(interval)
  }, [pharmacist?.pharmacist_id])

  // Fetch inventory
  useEffect(() => {
    if (!pharmacist?.pharmacist_id) return

    const fetchInventory = async () => {
      try {
        setInventoryLoading(true)
        const data = await getPharmacistInventory(pharmacist.pharmacist_id)
        setInventory(data)
      } catch (err) {
        console.error('Error fetching inventory:', err)
      } finally {
        setInventoryLoading(false)
      }
    }

    fetchInventory()
  }, [pharmacist?.pharmacist_id])

  // Fetch reservations
  useEffect(() => {
    if (!pharmacist?.pharmacist_id) return
    const fetchReservations = async () => {
      try {
        setReservationsLoading(true)
        const data = await getPharmacistReservations(pharmacist.pharmacist_id)
        setReservations(Array.isArray(data) ? data : (data?.reservations || data?.results || []))
      } catch (err) {
        console.error('Error fetching reservations:', err)
        setReservations([])
      } finally {
        setReservationsLoading(false)
      }
    }
    fetchReservations()
    const interval = setInterval(fetchReservations, 60000)
    return () => clearInterval(interval)
  }, [pharmacist?.pharmacist_id])

  const handleLogout = () => {
    localStorage.removeItem('pharmacist')
    localStorage.removeItem('pharmacy_id')
    localStorage.removeItem('pharmacist_id')
    localStorage.removeItem('userRole')
    localStorage.removeItem('token')
    navigate('/login')
  }

  // Match medicine names flexibly (handles "paracetamol 500mg" vs "paracetamol", "ibuprofen" vs "ibrufen")
  const getInventoryStatusForItems = (items, medicineName) => {
    const list = items || []
    const req = (medicineName || '').toLowerCase().trim()
    const reqBase = req.replace(/\s*\d+[\s]*(mg|ml|g|mcg|units?|tablets?|capsules?)?\s*/gi, '').trim() || req
    const item = list.find(i => {
      const inv = (i.medicine_name || '').toLowerCase().trim()
      const invBase = inv.replace(/\s*\d+[\s]*(mg|ml|g|mcg|units?|tablets?|capsules?)?\s*/gi, '').trim() || inv
      if (inv === req || invBase === reqBase) return true
      if (inv.startsWith(reqBase) || reqBase.startsWith(invBase)) return true
      if (inv.includes(reqBase) || reqBase.includes(invBase)) return true
      // Common aliases
      const aliases = { 'ibuprofen': 'ibrufen', 'ibrufen': 'ibuprofen', 'acetaminophen': 'paracetamol', 'panadol': 'paracetamol' }
      return (aliases[reqBase] === invBase) || (aliases[invBase] === reqBase)
    })
    const qty = item ? (parseInt(item.quantity, 10) || 0) : 0
    return { available: qty > 0, quantity: qty, matchedItem: item }
  }

  const handleOpenResponse = async (request) => {
    setSelectedRequest(request)
    let invData = inventory
    if (pharmacist?.pharmacist_id) {
      try {
        invData = await getPharmacistInventory(pharmacist.pharmacist_id)
        setInventory(invData)
      } catch (err) {
        console.error('Error refreshing inventory:', err)
      }
    }
    const medicineNames = (request.medicine_names || []).filter(med => {
      const lowerMed = med.toLowerCase().trim()
      const invalidPatterns = [
        'unable', 'uploaded', 'minutes', 'before', 'after', 'eatin', 'eating',
        'dru', 'mg', 'ml', 'tablet', 'capsule', 'times', 'per', 'day'
      ]
      if (lowerMed.length < 2 || invalidPatterns.some(pattern => lowerMed.includes(pattern))) return false
      if (/^\d+$|^\d+[:\-]/.test(lowerMed)) return false
      return med.trim().length > 0
    })
    const medicines = {}
    medicineNames.forEach(medicine => {
      const { available, quantity } = getInventoryStatusForItems(invData?.items, medicine)
      medicines[medicine] = {
        available,
        price: '',
        quantity: available ? String(quantity) : '',
        quantity_unit: 'capsules',
        expiry: '',
        alternative: ''
      }
    })
    setResponseForm({
      medicines,
      preparation_time: 0,
      notes: ''
    })
    setError('')
  }

  const handleCloseResponse = () => {
    setSelectedRequest(null)
    setError('')
  }

  const handleOpenInventoryModal = () => {
    const items = (inventory?.items || []).map(i => ({
      medicine_name: i.medicine_name || '',
      quantity: i.quantity ?? 0,
      low_stock_threshold: i.low_stock_threshold ?? 10,
      price: i.price != null && i.price !== '' ? Number(i.price) : '',
      price_unit: i.price_unit || 'per_packet'
    }))
    setInventoryForm({ items: items.length ? items : [{ medicine_name: '', quantity: 0, low_stock_threshold: 10, price: '', price_unit: 'per_packet' }] })
    setShowInventoryModal(true)
    setError('')
  }

  const handleCloseInventoryModal = () => {
    setShowInventoryModal(false)
    setError('')
  }

  const handleAddInventoryItem = () => {
    setInventoryForm(prev => ({
      items: [...prev.items, { medicine_name: '', quantity: 0, low_stock_threshold: 10, price: '', price_unit: 'per_packet' }]
    }))
  }

  const handleUpdateInventoryItem = (index, field, value) => {
    setInventoryForm(prev => ({
      items: prev.items.map((item, i) => {
        if (i !== index) return item
        if (field === 'medicine_name') return { ...item, medicine_name: value }
        if (field === 'price_unit') return { ...item, price_unit: value }
        if (field === 'price') {
          if (value === '') return { ...item, price: '' }
          const num = parseFloat(value)
          return { ...item, price: Number.isNaN(num) ? item.price : (num >= 0 ? num : item.price) }
        }
        return { ...item, [field]: parseInt(value, 10) || 0 }
      })
    }))
  }

  const handleRemoveInventoryItem = (index) => {
    setInventoryForm(prev => ({
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const handleSubmitInventory = async () => {
    const trimmed = inventoryForm.items.filter(i => i.medicine_name?.trim())
    const missingPrice = trimmed.find(i => i.price === '' || i.price == null || (typeof i.price === 'number' && Number.isNaN(i.price)))
    if (missingPrice) {
      setError(`Each item must include "price" (number). Medicine "${missingPrice.medicine_name.trim()}" is missing price. Prices should be kept updated for patient display and ranking.`)
      return
    }
    const validItems = trimmed.map(i => ({
      medicine_name: i.medicine_name.trim(),
      quantity: i.quantity,
      low_stock_threshold: i.low_stock_threshold,
      price: Number(i.price) >= 0 ? Number(i.price) : 0,
      price_unit: i.price_unit || 'per_packet'
    }))

    if (validItems.length === 0) {
      setError('Add at least one medicine')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await updatePharmacistInventory(pharmacist.pharmacist_id, validItems)
      const data = await getPharmacistInventory(pharmacist.pharmacist_id)
      setInventory(data)
      handleCloseInventoryModal()
    } catch (err) {
      setError(err.message || 'Failed to update inventory')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDecline = (request) => {
    if (window.confirm('Decline this request? The patient will not see your pharmacy in results.')) {
      // TODO: API call to decline when backend supports it
      setRequests(prev => prev.map(r => r.request_id === request.request_id ? { ...r, declined: true } : r))
    }
  }

  const handleConfirmReservation = async (reservation) => {
    const id = reservation.reservation_id || reservation.id
    if (!id || !pharmacist?.pharmacist_id) return
    try {
      await confirmReservation(id, pharmacist.pharmacist_id)
      const data = await getPharmacistReservations(pharmacist.pharmacist_id)
      setReservations(Array.isArray(data) ? data : (data?.reservations || data?.results || []))
    } catch (err) {
      setError(err.message || 'Failed to confirm reservation')
    }
  }

  const handleCompleteReservation = async (reservation) => {
    const id = reservation.reservation_id || reservation.id
    if (!id || !pharmacist?.pharmacist_id) return
    try {
      await completeReservation(id, pharmacist.pharmacist_id)
      const data = await getPharmacistReservations(pharmacist.pharmacist_id)
      setReservations(Array.isArray(data) ? data : (data?.reservations || data?.results || []))
      const invData = await getPharmacistInventory(pharmacist.pharmacist_id)
      setInventory(invData)
    } catch (err) {
      setError(err.message || 'Failed to complete reservation')
    }
  }

  const handleSuggestAlternative = (request) => {
    setSelectedRequest(request)
    handleOpenResponse(request)
  }

  // Parse "Paracetamol $5.00, Ibuprofen $7.50" from notes into { medicineName -> price }
  const parseNotesMedicinesWithPrices = (notes) => {
    const map = {}
    if (!notes?.trim()) return map
    const parts = notes.split(',').map(s => s.trim()).filter(Boolean)
    for (const part of parts) {
      const match = part.match(/^(.+?)\s*\$([\d.]+)\s*$/i)
      if (match) {
        map[match[1].trim().toLowerCase()] = match[2]
      }
    }
    return map
  }

  const handleSubmitResponse = async () => {
    if (!selectedRequest) return

    const medicines = responseForm.medicines || {}
    const isSymptomRequest = selectedRequest.request_type === 'symptom'

    // For symptom requests: pharmacist enters "paracetamol $1" in notes - skip per-medicine price validation
    // For direct requests: validate that available medicines have a price
    if (!isSymptomRequest) {
      for (const [medicineName, medicineData] of Object.entries(medicines)) {
        if (medicineData.available && !medicineData.price) {
          setError(`Please enter a price for ${medicineName} if it's available`)
          return
        }
      }
    }

    setSubmitting(true)
    setError('')

    const notesPrices = isSymptomRequest ? parseNotesMedicinesWithPrices(responseForm.notes) : {}

    const allAlternatives = []
    Object.entries(medicines).forEach(([medicineName, medicineData]) => {
      if (medicineData.alternative && medicineData.alternative.trim()) {
        const alternatives = medicineData.alternative.split(',').map(s => s.trim()).filter(s => s)
        allAlternatives.push(...alternatives)
      }
    })

    let atLeastOneAvailable = Object.values(medicines).some(m => m.available)
    let avgPrice = null
    let medicineResponses = []

    if (isSymptomRequest) {
      // For symptom requests: use notes to get prices; if notes has medicines with prices, consider available
      medicineResponses = Object.entries(medicines).map(([medicineName, medicineData]) => {
        const lowerName = medicineName.toLowerCase()
        const priceFromNotes = notesPrices[lowerName]
        const price = medicineData.price || priceFromNotes
        const available = medicineData.available
        if (available && price) {
          return { medicine: medicineName, available: true, price, quantity: medicineData.quantity || null, expiry: medicineData.expiry || null, alternative: medicineData.alternative || null }
        }
        return { medicine: medicineName, available: medicineData.available, price: price || null, quantity: medicineData.quantity || null, expiry: medicineData.expiry || null, alternative: medicineData.alternative || null }
      })
      const withPrice = medicineResponses.filter(m => m.available && m.price)
      if (withPrice.length > 0) {
        const prices = withPrice.map(m => parseFloat(m.price)).filter(p => !isNaN(p))
        avgPrice = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : null
        atLeastOneAvailable = true
      }
    } else {
      const availableMedicines = Object.values(medicines).filter(m => m.available && m.price)
      if (availableMedicines.length > 0) {
        const prices = availableMedicines.map(m => parseFloat(m.price)).filter(p => !isNaN(p))
        avgPrice = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : null
      }
      medicineResponses = Object.entries(medicines).map(([medicineName, medicineData]) => ({
        medicine: medicineName,
        available: medicineData.available,
        price: medicineData.available && medicineData.price ? medicineData.price : null,
        quantity: medicineData.quantity || null,
        expiry: medicineData.expiry || null,
        alternative: medicineData.alternative || null
      }))
    }

    try {
      await submitPharmacyResponse(selectedRequest.request_id, {
        pharmacist_id: pharmacist.pharmacist_id,
        medicine_available: atLeastOneAvailable,
        price: atLeastOneAvailable ? avgPrice : null,
        preparation_time: responseForm.preparation_time || 0,
        alternative_medicines: [...new Set(allAlternatives)],
        notes: responseForm.notes || '',
        medicine_responses: medicineResponses
      })

      // Update request status
      setRequests(requests.map(req => 
        req.request_id === selectedRequest.request_id 
          ? { ...req, has_responded: true, status: 'responded' }
          : req
      ))

      handleCloseResponse()
    } catch (err) {
      setError(err.message || 'Failed to submit response. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  const stats = {
    totalRequests: requests.length,
    responded: requests.filter(r => r.has_responded).length,
    pending: requests.filter(r => !r.has_responded && !isExpired(r.expires_at)).length,
    expired: requests.filter(r => !r.has_responded && isExpired(r.expires_at)).length
  }

  const toggleRequestExpanded = (requestId) => {
    setExpandedRequests(prev => {
      const newSet = new Set(prev)
      if (newSet.has(requestId)) {
        newSet.delete(requestId)
      } else {
        newSet.add(requestId)
      }
      return newSet
    })
  }

  const getFilteredRequests = () => {
    let filtered = requests
    switch (requestFilter) {
      case 'pending':
        filtered = requests.filter(r => !r.has_responded && !isExpired(r.expires_at))
        break
      case 'responded':
        filtered = requests.filter(r => r.has_responded)
        break
      case 'expired':
        filtered = requests.filter(r => !r.has_responded && isExpired(r.expires_at))
        break
      default:
        filtered = requests
    }
    return filtered
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const formatTimeAgo = (dateString) => {
    if (!dateString) return ''
    const diff = Math.floor((Date.now() - new Date(dateString)) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff} min ago`
    const hours = Math.floor(diff / 60)
    if (hours < 24) return `${hours} hr ago`
    return `${Math.floor(hours / 24)} days ago`
  }

  const getLocationShort = (addr) => {
    if (!addr) return 'Unknown'
    const parts = addr.split(',')
    return parts[0]?.trim() || addr
  }

  const requiresPrescription = (medicines) => {
    const rxKeywords = ['insulin', 'controlled', 'schedule', 'prescription only']
    return (medicines || []).some(m => 
      rxKeywords.some(kw => m.toLowerCase().includes(kw))
    )
  }

  if (!pharmacist || !pharmacy) {
    return <div>Loading...</div>
  }

  const initials = (pharmacist?.first_name?.[0] || '') + (pharmacist?.last_name?.[0] || '') || 'PK'
  const lowStockItems = (inventory?.items || []).filter(i => (i.status === 'low_stock' || i.status === 'out_of_stock') && (i.quantity != null)).slice(0, 5)
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today']

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <div className="pharmacy-dashboard">
      {/* Mobile top bar with hamburger */}
      <header className="ph-mobile-header" aria-hidden="true">
        <div className="ph-mobile-header-inner">
          <span className="ph-mobile-logo">Medi<span>Connect</span></span>
          <button
            type="button"
            className="ph-hamburger"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>
      <div
        className={`ph-mobile-overlay ${mobileMenuOpen ? 'ph-mobile-overlay-open' : ''}`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />
      {/* Sidebar - MediConnect style */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sb-logo">Medi<span>Connect</span></div>
        <div className="sb-pharmacy">
          <div className="sb-pharm-avatar">🏪</div>
          <div>
            <div className="sb-pharm-name">{pharmacy?.name || 'Pharmacy'}</div>
            <div className="sb-pharm-status">Open · Verified</div>
          </div>
        </div>
        <div className="sb-section">Main</div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => { setActiveTab('requests'); closeMobileMenu(); }}
          >
            <span className="ic">📥</span>
            <span>Requests</span>
            {stats.pending > 0 && <span className="badge">{stats.pending}</span>}
          </button>
          <button
            className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => { setActiveTab('inventory'); closeMobileMenu(); }}
          >
            <span className="ic">💊</span>
            <span>Stock Manager</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'reservations' ? 'active' : ''}`}
            onClick={() => { setActiveTab('reservations'); closeMobileMenu(); }}
          >
            <span className="ic">📋</span>
            <span>Orders</span>
            {reservations.filter(r => r.status === 'pending' || r.status === 'confirmed').length > 0 && (
              <span className="badge">{reservations.filter(r => r.status === 'pending' || r.status === 'confirmed').length}</span>
            )}
          </button>
          <button
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => { setActiveTab('analytics'); closeMobileMenu(); }}
          >
            <span className="ic">📊</span>
            <span>Analytics</span>
          </button>
        </nav>
        <div className="sb-section">System</div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); closeMobileMenu(); }}
          >
            <span className="ic">⚙️</span>
            <span>Settings</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sb-user">
            <div className="sb-avatar">{initials}</div>
            <div>
              <div className="sb-user-name">{pharmacist?.first_name} {pharmacist?.last_name}</div>
              <div className="sb-user-role">Pharmacist</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut className="nav-icon" size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <div className="topbar">
          <div className="topbar-left">
            <h1>Pharmacy Dashboard</h1>
            <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {pharmacy?.name || 'My Pharmacy'}</p>
          </div>
          <div className="topbar-right">
            <button type="button" className="btn btn-ghost">📊 Export</button>
            <button type="button" className="btn btn-teal" onClick={handleOpenInventoryModal}>+ Update Stock</button>
          </div>
        </div>

        {activeTab === 'requests' && (
          <>
            {/* Alert banner */}
            {stats.pending > 0 && (
              <div className="alert-banner" role="button" tabIndex={0} onClick={() => setRequestFilter('pending')}>
                <div className="al-dot" />
                <p><strong>{stats.pending} new patient request{stats.pending !== 1 ? 's' : ''}</strong> {stats.pending === 1 ? 'is' : 'are'} waiting for your response.</p>
                <span className="al-action">Respond Now →</span>
              </div>
            )}

            {/* Stats */}
            <div className="stats-grid">
              <div className="sc teal">
                <div className="sc-icon">📥</div>
                <div className="sc-label">New Requests</div>
                <div className="sc-val">{stats.pending}</div>
                <div className="sc-sub">Awaiting response</div>
              </div>
              <div className="sc green">
                <div className="sc-icon">✅</div>
                <div className="sc-label">Fulfilled Today</div>
                <div className="sc-val">{stats.responded}</div>
                <div className="sc-sub">Responded</div>
              </div>
              <div className="sc amber">
                <div className="sc-icon">⚠️</div>
                <div className="sc-label">Low Stock Items</div>
                <div className="sc-val">{inventory?.summary?.low_stock ?? 0}</div>
                <div className="sc-sub">Needs restocking</div>
              </div>
              <div className="sc red">
                <div className="sc-icon">📋</div>
                <div className="sc-label">Total Requests</div>
                <div className="sc-val">{stats.totalRequests}</div>
                <div className="sc-sub">All time</div>
              </div>
            </div>

            {/* Grid: Requests table + Right column */}
            <div className="grid2">
              <div className="card content-card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Patient Requests</div>
                    <div className="card-sub">Incoming medicine requests from the platform</div>
                  </div>
                  <div className="filter-tabs">
                    <button className={`filter-tab ${requestFilter === 'all' ? 'active' : ''}`} onClick={() => setRequestFilter('all')}>All ({stats.totalRequests})</button>
                    <button className={`filter-tab ${requestFilter === 'pending' ? 'active' : ''}`} onClick={() => setRequestFilter('pending')}>Pending ({stats.pending})</button>
                    <button className={`filter-tab ${requestFilter === 'responded' ? 'active' : ''}`} onClick={() => setRequestFilter('responded')}>Responded ({stats.responded})</button>
                    <button className={`filter-tab ${requestFilter === 'expired' ? 'active' : ''}`} onClick={() => setRequestFilter('expired')}>Expired ({stats.expired})</button>
                  </div>
                </div>

                {loading ? (
                  <div className="loading-state">
                    <Pill className="loading-icon" />
                    <p>Loading requests...</p>
                  </div>
                ) : getFilteredRequests().length === 0 ? (
                  <div className="empty-state">
                    <Bell className="empty-icon" />
                    <h3>No {requestFilter !== 'all' ? requestFilter.charAt(0).toUpperCase() + requestFilter.slice(1) : ''} Requests</h3>
                    <p>{requestFilter === 'all' ? 'Medicine requests from patients will appear here' : `No ${requestFilter} requests found`}</p>
                  </div>
                ) : (
                  <>
                    <table className="requests-table">
                      <thead>
                        <tr>
                          <th>Request</th>
                          <th>Urgency</th>
                          <th>Status</th>
                          <th>Received</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getFilteredRequests().slice(0, 10).map((request) => {
                          const expired = isExpired(request.expires_at)
                          const validMedicines = (request.medicine_names || []).filter(med => {
                            const lowerMed = (med || '').toLowerCase().trim()
                            if (lowerMed.length < 2) return false
                            if (/^\d+$|^\d+[:\-]/.test(lowerMed)) return false
                            return true
                          })
                          const summary = request.symptoms || (validMedicines.length ? validMedicines.join(', ') : 'Medicine request')
                          const shortId = request.short_request_id || request.request_id?.slice(0, 8)?.toUpperCase() || '—'
                          const statusBadge = request.has_responded ? 'responded' : expired ? 'expired' : 'new'
                          return (
                            <tr key={request.request_id}>
                              <td>
                                <div className="patient-cell">
                                  <div className="p-avatar" style={{ background: ['#7c3aed','#0891b2','#d97706','#059669','#be185d'][shortId.charCodeAt(0) % 5] }}>{shortId.slice(0, 2)}</div>
                                  <div>
                                    <div className="p-name">#{shortId}</div>
                                    <div className="p-med">{summary.length > 40 ? summary.slice(0, 40) + '…' : summary}</div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={expired ? 'badge-urgent' : 'badge-normal'}>{expired ? '🔴 Expired' : '🟢 Normal'}</span>
                              </td>
                              <td>
                                <span className={statusBadge === 'expired' ? 'badge-expired' : `badge-${statusBadge}`}>
                                  {(statusBadge === 'new' || statusBadge === 'responded' || statusBadge === 'fulfilled') && <span className="badge-dot" />}
                                  {request.has_responded ? 'Responded' : expired ? 'Expired' : 'New'}
                                </span>
                              </td>
                              <td><span className="time-ago">{formatTimeAgo(request.created_at)}</span></td>
                              <td>
                                {!request.has_responded && !expired ? (
                                  <button type="button" className="action-btn ab-teal" onClick={() => handleOpenResponse(request)}>Respond</button>
                                ) : (
                                  <button type="button" className="action-btn ab-ghost" onClick={() => handleOpenResponse(request)}>View</button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              {/* Right column: Low Stock + Revenue */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">⚠️ Low Stock Alert</div>
                      <div className="card-sub">Items needing restock</div>
                    </div>
                  </div>
                  <div className="card-body">
                    {lowStockItems.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>All items in good stock.</p>
                    ) : (
                      lowStockItems.map((item, idx) => {
                        const pct = item.low_stock_threshold ? Math.min(100, (item.quantity / item.low_stock_threshold) * 100) : (item.quantity > 10 ? 100 : item.quantity * 10)
                        const barClass = pct <= 15 ? 'bar-critical' : pct <= 40 ? 'bar-low' : 'bar-good'
                        const statusClass = pct <= 15 ? 's-crit' : pct <= 40 ? 's-low' : 's-good'
                        const statusText = pct <= 15 ? 'Critical' : pct <= 40 ? 'Low' : 'OK'
                        return (
                          <div key={idx} className="stock-item">
                            <div className="stock-name">{item.medicine_name}</div>
                            <div className="stock-qty">{item.quantity} left</div>
                            <div className="stock-bar-wrap"><div className={`stock-bar ${barClass}`} style={{ width: `${pct}%` }} /></div>
                            <div className={`stock-status ${statusClass}`}>{statusText}</div>
                          </div>
                        )
                      })
                    )}
                    {(inventory?.items?.length || 0) > lowStockItems.length && (
                      <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setActiveTab('inventory')}>View all stock</button>
                    )}
                  </div>
                </div>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">💰 This Week</div>
                  </div>
                  <div className="card-body">
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>— <span style={{ fontSize: 14, color: 'var(--green)', fontWeight: 600 }}>—</span></div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Revenue tracking coming soon</div>
                    <div className="mini-bars">
                      {[35, 55, 48, 72, 60, 85, 68].map((h, i) => (
                        <div key={weekDays[i]} className={`mini-bar ${i === 6 ? 'active' : ''}`} style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <div className="mini-labels">
                      {weekDays.map(d => <div key={d} className="mini-label">{d}</div>)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Orders / Reservations – from GET pharmacist/reservations */}
        {activeTab === 'reservations' && (
          <>
            {(() => {
              const completed = reservations.filter(r => (r.status || '').toLowerCase() === 'completed')
              const pendingOrConfirmed = reservations.filter(r => {
                const s = (r.status || '').toLowerCase()
                return s === 'pending' || s === 'confirmed'
              })
              const todayStart = new Date()
              todayStart.setHours(0, 0, 0, 0)
              const completedToday = completed.filter(r => new Date(r.completed_at || r.updated_at || r.created_at) >= todayStart)
              return (
                <>
                  <div className="stats-grid sg-4" style={{ marginBottom: 20 }}>
                    <div className="sc green fade-in" style={{ animationDelay: '.05s' }}>
                      <div className="sc-icon">✅</div>
                      <div className="sc-label">Completed</div>
                      <div className="sc-val">{completed.length}</div>
                      <div className="sc-sub">{completedToday.length} today</div>
                    </div>
                    <div className="sc amber fade-in" style={{ animationDelay: '.1s' }}>
                      <div className="sc-icon">⏳</div>
                      <div className="sc-label">Pending / Confirmed</div>
                      <div className="sc-val">{pendingOrConfirmed.length}</div>
                      <div className="sc-sub">Awaiting pickup</div>
                    </div>
                    <div className="sc teal fade-in" style={{ animationDelay: '.2s' }}>
                      <div className="sc-icon">📋</div>
                      <div className="sc-label">Total Reservations</div>
                      <div className="sc-val">{reservations.length}</div>
                      <div className="sc-sub">From API</div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <div>
                        <div className="card-title">Reservations / Orders</div>
                        <div className="card-sub">Patient reservations from MediConnect — confirm when ready, complete when picked up</div>
                      </div>
                    </div>
                    {reservationsLoading ? (
                      <div className="card-body"><p style={{ color: 'var(--muted)' }}>Loading reservations…</p></div>
                    ) : reservations.length === 0 ? (
                      <div className="card-body"><p style={{ color: 'var(--muted)' }}>No reservations yet. Patients reserve via the app after searching for medicine.</p></div>
                    ) : (
                      <>
                        <table className="requests-table">
                          <thead>
                            <tr>
                              <th>Reservation</th>
                              <th>Medicine</th>
                              <th>Qty</th>
                              <th>Created</th>
                              <th>Expires</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reservations.map((r) => {
                              const id = r.reservation_id || r.id || r.request_id || '—'
                              const status = (r.status || '').toLowerCase()
                              const isPending = status === 'pending' || status === 'confirmed'
                              const created = r.created_at ? new Date(r.created_at).toLocaleString() : '—'
                              const expires = r.expires_at ? new Date(r.expires_at).toLocaleString() : '—'
                              return (
                                <tr key={id}>
                                  <td><span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--teal)' }}>{(String(id)).slice(0, 8)}</span></td>
                                  <td><span style={{ fontSize: 13 }}>{r.medicine_name || '—'}</span></td>
                                  <td><span style={{ fontWeight: 600 }}>{r.quantity ?? '—'}</span></td>
                                  <td><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{created}</span></td>
                                  <td><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{expires}</span></td>
                                  <td>
                                    <span className={status === 'completed' ? 'badge-fulfilled' : status === 'expired' ? 'badge b-amber' : 'badge b-teal'}>{r.status || '—'}</span>
                                  </td>
                                  <td>
                                    {isPending && (
                                      <div style={{ display: 'flex', gap: 5 }}>
                                        {status === 'pending' && (
                                          <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => handleConfirmReservation(r)}>Confirm</button>
                                        )}
                                        <button type="button" className="btn btn-teal" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => handleCompleteReservation(r)}>Complete</button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        <div className="pagination">
                          <div className="pg-info">Showing {reservations.length} reservation(s)</div>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )
            })()}
          </>
        )}

        {/* Inventory Status */}
        {activeTab === 'requests' && (
          <div className="content-card inventory-card">
            <div className="card-header">
              <h2>Inventory Status</h2>
              <button className="btn btn-primary btn-sm" onClick={handleOpenInventoryModal}>
                Update Inventory
              </button>
            </div>
            {inventoryLoading ? (
              <div className="inventory-loading">
                <Pill className="loading-icon" />
                <span>Loading inventory...</span>
              </div>
            ) : (
              <>
                <div className="inventory-stats">
                  <div className="inventory-stat">
                    <Package className="inventory-icon" />
                    <span className="inventory-value">{inventory?.summary?.in_stock ?? '—'}</span>
                    <span className="inventory-label">Medicines in stock</span>
                  </div>
                  <div className="inventory-stat warning">
                    <AlertCircle className="inventory-icon" />
                    <span className="inventory-value">{inventory?.summary?.low_stock ?? '—'}</span>
                    <span className="inventory-label">Low stock (&lt;10 units)</span>
                  </div>
                  <div className="inventory-stat danger">
                    <XCircle className="inventory-icon" />
                    <span className="inventory-value">{inventory?.summary?.out_of_stock ?? '—'}</span>
                    <span className="inventory-label">Out of stock</span>
                  </div>
                </div>
                {inventory?.items && inventory.items.length > 0 ? (
                  <div className="inventory-medicines-list">
                    <h4>Medicines</h4>
                    <div className="inventory-items-table">
                      <div className="inventory-items-header">
                        <span>Medicine</span>
                        <span>Quantity</span>
                        <span>Price</span>
                        <span>Status</span>
                      </div>
                      {inventory.items.map((item, idx) => (
                        <div key={idx} className="inventory-item-row-view">
                          <span className="medicine-name">{item.medicine_name}</span>
                          <span className="medicine-qty">{item.quantity}</span>
                          <span className="medicine-price">
                            {item.price != null && item.price !== '' ? `$${Number(item.price).toFixed(2)} ${getPriceUnitLabel(item.price_unit)}`.toLowerCase() : '—'}
                          </span>
                          <span className={`medicine-status ${item.status || ''}`}>
                            {item.status === 'low_stock' ? '⚠️ Low stock' : item.status === 'out_of_stock' ? '⛔ Out of stock' : '✓ In stock'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="inventory-empty">No medicines in inventory. Click Update Inventory to add some.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Inventory Update Modal */}
        {showInventoryModal && (
          <div className="modal-overlay" onClick={handleCloseInventoryModal}>
            <div className="modal-content inventory-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Update Inventory</h2>
                <button className="modal-close" onClick={handleCloseInventoryModal}>
                  <X className="icon" />
                </button>
              </div>
              <div className="modal-body">
                {error && <div className="error-message">{error}</div>}
                <div className="inventory-form">
                  <div className="inventory-items-header">
                    <span>Medicine</span>
                    <span>Qty</span>
                    <span>Low at</span>
                    <span>Price</span>
                    <span>Per</span>
                    <span></span>
                  </div>
                  {inventoryForm.items.map((item, index) => (
                    <div key={index} className="inventory-item-row">
                      <input
                        type="text"
                        placeholder="Medicine name"
                        value={item.medicine_name}
                        onChange={(e) => handleUpdateInventoryItem(index, 'medicine_name', e.target.value)}
                        className="inventory-input"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={item.quantity || ''}
                        onChange={(e) => handleUpdateInventoryItem(index, 'quantity', e.target.value)}
                        className="inventory-input inventory-qty"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Low at"
                        value={item.low_stock_threshold ?? ''}
                        onChange={(e) => handleUpdateInventoryItem(index, 'low_stock_threshold', e.target.value)}
                        className="inventory-input inventory-threshold"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Price"
                        value={item.price === '' ? '' : item.price}
                        onChange={(e) => handleUpdateInventoryItem(index, 'price', e.target.value)}
                        className="inventory-input inventory-price"
                        title="Required for patient display and ranking"
                      />
                      <select
                        value={item.price_unit || 'per_packet'}
                        onChange={(e) => handleUpdateInventoryItem(index, 'price_unit', e.target.value)}
                        className="inventory-input inventory-unit"
                        title="Price is per packet, gram, ml, etc."
                      >
                        {PRICE_UNIT_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon-only"
                        onClick={() => handleRemoveInventoryItem(index)}
                        title="Remove"
                      >
                        <X className="icon" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleAddInventoryItem}>
                    + Add medicine
                  </button>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={handleCloseInventoryModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSubmitInventory} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Inventory'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Response Modal */}
        {selectedRequest && (
          <div className="modal-overlay" onClick={handleCloseResponse}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Respond to Request</h2>
                <button className="modal-close" onClick={handleCloseResponse}>
                  <X className="icon" />
                </button>
              </div>

              <div className="modal-body">
                <div className="request-summary">
                  <h3>Request Details</h3>
                  {selectedRequest.symptoms && (
                    <p><strong>Symptoms:</strong> {selectedRequest.symptoms}</p>
                  )}
                  {(() => {
                    const validMedicines = (selectedRequest.medicine_names || []).filter(med => {
                      const lowerMed = med.toLowerCase().trim()
                      const invalidPatterns = ['unable', 'uploaded', 'minutes', 'before', 'after', 'eatin', 'eating', 'dru']
                      return lowerMed.length >= 2 && !invalidPatterns.some(p => lowerMed.includes(p)) && med.trim().length > 0
                    })
                    return validMedicines.length > 0 ? (
                      <p><strong>{selectedRequest.request_type === 'symptom' ? 'Suggested medicines:' : 'Medicines:'}</strong> {validMedicines.join(', ')}</p>
                    ) : null
                  })()}
                  <p><strong>Location:</strong> {(() => {
                    const loc = selectedRequest.location_address || selectedRequest.location_suburb || ''
                    const raw = (loc && String(loc).trim()) || 'N/A'
                    if (raw === 'N/A') return raw
                    return raw.replace(/^location:\s*/i, '').trim() || raw
                  })()}</p>
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="response-form">
                  <div className="medicines-response-section">
                    {(() => {
                      // For symptom requests, don't show medicine-by-medicine form
                      if (selectedRequest.request_type === 'symptom') {
                        return (
                          <div className="symptom-response-info" style={{ 
                            padding: '1rem', 
                            background: '#f0fdf4', 
                            borderRadius: '8px', 
                            borderLeft: '3px solid #10b981',
                            marginBottom: '1rem'
                          }}>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#065f46', marginBottom: '0.5rem' }}>
                              💡 Suggest medicines you can provide
                            </h4>
                            <p style={{ fontSize: '0.8125rem', color: '#047857', margin: 0, lineHeight: 1.5 }}>
                              This is a symptom-based request. In the box below, type the medicines you HAVE in stock for this symptom, with their prices (e.g. “Paracetamol $5.00, Ibuprofen $7.50”).
                            </p>
                          </div>
                        )
                      }
                      
                      const validMedicines = (selectedRequest.medicine_names || []).filter(med => {
                        const lowerMed = med.toLowerCase().trim()
                        const invalidPatterns = ['unable', 'uploaded', 'minutes', 'before', 'after', 'eatin', 'eating', 'dru']
                        return lowerMed.length >= 2 && !invalidPatterns.some(p => lowerMed.includes(p)) && med.trim().length > 0
                      })
                      
                      return validMedicines.length > 0 ? (
                        <div className="medicines-list-form">
                          {validMedicines.map((medicineName, index) => {
                            const medicineData = responseForm.medicines[medicineName] || { available: false, price: '', quantity: '', quantity_unit: 'capsules', expiry: '', alternative: '' }
                            return (
                              <div key={index} className="medicine-item-form">
                                <div className="medicine-header">
                                  <Pill className="medicine-icon" />
                                  <strong className="medicine-name">{medicineName}</strong>
                                </div>
                                
                                <div className="medicine-form-row">
                                  <div className="inventory-status-badge" title="Availability from inventory (updated when patients buy or you edit inventory)">
                                    {medicineData.available ? (
                                      <span className="in-stock-badge">
                                        <CheckCircle className="icon-tiny" style={{ width: 14, height: 14 }} />
                                        In stock ({medicineData.quantity || '—'} units)
                                      </span>
                                    ) : (
                                      <span className="out-of-stock-badge">
                                        <XCircle className="icon-tiny" style={{ width: 14, height: 14 }} />
                                        Out of stock
                                      </span>
                                    )}
                                  </div>

                                  {medicineData.available && (
                                    <>
                                      <div className="price-input-wrapper">
                                        <label className="price-label">Price ($)</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          placeholder="0.00"
                                          value={medicineData.price}
                                          onChange={(e) => {
                                            const updatedMedicines = {
                                              ...responseForm.medicines,
                                              [medicineName]: { ...medicineData, price: e.target.value }
                                            }
                                            setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                          }}
                                          required
                                          className="price-input"
                                        />
                                      </div>
                                      <div className="quantity-input-wrapper">
                                        <label className="price-label">Quantity</label>
                                        <div className="quantity-with-unit">
                                          <input
                                            type="text"
                                            placeholder="100"
                                            value={medicineData.quantity}
                                            onChange={(e) => {
                                              const updatedMedicines = {
                                                ...responseForm.medicines,
                                                [medicineName]: { ...medicineData, quantity: e.target.value }
                                              }
                                              setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                            }}
                                            className="price-input"
                                          />
                                          <select
                                            value={medicineData.quantity_unit || 'capsules'}
                                            onChange={(e) => {
                                              const updatedMedicines = {
                                                ...responseForm.medicines,
                                                [medicineName]: { ...medicineData, quantity_unit: e.target.value }
                                              }
                                              setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                            }}
                                            className="unit-select"
                                          >
                                            <option value="capsules">capsules</option>
                                            <option value="tablets">tablets</option>
                                            <option value="ml">ml</option>
                                            <option value="units">units</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div className="expiry-input-wrapper">
                                        <label className="price-label">Expiry</label>
                                        <input
                                          type="date"
                                          placeholder="2026-08-30"
                                          value={medicineData.expiry}
                                          onChange={(e) => {
                                            const updatedMedicines = {
                                              ...responseForm.medicines,
                                              [medicineName]: { ...medicineData, expiry: e.target.value }
                                            }
                                            setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                          }}
                                          className="price-input"
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>

                                {!medicineData.available && (
                                  <div className="form-group compact">
                                    <label className="alternative-label">Suggest alternatives (you don’t have this medicine)</label>
                                    <input
                                      type="text"
                                      placeholder="e.g., Ibuprofen, Aspirin"
                                      value={medicineData.alternative}
                                      onChange={(e) => {
                                        const updatedMedicines = {
                                          ...responseForm.medicines,
                                          [medicineName]: {
                                            ...medicineData,
                                            alternative: e.target.value
                                          }
                                        }
                                        setResponseForm({ ...responseForm, medicines: updatedMedicines })
                                      }}
                                      className="alternative-input"
                                    />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="no-medicines">No medicines specified in this request</p>
                      )
                    })()}
                  </div>

                  <div className="form-group">
                    <label>Preparation time (minutes)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={responseForm.preparation_time}
                      onChange={(e) =>
                        setResponseForm({ ...responseForm, preparation_time: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      {selectedRequest.request_type === 'symptom' ? 'Medicines you can supply (with prices)' : 'Alternative Medicines'} 
                    </label>
                    {selectedRequest.request_type === 'symptom' ? (
                      <input
                        type="text"
                        placeholder="e.g., Paracetamol $5.00, Ibuprofen $7.50, Aspirin $3.00"
                        value={responseForm.notes || ''}
                        onChange={(e) =>
                          setResponseForm({ ...responseForm, notes: e.target.value })
                        }
                        style={{ 
                          width: '100%', 
                          padding: '0.875rem 1.125rem', 
                          border: '2px solid #10b981', 
                          borderRadius: '10px',
                          fontSize: '0.9375rem',
                          fontFamily: 'Inter, sans-serif'
                        }}
                      />
                    ) : (
                      <textarea
                        rows="3"
                        placeholder="e.g., Ibuprofen, Aspirin (if the requested medicines are not available)"
                        value={responseForm.notes}
                        onChange={(e) =>
                          setResponseForm({ ...responseForm, notes: e.target.value })
                        }
                      />
                    )}
                    {selectedRequest.request_type === 'symptom' && (
                      <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                        List the medicines you can supply for this request, with prices, e.g. “Paracetamol $5.00, Ibuprofen $7.50”.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-outline" onClick={handleCloseResponse}>
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSubmitResponse}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Response'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inventory Tab – Stock Manager from GET pharmacist/inventory */}
        {activeTab === 'inventory' && (
          <>
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              <div className="sc teal">
                <div className="sc-icon">💊</div>
                <div className="sc-label">Total Items</div>
                <div className="sc-val">{inventory?.summary?.total_medicines ?? 0}</div>
                <div className="sc-sub">In inventory</div>
              </div>
              <div className="sc green">
                <div className="sc-icon">✅</div>
                <div className="sc-label">In Stock</div>
                <div className="sc-val">{inventory?.summary?.in_stock ?? 0}</div>
                <div className="sc-sub">Above threshold</div>
              </div>
              <div className="sc amber">
                <div className="sc-icon">📉</div>
                <div className="sc-label">Low Stock</div>
                <div className="sc-val">{inventory?.summary?.low_stock ?? 0}</div>
                <div className="sc-sub">Below threshold</div>
              </div>
              <div className="sc red">
                <div className="sc-icon">⚠️</div>
                <div className="sc-label">Out of Stock</div>
                <div className="sc-val">{inventory?.summary?.out_of_stock ?? 0}</div>
                <div className="sc-sub">Zero units</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Medicine Inventory</div>
                  <div className="card-sub">From GET pharmacist/inventory — use Update Inventory to edit</div>
                </div>
                <button type="button" className="btn btn-teal" onClick={handleOpenInventoryModal}>Update Inventory</button>
              </div>
              {inventoryLoading && !inventory ? (
                <div className="card-body"><p style={{ color: 'var(--muted)' }}>Loading inventory…</p></div>
              ) : !inventory?.items?.length ? (
                <div className="card-body"><p style={{ color: 'var(--muted)' }}>No medicines in inventory. Click Update Inventory to add items (price required per item).</p></div>
              ) : (
                <>
                  <table className="requests-table">
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>In Stock</th>
                        <th>Threshold</th>
                        <th>Price</th>
                        <th>Last Updated</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.items.map((item, idx) => {
                        const status = (item.status || '').toLowerCase()
                        const statusClass = status === 'out_of_stock' ? 'b-red' : status === 'low_stock' ? 'b-amber' : 'b-green'
                        const updated = item.updated_at ? new Date(item.updated_at).toLocaleString() : '—'
                        return (
                          <tr key={item.medicine_name || idx}>
                            <td><div style={{ fontWeight: 600, fontSize: 13.5 }}>{item.medicine_name || '—'}</div></td>
                            <td><span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>{item.quantity ?? '—'}</span></td>
                            <td>{item.low_stock_threshold ?? '—'}</td>
                            <td>{item.price != null ? `$${Number(item.price).toFixed(2)}` : (item.price_missing ? 'Missing' : '—')}</td>
                            <td><span style={{ fontSize: 12, color: 'var(--muted)' }}>{updated}</span></td>
                            <td><span className={`badge ${statusClass}`}>{status || '—'}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="pagination">
                    <div className="pg-info">Showing {inventory.items.length} medicine(s)</div>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Analytics Tab – derived from requests, reservations, inventory (no dedicated analytics API) */}
        {activeTab === 'analytics' && (
          <div className="content-card">
            <div className="topbar" style={{ marginBottom: 20 }}>
              <div>
                <h1>Analytics</h1>
                <p>Insights from your requests, reservations and inventory</p>
              </div>
            </div>

            {(() => {
              const completedRes = reservations.filter(r => (r.status || '').toLowerCase() === 'completed')
              const totalItems = inventory?.summary?.total_medicines ?? 0
              const lowStock = inventory?.summary?.low_stock ?? 0
              const outOfStock = inventory?.summary?.out_of_stock ?? 0
              const medCount = {}
              requests.forEach(r => {
                (r.medicine_names || []).forEach(m => {
                  const key = (m || '').toLowerCase().trim()
                  if (key) medCount[key] = (medCount[key] || 0) + 1
                })
              })
              const topMeds = Object.entries(medCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count], i) => ({ rank: i + 1, name, count: `${count} reqs` }))
              return (
                <>
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              <div className="sc teal">
                <div className="sc-icon">📥</div>
                <div className="sc-label">Requests Received</div>
                <div className="sc-val">{requests.length}</div>
                <div className="sc-sub">From GET pharmacist/requests</div>
              </div>
              <div className="sc green">
                <div className="sc-icon">✅</div>
                <div className="sc-label">Reservations Completed</div>
                <div className="sc-val">{completedRes.length}</div>
                <div className="sc-sub">Pick-ups completed</div>
              </div>
              <div className="sc blue">
                <div className="sc-icon">💊</div>
                <div className="sc-label">Inventory Items</div>
                <div className="sc-val">{totalItems}</div>
                <div className="sc-sub">{inventory?.summary?.in_stock ?? 0} in stock</div>
              </div>
              <div className="sc amber">
                <div className="sc-icon">⚠️</div>
                <div className="sc-label">Low / Out of Stock</div>
                <div className="sc-val">{lowStock + outOfStock}</div>
                <div className="sc-sub">Needs attention</div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 1fr',
                gap: 20,
                marginBottom: 20
              }}
            >
              <div className="card">
                <div className="card-header">
                  <div className="card-title">📈 Daily Revenue — March 2026</div>
                </div>
                <div className="card-body">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: 6,
                      height: 130,
                      marginBottom: 10
                    }}
                  >
                    {[45, 60, 55, 72, 65, 88, 70, 50, 80, 75, 90, 85, 68, 77].map((h, idx) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={idx}
                        style={{
                          flex: 1,
                          borderRadius: '5px 5px 0 0',
                          background: idx === 5 ? 'var(--teal)' : 'var(--teal-mid)',
                          height: `${h}%`,
                          transition: 'height .3s'
                        }}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      justifyContent: 'space-between'
                    }}
                  >
                    {['Mar 1', 'Mar 2', 'Mar 3', 'Mar 4', 'Mar 5', 'Mar 6', 'Mar 7', 'Mar 8', 'Mar 9', 'Mar 10', 'Mar 11', 'Mar 12', 'Mar 13', 'Mar 14'].map(
                      (d) => (
                        <div
                          key={d}
                          style={{
                            flex: 1,
                            fontSize: 9.5,
                            color: 'var(--muted)',
                            textAlign: 'center'
                          }}
                        >
                          {d}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">💊 Top Requested Medicines</div>
                </div>
                <div className="card-body" style={{ padding: '12px 16px' }}>
                  {topMeds.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: 13 }}>No request data yet. Medicines appear here as patients send requests.</p>
                  ) : topMeds.map((m) => {
                    const getNum = (x) => parseInt(String(x.count).replace(/\D/g, ''), 10) || 0
                    const maxCount = Math.max(...topMeds.map(getNum), 1)
                    const n = getNum(m)
                    const pct = Math.round((n / maxCount) * 100)
                    return (
                    <div
                      key={m.rank}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 0',
                        borderBottom: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', width: 20 }}>{m.rank}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{m.name}</div>
                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', borderRadius: 10 }} />
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--teal)' }}>{m.count}</div>
                    </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20
              }}
            >
              <div className="card">
                <div className="card-header">
                  <div className="card-title">📊 Request Fulfilment Breakdown</div>
                </div>
                <div className="card-body">
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      marginBottom: 16
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        background: 'var(--green-light)',
                        borderRadius: 10,
                        padding: 16
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'Syne',sans-serif",
                          fontSize: 24,
                          fontWeight: 800,
                          color: 'var(--green)'
                        }}
                      >
                        91%
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--green)',
                          fontWeight: 600
                        }}
                      >
                        Fulfilled
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        background: 'var(--amber-light)',
                        borderRadius: 10,
                        padding: 16
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'Syne',sans-serif",
                          fontSize: 24,
                          fontWeight: 800,
                          color: 'var(--amber)'
                        }}
                      >
                        6%
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--amber)',
                          fontWeight: 600
                        }}
                      >
                        Out of Stock
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        background: 'var(--red-light)',
                        borderRadius: 10,
                        padding: 16
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'Syne',sans-serif",
                          fontSize: 24,
                          fontWeight: 800,
                          color: 'var(--red)'
                        }}
                      >
                        3%
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--red)',
                          fontWeight: 600
                        }}
                      >
                        Expired
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Average response time:{' '}
                    <strong style={{ color: 'var(--text)' }}>6.4 minutes</strong> (Target: 10 min ✓)
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <div className="card-title">🕐 Busiest Hours</div>
                </div>
                <div className="card-body">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: 5,
                      height: 80,
                      marginBottom: 8
                    }}
                  >
                    {[15, 25, 55, 90, 100, 80, 65, 70, 95, 88, 75, 60, 40, 25, 10].map((h, idx) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={idx}
                        style={{
                          flex: 1,
                          borderRadius: '4px 4px 0 0',
                          background: h >= 90 ? 'var(--teal)' : 'var(--teal-mid)',
                          height: `${h}%`
                        }}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 5,
                      justifyContent: 'space-between'
                    }}
                  >
                    {['6am', '7', '8', '9', '10', '11', '12', '1pm', '2', '3', '4', '5', '6', '7', '8pm'].map(
                      (t) => (
                        <div
                          key={t}
                          style={{
                            flex: 1,
                            fontSize: 9,
                            color: 'var(--muted)',
                            textAlign: 'center'
                          }}
                        >
                          {t}
                        </div>
                      )
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                    Chart placeholder — no hourly analytics API
                  </div>
                </div>
              </div>
            </div>
                </>
              )
            })()}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="content-card">
            <div className="card-header">
              <h2>Pharmacy Settings</h2>
            </div>
            <div className="settings-form">
              <div className="form-group">
                <label>Pharmacy Name</label>
                <input type="text" defaultValue={pharmacy.name} />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input type="text" defaultValue={pharmacy.address} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input type="text" defaultValue={pharmacy.phone || ''} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" defaultValue={pharmacy.email || ''} />
              </div>
              <button className="btn btn-primary">Save Changes</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default PharmacyDashboard
