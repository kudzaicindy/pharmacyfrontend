import {
  LayoutDashboard,
  Activity,
  ClipboardCheck,
  Building2,
  SlidersHorizontal,
  Bot,
  UserRound,
  ClipboardList,
  CalendarCheck2,
  Users,
  Package
} from 'lucide-react'

/** All valid `?tab=` values for `/admin/dashboard`. */
export const ADMIN_DASHBOARD_TAB_IDS = new Set([
  'overview',
  'layer1-system',
  'verification-queue',
  'pharmacies',
  'algorithm-stewardship',
  'chatbot-audit',
  'users',
  'requests',
  'reservations',
  'pharmacists',
  'inventory',
  // Legacy (redirected to canonical tabs)
  'system-health',
  'geographic-heatmap',
  'sla-monitoring',
  'weight-tuning',
  'ranking-profiles',
  'content-policy',
  'command-center',
  'chatbot'
])

function formatCompactCount(n) {
  const x = Number(n) || 0
  if (x >= 1000000) return `${(x / 1000000).toFixed(1).replace(/\.0$/, '')}m`
  if (x >= 1000) return `${(x / 1000).toFixed(x >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`
  return String(x)
}

/**
 * MediBot-style layered sidebar (matches admin portal mocks).
 */
export function buildAdminNavSections({
  usersApproxCount = 0,
  pharmacyRegistryCount = 0,
  pharmacistRegistryCount = 0,
  requestStatsTotal = 0,
  reservationsTotal = 0,
  verificationPendingCount = 0,
  chatbotAuditBadgeCount = 0,
  /** Optional: from MediBot overview `nav_badges` (snake_case or camelCase). Overrides computed badges when counts are > 0. */
  navBadges = null
} = {}) {
  const nb = navBadges && typeof navBadges === 'object' ? navBadges : null
  const vqApi = nb != null ? Number(nb.verification_queue ?? nb.verificationQueue ?? NaN) : NaN
  const auditApi = nb != null ? Number(nb.chatbot_audit ?? nb.chatbotAudit ?? NaN) : NaN

  const vqBadge =
    Number.isFinite(vqApi) && vqApi > 0
      ? String(vqApi)
      : verificationPendingCount > 0
        ? String(verificationPendingCount)
        : undefined
  const auditBadge =
    Number.isFinite(auditApi) && auditApi > 0
      ? String(auditApi)
      : chatbotAuditBadgeCount > 0
        ? String(chatbotAuditBadgeCount)
        : undefined

  return [
    {
      label: 'Overview',
      items: [{ id: 'overview', icon: LayoutDashboard, label: 'Dashboard' }]
    },
    {
      label: 'Layer 1 — System',
      items: [{ id: 'layer1-system', icon: Activity, label: 'Health, geography & SLA' }]
    },
    {
      label: 'Layer 2 — Governance',
      items: [
        { id: 'verification-queue', icon: ClipboardCheck, label: 'Verification queue', badge: vqBadge },
        { id: 'pharmacies', icon: Building2, label: 'All pharmacies', badge: String(pharmacyRegistryCount) }
      ]
    },
    {
      label: 'Layer 3 — Algorithm & policy',
      items: [
        {
          id: 'algorithm-stewardship',
          icon: SlidersHorizontal,
          label: 'Weights, profiles & content'
        }
      ]
    },
    {
      label: 'Layer 4 — AI safety',
      items: [{ id: 'chatbot-audit', icon: Bot, label: 'Chatbot audit', badge: auditBadge }]
    },
    {
      label: 'Platform',
      items: [
        { id: 'users', icon: UserRound, label: 'Users', badge: formatCompactCount(usersApproxCount) },
        { id: 'requests', icon: ClipboardList, label: 'Patient requests', badge: requestStatsTotal > 0 ? formatCompactCount(requestStatsTotal) : undefined },
        { id: 'reservations', icon: CalendarCheck2, label: 'Reservations', badge: reservationsTotal > 0 ? formatCompactCount(reservationsTotal) : undefined },
        { id: 'pharmacists', icon: Users, label: 'Pharmacists', badge: String(pharmacistRegistryCount) },
        { id: 'inventory', icon: Package, label: 'Inventory reports' }
      ]
    }
  ]
}
