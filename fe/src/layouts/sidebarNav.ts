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
  Sparkles,
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

  // ── AI Management (super-admin / admin) ─────────────────────────
  {
    labelKey: 'nav.aiManagement',
    icon: Sparkles,
    roles: ['super-admin', 'admin'],
    children: [
      {
        path: '/ai/chat-assistants',
        labelKey: 'nav.chatAssistants',
        icon: MessageSquare,
      },
      {
        path: '/ai/search-apps',
        labelKey: 'nav.searchApps',
        icon: Search,
      },
      {
        path: '/ai/histories',
        labelKey: 'nav.histories',
        icon: History,
      },
    ],
  },

  // ── Agent Studio (with Agent List & Memory children) ────────────
  {
    labelKey: 'nav.agentStudio',
    icon: Workflow,
    children: [
      { path: '/agent-studio/agents', labelKey: 'nav.agentList', icon: Workflow, iconSize: 18 },
      { path: '/agent-studio/memory', labelKey: 'nav.memory', icon: Brain, iconSize: 18 },
    ],
  },
  {
    path: '/glossary',
    labelKey: 'nav.glossary',
    icon: BookOpen,
    iconSize: 20,
    roles: ['super-admin', 'admin', 'leader'],
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
