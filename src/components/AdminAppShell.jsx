import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X, ShieldCheck, LogOut, Bot } from 'lucide-react'
import '../pages/AdminDashboard.css'

/**
 * @param {object} props
 * @param {Array<{ label: string, items: Array<{ id: string, icon: object, label: string, badge?: string }> }>} props.navSections
 * @param {string} props.activeTab
 * @param {(id: string) => void} [props.onSelectTab]
 * @param {boolean} [props.linkNav]
 * @param {() => void} props.onLogout
 * @param {{
 *   uptimePct?: string,
 *   avgResponse?: string,
 *   platformUsers?: string | number,
 *   platformSessions?: string | number,
 *   operational?: boolean
 * }} [props.systemStatus]
 * @param {{ name?: string, role?: string, initials?: string }} [props.adminProfile]
 */
function AdminAppShell({
  navSections,
  activeTab,
  onSelectTab,
  linkNav = false,
  onLogout,
  systemStatus,
  adminProfile,
  children
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const closeMobileMenu = () => setMobileMenuOpen(false)

  const ss = systemStatus || {}
  const op = ss.operational !== false
  const profile = adminProfile || {}
  const displayName = profile.name || 'Administrator'
  const displayRole = profile.role || 'System admin · Full access'
  const initials =
    profile.initials ||
    displayName
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'SA'

  return (
    <div className="admin-dashboard admin-dashboard--medibot admin-dashboard--compact">
      <header className="admin-mobile-header" aria-hidden="true">
        <div className="admin-mobile-header-inner">
          <span className="admin-mobile-logo admin-mobile-logo--medibot">
            Medi<span>Bot</span>
          </span>
          <button
            type="button"
            className="admin-hamburger"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      <div
        className={`admin-mobile-overlay ${mobileMenuOpen ? 'admin-mobile-overlay-open' : ''}`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      <aside className={`admin-sidebar admin-sidebar--medibot ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="admin-sb-brand admin-sb-brand--medibot">
          <div className="admin-sb-brand-top">
            <span className="admin-sb-medibot-icon" aria-hidden>
              <Bot size={20} strokeWidth={2} />
            </span>
            <div>
              <div className="admin-sb-logo admin-sb-logo--medibot">MediBot</div>
              <div className="admin-sb-version admin-sb-version--medibot">ADMIN PORTAL</div>
            </div>
          </div>
        </div>

        <div className={`admin-sb-status-card ${op ? 'admin-sb-status-card--ok' : 'admin-sb-status-card--warn'}`}>
          <div className="admin-sb-status-head">
            <span className={`admin-sb-status-dot ${op ? '' : 'admin-sb-status-dot--warn'}`} aria-hidden />
            <span>{op ? 'SYSTEM OPERATIONAL' : 'DEGRADED'}</span>
          </div>
          <div className="admin-sb-status-metrics">
            <div className="admin-sb-status-metric">
              <span className="admin-sb-status-k">Uptime</span>
              <span className="admin-sb-status-v">{ss.uptimePct ?? '—'}</span>
            </div>
            <div className="admin-sb-status-metric">
              <span className="admin-sb-status-k">Avg response</span>
              <span className="admin-sb-status-v">{ss.avgResponse ?? '—'}</span>
            </div>
            <div className="admin-sb-status-metric">
              <span className="admin-sb-status-k">Platform users</span>
              <span className="admin-sb-status-v">{ss.platformUsers ?? '—'}</span>
            </div>
            <div className="admin-sb-status-metric">
              <span className="admin-sb-status-k">Platform sessions</span>
              <span className="admin-sb-status-v">{ss.platformSessions ?? '—'}</span>
            </div>
          </div>
        </div>

        <nav className="admin-sb-nav admin-sb-nav--medibot">
          {navSections.map((section) => (
            <div key={section.label} className="admin-sb-group">
              <div className="admin-sb-section admin-sb-section--medibot">{section.label}</div>
              <div className="admin-sb-items">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const cls = `admin-sb-item ${activeTab === item.id ? 'active' : ''}`
                  if (linkNav) {
                    return (
                      <Link
                        key={item.id}
                        to={`/admin/dashboard?tab=${encodeURIComponent(item.id)}`}
                        className={cls}
                        onClick={closeMobileMenu}
                      >
                        <Icon size={16} strokeWidth={1.85} className="admin-sb-ico" aria-hidden />
                        <span className="admin-sb-item-label">{item.label}</span>
                        {item.badge != null && item.badge !== '' && (
                          <span className="admin-sb-badge">{item.badge}</span>
                        )}
                      </Link>
                    )
                  }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cls}
                      onClick={() => {
                        onSelectTab?.(item.id)
                        closeMobileMenu()
                      }}
                    >
                      <Icon size={16} strokeWidth={1.85} className="admin-sb-ico" aria-hidden />
                      <span className="admin-sb-item-label">{item.label}</span>
                      {item.badge != null && item.badge !== '' && (
                        <span className="admin-sb-badge">{item.badge}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="admin-sb-footer admin-sb-footer--medibot">
          <div className="admin-sb-profile admin-sb-profile-footer">
            <div className="admin-sb-avatar admin-sb-avatar-initials admin-sb-avatar--medibot" aria-hidden>
              {initials}
            </div>
            <div>
              <div className="admin-sb-name">{displayName}</div>
              <div className="admin-sb-status">
                <ShieldCheck size={12} className="admin-sb-status-icon" aria-hidden /> {displayRole}
              </div>
            </div>
          </div>
          <button
            className="logout-btn logout-btn--medibot"
            type="button"
            onClick={() => {
              setMobileMenuOpen(false)
              onLogout()
            }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="admin-main admin-main--medibot">{children}</main>
    </div>
  )
}

export default AdminAppShell
