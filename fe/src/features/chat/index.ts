/**
 * @fileoverview Barrel export for the chat feature module.
 * @module features/chat
 */

export { default as ChatPage } from './pages/ChatPage'
export { default as ChatInput } from './components/ChatInput'
export type { ChatInputHandle } from './components/ChatInput'
export { default as ChatAssistantConfig } from './components/ChatAssistantConfig'
export { default as ChatAssistantAccessDialog } from './components/ChatAssistantAccessDialog'
export { default as ChatVariableForm } from './components/ChatVariableForm'
export { chatApi } from './api/chatApi'
export { useChatAssistants, useChatAssistantsAdmin, useChatConversations, useRenameConversation } from './api/chatQueries'
export { useChatStream } from './hooks/useChatStream'
export type {
  ChatMessage,
  ChatAssistant,
  CreateAssistantPayload,
  Conversation,
  PromptVariable,
  PromptConfig,
  SendMessageOptions,
  SendMessagePayload,
} from './types/chat.types'

