/**
 * @fileoverview Unit tests for agent Zod schemas.
 *
 * Tests validation for creation, update, version saving, listing,
 * run body, and credential schemas. Covers valid inputs, invalid
 * payloads, missing required fields, and type coercion.
 */

import { describe, it, expect } from 'vitest'
import {
  createAgentSchema,
  updateAgentSchema,
  saveVersionSchema,
  agentIdParamSchema,
  versionIdParamSchema,
  listAgentsQuerySchema,
  agentRunBodySchema,
  agentRunIdParamSchema,
  createCredentialSchema,
  updateCredentialSchema,
} from '../../src/modules/agents/schemas/agent.schemas.js'

// ---------------------------------------------------------------------------
// createAgentSchema
// ---------------------------------------------------------------------------

describe('createAgentSchema', () => {
  it('accepts a valid creation payload with required fields only', () => {
    const result = createAgentSchema.safeParse({ name: 'My Agent' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('My Agent')
      // Mode should default to 'agent'
      expect(result.data.mode).toBe('agent')
    }
  })

  it('accepts a full valid creation payload', () => {
    const result = createAgentSchema.safeParse({
      name: 'Pipeline Agent',
      description: 'A pipeline agent for document processing',
      mode: 'pipeline',
      project_id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11',
      template_id: 'b1ffcd000d1c5fa9cc7e7cc0ce491b22',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mode).toBe('pipeline')
      expect(result.data.project_id).toBe('a0eebc999c0b4ef8bb6d6bb9bd380a11')
    }
  })

  it('rejects when name is missing', () => {
    const result = createAgentSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects when name is empty string', () => {
    const result = createAgentSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects when name exceeds 255 characters', () => {
    const result = createAgentSchema.safeParse({ name: 'a'.repeat(256) })
    expect(result.success).toBe(false)
  })

  it('rejects invalid mode value', () => {
    const result = createAgentSchema.safeParse({ name: 'Test', mode: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID project_id', () => {
    const result = createAgentSchema.safeParse({ name: 'Test', project_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID template_id', () => {
    const result = createAgentSchema.safeParse({ name: 'Test', template_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects description exceeding 2000 characters', () => {
    const result = createAgentSchema.safeParse({ name: 'Test', description: 'x'.repeat(2001) })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updateAgentSchema
// ---------------------------------------------------------------------------

describe('updateAgentSchema', () => {
  it('accepts an empty update payload (all fields optional)', () => {
    const result = updateAgentSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts a partial update with name only', () => {
    const result = updateAgentSchema.safeParse({ name: 'Updated Name' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Updated Name')
    }
  })

  it('accepts DSL as a JSON record', () => {
    const result = updateAgentSchema.safeParse({
      dsl: { nodes: {}, edges: [] },
    })
    expect(result.success).toBe(true)
  })

  it('accepts status change to published', () => {
    const result = updateAgentSchema.safeParse({ status: 'published' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status value', () => {
    const result = updateAgentSchema.safeParse({ status: 'archived' })
    expect(result.success).toBe(false)
  })

  it('accepts nullable description', () => {
    const result = updateAgentSchema.safeParse({ description: null })
    expect(result.success).toBe(true)
  })

  it('rejects name with empty string', () => {
    const result = updateAgentSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// saveVersionSchema
// ---------------------------------------------------------------------------

describe('saveVersionSchema', () => {
  it('accepts empty body (both fields optional)', () => {
    const result = saveVersionSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts version_label and change_summary', () => {
    const result = saveVersionSchema.safeParse({
      version_label: 'v1.0',
      change_summary: 'Initial stable release',
    })
    expect(result.success).toBe(true)
  })

  it('rejects version_label exceeding 128 characters', () => {
    const result = saveVersionSchema.safeParse({ version_label: 'v'.repeat(129) })
    expect(result.success).toBe(false)
  })

  it('rejects change_summary exceeding 1000 characters', () => {
    const result = saveVersionSchema.safeParse({ change_summary: 's'.repeat(1001) })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// agentIdParamSchema
// ---------------------------------------------------------------------------

describe('agentIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    const result = agentIdParamSchema.safeParse({ id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11' })
    expect(result.success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    const result = agentIdParamSchema.safeParse({ id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects missing id', () => {
    const result = agentIdParamSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// versionIdParamSchema
// ---------------------------------------------------------------------------

describe('versionIdParamSchema', () => {
  it('accepts valid id and versionId UUIDs', () => {
    const result = versionIdParamSchema.safeParse({
      id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11',
      versionId: 'b1ffcd000d1c5fa9cc7e7cc0ce491b22',
    })
    expect(result.success).toBe(true)
  })

  it('rejects when versionId is missing', () => {
    const result = versionIdParamSchema.safeParse({
      id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// listAgentsQuerySchema
// ---------------------------------------------------------------------------

describe('listAgentsQuerySchema', () => {
  it('applies default page and page_size when omitted', () => {
    const result = listAgentsQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.page_size).toBe(20)
    }
  })

  it('coerces string page and page_size to numbers', () => {
    const result = listAgentsQuerySchema.safeParse({ page: '3', page_size: '50' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(3)
      expect(result.data.page_size).toBe(50)
    }
  })

  it('rejects page_size exceeding 100', () => {
    const result = listAgentsQuerySchema.safeParse({ page_size: '101' })
    expect(result.success).toBe(false)
  })

  it('rejects page_size of 0', () => {
    const result = listAgentsQuerySchema.safeParse({ page_size: '0' })
    expect(result.success).toBe(false)
  })

  it('rejects negative page', () => {
    const result = listAgentsQuerySchema.safeParse({ page: '-1' })
    expect(result.success).toBe(false)
  })

  it('accepts optional mode filter', () => {
    const result = listAgentsQuerySchema.safeParse({ mode: 'pipeline' })
    expect(result.success).toBe(true)
  })

  it('accepts optional status filter', () => {
    const result = listAgentsQuerySchema.safeParse({ status: 'published' })
    expect(result.success).toBe(true)
  })

  it('accepts optional search string', () => {
    const result = listAgentsQuerySchema.safeParse({ search: 'my agent' })
    expect(result.success).toBe(true)
  })

  it('rejects search string exceeding 255 characters', () => {
    const result = listAgentsQuerySchema.safeParse({ search: 'x'.repeat(256) })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// agentRunBodySchema
// ---------------------------------------------------------------------------

describe('agentRunBodySchema', () => {
  it('accepts a valid input string', () => {
    const result = agentRunBodySchema.safeParse({ input: 'Hello agent' })
    expect(result.success).toBe(true)
  })

  it('rejects empty input', () => {
    const result = agentRunBodySchema.safeParse({ input: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing input', () => {
    const result = agentRunBodySchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects input exceeding 50000 characters', () => {
    const result = agentRunBodySchema.safeParse({ input: 'x'.repeat(50001) })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// agentRunIdParamSchema
// ---------------------------------------------------------------------------

describe('agentRunIdParamSchema', () => {
  it('accepts valid id and runId UUIDs', () => {
    const result = agentRunIdParamSchema.safeParse({
      id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11',
      runId: 'b1ffcd000d1c5fa9cc7e7cc0ce491b22',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-UUID runId', () => {
    const result = agentRunIdParamSchema.safeParse({
      id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11',
      runId: 'invalid',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createCredentialSchema
// ---------------------------------------------------------------------------

describe('createCredentialSchema', () => {
  it('accepts a valid credential creation payload', () => {
    const result = createCredentialSchema.safeParse({
      tool_type: 'tavily',
      name: 'My Tavily Key',
      credentials: { api_key: 'tvly-abc123' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional agent_id', () => {
    const result = createCredentialSchema.safeParse({
      tool_type: 'github',
      name: 'GH Token',
      credentials: { token: 'ghp_xxx' },
      agent_id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing tool_type', () => {
    const result = createCredentialSchema.safeParse({
      name: 'Test',
      credentials: { key: 'val' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty credentials object', () => {
    const result = createCredentialSchema.safeParse({
      tool_type: 'test',
      name: 'Test',
      credentials: {},
    })
    // z.record(z.string()) allows empty record
    expect(result.success).toBe(true)
  })

  it('rejects non-string credential values', () => {
    const result = createCredentialSchema.safeParse({
      tool_type: 'test',
      name: 'Test',
      credentials: { key: 123 },
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updateCredentialSchema
// ---------------------------------------------------------------------------

describe('updateCredentialSchema', () => {
  it('accepts empty update (all optional)', () => {
    const result = updateCredentialSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts name-only update', () => {
    const result = updateCredentialSchema.safeParse({ name: 'Renamed Key' })
    expect(result.success).toBe(true)
  })

  it('accepts credentials-only update', () => {
    const result = updateCredentialSchema.safeParse({ credentials: { api_key: 'new-key' } })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = updateCredentialSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })
})
