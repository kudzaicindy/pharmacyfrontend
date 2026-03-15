import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import './PatientLayout.css'

export default function PatientLayout() {
  const navigate = useNavigate()
  const patient = JSON.parse(localStorage.getItem('patient') || '{}')
  const name = patient?.name || 'Guest'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'GU'

  const handleLogout = () => {
    localStorage.removeItem('patient')
    navigate('/')
  }

  const nav = [
    { to: '/patient/dashboard', label: 'Dashboard', icon: '🏠' },
    { to: '/patient/search', label: 'Search Medicine', icon: '🔍' },
    { to: '/patient/requests', label: 'My Requests', icon: '📋', badge: 3 },
    { to: '/patient/history', label: 'History', icon: '🕐' },
    { to: '/patient/saved', label: 'Saved Medicines', icon: '💊' },
    { to: '/patient/ai-assistant', label: 'AI Assistant', icon: '🤖' },
  ]
  const account = [
    { to: '/patient/profile', label: 'My Profile', icon: '👤' },
    { to: '/patient/notifications', label: 'Notifications', icon: '🔔', badge: 2 },
    { to: '/patient/settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <div className="pl-wrap">
      <aside className="sidebar">
        <div className="sb-logo">Medi<span>Connect</span></div>
        <div className="sb-user-card">
          <div className="sb-av" style={{ background: 'var(--teal)' }}>{initials}</div>
          <div>
            <div className="sb-uname">{name}</div>
            <div className="sb-urole">Patient Account</div>
          </div>
        </div>
        <div className="sb-section">Menu</div>
        {nav.map(({ to, label, icon, badge }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`}>
            <span className="ic">{icon}</span>
            {label}
            {badge != null && <span className="sb-badge teal">{badge}</span>}
          </NavLink>
        ))}
        <div className="sb-section">Account</div>
        {account.map(({ to, label, icon, badge }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`}>
            <span className="ic">{icon}</span>
            {label}
            {badge != null && <span className="sb-badge">{badge}</span>}
          </NavLink>
        ))}
        <div className="sb-foot">
          <button type="button" className="sb-item sb-item-btn" onClick={handleLogout}>
            <span className="ic">🚪</span>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
