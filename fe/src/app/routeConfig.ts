/**
 * @fileoverview Route configuration and metadata.
 *
 * Centralizes route paths, page titles, guideline feature IDs,
 * and layout behavior. Every new route should be added here instead
 * of scattering switch/if-blocks across Layout / App components.
 *
 * @module app/routeConfig
 */

// ============================================================================
// Types
// ============================================================================

/**
 * @description Metadata associated with a route, controlling header display, help buttons, and layout behavior
 */
export interface RouteMetadata {
  /** i18n key for the page title shown in the header */
  titleKey: string;
  /** Guideline feature ID for the help button (empty = no help button) */
  guidelineFeatureId?: string;
  /** If true, the header bar is hidden for this route */
  hideHeader?: boolean;
  /** If true, the content area gets no padding and allows overflow */
  fullBleed?: boolean;
}

// ============================================================================
// Route Map
// ============================================================================

/**
 * Map of route paths to their metadata.
 *
 * When adding a new page:
 *  1. Add a lazy import in App.tsx
 *  2. Add the <Route> element
 *  3. Add an entry here
 *
 * For dynamic routes (e.g. `/datasets/:id`), use the `matchRoute()` helper.
 */
export const ROUTE_CONFIG: Record<string, RouteMetadata> = {
  '/agent-studio/agents': {
    titleKey: 'agents.pageTitle',
    fullBleed: true,
  },
  '/agent-studio/agents/:id': {
    titleKey: 'agents.canvasTitle',
    fullBleed: true,
    hideHeader: true,
  },
  '/agent-studio/memory': {
    titleKey: 'memory.title',
    fullBleed: true,
  },
  '/agent-studio/memory/:id': {
    titleKey: 'memory.detail',
    fullBleed: true,
  },
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
  '/glossary': {
    titleKey: 'glossary.title',
  },
  '/data-studio/datasets': {
    titleKey: 'datasets.title',
    fullBleed: true,
  },
  '/data-studio/knowledge-base': {
    titleKey: 'knowledgeBase.title',
    guidelineFeatureId: 'knowledge-base',
    fullBleed: true,
  },
  '/iam/users': {
    titleKey: 'userManagement.title',
    guidelineFeatureId: 'users',
  },
  '/iam/users/:id': {
    titleKey: 'users.detail.title',
  },
  '/iam/teams': {
    titleKey: 'iam.teams.title',
    guidelineFeatureId: 'teams',
    fullBleed: true,
  },
  '/iam/permissions': {
    titleKey: 'permissions.admin.matrix.title',
    guidelineFeatureId: 'permissions',
  },
  '/agent-studio/chat-assistants': {
    titleKey: 'chatAdmin.title',
    fullBleed: true,
  },
  '/agent-studio/search-apps': {
    titleKey: 'searchAdmin.title',
    fullBleed: true,
  },
  '/system/dashboard': {
    titleKey: 'dashboard.title',
  },
  '/system/audit-log': {
    titleKey: 'pages.auditLog.title',
    guidelineFeatureId: 'audit',
  },
  '/system/system-tools': {
    titleKey: 'pages.systemMonitor.title',
    hideHeader: true,
    fullBleed: true,
  },
  '/system/system-monitor': {
    titleKey: 'pages.systemMonitor.title',
    hideHeader: true,
    fullBleed: true,
  },
  '/system/tokenizer': {
    titleKey: 'pages.tokenizer.title',
    hideHeader: true,
    fullBleed: true,
  },
  '/system/broadcast-messages': {
    titleKey: 'system.broadcastMessages',
    guidelineFeatureId: 'broadcast',
  },
  '/agent-studio/histories': {
    titleKey: 'histories.title',
    guidelineFeatureId: 'global-histories',
    fullBleed: true,
  },
  '/system/llm-providers': {
    titleKey: 'llmProviders.title',
    fullBleed: true,
  },
'/data-studio/datasets/:id/settings': {
    titleKey: 'datasetSettings.title',
    fullBleed: true,
  },
  '/data-studio/datasets/:id/chunks': {
    titleKey: 'datasetSettings.chunks.title',
    fullBleed: true,
  },
  '/data-studio/datasets/:id/documents/:docId/chunks': {
    titleKey: 'datasets.chunkDetail',
    fullBleed: true,
  },
  '/search/share/:token': {
    titleKey: 'pages.aiSearch.title',
    fullBleed: true,
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Resolves route metadata for a given pathname, supporting exact and prefix matching for dynamic routes
 * @param {string} pathname - The current URL pathname to look up
 * @returns {RouteMetadata} Route metadata for the matched route, or a default fallback
 */
export function getRouteMetadata(pathname: string): RouteMetadata {
  // Exact match
  if (ROUTE_CONFIG[pathname]) {
    return ROUTE_CONFIG[pathname]!;
  }

  // Dynamic route prefix match — more specific paths checked first
  if (pathname.match(/^\/data-studio\/datasets\/[^/]+\/documents\/[^/]+\/chunks$/)) {
    return ROUTE_CONFIG['/data-studio/datasets/:id/documents/:docId/chunks']!;
  }
  // Match agent canvas route with dynamic ID
  if (pathname.startsWith('/agent-studio/agents/')) {
    return ROUTE_CONFIG['/agent-studio/agents/:id']!;
  }
  // Match memory detail route with dynamic ID
  if (pathname.startsWith('/agent-studio/memory/')) {
    return ROUTE_CONFIG['/agent-studio/memory/:id']!;
  }
  if (pathname.startsWith('/search/share/')) {
    return ROUTE_CONFIG['/search/share/:token']!;
  }
  if (pathname.startsWith('/search/apps/')) {
    return ROUTE_CONFIG['/search/apps/:appId']!;
  }
  if (pathname.startsWith('/data-studio/datasets/')) {
    return ROUTE_CONFIG['/data-studio/datasets']!;
  }
  if (pathname.startsWith('/data-studio/knowledge-base/')) {
    return ROUTE_CONFIG['/data-studio/knowledge-base']!;
  }

  // Default fallback
  return {
    titleKey: 'common.appName',
  };
}
