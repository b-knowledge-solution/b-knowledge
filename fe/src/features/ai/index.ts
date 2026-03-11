/**
 * @fileoverview Barrel file for the AI feature.
 * Exports pages, types, and components for external consumption.
 * @module features/ai
 */

// Pages
export { default as AiChatPage } from './pages/AiChatPage'
export { default as AiSearchPage } from './pages/AiSearchPage'
export { default as DatasetChatPage } from './pages/DatasetChatPage'
export { default as DatasetSearchPage } from './pages/DatasetSearchPage'
export { default as TokenizerPage } from './pages/TokenizerPage'
export { default as ChatDialogManagementPage } from './pages/ChatDialogManagementPage'
export { default as SearchAppManagementPage } from './pages/SearchAppManagementPage'

// Components
export { default as RagflowIframe } from './components/RagflowIframe'
export { default as ChatMessage } from './components/ChatMessage'
export { default as ChatInput } from './components/ChatInput'
export { default as ChatMessageList } from './components/ChatMessageList'
export { default as ChatSidebar } from './components/ChatSidebar'
export { default as ChatReferencePanel } from './components/ChatReferencePanel'
export { default as ChatDialogConfig } from './components/ChatDialogConfig'
export { default as SearchBar } from './components/SearchBar'
export { default as SearchResults } from './components/SearchResults'
export { default as SearchResultCard } from './components/SearchResultCard'
export { default as SearchFilters } from './components/SearchFilters'
export { default as ChatDialogAccessDialog } from './components/ChatDialogAccessDialog'
export { default as SearchAppAccessDialog } from './components/SearchAppAccessDialog'
export { default as SearchAppConfig } from './components/SearchAppConfig'

// Hooks
export { useChatStream } from './hooks/useChatStream'
export { useChatConversations } from './hooks/useChatConversations'
export { useChatDialogs } from './hooks/useChatDialogs'
export { useSearch } from './hooks/useSearch'

// Types
export type { RagflowIframeProps, IframeError } from './types/ai.types'
export type {
  ChatMessage as ChatMessageType,
  ChatReference,
  ChatChunk,
  DocAggregate,
  Conversation,
  ChatDialog,
  PromptConfig,
  CreateDialogPayload,
  CreateConversationPayload,
  SendMessagePayload,
  ChatDialogAccessEntry,
} from './types/chat.types'
export type {
  SearchResult,
  SearchFilters as SearchFiltersType,
  SearchResponse,
  SearchApp,
  SearchAppAccessEntry,
  CreateSearchAppPayload,
} from './types/search.types'
