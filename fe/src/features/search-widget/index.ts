/**
 * @fileoverview Barrel export for the search widget module.
 * Also provides IIFE initialization for external embedding.
 *
 * Usage (internal React component):
 *   import { SearchWidget } from '@/features/search-widget'
 *   <SearchWidget mode="internal" appId="..." />
 *
 * Usage (external IIFE script):
 *   <script src="https://your-domain/search-widget.iife.js"></script>
 *   <script>
 *     BKnowledgeSearch.init({
 *       token: 'your-embed-token',
 *       baseUrl: 'https://your-domain',
 *       el: '#search-widget',
 *       placeholder: 'Search our docs...',
 *     })
 *   </script>
 *
 * @module features/search-widget
 */

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { SearchWidget } from './SearchWidget'
import type { SearchWidgetProps } from './SearchWidget'

// ============================================================================
// React Component Exports
// ============================================================================

export { SearchWidget } from './SearchWidget'
export type { SearchWidgetProps } from './SearchWidget'
export { SearchWidgetBar } from './SearchWidgetBar'
export { SearchWidgetResults } from './SearchWidgetResults'
export { createSearchWidgetApi } from './searchWidgetApi'

// ============================================================================
// IIFE Init (for external embedding)
// ============================================================================

/**
 * Configuration for external IIFE initialization.
 */
interface SearchWidgetInitConfig {
  /** Embed token for authentication */
  token: string
  /** Base URL of the B-Knowledge API */
  baseUrl: string
  /** CSS selector or DOM element to mount the widget into */
  el: string | HTMLElement
  /** Optional placeholder text */
  placeholder?: string | undefined
}

/**
 * Initialize the search widget in a DOM container.
 * Used by external sites via the IIFE bundle.
 * @param config - Widget initialization configuration
 */
function init(config: SearchWidgetInitConfig): void {
  const container =
    typeof config.el === 'string'
      ? document.querySelector(config.el)
      : config.el

  if (!container) {
    console.error('[BKnowledgeSearch] Container element not found:', config.el)
    return
  }

  const root = createRoot(container)
  const props: SearchWidgetProps = {
    mode: 'external',
    token: config.token,
    baseUrl: config.baseUrl,
    placeholder: config.placeholder,
  }
  root.render(createElement(SearchWidget, props))
}

// Attach to window for IIFE bundle
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).BKnowledgeSearch = { init }
}
