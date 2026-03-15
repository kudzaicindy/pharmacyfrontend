import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Stethoscope, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { pharmacistLogin } from '../utils/api'
import './Auth.css'

function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    userType: 'patient'
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  // Pre-fill email if coming from registration
  useEffect(() => {
    if (location.state?.email) {
      setFormData(prev => ({ ...prev, email: location.state.email }))
    }
    if (location.state?.userType) {
      setFormData(prev => ({ ...prev, userType: location.state.userType }))
    }
  }, [location.state])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (formData.userType === 'pharmacist') {
        // Pharmacist login
        const response = await pharmacistLogin(formData.email, formData.password)
        
        // Store pharmacist data
        localStorage.setItem('pharmacist', JSON.stringify(response.pharmacist))
        localStorage.setItem('pharmacy_id', response.pharmacist.pharmacy.pharmacy_id)
        localStorage.setItem('pharmacist_id', response.pharmacist.pharmacist_id)
        localStorage.setItem('userRole', 'pharmacist')
        localStorage.setItem('token', 'authenticated') // You may want to implement proper JWT tokens
        
        navigate('/pharmacy/dashboard')
      } else {
        // Patient login (mock for now)
        localStorage.setItem('token', 'mock-token')
        localStorage.setItem('userRole', 'patient')
        navigate('/patient/dashboard')
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
            <span>Medi<span style={{ color: '#2dd4bf' }}>Connect</span></span>
          </Link>
        </div>

        <div className="auth-card">
          <h1>Welcome Back</h1>
          <p className="auth-subtitle">Sign in to your account</p>

          <div className="user-type-toggle">
            <button
              className={`toggle-btn ${formData.userType === 'patient' ? 'active' : ''}`}
              onClick={() => setFormData({ ...formData, userType: 'patient' })}
            >
              Patient
            </button>
            <button
              className={`toggle-btn ${formData.userType === 'pharmacist' ? 'active' : ''}`}
              onClick={() => setFormData({ ...formData, userType: 'pharmacist' })}
            >
              Pharmacy
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-wrapper">
                <Mail className="input-icon" />
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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

            <div className="form-options">
              <label className="checkbox-label">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <Link to="#" className="forgot-link">Forgot password?</Link>
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Don't have an account? <Link to="/register">Sign up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
