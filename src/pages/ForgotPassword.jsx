import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Stethoscope, Mail, Lock, KeyRound, ArrowLeft } from 'lucide-react'
import { requestPasswordResetCode, confirmPasswordReset } from '../utils/api'
import './Auth.css'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [userType, setUserType] = useState('patient')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const handleRequestCode = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await requestPasswordResetCode({ email: email.trim(), userType })
      setInfo('If an account exists for this email, a reset code has been sent. Check your inbox and spam folder.')
      setStep(2)
    } catch (err) {
      setError(err?.message || 'Could not send reset code.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await confirmPasswordReset({
        email: email.trim(),
        code: code.trim(),
        newPassword,
        userType,
      })
      setInfo('Password updated. You can sign in with your new password.')
      setTimeout(() => navigate('/login', { state: { email: email.trim(), userType } }), 1500)
    } catch (err) {
      setError(err?.message || 'Reset failed. Check the code and try again.')
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
          <h1>Reset password</h1>
          <p className="auth-subtitle">We&apos;ll email you a one-time code to set a new password</p>

          <div className="user-type-toggle">
            <button
              type="button"
              className={`toggle-btn ${userType === 'patient' ? 'active' : ''}`}
              onClick={() => setUserType('patient')}
            >
              Patient
            </button>
            <button
              type="button"
              className={`toggle-btn ${userType === 'pharmacist' ? 'active' : ''}`}
              onClick={() => setUserType('pharmacist')}
            >
              Pharmacy
            </button>
            <button
              type="button"
              className={`toggle-btn ${userType === 'admin' ? 'active' : ''}`}
              onClick={() => setUserType('admin')}
            >
              Admin
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}
          {info && (
            <div className="error-message" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
              {info}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleRequestCode} className="auth-form">
              <div className="form-group">
                <label htmlFor="fp-email">Email</label>
                <div className="input-wrapper">
                  <Mail className="input-icon" />
                  <input
                    id="fp-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset code'}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleConfirm} className="auth-form">
              <div className="form-group">
                <label htmlFor="fp-code">Code from email</label>
                <div className="input-wrapper">
                  <KeyRound className="input-icon" />
                  <input
                    id="fp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6–8 digit code"
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="fp-new">New password</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" />
                  <input
                    id="fp-new"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="fp-confirm">Confirm password</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" />
                  <input
                    id="fp-confirm"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Saving…' : 'Set new password'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-full"
                style={{ marginTop: 8 }}
                disabled={loading}
                onClick={async () => {
                  setError('')
                  setLoading(true)
                  try {
                    await requestPasswordResetCode({ email: email.trim(), userType })
                    setInfo('A new code has been sent to your email.')
                  } catch (err) {
                    setError(err?.message || 'Could not resend code.')
                  } finally {
                    setLoading(false)
                  }
                }}
              >
                Resend code to same email
              </button>
            </form>
          )}

          <div className="auth-footer">
            <p>
              <Link to="/login" className="forgot-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ArrowLeft size={16} aria-hidden />
                Back to sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
