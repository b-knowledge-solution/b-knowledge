/**
 * @fileoverview Barrel file for the Chat feature.
 * Exports pages, types, hooks, and components for external consumption.
 * @module features/chat
 */

// Pages
export { default as ChatPage } from './pages/ChatPage'
export { default as ChatDialogManagementPage } from './pages/ChatDialogManagementPage'

// Components
export { default as ChatMessage } from './components/ChatMessage'
export { default as ChatInput } from './components/ChatInput'
export { default as ChatMessageList } from './components/ChatMessageList'
export { default as ChatSidebar } from './components/ChatSidebar'
export { default as ChatReferencePanel } from './components/ChatReferencePanel'
export { default as ChatDialogConfig } from './components/ChatDialogConfig'
export { default as ChatDialogAccessDialog } from './components/ChatDialogAccessDialog'

// Hooks
export { useChatStream } from './hooks/useChatStream'
export { useChatConversations } from './hooks/useChatConversations'
export { useChatDialogs } from './hooks/useChatDialogs'

// Types
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
