import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Stethoscope, Mail, Lock, Eye, EyeOff, Shield } from 'lucide-react'
import {
  pharmacistLogin,
  patientLogin,
  adminLogin,
  clearAdminCsrfToken,
  completeMfaLogin,
  extractAuthTokenFromPayload,
  storeAuthTokenFromLoginResponse,
} from '../utils/api'
import { useLanguage } from '../context/LanguageContext'
import './Auth.css'

function loginResponseNeedsMfa(data) {
  if (!data || typeof data !== 'object') return false
  const tok = data.mfa_token || data.mfa_challenge_token
  return Boolean(data.requires_mfa || data.requires_otp || data.mfa_required) && Boolean(tok)
}

function getMfaToken(data) {
  return String(data?.mfa_token || data?.mfa_challenge_token || '').trim()
}

function getLoginPortal(pathname) {
  if (pathname === '/pharmacy/login') return 'pharmacy'
  if (pathname === '/admin/login') return 'admin'
  return 'default'
}

function Login() {
  const { t } = useLanguage()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    userType: 'patient',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mfaToken, setMfaToken] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const loginPortal = getLoginPortal(location.pathname)
  const effectiveUserType =
    loginPortal === 'pharmacy' ? 'pharmacist' : loginPortal === 'admin' ? 'admin' : 'patient'

  useEffect(() => {
    if (location.state?.email) {
      setFormData((prev) => ({ ...prev, email: location.state.email }))
    }
  }, [location.state])

  useEffect(() => {
    const userType =
      loginPortal === 'admin' ? 'admin' : loginPortal === 'pharmacy' ? 'pharmacist' : 'patient'
    setFormData((prev) => ({ ...prev, userType }))
  }, [loginPortal])

  const clearMfa = () => {
    setMfaToken('')
    setOtpCode('')
  }

  const applyPharmacistSession = (response) => {
    const token = extractAuthTokenFromPayload(response)
    const pharmacist = {
      ...response.pharmacist,
      ...(token ? { token } : {}),
    }
    localStorage.setItem('pharmacist', JSON.stringify(pharmacist))
    localStorage.setItem('pharmacy_id', response.pharmacist.pharmacy.pharmacy_id)
    localStorage.setItem('pharmacist_id', response.pharmacist.pharmacist_id)
    localStorage.setItem('userRole', 'pharmacist')
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
    storeAuthTokenFromLoginResponse(response)
    navigate('/pharmacy/dashboard')
  }

  const applyPatientSession = (response) => {
    const patient = response.patient || response.profile || {}
    if (response.session_id) {
      localStorage.setItem('chatbot_session_id', response.session_id)
    }
    localStorage.setItem(
      'patient',
      JSON.stringify({
        ...patient,
        email: patient.email || formData.email,
        session_id: response.session_id || patient.session_id || null,
      })
    )
    localStorage.setItem('token', response.token || response.access_token || 'authenticated')
    localStorage.setItem('userRole', 'patient')
    navigate('/my-search')
  }

  const applyAdminSession = (response) => {
    localStorage.setItem('admin', JSON.stringify(response.admin || response.user || { email: formData.email }))
    localStorage.setItem('token', response.token || response.access_token || 'authenticated')
    localStorage.setItem('userRole', 'admin')
    navigate('/admin/dashboard')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mfaToken) {
        const response = await completeMfaLogin({
          userType: effectiveUserType,
          mfaToken,
          otpCode,
          email: formData.email,
          password: formData.password,
        })
        clearMfa()
        if (effectiveUserType === 'pharmacist') applyPharmacistSession(response)
        else if (effectiveUserType === 'admin') applyAdminSession(response)
        else applyPatientSession(response)
        return
      }

      if (effectiveUserType === 'pharmacist') {
        clearAdminCsrfToken()
        const response = await pharmacistLogin(formData.email, formData.password)
        if (loginResponseNeedsMfa(response)) {
          setMfaToken(getMfaToken(response))
          setLoading(false)
          return
        }
        applyPharmacistSession(response)
      } else if (effectiveUserType === 'admin') {
        const response = await adminLogin(formData.email, formData.password)
        if (loginResponseNeedsMfa(response)) {
          setMfaToken(getMfaToken(response))
          setLoading(false)
          return
        }
        applyAdminSession(response)
      } else {
        clearAdminCsrfToken()
        const response = await patientLogin(formData.email, formData.password)
        if (loginResponseNeedsMfa(response)) {
          setMfaToken(getMfaToken(response))
          setLoading(false)
          return
        }
        applyPatientSession(response)
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.')
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
            <span>
              Medi<span style={{ color: '#2dd4bf' }}>Connect</span>
            </span>
          </Link>
        </div>

        <div className="auth-card">
          <h1>
            {loginPortal === 'pharmacy'
              ? 'Pharmacy Login'
              : loginPortal === 'admin'
                ? 'Admin Login'
                : 'Welcome Back'}
          </h1>
          <p className="auth-subtitle">
            {mfaToken
              ? 'Enter the code from your authenticator app'
              : loginPortal === 'pharmacy'
                ? 'Sign in to manage your pharmacy dashboard'
                : loginPortal === 'admin'
                  ? 'Sign in to the MediConnect admin console'
                  : 'Sign in to find medicines and manage your health'}
          </p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">{t('auth.email')}</label>
              <div className="input-wrapper">
                <Mail className="input-icon" />
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={Boolean(mfaToken)}
                />
              </div>
            </div>

            {!mfaToken && (
              <div className="form-group">
                <label htmlFor="password">{t('auth.password')}</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    autoComplete="current-password"
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
            )}

            {mfaToken && (
              <div className="form-group">
                <label htmlFor="otp">Authentication code</label>
                <div className="input-wrapper">
                  <Shield className="input-icon" />
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\s/g, ''))}
                    required
                  />
                </div>
                <button
                  type="button"
                  className="forgot-link"
                  style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  onClick={() => {
                    clearMfa()
                    setError('')
                  }}
                >
                  ← Back to password
                </button>
              </div>
            )}

            <div className="form-options">
              {!mfaToken && (
                <>
                  <label className="checkbox-label">
                    <input type="checkbox" />
                    <span>Remember me</span>
                  </label>
                  <Link
                    to="/forgot-password"
                    state={{ userType: effectiveUserType }}
                    className="forgot-link"
                  >
                    Forgot password?
                  </Link>
                </>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? (mfaToken ? t('auth.verify') : t('auth.signingIn')) : mfaToken ? t('auth.verify') : t('auth.signIn')}
            </button>
          </form>

          <div className="auth-footer">
            {loginPortal === 'pharmacy' && (
              <p>
                Don&apos;t have an account?{' '}
                <Link to="/register" state={{ userType: 'pharmacist' }}>
                  Register your pharmacy
                </Link>
              </p>
            )}
            {loginPortal === 'admin' && (
              <p>
                <Link to="/">← Back to home</Link>
              </p>
            )}
            {loginPortal === 'default' && (
              <p>
                Don&apos;t have an account? <Link to="/register" state={{ userType: 'patient' }}>Sign up</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
