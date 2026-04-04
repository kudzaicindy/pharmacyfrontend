import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildAdminNavSections } from '../utils/adminNavSections'

/**
 * Shared props for {@link AdminAppShell} on standalone admin routes (not embedded in AdminDashboard).
 * @param {string} activeTab — sidebar highlight id (see ADMIN_DASHBOARD_TAB_IDS)
 */
export function useAdminShell(activeTab) {
  const navigate = useNavigate()
  const navSections = useMemo(() => buildAdminNavSections(), [])
  const onLogout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('userRole')
    navigate('/login')
  }, [navigate])

  return {
    navSections,
    activeTab,
    linkNav: true,
    onLogout
  }
}
