/**
 * @fileoverview API-level E2E tests for the Agents module.
 *
 * Tests all agent CRUD, versioning, duplication, and export endpoints
 * directly via Playwright's APIRequestContext. Verifies response shapes
 * match expected schema without involving the UI.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * @module e2e/agent/agent-api.spec
 */

import { test, expect } from '@playwright/test'

/** Base URL for backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

/** Track resources for cleanup */
let agentId: string
let duplicatedAgentId: string
let versionId: string

test.afterAll(async ({ request }) => {
  // Clean up in reverse order
  if (duplicatedAgentId) {
    try {
      await request.delete(`${API_BASE}/api/agents/${duplicatedAgentId}`)
    } catch { /* ignore cleanup errors */ }
  }
  if (agentId) {
    try {
      await request.delete(`${API_BASE}/api/agents/${agentId}`)
    } catch { /* ignore cleanup errors */ }
  }
})

// ============================================================================
// POST /api/agents — create agent
// ============================================================================

test('POST /api/agents - create a new agent @smoke', async ({ request }) => {
  const response = await request.post(`${API_BASE}/api/agents`, {
    data: {
      name: `E2E API Agent ${Date.now()}`,
      mode: 'agent',
      description: 'Created by E2E API test',
    },
  })

  expect(response.ok()).toBeTruthy()
  expect(response.status()).toBe(201)

  const agent = await response.json()

  // Verify response shape
  expect(agent).toHaveProperty('id')
  expect(agent).toHaveProperty('name')
  expect(agent.name).toContain('E2E API Agent')
  expect(agent).toHaveProperty('mode', 'agent')

  agentId = agent.id
})

// ============================================================================
// GET /api/agents — list agents
// ============================================================================

test('GET /api/agents - list agents includes created agent', async ({ request }) => {
  test.skip(!agentId, 'No agent created in previous test')

  const response = await request.get(`${API_BASE}/api/agents`)

  expect(response.ok()).toBeTruthy()
  expect(response.status()).toBe(200)

  const body = await response.json()

  // Response should be an object with data array or a direct array
  const agents = Array.isArray(body) ? body : body.data || []
  expect(Array.isArray(agents)).toBeTruthy()

  // Our test agent should be in the list
  const found = agents.find((a: Record<string, unknown>) => a.id === agentId)
  expect(found).toBeTruthy()
  expect(found.name).toContain('E2E API Agent')
})

// ============================================================================
// GET /api/agents/:id — get single agent
// ============================================================================

test('GET /api/agents/:id - get single agent by ID', async ({ request }) => {
  test.skip(!agentId, 'No agent created in previous test')

  const response = await request.get(`${API_BASE}/api/agents/${agentId}`)

  expect(response.ok()).toBeTruthy()
  expect(response.status()).toBe(200)

  const agent = await response.json()

  // Verify full response shape
  expect(agent).toHaveProperty('id', agentId)
  expect(agent).toHaveProperty('name')
  expect(agent).toHaveProperty('mode', 'agent')
  expect(agent).toHaveProperty('description')

  // Agent should have DSL (graph definition) and metadata
  if (agent.dsl) {
    expect(typeof agent.dsl).toBe('object')
  }
  if (agent.created_at) {
    expect(typeof agent.created_at).toBe('string')
  }
  if (agent.updated_at) {
    expect(typeof agent.updated_at).toBe('string')
  }
})

// ============================================================================
// PUT /api/agents/:id — update agent
// ============================================================================

test('PUT /api/agents/:id - update agent name and description', async ({ request }) => {
  test.skip(!agentId, 'No agent created in previous test')

  const updatedName = `E2E API Agent Updated ${Date.now()}`
  const response = await request.put(`${API_BASE}/api/agents/${agentId}`, {
    data: {
      name: updatedName,
      description: 'Updated by E2E API test',
    },
  })

  expect(response.ok()).toBeTruthy()

  const agent = await response.json()
  expect(agent.name).toBe(updatedName)

  // Verify the update persisted by fetching again
  const getResponse = await request.get(`${API_BASE}/api/agents/${agentId}`)
  const fetched = await getResponse.json()
  expect(fetched.name).toBe(updatedName)
})

// ============================================================================
// POST /api/agents/:id/versions — create version
// ============================================================================

test('POST /api/agents/:id/versions - create a version snapshot', async ({ request }) => {
  test.skip(!agentId, 'No agent created in previous test')

  const response = await request.post(`${API_BASE}/api/agents/${agentId}/versions`, {
    data: {
      label: 'v1.0',
      description: 'First version snapshot',
    },
  })

  expect(response.ok()).toBeTruthy()

  const version = await response.json()

  // Verify version response shape
  expect(version).toHaveProperty('id')
  if (version.label) {
    expect(version.label).toBe('v1.0')
  }

  versionId = version.id
})

// ============================================================================
// GET /api/agents/:id/versions — list versions
// ============================================================================

test('GET /api/agents/:id/versions - list agent versions', async ({ request }) => {
  test.skip(!agentId, 'No agent created in previous test')

  const response = await request.get(`${API_BASE}/api/agents/${agentId}/versions`)

  expect(response.ok()).toBeTruthy()

  const body = await response.json()
  const versions = Array.isArray(body) ? body : body.data || []

  // Should have at least the one version we created
  expect(versions.length).toBeGreaterThanOrEqual(1)

  // Verify version entries have expected fields
  const firstVersion = versions[0]
  expect(firstVersion).toHaveProperty('id')
})

// ============================================================================
// POST /api/agents/:id/duplicate — duplicate agent
// ============================================================================

test('POST /api/agents/:id/duplicate - duplicate the agent @smoke', async ({ request }) => {
  test.skip(!agentId, 'No agent created in previous test')

  const response = await request.post(`${API_BASE}/api/agents/${agentId}/duplicate`)

  expect(response.ok()).toBeTruthy()

  const duplicated = await response.json()

  // Verify the duplicate has a different ID but similar structure
  expect(duplicated).toHaveProperty('id')
  expect(duplicated.id).not.toBe(agentId)
  expect(duplicated).toHaveProperty('name')
  expect(duplicated).toHaveProperty('mode')

  duplicatedAgentId = duplicated.id
})

// ============================================================================
// GET /api/agents/:id/export — export agent
// ============================================================================

test('GET /api/agents/:id/export - export agent as JSON', async ({ request }) => {
  test.skip(!agentId, 'No agent created in previous test')

  const response = await request.get(`${API_BASE}/api/agents/${agentId}/export`)

  expect(response.ok()).toBeTruthy()

  const exported = await response.json()

  // Exported data should contain the agent definition
  expect(exported).toBeTruthy()
  expect(typeof exported).toBe('object')
})

// ============================================================================
// DELETE /api/agents/:id — delete agent
// ============================================================================

test('DELETE /api/agents/:id - delete agent @smoke', async ({ request }) => {
  test.skip(!agentId, 'No agent created in previous test')

  const response = await request.delete(`${API_BASE}/api/agents/${agentId}`)

  expect(response.ok()).toBeTruthy()

  // Verify the agent no longer exists
  const getResponse = await request.get(`${API_BASE}/api/agents/${agentId}`)
  expect(getResponse.status()).toBe(404)

  // Clear tracking to prevent afterAll cleanup
  agentId = ''
})

// ============================================================================
// Error cases
// ============================================================================

test('GET /api/agents/:id returns 404 for non-existent agent', async ({ request }) => {
  const response = await request.get(`${API_BASE}/api/agents/00000000-0000-0000-0000-000000000000`)

  expect(response.status()).toBe(404)
})

test('POST /api/agents with empty name returns validation error', async ({ request }) => {
  const response = await request.post(`${API_BASE}/api/agents`, {
    data: {
      name: '',
      mode: 'agent',
    },
  })

  // Should return 400 or 422 for validation error
  expect([400, 422]).toContain(response.status())
})
