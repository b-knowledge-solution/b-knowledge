/**
 * @fileoverview Declarative sidebar navigation configuration.
 *
 * Defines all sidebar items (links and expandable groups) as data.
 * Each item specifies its route, label key, icon, and optional
 * role / feature-flag guards.
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
  FolderOpen,
  LayoutDashboard,
  BrainCircuit,
  Workflow,
  Brain,
} from 'lucide-react'
import type { config } from '@/config'

// ============================================================================
// Types
// ============================================================================

/**
 * @description A single sidebar navigation link (leaf item) with route, label, icon, and optional access guards
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
  /** Restrict to specific user roles */
  roles?: string[]
  /** Feature flag key in `config.features` — item hidden when `false` */
  featureFlag?: keyof typeof config.features
}

/**
 * @description An expandable sidebar group containing child navigation links with optional role-based access control
 */
export interface SidebarNavGroup {
  /** i18n key for the group header label */
  labelKey: string
  /** Lucide icon for the group header */
  icon: LucideIcon
  /** Restrict entire group to specific user roles */
  roles?: string[]
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


  // ── Data Studio (super-admin / admin / leader) ─────────────────
  {
    labelKey: 'nav.dataStudio',
    icon: LayoutDashboard,
    roles: ['super-admin', 'admin', 'leader'],
    children: [
      {
        path: '/data-studio/projects',
        labelKey: 'nav.projects',
        icon: FolderOpen,
      },
      {
        path: '/data-studio/datasets',
        labelKey: 'nav.datasets',
        icon: Database,
      },
      {
        path: '/data-studio/llm-providers',
        labelKey: 'nav.llmProviders',
        icon: BrainCircuit,
        roles: ['super-admin', 'admin'],
      },
    ],
  },

  // ── Agent Studio (Agents, Memory, Chat Assistants, Search Apps, Histories) ──
  {
    labelKey: 'nav.agentStudio',
    icon: Workflow,
    roles: ['super-admin', 'admin'],
    children: [
      {
        path: '/agent-studio/chat-assistants',
        labelKey: 'nav.chatAssistants',
        icon: MessageSquare,
        roles: ['super-admin', 'admin'],
      },
      {
        path: '/agent-studio/search-apps',
        labelKey: 'nav.searchApps',
        icon: Search,
        roles: ['super-admin', 'admin'],
      },
      {
        path: '/agent-studio/histories',
        labelKey: 'nav.histories',
        icon: History,
        roles: ['super-admin', 'admin'],
      },
      { path: '/agent-studio/agents', labelKey: 'nav.agentList', icon: Workflow, iconSize: 18 },
      { path: '/agent-studio/memory', labelKey: 'nav.memory', icon: Brain, iconSize: 18 },

    ],
  },
  {
    path: '/glossary',
    labelKey: 'nav.glossary',
    icon: BookOpen,
    iconSize: 20,
    roles: ['super-admin', 'admin'],
  },
  // ── IAM (super-admin / admin) ───────────────────────────────────
  {
    labelKey: 'nav.iam',
    icon: UserCog,
    roles: ['super-admin', 'admin'],
    children: [
      {
        path: '/iam/users',
        labelKey: 'nav.userManagement',
        icon: UserIcon,
      },
      {
        path: '/iam/teams',
        labelKey: 'nav.teamManagement',
        icon: Users,
      },
    ],
  },

  // ── Administration (super-admin / admin) ────────────────────────
  {
    labelKey: 'nav.administrators',
    icon: Shield,
    roles: ['super-admin', 'admin'],
    children: [
      {
        path: '/admin/dashboard',
        labelKey: 'nav.dashboard',
        icon: BarChart3,
      },
      {
        path: '/admin/audit-log',
        labelKey: 'nav.auditLog',
        icon: ClipboardList,
      },
      {
        path: '/admin/system-tools',
        labelKey: 'nav.systemTools',
        icon: Server,
      },
      {
        path: '/admin/system-monitor',
        labelKey: 'nav.systemMonitor',
        icon: Activity,
      },
      {
        path: '/admin/tokenizer',
        labelKey: 'nav.tokenizer',
        icon: FileCode,
      },
      {
        path: '/admin/broadcast-messages',
        labelKey: 'nav.broadcastMessages',
        icon: Megaphone,
      },
    ],
  },
]

// ============================================================================
// Role Resolution Helper
// ============================================================================

/**
 * Flat map of route path → effective roles[], built once from SIDEBAR_NAV.
 * Child items inherit the parent group's roles when they don't define their own.
 */
const ROUTE_ROLES_MAP: Record<string, string[]> = {}

// Build the map at module load time
for (const entry of SIDEBAR_NAV) {
  if (isNavGroup(entry)) {
    const groupRoles = entry.roles || []
    for (const child of entry.children) {
      // Child-level roles take precedence; fall back to group-level roles
      const effectiveRoles = child.roles?.length ? child.roles : groupRoles
      if (effectiveRoles.length) {
        ROUTE_ROLES_MAP[child.path] = effectiveRoles
      }
    }
  } else if (entry.roles?.length) {
    ROUTE_ROLES_MAP[entry.path] = entry.roles
  }
}

/**
 * @description Resolve the allowed roles for a given pathname from the nav config.
 *   Uses exact match first, then longest-prefix match for detail pages
 *   (e.g. `/data-studio/datasets/abc` matches `/data-studio/datasets`).
 * @param {string} pathname - The current URL pathname
 * @returns {string[] | undefined} Allowed roles array, or undefined if no restriction
 */
export function getRouteRoles(pathname: string): string[] | undefined {
  // Exact match
  if (ROUTE_ROLES_MAP[pathname]) {
    return ROUTE_ROLES_MAP[pathname]
  }

  // Prefix match — find the longest matching path
  let bestMatch: string | undefined
  let bestLength = 0
  for (const path of Object.keys(ROUTE_ROLES_MAP)) {
    if (pathname.startsWith(path + '/') && path.length > bestLength) {
      bestMatch = path
      bestLength = path.length
    }
  }
  return bestMatch ? ROUTE_ROLES_MAP[bestMatch] : undefined
}
