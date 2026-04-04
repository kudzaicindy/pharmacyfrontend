import {
  Building2,
  Users,
  ClipboardList,
  CalendarCheck2,
  LayoutDashboard,
  Package,
  LineChart,
  Bot,
  UserRound
} from 'lucide-react'

export const ADMIN_DASHBOARD_TAB_IDS = new Set([
  'overview',
  'users',
  'pharmacies',
  'medicines',
  'inventory',
  'pharmacists',
  'requests',
  'reservations',
  'search-analytics',
  'chatbot',
  'audit'
])

function formatCompactCount(n) {
  const x = Number(n) || 0
  if (x >= 1000000) return `${(x / 1000000).toFixed(1).replace(/\.0$/, '')}m`
  if (x >= 1000) return `${(x / 1000).toFixed(x >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`
  return String(x)
}

/**
 * Sidebar nav structure for admin dashboard shell.
 * Counts default to 0 (e.g. patient detail page uses static nav without live totals).
 */
export function buildAdminNavSections({
  usersApproxCount = 0,
  pharmacyRegistryCount = 0,
  pharmacistRegistryCount = 0,
  requestStatsTotal = 0,
  reservationsTotal = 0
} = {}) {
  return [
    {
      label: 'Overview',
      items: [
        { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' },
        {
          id: 'users',
          icon: UserRound,
          label: 'Users & Patients',
          badge: formatCompactCount(usersApproxCount)
        }
      ]
    },
    {
      label: 'Pharmacy',
      items: [
        {
          id: 'pharmacies',
          icon: Building2,
          label: 'Pharmacy Registry',
          badge: String(pharmacyRegistryCount)
        },
        { id: 'inventory', icon: Package, label: 'Inventory Reports' },
        { id: 'pharmacists', icon: Users, label: 'Pharmacists', badge: String(pharmacistRegistryCount) },
        {
          id: 'requests',
          icon: ClipboardList,
          label: 'Patient requests',
          badge: requestStatsTotal > 0 ? formatCompactCount(requestStatsTotal) : undefined
        },
        {
          id: 'reservations',
          icon: CalendarCheck2,
          label: 'Reservations',
          badge: reservationsTotal > 0 ? formatCompactCount(reservationsTotal) : undefined
        }
      ]
    },
    {
      label: 'System',
      items: [
        { id: 'search-analytics', icon: LineChart, label: 'Search Analytics' },
        { id: 'chatbot', icon: Bot, label: 'AI Chatbot Logs' }
      ]
    }
  ]
}
