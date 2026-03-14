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
  '/data-studio/glossary': {
    titleKey: 'glossary.title',
  },
  '/datasets': {
    titleKey: 'datasets.title',
    fullBleed: true,
  },
  '/data-studio/projects': {
    titleKey: 'projectManagement.title',
    guidelineFeatureId: 'projects',
    fullBleed: true,
  },
  '/iam/users': {
    titleKey: 'userManagement.title',
    guidelineFeatureId: 'users',
  },
  '/iam/teams': {
    titleKey: 'iam.teams.title',
    guidelineFeatureId: 'teams',
    fullBleed: true,
  },
  '/admin/chat-dialogs': {
    titleKey: 'chatAdmin.title',
    fullBleed: true,
  },
  '/admin/search-apps': {
    titleKey: 'searchAdmin.title',
    fullBleed: true,
  },
  '/admin/dashboard': {
    titleKey: 'dashboard.title',
  },
  '/admin/audit-log': {
    titleKey: 'pages.auditLog.title',
    guidelineFeatureId: 'audit',
  },
  '/admin/system-tools': {
    titleKey: 'pages.systemMonitor.title',
    hideHeader: true,
    fullBleed: true,
  },
  '/admin/system-monitor': {
    titleKey: 'pages.systemMonitor.title',
    hideHeader: true,
    fullBleed: true,
  },
  '/admin/tokenizer': {
    titleKey: 'pages.tokenizer.title',
    hideHeader: true,
    fullBleed: true,
  },
  '/admin/broadcast-messages': {
    titleKey: 'admin.broadcastMessages',
    guidelineFeatureId: 'broadcast',
  },
  '/admin/histories': {
    titleKey: 'histories.title',
    guidelineFeatureId: 'global-histories',
    fullBleed: true,
  },
  '/admin/llm-providers': {
    titleKey: 'llmProviders.title',
    fullBleed: true,
  },
  '/datasets/:id/settings': {
    titleKey: 'datasetSettings.title',
    fullBleed: true,
  },
  '/datasets/:id/chunks': {
    titleKey: 'datasetSettings.chunks.title',
    fullBleed: true,
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve route metadata for the given pathname.
 *
 * Handles exact matches first, then falls back to prefix matching
 * for dynamic routes (e.g. `/datasets/some-id` → `/datasets`).
 */
export function getRouteMetadata(pathname: string): RouteMetadata {
  // Exact match
  if (ROUTE_CONFIG[pathname]) {
    return ROUTE_CONFIG[pathname]!;
  }

  // Dynamic route prefix match
  if (pathname.startsWith('/datasets/')) {
    return ROUTE_CONFIG['/datasets']!;
  }
  if (pathname.startsWith('/data-studio/projects/')) {
    return ROUTE_CONFIG['/data-studio/projects']!;
  }

  // Default fallback
  return {
    titleKey: 'common.appName',
  };
}
