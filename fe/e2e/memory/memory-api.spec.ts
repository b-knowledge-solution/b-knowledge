/**
 * @fileoverview E2E API tests for memory pool and message endpoints.
 *
 * Exercises the backend memory REST API directly through Playwright's
 * request context: create pool, list, get, update, add messages, list
 * messages, and delete. Validates response shapes at each step.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * @module e2e/memory/memory-api.spec
 */

import { test, expect } from '@playwright/test'

/** Base URL for backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

/** Track created resources for sequential tests and cleanup */
let poolId: string
let messageId: string

test.afterAll(async ({ request }) => {
  // Clean up memory pool if tests left one behind
  if (poolId) {
    try {
      await request.delete(`${API_BASE}/api/memory/${poolId}`)
    } catch { /* ignore cleanup errors */ }
  }
})

// ============================================================================
// POST /api/memory — create pool
// ============================================================================

test('POST /api/memory — create a memory pool', async ({ request }) => {
  const poolName = `E2E API Pool ${Date.now()}`
  const response = await request.post(`${API_BASE}/api/memory`, {
    data: {
      name: poolName,
      description: 'Created by E2E memory API test',
    },
  })

  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  // Verify response shape contains an id and name
  const data = body.data || body
  expect(data).toHaveProperty('id')
  expect(data).toHaveProperty('name')
  expect(data.name).toBe(poolName)

  poolId = data.id
})

// ============================================================================
// GET /api/memory — list pools
// ============================================================================

test('GET /api/memory — list memory pools', async ({ request }) => {
  test.skip(!poolId, 'No pool created in previous test')

  const response = await request.get(`${API_BASE}/api/memory`)

  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  // Response should be an array or have a data array
  const pools = Array.isArray(body) ? body : body.data
  expect(Array.isArray(pools)).toBeTruthy()
  expect(pools.length).toBeGreaterThan(0)

  // Verify at least one pool has the expected shape
  const pool = pools.find((p: { id: string }) => p.id === poolId)
  expect(pool).toBeDefined()
  expect(pool).toHaveProperty('id')
  expect(pool).toHaveProperty('name')
})

// ============================================================================
// GET /api/memory/:id — get single pool
// ============================================================================

test('GET /api/memory/:id — get a single memory pool', async ({ request }) => {
  test.skip(!poolId, 'No pool created in previous test')

  const response = await request.get(`${API_BASE}/api/memory/${poolId}`)

  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  // Verify response shape
  const data = body.data || body
  expect(data).toHaveProperty('id', poolId)
  expect(data).toHaveProperty('name')
  expect(data).toHaveProperty('description')
})

// ============================================================================
// PUT /api/memory/:id — update pool
// ============================================================================

test('PUT /api/memory/:id — update a memory pool', async ({ request }) => {
  test.skip(!poolId, 'No pool created in previous test')

  const updatedName = `E2E Updated Pool ${Date.now()}`
  const response = await request.put(`${API_BASE}/api/memory/${poolId}`, {
    data: {
      name: updatedName,
      description: 'Updated by E2E memory API test',
    },
  })

  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  // Verify the update was applied
  const data = body.data || body
  expect(data).toHaveProperty('name', updatedName)
})

// ============================================================================
// POST /api/memory/:id/messages — add message
// ============================================================================

test('POST /api/memory/:id/messages — add a message to pool', async ({ request }) => {
  test.skip(!poolId, 'No pool created in previous test')

  const response = await request.post(`${API_BASE}/api/memory/${poolId}/messages`, {
    data: {
      content: 'This is a test memory message from E2E',
      message_type: 1,
    },
  })

  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  // Verify response contains a message identifier
  const data = body.data || body
  expect(data).toHaveProperty('message_id')
  messageId = data.message_id || data.id
})

// ============================================================================
// GET /api/memory/:id/messages — list messages
// ============================================================================

test('GET /api/memory/:id/messages — list messages in pool', async ({ request }) => {
  test.skip(!poolId, 'No pool created in previous test')

  const response = await request.get(`${API_BASE}/api/memory/${poolId}/messages`)

  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  // Response should contain an array of messages
  const messages = Array.isArray(body) ? body : body.data
  expect(Array.isArray(messages)).toBeTruthy()
  expect(messages.length).toBeGreaterThan(0)

  // Verify message shape
  const msg = messages[0]
  expect(msg).toHaveProperty('content')
})

// ============================================================================
// DELETE /api/memory/:id — delete pool
// ============================================================================

test('DELETE /api/memory/:id — delete a memory pool', async ({ request }) => {
  test.skip(!poolId, 'No pool created in previous test')

  const response = await request.delete(`${API_BASE}/api/memory/${poolId}`)
  expect(response.ok()).toBeTruthy()

  // Verify the pool is no longer accessible
  const getResponse = await request.get(`${API_BASE}/api/memory/${poolId}`)
  expect(getResponse.status()).toBe(404)

  // Clear tracking to prevent afterAll cleanup attempt
  poolId = ''
})

// ============================================================================
// Verify response shapes for error cases
// ============================================================================

test('GET /api/memory/nonexistent-id — returns 404', async ({ request }) => {
  const response = await request.get(`${API_BASE}/api/memory/00000000-0000-0000-0000-000000000000`)

  // Non-existent pool should return 404
  expect(response.status()).toBe(404)
})

test('POST /api/memory — returns 400 for missing name', async ({ request }) => {
  const response = await request.post(`${API_BASE}/api/memory`, {
    data: {
      description: 'Missing name field',
    },
  })

  // Missing required name should return 400 validation error
  expect(response.status()).toBeGreaterThanOrEqual(400)
  expect(response.status()).toBeLessThan(500)
})
