/**
 * @description Chat message role constants for rendering and filtering
 */

export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const

export type MessageRoleType = (typeof MessageRole)[keyof typeof MessageRole]
