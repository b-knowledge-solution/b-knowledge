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
} from 'lucide-react'
import type { config } from '@/config'

// ============================================================================
// Types
// ============================================================================

/** A single sidebar link (leaf item). */
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

/** An expandable group containing child links. */
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

/** A nav entry is either a standalone link or an expandable group. */
export type SidebarNavEntry = SidebarNavItem | SidebarNavGroup

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Determines whether an entry is an expandable group.
 *
 * @param entry - The navigation entry to check
 * @returns `true` when the entry has `children` (is a group)
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
  // ── Top-level links ────────────────────────────────────────────
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

  // ── Knowledge Base (admin / leader) ────────────────────────────
  {
    labelKey: 'nav.knowledgeBase',
    icon: BookOpen,
    roles: ['admin', 'leader'],
    children: [
      {
        path: '/knowledge-base/glossary',
        labelKey: 'nav.glossary',
        icon: BookOpen,
      },
    ],
  },

  // ── Data Studio (admin / leader) ───────────────────────────────
  {
    labelKey: 'nav.dataStudio',
    icon: LayoutDashboard,
    roles: ['admin', 'leader'],
    children: [
      {
        path: '/datasets',
        labelKey: 'nav.datasets',
        icon: Database,
      },
      {
        path: '/knowledge-base/projects',
        labelKey: 'nav.projects',
        icon: FolderOpen,
      },
      {
        path: '/admin/chat-dialogs',
        labelKey: 'nav.chatAssistants',
        icon: MessageSquare,
        roles: ['admin'],
      },
      {
        path: '/admin/search-apps',
        labelKey: 'nav.searchApps',
        icon: Search,
        roles: ['admin'],
      },
    ],
  },

  // ── IAM (admin) ────────────────────────────────────────────────
  {
    labelKey: 'nav.iam',
    icon: UserCog,
    roles: ['admin'],
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

  // ── Administration (admin) ─────────────────────────────────────
  {
    labelKey: 'nav.administrators',
    icon: Shield,
    roles: ['admin'],
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
      {
        path: '/admin/histories',
        labelKey: 'nav.histories',
        icon: History,
      },
      {
        path: '/admin/llm-providers',
        labelKey: 'nav.llmProviders',
        icon: BrainCircuit,
      },
    ],
  },
]
