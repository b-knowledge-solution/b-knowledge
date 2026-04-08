/**
 * @fileoverview Declarative sidebar navigation configuration.
 *
 * Defines all sidebar items (links and expandable groups) as data.
 * Each item specifies its route, label key, icon, and optional
 * permission key / feature-flag guards.
 *
 * Phase 4: nav visibility now resolves via permission keys, not role-set membership.
 *
 * When adding a new sidebar entry, add it here instead of touching
 * the Sidebar component directly.
 *
 * @module layouts/sidebarNav
 */

import type { LucideIcon } from 'lucide-react'
import {
  MessageSquare,
  Search,
  BookOpen,
  Users,
  Server,
  ClipboardList,
  FileCode,
  Activity,
  User as UserIcon,
  UserCog,
  Megaphone,
  History,
  BarChart3,
  Database,
  Shield,
  ShieldCheck,
  FolderOpen,
  LayoutDashboard,
  BrainCircuit,
  Workflow,
  Brain,
} from 'lucide-react'
import type { config } from '@/config'
import { PERMISSION_KEYS, type PermissionKey } from '@/constants/permission-keys'

// ============================================================================
// Types
// ============================================================================

/**
 * @description A single sidebar navigation link (leaf item) with route, label, icon, and optional access guards.
 *   Phase 4: nav visibility now resolves via permission keys, not role-set membership.
 */
export interface SidebarNavItem {
  /** Route path used for navigation and active-state matching */
  path: string
  /** i18n key for the label */
  labelKey: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Icon size (defaults to 18 for children, 20 for top-level) */
  iconSize?: number
  /** Catalog permission key required to see this item */
  requiredPermission?: PermissionKey
  /** Feature flag key in `config.features` — item hidden when `false` */
  featureFlag?: keyof typeof config.features
}

/**
 * @description An expandable sidebar group containing child navigation links, with optional group-level permission guard.
 *   Group visibility is independent of child visibility — children re-check individually.
 */
export interface SidebarNavGroup {
  /** i18n key for the group header label */
  labelKey: string
  /** Lucide icon for the group header */
  icon: LucideIcon
  /** Catalog permission key required to see the entire group */
  requiredPermission?: PermissionKey
  /** Child links rendered inside the collapsible section */
  children: SidebarNavItem[]
}

/**
 * @description Union type representing either a standalone navigation link or an expandable group with children
 */
export type SidebarNavEntry = SidebarNavItem | SidebarNavGroup

// ============================================================================
// Type Guards
// ============================================================================

/**
 * @description Type guard that determines whether a navigation entry is an expandable group by checking for the children property
 * @param {SidebarNavEntry} entry - The navigation entry to check
 * @returns {boolean} True when the entry has children (is a group)
 */
export function isNavGroup(entry: SidebarNavEntry): entry is SidebarNavGroup {
  return 'children' in entry
}

// ============================================================================
// Navigation Configuration
// ============================================================================

/**
 * All sidebar navigation entries in display order.
 *
 * To add a new sidebar link:
 *  1. Add a `SidebarNavItem` entry (or add to an existing group's `children`)
 *  2. Add the route metadata in `routeConfig.ts`
 *  3. Add the `<Route>` element in `App.tsx`
 */
export const SIDEBAR_NAV: SidebarNavEntry[] = [
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


  // ── Data Studio ──────────────────────────────────────────────
  {
    labelKey: 'nav.dataStudio',
    icon: LayoutDashboard,
    // Group-level guard: most-permissive child (knowledge_base.view). Children re-check individually.
    requiredPermission: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW,
    children: [
      {
        path: '/data-studio/knowledge-base',
        labelKey: 'nav.knowledgeBase',
        icon: FolderOpen,
        requiredPermission: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW,
      },
      {
        path: '/data-studio/datasets',
        labelKey: 'nav.datasets',
        icon: Database,
        requiredPermission: PERMISSION_KEYS.DATASETS_VIEW,
      },
    ],
  },

  // ── Agent Studio ─────────────────────────────────────────────
  {
    labelKey: 'nav.agentStudio',
    icon: Workflow,
    requiredPermission: PERMISSION_KEYS.AGENTS_VIEW,
    children: [
      {
        path: '/agent-studio/chat-assistants',
        labelKey: 'nav.chatAssistants',
        icon: MessageSquare,
        requiredPermission: PERMISSION_KEYS.CHAT_VIEW,
      },
      {
        path: '/agent-studio/search-apps',
        labelKey: 'nav.searchApps',
        icon: Search,
        requiredPermission: PERMISSION_KEYS.SEARCH_APPS_VIEW,
      },
      {
        path: '/agent-studio/histories',
        labelKey: 'nav.histories',
        icon: History,
        requiredPermission: PERMISSION_KEYS.SYSTEM_HISTORY_VIEW,
      },
      {
        path: '/agent-studio/agents',
        labelKey: 'nav.agentList',
        icon: Workflow,
        iconSize: 18,
        requiredPermission: PERMISSION_KEYS.AGENTS_VIEW,
      },
      {
        path: '/agent-studio/memory',
        labelKey: 'nav.memory',
        icon: Brain,
        iconSize: 18,
        requiredPermission: PERMISSION_KEYS.MEMORY_VIEW,
      },
    ],
  },
  {
    path: '/glossary',
    labelKey: 'nav.glossary',
    icon: BookOpen,
    iconSize: 20,
    requiredPermission: PERMISSION_KEYS.GLOSSARY_VIEW,
  },
  // ── IAM ──────────────────────────────────────────────────────
  {
    labelKey: 'nav.iam',
    icon: UserCog,
    requiredPermission: PERMISSION_KEYS.USERS_VIEW,
    children: [
      {
        path: '/iam/users',
        labelKey: 'nav.userManagement',
        icon: UserIcon,
        requiredPermission: PERMISSION_KEYS.USERS_VIEW,
      },
      {
        path: '/iam/teams',
        labelKey: 'nav.teamManagement',
        icon: Users,
        requiredPermission: PERMISSION_KEYS.TEAMS_VIEW,
      },
      {
        path: '/iam/permissions',
        labelKey: 'nav.permissionManagement',
        icon: ShieldCheck,
        requiredPermission: PERMISSION_KEYS.PERMISSIONS_MANAGE,
      },
      {
        path: '/iam/effective-access',
        labelKey: 'nav.effectiveAccess',
        icon: Search,
        requiredPermission: PERMISSION_KEYS.PERMISSIONS_VIEW,
      },
    ],
  },

  // ── System ───────────────────────────────────────────────────
  {
    labelKey: 'nav.system',
    icon: Shield,
    requiredPermission: PERMISSION_KEYS.SYSTEM_VIEW,
    children: [
      {
        path: '/system/dashboard',
        labelKey: 'nav.dashboard',
        icon: BarChart3,
        requiredPermission: PERMISSION_KEYS.DASHBOARD_VIEW,
      },
      {
        path: '/system/audit-log',
        labelKey: 'nav.auditLog',
        icon: ClipboardList,
        requiredPermission: PERMISSION_KEYS.AUDIT_VIEW,
      },
      {
        path: '/system/system-tools',
        labelKey: 'nav.systemTools',
        icon: Server,
        requiredPermission: PERMISSION_KEYS.SYSTEM_TOOLS_VIEW,
      },
      {
        path: '/system/system-monitor',
        labelKey: 'nav.systemMonitor',
        icon: Activity,
        // No dedicated monitor key — generic system.view is correct gate.
        requiredPermission: PERMISSION_KEYS.SYSTEM_VIEW,
      },
      {
        path: '/system/tokenizer',
        labelKey: 'nav.tokenizer',
        icon: FileCode,
        // No dedicated tokenizer key — generic system.view is correct gate.
        requiredPermission: PERMISSION_KEYS.SYSTEM_VIEW,
      },
      {
        path: '/system/broadcast-messages',
        labelKey: 'nav.broadcastMessages',
        icon: Megaphone,
        requiredPermission: PERMISSION_KEYS.BROADCAST_VIEW,
      },
      {
        path: '/system/llm-providers',
        labelKey: 'nav.llmProviders',
        icon: BrainCircuit,
        requiredPermission: PERMISSION_KEYS.LLM_PROVIDERS_VIEW,
      },
    ],
  },
]

// ============================================================================
// Permission Resolution Helper
// ============================================================================

/**
 * Flat map of route path → required permission key, built once from SIDEBAR_NAV.
 * Child items inherit the parent group's requirement when they don't define their own.
 */
const ROUTE_PERMISSION_MAP: Record<string, PermissionKey> = {}

// Build the map at module load time
for (const entry of SIDEBAR_NAV) {
  if (isNavGroup(entry)) {
    const groupPerm = entry.requiredPermission
    for (const child of entry.children) {
      // Child-level permission takes precedence; fall back to group-level.
      const effective = child.requiredPermission ?? groupPerm
      if (effective) {
        ROUTE_PERMISSION_MAP[child.path] = effective
      }
    }
  } else if (entry.requiredPermission) {
    ROUTE_PERMISSION_MAP[entry.path] = entry.requiredPermission
  }
}

/**
 * @description Resolve the required permission key for a given pathname from the nav config.
 *   Uses exact match first, then longest-prefix match for detail pages
 *   (e.g. `/data-studio/datasets/abc` matches `/data-studio/datasets`).
 * @param {string} pathname - The current URL pathname
 * @returns {PermissionKey | undefined} Required permission key, or undefined if no restriction
 */
export function getRoutePermission(pathname: string): PermissionKey | undefined {
  // Exact match
  if (ROUTE_PERMISSION_MAP[pathname]) {
    return ROUTE_PERMISSION_MAP[pathname]
  }

  // Prefix match — find the longest matching path
  let bestMatch: string | undefined
  let bestLength = 0
  for (const path of Object.keys(ROUTE_PERMISSION_MAP)) {
    if (pathname.startsWith(path + '/') && path.length > bestLength) {
      bestMatch = path
      bestLength = path.length
    }
  }
  return bestMatch ? ROUTE_PERMISSION_MAP[bestMatch] : undefined
}
