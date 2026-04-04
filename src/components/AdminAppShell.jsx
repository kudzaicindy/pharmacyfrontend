import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X, ShieldCheck, LogOut } from 'lucide-react'
import '../pages/AdminDashboard.css'

/**
 * Shared admin layout: navy sidebar (pharmacy-aligned) + mobile drawer.
 * @param {object} props
 * @param {Array<{ label: string, items: Array<{ id: string, icon: object, label: string, badge?: string }> }>} props.navSections
 * @param {string} props.activeTab
 * @param {(id: string) => void} [props.onSelectTab] — in-page tab switch (dashboard)
 * @param {boolean} [props.linkNav] — use React Router links to `/admin/dashboard?tab=…` (e.g. patient page)
 * @param {() => void} props.onLogout
 * @param {React.ReactNode} props.children — rendered inside `main.admin-main`
 */
function AdminAppShell({ navSections, activeTab, onSelectTab, linkNav = false, onLogout, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <div className="admin-dashboard">
      <header className="admin-mobile-header" aria-hidden="true">
        <div className="admin-mobile-header-inner">
          <span className="admin-mobile-logo">
            Medi<span>Connect</span>
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

      <aside className={`admin-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="admin-sb-brand">
          <div className="admin-sb-logo">
            Medi<span>Connect</span>
          </div>
          <div className="admin-sb-version">ADMIN · v2.1</div>
        </div>

        <nav className="admin-sb-nav">
          {navSections.map((section) => (
            <div key={section.label} className="admin-sb-group">
              <div className="admin-sb-section">{section.label}</div>
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
                        <Icon size={18} strokeWidth={1.75} className="admin-sb-ico" aria-hidden />
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
                      <Icon size={18} strokeWidth={1.75} className="admin-sb-ico" aria-hidden />
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

        <div className="admin-sb-footer">
          <div className="admin-sb-profile admin-sb-profile-footer">
            <div className="admin-sb-avatar admin-sb-avatar-initials" aria-hidden>
              PA
            </div>
            <div>
              <div className="admin-sb-name">Platform Admin</div>
              <div className="admin-sb-status">
                <ShieldCheck size={12} className="admin-sb-status-icon" aria-hidden /> Super admin
              </div>
            </div>
          </div>
          <button
            className="logout-btn"
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

      <main className="admin-main">{children}</main>
    </div>
  )
}

export default AdminAppShell
