import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildAdminNavSections } from '../utils/adminNavSections'
import { adminLogoutRequest } from '../utils/api'

/**
 * Shared props for {@link AdminAppShell} on standalone admin routes (not embedded in AdminDashboard).
 * @param {string} activeTab — sidebar highlight id (see ADMIN_DASHBOARD_TAB_IDS)
 */
export function useAdminShell(activeTab) {
  const navigate = useNavigate()
  const navSections = useMemo(() => buildAdminNavSections(), [])
  const onLogout = useCallback(async () => {
    await adminLogoutRequest()
    localStorage.removeItem('token')
    localStorage.removeItem('userRole')
    localStorage.removeItem('admin')
    navigate('/')
  }, [navigate])

  return {
    navSections,
    activeTab,
    linkNav: true,
    onLogout
  }
}
