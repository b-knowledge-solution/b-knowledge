/**
 * @fileoverview Route metadata registry for shell titles and layout behavior.
 *
 * Centralizes page titles, guideline feature ids, and layout flags so the
 * shell can resolve `/admin/...` and non-admin routes consistently.
 *
 * @module app/routeConfig
 */

import {
  ADMIN_AGENT_CANVAS_ROUTE,
  ADMIN_AGENTS_ROUTE,
  ADMIN_AUDIT_LOG_ROUTE,
  ADMIN_BROADCAST_MESSAGES_ROUTE,
  ADMIN_CHAT_ASSISTANTS_ROUTE,
  ADMIN_CODE_GRAPH_ROUTE,
  ADMIN_DASHBOARD_ROUTE,
  ADMIN_DATASETS_ROUTE,
  ADMIN_DATASET_CHUNK_DETAIL_ROUTE,
  ADMIN_EFFECTIVE_ACCESS_ROUTE,
  ADMIN_HISTORIES_ROUTE,
  ADMIN_KNOWLEDGE_BASE_ROUTE,
  ADMIN_LLM_PROVIDERS_ROUTE,
  ADMIN_MEMORY_DETAIL_ROUTE,
  ADMIN_MEMORY_ROUTE,
  ADMIN_PERMISSIONS_ROUTE,
  ADMIN_SEARCH_APPS_ROUTE,
  ADMIN_SYSTEM_MONITOR_ROUTE,
  ADMIN_SYSTEM_TOOLS_ROUTE,
  ADMIN_TEAMS_ROUTE,
  ADMIN_TOKENIZER_ROUTE,
  ADMIN_USERS_ROUTE,
  ADMIN_USER_DETAIL_ROUTE,
} from './adminRoutes'

/**
 * @description Metadata associated with a route, controlling header display, help buttons, and layout behavior
 */
export interface RouteMetadata {
  /** i18n key for the page title shown in the header */
  titleKey: string
  /** Guideline feature id for the help button */
  guidelineFeatureId?: string
  /** If true, the header bar is hidden for this route */
  hideHeader?: boolean
  /** If true, the content area gets no padding and allows overflow */
  fullBleed?: boolean
}

/**
 * @description Exact and pattern route metadata keyed by route contract
 */
export const ROUTE_CONFIG: Record<string, RouteMetadata> = {
  '/chat': {
    titleKey: 'pages.aiChat.title',
    guidelineFeatureId: 'ai-chat',
    fullBleed: true,
  },
  '/search': {
    titleKey: 'pages.aiSearch.title',
    guidelineFeatureId: 'ai-search',
    fullBleed: true,
  },
  '/search/apps/:appId': {
    titleKey: 'pages.aiSearch.title',
    guidelineFeatureId: 'ai-search',
    fullBleed: true,
  },
  [ADMIN_AGENTS_ROUTE]: {
    titleKey: 'agents.pageTitle',
    fullBleed: true,
  },
  [ADMIN_AGENT_CANVAS_ROUTE]: {
    titleKey: 'agents.canvasTitle',
    fullBleed: true,
    hideHeader: true,
  },
  [ADMIN_MEMORY_ROUTE]: {
    titleKey: 'memory.title',
    fullBleed: true,
  },
  [ADMIN_MEMORY_DETAIL_ROUTE]: {
    titleKey: 'memory.detail',
    fullBleed: true,
  },
  [ADMIN_KNOWLEDGE_BASE_ROUTE]: {
    titleKey: 'knowledgeBase.title',
    guidelineFeatureId: 'knowledge-base',
    fullBleed: true,
  },
  [ADMIN_DATASETS_ROUTE]: {
    titleKey: 'datasets.title',
    fullBleed: true,
  },
  [ADMIN_CODE_GRAPH_ROUTE]: {
    titleKey: 'knowledgeBase.title',
    guidelineFeatureId: 'knowledge-base',
    fullBleed: true,
  },
  [ADMIN_USERS_ROUTE]: {
    titleKey: 'userManagement.title',
    guidelineFeatureId: 'users',
  },
  [ADMIN_USER_DETAIL_ROUTE]: {
    titleKey: 'users.detail.title',
  },
  [ADMIN_TEAMS_ROUTE]: {
    titleKey: 'iam.teams.title',
    guidelineFeatureId: 'teams',
    fullBleed: true,
  },
  [ADMIN_PERMISSIONS_ROUTE]: {
    titleKey: 'permissions.admin.matrix.title',
    guidelineFeatureId: 'permissions',
  },
  [ADMIN_EFFECTIVE_ACCESS_ROUTE]: {
    titleKey: 'permissions.admin.effectiveAccess.title',
  },
  [ADMIN_CHAT_ASSISTANTS_ROUTE]: {
    titleKey: 'chatAdmin.title',
    fullBleed: true,
  },
  [ADMIN_SEARCH_APPS_ROUTE]: {
    titleKey: 'searchAdmin.title',
    fullBleed: true,
  },
  [ADMIN_DASHBOARD_ROUTE]: {
    titleKey: 'dashboard.title',
  },
  [ADMIN_AUDIT_LOG_ROUTE]: {
    titleKey: 'pages.auditLog.title',
    guidelineFeatureId: 'audit',
  },
  [ADMIN_SYSTEM_TOOLS_ROUTE]: {
    titleKey: 'pages.systemMonitor.title',
    hideHeader: true,
    fullBleed: true,
  },
  [ADMIN_SYSTEM_MONITOR_ROUTE]: {
    titleKey: 'pages.systemMonitor.title',
    hideHeader: true,
    fullBleed: true,
  },
  [ADMIN_TOKENIZER_ROUTE]: {
    titleKey: 'pages.tokenizer.title',
    hideHeader: true,
    fullBleed: true,
  },
  [ADMIN_BROADCAST_MESSAGES_ROUTE]: {
    titleKey: 'system.broadcastMessages',
    guidelineFeatureId: 'broadcast',
  },
  [ADMIN_HISTORIES_ROUTE]: {
    titleKey: 'histories.title',
    guidelineFeatureId: 'global-histories',
    fullBleed: true,
  },
  [ADMIN_LLM_PROVIDERS_ROUTE]: {
    titleKey: 'llmProviders.title',
    fullBleed: true,
  },
  [ADMIN_DATASET_CHUNK_DETAIL_ROUTE]: {
    titleKey: 'datasets.chunkDetail',
    fullBleed: true,
  },
  '/search/share/:token': {
    titleKey: 'pages.aiSearch.title',
    fullBleed: true,
  },
}

interface RouteMatcher {
  key: keyof typeof ROUTE_CONFIG
  test: RegExp
}

const ROUTE_MATCHERS: RouteMatcher[] = [
  {
    key: ADMIN_DATASET_CHUNK_DETAIL_ROUTE,
    test: /^\/admin\/data-studio\/datasets\/[^/]+\/documents\/[^/]+\/chunks$/,
  },
  {
    key: ADMIN_AGENT_CANVAS_ROUTE,
    test: /^\/admin\/agent-studio\/agents\/[^/]+$/,
  },
  {
    key: ADMIN_MEMORY_DETAIL_ROUTE,
    test: /^\/admin\/agent-studio\/memory\/[^/]+$/,
  },
  {
    key: ADMIN_CODE_GRAPH_ROUTE,
    test: /^\/admin\/code-graph\/[^/]+$/,
  },
  {
    key: '/search/apps/:appId',
    test: /^\/search\/apps\/[^/]+$/,
  },
  {
    key: '/search/share/:token',
    test: /^\/search\/share\/[^/]+$/,
  },
]

const ROUTE_PREFIX_MATCHES: Array<{
  key: keyof typeof ROUTE_CONFIG
  prefix: string
}> = [
  { key: ADMIN_DATASETS_ROUTE, prefix: `${ADMIN_DATASETS_ROUTE}/` },
  { key: ADMIN_KNOWLEDGE_BASE_ROUTE, prefix: `${ADMIN_KNOWLEDGE_BASE_ROUTE}/` },
  { key: ADMIN_AGENTS_ROUTE, prefix: `${ADMIN_AGENTS_ROUTE}/` },
  { key: ADMIN_MEMORY_ROUTE, prefix: `${ADMIN_MEMORY_ROUTE}/` },
  { key: ADMIN_USERS_ROUTE, prefix: `${ADMIN_USERS_ROUTE}/` },
]

/**
 * @description Resolves route metadata for a given pathname using exact, regex, and prefix matching
 * @param {string} pathname - Current URL pathname
 * @returns {RouteMetadata} Matched route metadata or the application fallback metadata
 */
export function getRouteMetadata(pathname: string): RouteMetadata {
  if (ROUTE_CONFIG[pathname]) {
    return ROUTE_CONFIG[pathname]
  }

  // Match dynamic routes whose contract includes parameters or hidden admin paths.
  for (const matcher of ROUTE_MATCHERS) {
    if (matcher.test.test(pathname)) {
      return ROUTE_CONFIG[matcher.key]!
    }
  }

  // Reuse list metadata for nested detail pages that stay within the same section.
  for (const prefixMatch of ROUTE_PREFIX_MATCHES) {
    if (pathname.startsWith(prefixMatch.prefix)) {
      return ROUTE_CONFIG[prefixMatch.key]!
    }
  }

  return {
    titleKey: 'common.appName',
  }
}
