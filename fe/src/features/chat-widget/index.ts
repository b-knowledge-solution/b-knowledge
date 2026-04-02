/**
 * @fileoverview Barrel export for the chat widget feature module.
 * Also provides IIFE initialization for external embedding via script tag.
 *
 * Internal usage (React import):
 * ```tsx
 * import { ChatWidget } from '@/features/chat-widget'
 * <ChatWidget mode="internal" dialogId="..." />
 * ```
 *
 * External usage (script tag):
 * ```html
 * <script src="/widget/bk-chat-widget.js"></script>
 * <script>
 *   BKnowledgeChat.init({
 *     token: 'your-embed-token',
 *     baseUrl: 'https://your-bk-instance.com',
 *     position: 'bottom-right',
 *     theme: 'auto',
 *   })
 * </script>
 * ```
 *
 * @module features/chat-widget
 */

export { default as ChatWidget } from './ChatWidget'
export { default as ChatWidgetButton } from './ChatWidgetButton'
export { default as ChatWidgetWindow } from './ChatWidgetWindow'
export { ChatWidgetApi } from './chatWidgetApi'
export type { WidgetDialogInfo, WidgetSession } from './chatWidgetApi'
export type { WidgetMessage } from './ChatWidgetWindow'

// ============================================================================
// IIFE Initialization for External Mode
// ============================================================================

/**
 * @description External widget configuration passed to BKnowledgeChat.init() for script-tag embedding.
 */
interface ExternalWidgetConfig {
  /** Embed token for API authentication */
  token: string
  /** API base URL of the B-Knowledge instance */
  baseUrl: string
  /** Widget position */
  position?: 'bottom-right' | 'bottom-left'
  /** Theme preference */
  theme?: 'light' | 'dark' | 'auto'
  /** Locale (reserved for future i18n support) */
  locale?: string
}

/**
 * @description Initialize the chat widget in external mode.
 * Creates a mount point in the DOM and renders the widget.
 * This function is exposed as `BKnowledgeChat.init()` in the IIFE bundle.
 *
 * @param {ExternalWidgetConfig} config - External widget configuration including token and baseUrl
 */
function init(config: ExternalWidgetConfig): void {
  // Dynamically import React and ReactDOM to support IIFE bundle
  // These will be bundled inline by the widget build config
  import('react').then((React) => {
    import('react-dom/client').then((ReactDOM) => {
      // Create mount point
      let container = document.getElementById('bk-chat-widget-root')
      if (!container) {
        container = document.createElement('div')
        container.id = 'bk-chat-widget-root'
        document.body.appendChild(container)
      }

      // Import and render the widget component
      import('./ChatWidget').then((module) => {
        const ChatWidgetComponent = module.default
        const root = ReactDOM.createRoot(container!)
        root.render(
          React.createElement(ChatWidgetComponent, {
            mode: 'external',
            token: config.token,
            baseUrl: config.baseUrl,
            position: config.position || 'bottom-right',
            theme: config.theme || 'auto',
          })
        )
      })
    })
  })
}

// Expose global init function for IIFE bundle
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).BKnowledgeChat = { init }
}
