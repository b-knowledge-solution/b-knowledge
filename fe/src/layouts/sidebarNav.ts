/**
 * @fileoverview Declarative sidebar navigation registries for user and admin shells.
 *
 * Keeps shell navigation and route-permission resolution in one place so
 * `/admin/...` routing cannot drift from sidebar visibility rules.
 *
 * @module layouts/sidebarNav
 */

import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  Brain,
  BrainCircuit,
  ClipboardList,
  Database,
  FileCode,
  FolderOpen,
  History,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Search,
  Server,
  Shield,
  ShieldCheck,
  User as UserIcon,
  UserCog,
  Users,
  Workflow,
} from 'lucide-react'
import type { config } from '@/config'
import {
  ADMIN_AGENTS_ROUTE,
  ADMIN_AUDIT_LOG_ROUTE,
  ADMIN_BROADCAST_MESSAGES_ROUTE,
  ADMIN_CHAT_ASSISTANTS_ROUTE,
  ADMIN_CODE_GRAPH_ROUTE,
  ADMIN_DASHBOARD_ROUTE,
  ADMIN_DATASETS_ROUTE,
  ADMIN_EFFECTIVE_ACCESS_ROUTE,
  ADMIN_HISTORIES_ROUTE,
  ADMIN_KNOWLEDGE_BASE_ROUTE,
  ADMIN_LLM_PROVIDERS_ROUTE,
  ADMIN_MEMORY_ROUTE,
  ADMIN_PERMISSIONS_ROUTE,
  ADMIN_SEARCH_APPS_ROUTE,
  ADMIN_SYSTEM_MONITOR_ROUTE,
  ADMIN_SYSTEM_TOOLS_ROUTE,
  ADMIN_TEAMS_ROUTE,
  ADMIN_TOKENIZER_ROUTE,
  ADMIN_USERS_ROUTE,
} from '@/app/adminRoutes'
import { PERMISSION_KEYS, type PermissionKey } from '@/constants/permission-keys'

/**
 * @description A single sidebar navigation link with its path, label, icon, and optional access guards
 */
export interface SidebarNavItem {
  /** Route path used for navigation and active-state matching */
  path: string
  /** i18n key for the label */
  labelKey: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Icon size override for compact children */
  iconSize?: number
  /** Catalog permission key required to see this item */
  requiredPermission?: PermissionKey
  /** Feature flag key in `config.features` */
  featureFlag?: keyof typeof config.features
}

/**
 * @description An expandable sidebar group containing child navigation links
 */
export interface SidebarNavGroup {
  /** i18n key for the group label */
  labelKey: string
  /** Lucide icon for the group header */
  icon: LucideIcon
  /** Catalog permission key required to see the group */
  requiredPermission?: PermissionKey
  /** Child routes rendered inside the group */
  children: SidebarNavItem[]
}

/**
 * @description Union type for standalone nav links and grouped nav sections
 */
export type SidebarNavEntry = SidebarNavItem | SidebarNavGroup

/**
 * @description Type guard that determines whether a navigation entry is an expandable group
 * @param {SidebarNavEntry} entry - Candidate navigation entry
 * @returns {boolean} True when the entry contains child links
 */
export function isNavGroup(entry: SidebarNavEntry): entry is SidebarNavGroup {
  return 'children' in entry
}

/**
 * @description Sidebar registry for the standard authenticated shell
 */
export const USER_SIDEBAR_NAV: SidebarNavEntry[] = [
  {
    path: '/chat',
    labelKey: 'nav.aiChat',
    icon: MessageSquare,
    iconSize: 20,
    featureFlag: 'enableAiChat',
  },
  {
    path: '/search',
    labelKey: 'nav.aiSearch',
    icon: Search,
    iconSize: 20,
    featureFlag: 'enableAiSearch',
  },
]

/**
 * @description Sidebar registry for the `/admin` shell
 */
export const ADMIN_SIDEBAR_NAV: SidebarNavEntry[] = [
  {
    labelKey: 'nav.dataStudio',
    icon: LayoutDashboard,
    requiredPermission: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW,
    children: [
      {
        path: ADMIN_KNOWLEDGE_BASE_ROUTE,
        labelKey: 'nav.knowledgeBase',
        icon: FolderOpen,
        requiredPermission: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW,
      },
      {
        path: ADMIN_DATASETS_ROUTE,
        labelKey: 'nav.datasets',
        icon: Database,
        requiredPermission: PERMISSION_KEYS.DATASETS_VIEW,
      },
    ],
  },
  {
    labelKey: 'nav.agentStudio',
    icon: Workflow,
    requiredPermission: PERMISSION_KEYS.AGENTS_VIEW,
    children: [
      {
        path: ADMIN_CHAT_ASSISTANTS_ROUTE,
        labelKey: 'nav.chatAssistants',
        icon: MessageSquare,
        requiredPermission: PERMISSION_KEYS.CHAT_VIEW,
      },
      {
        path: ADMIN_SEARCH_APPS_ROUTE,
        labelKey: 'nav.searchApps',
        icon: Search,
        requiredPermission: PERMISSION_KEYS.SEARCH_APPS_VIEW,
      },
      {
        path: ADMIN_HISTORIES_ROUTE,
        labelKey: 'nav.histories',
        icon: History,
        requiredPermission: PERMISSION_KEYS.SYSTEM_HISTORY_VIEW,
      },
      {
        path: ADMIN_AGENTS_ROUTE,
        labelKey: 'nav.agentList',
        icon: Workflow,
        iconSize: 18,
        requiredPermission: PERMISSION_KEYS.AGENTS_VIEW,
      },
      {
        path: ADMIN_MEMORY_ROUTE,
        labelKey: 'nav.memory',
        icon: Brain,
        iconSize: 18,
        requiredPermission: PERMISSION_KEYS.MEMORY_VIEW,
      },
    ],
  },
  {
    labelKey: 'nav.iam',
    icon: UserCog,
    requiredPermission: PERMISSION_KEYS.USERS_VIEW,
    children: [
      {
        path: ADMIN_USERS_ROUTE,
        labelKey: 'nav.userManagement',
        icon: UserIcon,
        requiredPermission: PERMISSION_KEYS.USERS_VIEW,
      },
      {
        path: ADMIN_TEAMS_ROUTE,
        labelKey: 'nav.teamManagement',
        icon: Users,
        requiredPermission: PERMISSION_KEYS.TEAMS_VIEW,
      },
      {
        path: ADMIN_PERMISSIONS_ROUTE,
        labelKey: 'nav.permissionManagement',
        icon: ShieldCheck,
        requiredPermission: PERMISSION_KEYS.PERMISSIONS_MANAGE,
      },
      {
        path: ADMIN_EFFECTIVE_ACCESS_ROUTE,
        labelKey: 'nav.effectiveAccess',
        icon: Search,
        requiredPermission: PERMISSION_KEYS.PERMISSIONS_VIEW,
      },
    ],
  },
  {
    labelKey: 'nav.system',
    icon: Shield,
    requiredPermission: PERMISSION_KEYS.SYSTEM_VIEW,
    children: [
      {
        path: ADMIN_DASHBOARD_ROUTE,
        labelKey: 'nav.dashboard',
        icon: BarChart3,
        requiredPermission: PERMISSION_KEYS.DASHBOARD_VIEW,
      },
      {
        path: ADMIN_AUDIT_LOG_ROUTE,
        labelKey: 'nav.auditLog',
        icon: ClipboardList,
        requiredPermission: PERMISSION_KEYS.AUDIT_VIEW,
      },
      {
        path: ADMIN_SYSTEM_TOOLS_ROUTE,
        labelKey: 'nav.systemTools',
        icon: Server,
        requiredPermission: PERMISSION_KEYS.SYSTEM_TOOLS_VIEW,
      },
      {
        path: ADMIN_SYSTEM_MONITOR_ROUTE,
        labelKey: 'nav.systemMonitor',
        icon: Activity,
        requiredPermission: PERMISSION_KEYS.SYSTEM_VIEW,
      },
      {
        path: ADMIN_TOKENIZER_ROUTE,
        labelKey: 'nav.tokenizer',
        icon: FileCode,
        requiredPermission: PERMISSION_KEYS.SYSTEM_VIEW,
      },
      {
        path: ADMIN_BROADCAST_MESSAGES_ROUTE,
        labelKey: 'nav.broadcastMessages',
        icon: Megaphone,
        requiredPermission: PERMISSION_KEYS.BROADCAST_VIEW,
      },
      {
        path: ADMIN_LLM_PROVIDERS_ROUTE,
        labelKey: 'nav.llmProviders',
        icon: BrainCircuit,
        requiredPermission: PERMISSION_KEYS.LLM_PROVIDERS_VIEW,
      },
    ],
  },
]

const HIDDEN_ADMIN_ROUTE_PERMISSIONS: Record<string, PermissionKey> = {
  [ADMIN_CODE_GRAPH_ROUTE]: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW,
}

const ROUTE_PERMISSION_MAP: Record<string, PermissionKey> = {}

for (const entry of [...USER_SIDEBAR_NAV, ...ADMIN_SIDEBAR_NAV]) {
  if (isNavGroup(entry)) {
    const groupPermission = entry.requiredPermission
    for (const child of entry.children) {
      const effectivePermission = child.requiredPermission ?? groupPermission
      if (effectivePermission) {
        ROUTE_PERMISSION_MAP[child.path] = effectivePermission
      }
    }
    continue
  }

  if (entry.requiredPermission) {
    ROUTE_PERMISSION_MAP[entry.path] = entry.requiredPermission
  }
}

for (const [path, permission] of Object.entries(HIDDEN_ADMIN_ROUTE_PERMISSIONS)) {
  ROUTE_PERMISSION_MAP[path] = permission
}

/**
 * @description Resolves the permission required for the given pathname using exact, hidden-route, and prefix matching
 * @param {string} pathname - Current URL pathname
 * @returns {PermissionKey | undefined} Required permission key, or undefined when the route is unrestricted
 */
export function getRoutePermission(pathname: string): PermissionKey | undefined {
  if (ROUTE_PERMISSION_MAP[pathname]) {
    return ROUTE_PERMISSION_MAP[pathname]
  }

  // Guard hidden code-graph routes explicitly because they are not visible nav entries.
  if (/^\/admin\/code-graph\/[^/]+$/.test(pathname)) {
    return ROUTE_PERMISSION_MAP[ADMIN_CODE_GRAPH_ROUTE]
  }

  let bestMatch: string | undefined
  let bestLength = 0

  for (const path of Object.keys(ROUTE_PERMISSION_MAP)) {
    if (pathname.startsWith(`${path}/`) && path.length > bestLength) {
      bestMatch = path
      bestLength = path.length
    }
  }

  return bestMatch ? ROUTE_PERMISSION_MAP[bestMatch] : undefined
}
