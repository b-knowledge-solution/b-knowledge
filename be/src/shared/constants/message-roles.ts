/**
 * @description Chat message role constants for conversation handling
 */

export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const

export type MessageRoleType = (typeof MessageRole)[keyof typeof MessageRole]
