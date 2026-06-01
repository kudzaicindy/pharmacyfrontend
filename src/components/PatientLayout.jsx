import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import './PatientLayout.css'

export default function PatientLayout() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const patient = JSON.parse(localStorage.getItem('patient') || '{}')
  const name = patient?.name || t('patient.guest')
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'GU'

  const handleLogout = () => {
    localStorage.removeItem('patient')
    localStorage.removeItem('token')
    localStorage.removeItem('userRole')
    navigate('/')
  }

  const closeMobileMenu = () => setMobileMenuOpen(false)

  const nav = [
    { to: '/patient/dashboard', labelKey: 'patient.nav.dashboard', icon: '🏠' },
    { to: '/patient/search', labelKey: 'patient.nav.search', icon: '🔍' },
    { to: '/patient/requests', labelKey: 'patient.nav.requests', icon: '📋', badge: 3 },
    { to: '/patient/history', labelKey: 'patient.nav.history', icon: '🕐' },
    { to: '/patient/saved', labelKey: 'patient.nav.saved', icon: '💊' },
    { to: '/patient/ai-assistant', labelKey: 'patient.nav.assistant', icon: '🤖' },
  ]
  const account = [
    { to: '/patient/profile', labelKey: 'patient.nav.profile', icon: '👤' },
    { to: '/patient/notifications', labelKey: 'patient.nav.notifications', icon: '🔔', badge: 2 },
    { to: '/patient/settings', labelKey: 'patient.nav.settings', icon: '⚙️' },
  ]

  return (
    <div className="pl-wrap">
      <header className="pl-mobile-header" aria-hidden="true">
        <div className="pl-mobile-header-inner">
          <span className="pl-mobile-logo">Medi<span>Connect</span></span>
          <button
            type="button"
            className="pl-hamburger"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? t('patient.closeMenu') : t('patient.openMenu')}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>
      <div
        className={`pl-mobile-overlay ${mobileMenuOpen ? 'pl-mobile-overlay-open' : ''}`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />
      <aside className={`sidebar pl-sidebar ${mobileMenuOpen ? 'pl-sidebar-open' : ''}`}>
        <div className="sb-logo">Medi<span>Connect</span></div>
        <div className="sb-user-card">
          <div className="sb-av" style={{ background: 'var(--teal)' }}>{initials}</div>
          <div>
            <div className="sb-uname">{name}</div>
            <div className="sb-urole">{t('patient.accountRole')}</div>
          </div>
        </div>
        <div className="sb-section">{t('patient.menu')}</div>
        {nav.map(({ to, labelKey, icon, badge }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            <span className="ic">{icon}</span>
            {t(labelKey)}
            {badge != null && <span className="sb-badge teal">{badge}</span>}
          </NavLink>
        ))}
        <div className="sb-section">{t('patient.account')}</div>
        {account.map(({ to, labelKey, icon, badge }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            <span className="ic">{icon}</span>
            {t(labelKey)}
            {badge != null && <span className="sb-badge">{badge}</span>}
          </NavLink>
        ))}
        <div className="sb-foot">
          <button type="button" className="sb-item sb-item-btn" onClick={() => { closeMobileMenu(); handleLogout(); }}>
            <span className="ic">🚪</span>
            {t('patient.signOut')}
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
