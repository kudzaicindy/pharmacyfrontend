import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Stethoscope, Mail, Lock, User, Phone, MapPin, Eye, EyeOff, Building2, ArrowRight, ArrowLeft, CheckCircle, Globe } from 'lucide-react'
import { registerPharmacy, registerPharmacist, registerPatient, generateSessionId } from '../utils/api'
import './Auth.css'

function Register() {
  const [step, setStep] = useState(1) // 1: User type, 2: Pharmacy registration, 3: Pharmacist registration
  const [userType, setUserType] = useState('patient')
  const [pharmacyData, setPharmacyData] = useState({
    pharmacy_id: '',
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    phone: '',
    email: ''
  })
  const [pharmacistData, setPharmacistData] = useState({
    pharmacy_id: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    license_number: '',
    username: '',
    password: '',
    confirmPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()

  const handlePharmacySubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const data = {
        pharmacy_id: pharmacyData.pharmacy_id,
        name: pharmacyData.name,
        address: pharmacyData.address,
        phone: pharmacyData.phone || undefined,
        email: pharmacyData.email || undefined,
      }

      // Add coordinates if provided
      if (pharmacyData.latitude && pharmacyData.longitude) {
        data.latitude = parseFloat(pharmacyData.latitude)
        data.longitude = parseFloat(pharmacyData.longitude)
      }

      const response = await registerPharmacy(data)
      setSuccess(`Pharmacy "${response.pharmacy.name}" registered successfully!`)
      
      // Store pharmacy ID for pharmacist registration
      setPharmacistData(prev => ({ ...prev, pharmacy_id: response.pharmacy.pharmacy_id }))
      
      // Move to pharmacist registration step
      setTimeout(() => {
        setStep(3)
        setSuccess('')
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to register pharmacy')
    } finally {
      setLoading(false)
    }
  }

  const handlePharmacistSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (pharmacistData.password !== pharmacistData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (pharmacistData.password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    setLoading(true)

    try {
      const data = {
        pharmacy_id: pharmacistData.pharmacy_id,
        first_name: pharmacistData.first_name,
        last_name: pharmacistData.last_name,
        email: pharmacistData.email,
        username: pharmacistData.username,
        password: pharmacistData.password,
        phone: pharmacistData.phone || undefined,
        license_number: pharmacistData.license_number || undefined,
      }

      const response = await registerPharmacist(data)
      setSuccess(`Pharmacist "${response.pharmacist.full_name}" registered successfully!`)
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login', { state: { email: pharmacistData.email, userType: 'pharmacist' } })
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to register pharmacist')
    } finally {
      setLoading(false)
    }
  }

  const handlePatientSubmit = async (e) => {
    e.preventDefault()
    const form = e.target
    const display_name = form.querySelector('#name')?.value?.trim()
    const email = form.querySelector('#email')?.value?.trim()
    const phone = form.querySelector('#phone')?.value?.trim()
    const password = form.querySelector('#password')?.value?.trim()

    setError('')
    setSuccess('')
    setLoading(true)

    const patientData = {
      display_name,
      email,
      phone: phone || undefined,
      password: password || undefined,
      preferred_language: 'en',
    }
    const existingSessionId = localStorage.getItem('chatbot_session_id')
    const existingConversationId = localStorage.getItem('chatbot_conversation_id')
    if (existingSessionId) patientData.session_id = existingSessionId
    if (existingConversationId) patientData.conversation_id = existingConversationId

    try {
      const response = await registerPatient(patientData)
      setSuccess('Account created! Redirecting...')
      if (response.session_id) {
        localStorage.setItem('chatbot_session_id', response.session_id)
      }
      const profile = response.profile || {}
      localStorage.setItem('patient', JSON.stringify({
        session_id: response.session_id,
        display_name: profile.display_name || display_name,
        email: profile.email || email,
        phone: profile.phone || phone,
      }))
      setTimeout(() => navigate('/patient/dashboard'), 1500)
    } catch (err) {
      const is404OrUnavailable = err.code === 'NOT_FOUND' || err.status === 404 ||
        (err.message && (err.message.includes('404') || err.message.includes('not available') || err.message.includes('not valid JSON')))
      if (is404OrUnavailable) {
        const sessionId = generateSessionId()
        localStorage.setItem('chatbot_session_id', sessionId)
        localStorage.setItem('patient', JSON.stringify({ session_id: sessionId, display_name, email, phone }))
        setSuccess('Continuing as guest. Redirecting to dashboard...')
        setTimeout(() => navigate('/patient/dashboard'), 1500)
      } else {
        setError(err.message || 'Registration failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <Link to="/" className="auth-logo">
            <Stethoscope className="logo-icon" />
            <span>HealthConnect</span>
          </Link>
        </div>

        <div className="auth-card">
          {/* Step 1: User Type Selection */}
          {step === 1 && (
            <>
              <h1>Create Account</h1>
              <p className="auth-subtitle">Join HealthConnect today</p>

              <div className="user-type-toggle">
                <button
                  className={`toggle-btn ${userType === 'patient' ? 'active' : ''}`}
                  onClick={() => setUserType('patient')}
                >
                  Patient
                </button>
                <button
                  className={`toggle-btn ${userType === 'pharmacist' ? 'active' : ''}`}
                  onClick={() => setUserType('pharmacist')}
                >
                  Pharmacy
                </button>
              </div>

              {userType === 'patient' && (
                <form onSubmit={handlePatientSubmit} className="auth-form">
                  <div className="form-group">
                    <label htmlFor="name">Full Name</label>
                    <div className="input-wrapper">
                      <User className="input-icon" />
                      <input
                        id="name"
                        type="text"
                        placeholder="John Moyo"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <div className="input-wrapper">
                      <Mail className="input-icon" />
                      <input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="phone">Phone Number</label>
                    <div className="input-wrapper">
                      <Phone className="input-icon" />
                      <input
                        id="phone"
                        type="tel"
                        placeholder="+263 77 123 4567"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <div className="input-wrapper">
                      <Lock className="input-icon" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Create a strong password"
                        required
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="icon" /> : <Eye className="icon" />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Create Account'}
                  </button>
                </form>
              )}

              {userType === 'pharmacist' && (
                <div className="registration-info">
                  <div className="info-box">
                    <Building2 className="info-icon" />
                    <h3>Pharmacy Registration</h3>
                    <p>To register as a pharmacist, you need to:</p>
                    <ol>
                      <li>Register your pharmacy first</li>
                      <li>Then register yourself as a pharmacist linked to that pharmacy</li>
                    </ol>
                    <button
                      className="btn btn-primary btn-full"
                      onClick={() => setStep(2)}
                    >
                      Register Pharmacy <ArrowRight className="icon" />
                    </button>
                  </div>
                </div>
              )}

              <div className="auth-footer">
                <p>
                  Already have an account? <Link to="/login">Sign in</Link>
                </p>
              </div>
            </>
          )}

          {/* Step 2: Pharmacy Registration */}
          {step === 2 && (
            <>
              <div className="step-header">
                <button
                  className="back-btn"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="icon" />
                </button>
                <h1>Register Pharmacy</h1>
                <p className="auth-subtitle">Step 1 of 2: Register your pharmacy</p>
              </div>

              {error && <div className="error-message">{error}</div>}
              {success && <div className="success-message">{success}</div>}

              <form onSubmit={handlePharmacySubmit} className="auth-form">
                <div className="form-group">
                  <label htmlFor="pharmacy_id">Pharmacy ID *</label>
                  <div className="input-wrapper">
                    <Building2 className="input-icon" />
                    <input
                      id="pharmacy_id"
                      type="text"
                      placeholder="ph-001 or city-care-harare"
                      value={pharmacyData.pharmacy_id}
                      onChange={(e) => setPharmacyData({ ...pharmacyData, pharmacy_id: e.target.value })}
                      required
                      minLength={3}
                    />
                  </div>
                  <small className="form-hint">Unique identifier for your pharmacy (min 3 characters)</small>
                </div>

                <div className="form-group">
                  <label htmlFor="pharmacy_name">Pharmacy Name *</label>
                  <div className="input-wrapper">
                    <Building2 className="input-icon" />
                    <input
                      id="pharmacy_name"
                      type="text"
                      placeholder="HealthFirst Pharmacy"
                      value={pharmacyData.name}
                      onChange={(e) => setPharmacyData({ ...pharmacyData, name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="pharmacy_address">Address *</label>
                  <div className="input-wrapper">
                    <MapPin className="input-icon" />
                    <input
                      id="pharmacy_address"
                      type="text"
                      placeholder="123 Main Street, Harare"
                      value={pharmacyData.address}
                      onChange={(e) => setPharmacyData({ ...pharmacyData, address: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="latitude">Latitude (optional)</label>
                    <div className="input-wrapper">
                      <MapPin className="input-icon" />
                      <input
                        id="latitude"
                        type="number"
                        step="any"
                        placeholder="-17.8095"
                        value={pharmacyData.latitude}
                        onChange={(e) => setPharmacyData({ ...pharmacyData, latitude: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="longitude">Longitude (optional)</label>
                    <div className="input-wrapper">
                      <MapPin className="input-icon" />
                      <input
                        id="longitude"
                        type="number"
                        step="any"
                        placeholder="31.0452"
                        value={pharmacyData.longitude}
                        onChange={(e) => setPharmacyData({ ...pharmacyData, longitude: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="pharmacy_phone">Phone (optional)</label>
                  <div className="input-wrapper">
                    <Phone className="input-icon" />
                    <input
                      id="pharmacy_phone"
                      type="tel"
                      placeholder="+263771234567"
                      value={pharmacyData.phone}
                      onChange={(e) => setPharmacyData({ ...pharmacyData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="pharmacy_email">Email (optional)</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon" />
                    <input
                      id="pharmacy_email"
                      type="email"
                      placeholder="info@pharmacy.co.zw"
                      value={pharmacyData.email}
                      onChange={(e) => setPharmacyData({ ...pharmacyData, email: e.target.value })}
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                  {loading ? 'Registering...' : 'Register Pharmacy'}
                </button>
              </form>
            </>
          )}

          {/* Step 3: Pharmacist Registration */}
          {step === 3 && (
            <>
              <div className="step-header">
                <button
                  className="back-btn"
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft className="icon" />
                </button>
                <h1>Register Pharmacist</h1>
                <p className="auth-subtitle">Step 2 of 2: Register yourself as a pharmacist</p>
              </div>

              {error && <div className="error-message">{error}</div>}
              {success && (
                <div className="success-message">
                  <CheckCircle className="icon" />
                  {success}
                </div>
              )}

              <form onSubmit={handlePharmacistSubmit} className="auth-form">
                <div className="form-group">
                  <label htmlFor="pharmacy_id_display">Pharmacy ID</label>
                  <div className="input-wrapper">
                    <Building2 className="input-icon" />
                    <input
                      id="pharmacy_id_display"
                      type="text"
                      value={pharmacistData.pharmacy_id}
                      disabled
                      className="disabled-input"
                    />
                  </div>
                  <small className="form-hint">This pharmacist will be linked to this pharmacy</small>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="first_name">First Name *</label>
                    <div className="input-wrapper">
                      <User className="input-icon" />
                      <input
                        id="first_name"
                        type="text"
                        placeholder="John"
                        value={pharmacistData.first_name}
                        onChange={(e) => setPharmacistData({ ...pharmacistData, first_name: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="last_name">Last Name *</label>
                    <div className="input-wrapper">
                      <User className="input-icon" />
                      <input
                        id="last_name"
                        type="text"
                        placeholder="Doe"
                        value={pharmacistData.last_name}
                        onChange={(e) => setPharmacistData({ ...pharmacistData, last_name: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="pharmacist_email">Email Address *</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon" />
                    <input
                      id="pharmacist_email"
                      type="email"
                      placeholder="john.doe@pharmacy.co.zw"
                      value={pharmacistData.email}
                      onChange={(e) => setPharmacistData({ ...pharmacistData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="pharmacist_username">Username *</label>
                  <div className="input-wrapper">
                    <User className="input-icon" />
                    <input
                      id="pharmacist_username"
                      type="text"
                      placeholder="johndoe"
                      value={pharmacistData.username}
                      onChange={(e) => setPharmacistData({ ...pharmacistData, username: e.target.value })}
                      required
                    />
                  </div>
                  <small className="form-hint">Unique username for login (must be unique across all users)</small>
                </div>

                <div className="form-group">
                  <label htmlFor="pharmacist_phone">Phone (optional)</label>
                  <div className="input-wrapper">
                    <Phone className="input-icon" />
                    <input
                      id="pharmacist_phone"
                      type="tel"
                      placeholder="+263771234568"
                      value={pharmacistData.phone}
                      onChange={(e) => setPharmacistData({ ...pharmacistData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="license_number">License Number (optional)</label>
                  <div className="input-wrapper">
                    <User className="input-icon" />
                    <input
                      id="license_number"
                      type="text"
                      placeholder="PHARM-2024-001"
                      value={pharmacistData.license_number}
                      onChange={(e) => setPharmacistData({ ...pharmacistData, license_number: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="pharmacist_password">Password *</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon" />
                    <input
                      id="pharmacist_password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a strong password (min 8 characters)"
                      value={pharmacistData.password}
                      onChange={(e) => setPharmacistData({ ...pharmacistData, password: e.target.value })}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="icon" /> : <Eye className="icon" />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="confirm_password">Confirm Password *</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon" />
                    <input
                      id="confirm_password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      value={pharmacistData.confirmPassword}
                      onChange={(e) => setPharmacistData({ ...pharmacistData, confirmPassword: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                  {loading ? 'Registering...' : 'Register Pharmacist'}
                </button>
              </form>

              <div className="auth-footer">
                <p>
                  Already have an account? <Link to="/login">Sign in</Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Register
