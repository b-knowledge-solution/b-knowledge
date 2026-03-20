/**
 * @fileoverview Tests for chat Zod validation schemas (enhanced).
 *
 * Covers renameConversationSchema, chatCompletionSchema,
 * createAssistantSchema, and all conversation-related schemas.
 */

import { describe, expect, it } from 'vitest'
import {
  createConversationSchema,
  deleteConversationsSchema,
  chatCompletionSchema,
  feedbackSchema,
  deleteMessageParamsSchema,
  conversationIdParamSchema,
  renameConversationSchema,
  ttsSchema,
} from '../../src/modules/chat/schemas/chat-conversation.schemas'
import {
  createAssistantSchema,
  updateAssistantSchema,
  assistantAccessSchema,
  assistantIdParamSchema,
} from '../../src/modules/chat/schemas/chat-assistant.schemas'

const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const VALID_UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'

// ---------------------------------------------------------------------------
// renameConversationSchema
// ---------------------------------------------------------------------------

describe('renameConversationSchema', () => {
  it('accepts a valid name', () => {
    const result = renameConversationSchema.safeParse({ name: 'My Chat' })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = renameConversationSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing name', () => {
    const result = renameConversationSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects name exceeding 256 characters', () => {
    const result = renameConversationSchema.safeParse({ name: 'x'.repeat(257) })
    expect(result.success).toBe(false)
  })

  it('accepts name at exactly 256 characters', () => {
    const result = renameConversationSchema.safeParse({ name: 'x'.repeat(256) })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// chatCompletionSchema
// ---------------------------------------------------------------------------

describe('chatCompletionSchema', () => {
  it('accepts valid content without dialog_id', () => {
    const result = chatCompletionSchema.safeParse({ content: 'Hello AI' })
    expect(result.success).toBe(true)
  })

  it('accepts valid content with dialog_id', () => {
    const result = chatCompletionSchema.safeParse({
      content: 'Hello AI',
      dialog_id: VALID_UUID,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty content', () => {
    const result = chatCompletionSchema.safeParse({ content: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing content', () => {
    const result = chatCompletionSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects invalid dialog_id format', () => {
    const result = chatCompletionSchema.safeParse({
      content: 'Hello',
      dialog_id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createAssistantSchema
// ---------------------------------------------------------------------------

describe('createAssistantSchema', () => {
  it('accepts all required and optional fields', () => {
    const result = createAssistantSchema.safeParse({
      name: 'Sales Bot',
      description: 'A sales assistant',
      icon: 'bot-icon',
      kb_ids: [VALID_UUID],
      llm_id: 'gpt-4',
      prompt_config: { system: 'You are helpful' },
      is_public: true,
    })
    expect(result.success).toBe(true)
  })

  it('accepts minimal required fields', () => {
    const result = createAssistantSchema.safeParse({
      name: 'Bot',
      kb_ids: [VALID_UUID],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = createAssistantSchema.safeParse({
      name: '',
      kb_ids: [VALID_UUID],
    })
    expect(result.success).toBe(false)
  })

  it('rejects name exceeding 128 characters', () => {
    const result = createAssistantSchema.safeParse({
      name: 'x'.repeat(129),
      kb_ids: [VALID_UUID],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty kb_ids array', () => {
    const result = createAssistantSchema.safeParse({
      name: 'Bot',
      kb_ids: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing kb_ids', () => {
    const result = createAssistantSchema.safeParse({ name: 'Bot' })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID in kb_ids', () => {
    const result = createAssistantSchema.safeParse({
      name: 'Bot',
      kb_ids: ['not-a-uuid'],
    })
    expect(result.success).toBe(false)
  })

  it('accepts multiple valid UUIDs in kb_ids', () => {
    const result = createAssistantSchema.safeParse({
      name: 'Multi KB Bot',
      kb_ids: [VALID_UUID, VALID_UUID_2],
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// updateAssistantSchema
// ---------------------------------------------------------------------------

describe('updateAssistantSchema', () => {
  it('accepts partial updates', () => {
    const result = updateAssistantSchema.safeParse({ name: 'Updated Name' })
    expect(result.success).toBe(true)
  })

  it('accepts empty object (no updates)', () => {
    const result = updateAssistantSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts is_public toggle', () => {
    const result = updateAssistantSchema.safeParse({ is_public: true })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// createConversationSchema
// ---------------------------------------------------------------------------

describe('createConversationSchema', () => {
  it('accepts valid name and dialog_id', () => {
    const result = createConversationSchema.safeParse({
      name: 'My Conversation',
      dialog_id: VALID_UUID,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = createConversationSchema.safeParse({
      name: '',
      dialog_id: VALID_UUID,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid dialog_id', () => {
    const result = createConversationSchema.safeParse({
      name: 'Chat',
      dialog_id: 'bad-id',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing dialog_id', () => {
    const result = createConversationSchema.safeParse({ name: 'Chat' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// deleteConversationsSchema
// ---------------------------------------------------------------------------

describe('deleteConversationsSchema', () => {
  it('accepts array of valid UUIDs', () => {
    const result = deleteConversationsSchema.safeParse({
      ids: [VALID_UUID, VALID_UUID_2],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty ids array', () => {
    const result = deleteConversationsSchema.safeParse({ ids: [] })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// feedbackSchema
// ---------------------------------------------------------------------------

describe('feedbackSchema', () => {
  it('accepts thumbup with optional feedback', () => {
    const result = feedbackSchema.safeParse({
      message_id: 'msg-123',
      thumbup: true,
      feedback: 'Great answer!',
    })
    expect(result.success).toBe(true)
  })

  it('accepts thumbdown without feedback', () => {
    const result = feedbackSchema.safeParse({
      message_id: 'msg-123',
      thumbup: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing message_id', () => {
    const result = feedbackSchema.safeParse({ thumbup: true })
    expect(result.success).toBe(false)
  })

  it('rejects missing thumbup', () => {
    const result = feedbackSchema.safeParse({ message_id: 'msg-1' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// deleteMessageParamsSchema
// ---------------------------------------------------------------------------

describe('deleteMessageParamsSchema', () => {
  it('accepts valid conversation and message IDs', () => {
    const result = deleteMessageParamsSchema.safeParse({
      id: VALID_UUID,
      msgId: 'msg-abc',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid conversation ID', () => {
    const result = deleteMessageParamsSchema.safeParse({
      id: 'bad-id',
      msgId: 'msg-1',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing msgId', () => {
    const result = deleteMessageParamsSchema.safeParse({ id: VALID_UUID })
    expect(result.success).toBe(false)
  })

  it('rejects empty msgId', () => {
    const result = deleteMessageParamsSchema.safeParse({
      id: VALID_UUID,
      msgId: '',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// assistantAccessSchema
// ---------------------------------------------------------------------------

describe('assistantAccessSchema', () => {
  it('accepts user and team entries', () => {
    const result = assistantAccessSchema.safeParse({
      entries: [
        { entity_type: 'user', entity_id: VALID_UUID },
        { entity_type: 'team', entity_id: VALID_UUID_2 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty entries array', () => {
    const result = assistantAccessSchema.safeParse({ entries: [] })
    expect(result.success).toBe(true)
  })

  it('rejects invalid entity_type', () => {
    const result = assistantAccessSchema.safeParse({
      entries: [{ entity_type: 'group', entity_id: VALID_UUID }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid entity_id', () => {
    const result = assistantAccessSchema.safeParse({
      entries: [{ entity_type: 'user', entity_id: 'not-uuid' }],
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ttsSchema
// ---------------------------------------------------------------------------

describe('ttsSchema', () => {
  it('accepts valid text with defaults', () => {
    const result = ttsSchema.safeParse({ text: 'Hello world' })
    expect(result.success).toBe(true)
  })

  it('accepts all optional fields', () => {
    const result = ttsSchema.safeParse({
      text: 'Hello',
      voice: 'alloy',
      speed: 1.5,
      format: 'mp3',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty text', () => {
    const result = ttsSchema.safeParse({ text: '' })
    expect(result.success).toBe(false)
  })

  it('rejects text exceeding 5000 chars', () => {
    const result = ttsSchema.safeParse({ text: 'x'.repeat(5001) })
    expect(result.success).toBe(false)
  })

  it('rejects speed below 0.25', () => {
    const result = ttsSchema.safeParse({ text: 'Hello', speed: 0.1 })
    expect(result.success).toBe(false)
  })

  it('rejects speed above 4.0', () => {
    const result = ttsSchema.safeParse({ text: 'Hello', speed: 5.0 })
    expect(result.success).toBe(false)
  })

  it('rejects invalid format', () => {
    const result = ttsSchema.safeParse({ text: 'Hello', format: 'wma' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// conversationIdParamSchema / assistantIdParamSchema
// ---------------------------------------------------------------------------

describe('UUID param schemas', () => {
  it('conversationIdParamSchema accepts valid UUID', () => {
    const result = conversationIdParamSchema.safeParse({ id: VALID_UUID })
    expect(result.success).toBe(true)
  })

  it('conversationIdParamSchema rejects invalid UUID', () => {
    const result = conversationIdParamSchema.safeParse({ id: 'bad' })
    expect(result.success).toBe(false)
  })

  it('assistantIdParamSchema accepts valid UUID', () => {
    const result = assistantIdParamSchema.safeParse({ id: VALID_UUID })
    expect(result.success).toBe(true)
  })

  it('assistantIdParamSchema rejects invalid UUID', () => {
    const result = assistantIdParamSchema.safeParse({ id: 'bad' })
    expect(result.success).toBe(false)
  })
})
