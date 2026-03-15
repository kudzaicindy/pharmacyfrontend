import { useState } from 'react'
import { getPatientSessionIds } from '../utils/api'
import Chatbot from '../components/Chatbot'
import '../components/PatientLayout.css'

const tabs = [
  { id: 'name', label: 'By Name' },
  { id: 'upload', label: 'Upload Prescription' },
  { id: 'symptoms', label: 'Describe Symptoms' },
]

export default function PatientSearch() {
  const { patient } = getPatientSessionIds()
  const [activeTab, setActiveTab] = useState('name')
  const [medicine, setMedicine] = useState('')
  const [location, setLocation] = useState(patient?.home_area || '')
  const [distance, setDistance] = useState('10 km')
  const [showChatbot, setShowChatbot] = useState(false)
  const [pendingQuery, setPendingQuery] = useState('')
  const [pendingMode, setPendingMode] = useState(null)
  const [searchError, setSearchError] = useState('')

  const handleSearchNow = () => {
    setSearchError('')
    if (activeTab === 'name') {
      const query = medicine.trim()
      if (!query) {
        setSearchError('Enter a medicine name to search.')
        return
      }
      setPendingQuery(query)
      setPendingMode('direct')
      setShowChatbot(true)
    } else if (activeTab === 'symptoms') {
      setPendingQuery('')
      setPendingMode('symptom')
      setShowChatbot(true)
    } else {
      setPendingQuery('')
      setPendingMode(null)
      setShowChatbot(true)
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Search Medicine</h1>
          <p>Find medicine by name, prescription, or describe your symptoms</p>
        </div>
      </div>

      <div className="patient-search-card">
        <div className="search-tabs-inner">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={activeTab === t.id ? 'search-tab-active' : 'search-tab-inactive'}
            >
              {t.id === 'name' && '🔍 '}{t.id === 'upload' && '📸 '}{t.id === 'symptoms' && '🧠 '}{t.label}
            </button>
          ))}
        </div>
        {activeTab === 'name' && (
          <div className="search-form-row">
            <div className="search-field-wrap">
              <label className="form-label">Medicine Name or Active Ingredient</label>
              <input
                className="form-input"
                placeholder="e.g. Amoxicillin, Paracetamol, Metformin..."
                value={medicine}
                onChange={(e) => setMedicine(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchNow()}
              />
            </div>
            <div className="search-field-loc">
              <label className="form-label">Your Location</label>
              <input
                className="form-input form-select"
                placeholder="e.g. Harare CBD"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="search-field-dist">
              <label className="form-label">Max Distance</label>
              <select className="form-input form-select" value={distance} onChange={(e) => setDistance(e.target.value)}>
                <option>5 km</option>
                <option>10 km</option>
                <option>20 km</option>
                <option>Any</option>
              </select>
            </div>
            <button type="button" className="btn btn-teal" onClick={handleSearchNow}>🔍 Search Now</button>
            {searchError && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8, width: '100%' }}>{searchError}</p>}
          </div>
        )}
        {activeTab === 'symptoms' && (
          <div className="search-form-row">
            <p style={{ color: 'var(--muted)', marginBottom: 12 }}>Describe your symptoms and the assistant will suggest medicines, then find pharmacies near you.</p>
            <button type="button" className="btn btn-teal" onClick={handleSearchNow}>🧠 Open symptom assistant</button>
          </div>
        )}
        {activeTab === 'upload' && (
          <div className="search-form-row">
            <p style={{ color: 'var(--muted)', marginBottom: 12 }}>Upload a prescription image and the assistant will read it and search for those medicines.</p>
            <button type="button" className="btn btn-teal" onClick={handleSearchNow}>📸 Open prescription assistant</button>
          </div>
        )}
      </div>

      <div className="results-header" style={{ marginBottom: 12 }}>
        <span>Search results appear in the AI assistant. Click &quot;Search Now&quot; or &quot;Open assistant&quot; above to start.</span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        The assistant will ask for your location if needed, then show ranked pharmacy results with prices and reserve options.
      </p>

      <Chatbot
        isOpen={showChatbot}
        onClose={() => setShowChatbot(false)}
        initialQuery={pendingQuery}
        initialMode={pendingMode}
      />
    </>
  )
}
