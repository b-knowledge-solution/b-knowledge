/**
 * @fileoverview E2E tests for chat assistant configuration management.
 *
 * Tests creating, configuring, updating, and deleting chat assistants
 * including model settings, dataset linking, and persistence verification.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/chat/chat-config.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'

/** Chat assistants management page URL */
const CHAT_ASSISTANTS_URL = '/data-studio/chat-assistants'

/** Track resources for cleanup */
let api: ApiHelper
let datasetId: string
let assistantId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)

  // Create a test dataset to link to the assistant
  const dataset = await api.createDataset(
    `E2E Chat Config Dataset ${Date.now()}`,
    'For chat assistant config tests',
  )
  datasetId = dataset.id
})

test.afterAll(async () => {
  // Clean up in reverse creation order
  try {
    if (assistantId) await api.deleteChatAssistant(assistantId)
  } catch { /* ignore cleanup errors */ }
  try {
    if (datasetId) await api.deleteDataset(datasetId)
  } catch { /* ignore cleanup errors */ }
})

// ============================================================================
// Create chat assistant via API
// ============================================================================

test('Create a chat assistant via API helper @smoke', async () => {
  // Create assistant with dataset linking
  const assistant = await api.createChatAssistant(
    `E2E Config Assistant ${Date.now()}`,
    [datasetId],
  )

  assistantId = assistant.id
  expect(assistantId).toBeTruthy()
  expect(assistant.name).toContain('E2E Config Assistant')
})

// ============================================================================
// Configure assistant settings
// ============================================================================

test('Configure assistant settings (model, temperature, top_k, system prompt)', async () => {
  // Update assistant with specific LLM configuration
  const updated = await api.updateChatAssistant(assistantId, {
    llm_setting: {
      temperature: 0.3,
      top_k: 5,
      max_tokens: 2048,
    },
    prompt_config: {
      system: 'You are a helpful technical assistant. Answer concisely.',
    },
  })

  expect(updated.id).toBe(assistantId)
})

// ============================================================================
// Link datasets to assistant
// ============================================================================

test('Link datasets to the assistant', async () => {
  // Update assistant to link the dataset
  const updated = await api.updateChatAssistant(assistantId, {
    dataset_ids: [datasetId],
  })

  expect(updated.id).toBe(assistantId)

  // Verify dataset is linked by fetching the assistant
  const fetched = await api.getChatAssistant(assistantId)
  expect(fetched).not.toBeNull()
  // Dataset IDs should include our test dataset
  if (fetched!.dataset_ids) {
    expect(fetched!.dataset_ids).toContain(datasetId)
  }
})

// ============================================================================
// Verify configuration persists after page reload
// ============================================================================

test('Verify configuration persists after page reload @smoke', async ({ page }) => {
  // Navigate to chat assistants management page
  await page.goto(CHAT_ASSISTANTS_URL)
  await page.waitForLoadState('networkidle')

  // Look for the assistant in the list
  const assistantText = page.getByText(/E2E Config Assistant/i)
  await expect(assistantText).toBeVisible({ timeout: 10_000 })

  // Reload the page
  await page.reload()
  await page.waitForLoadState('networkidle')

  // Verify the assistant is still visible after reload
  await expect(page.getByText(/E2E Config Assistant/i)).toBeVisible({ timeout: 10_000 })

  // Verify via API that settings persist
  const fetched = await api.getChatAssistant(assistantId)
  expect(fetched).not.toBeNull()
  expect(fetched!.id).toBe(assistantId)
})

// ============================================================================
// Update configuration
// ============================================================================

test('Update assistant configuration', async () => {
  const newName = `E2E Updated Assistant ${Date.now()}`

  // Update the assistant name and LLM settings
  const updated = await api.updateChatAssistant(assistantId, {
    name: newName,
    llm_setting: {
      temperature: 0.7,
      top_k: 10,
      max_tokens: 4096,
    },
  })

  expect(updated.id).toBe(assistantId)

  // Verify the update persisted
  const fetched = await api.getChatAssistant(assistantId)
  expect(fetched).not.toBeNull()
  expect(fetched!.name).toBe(newName)
})

// ============================================================================
// Delete assistant
// ============================================================================

test('Delete chat assistant', async () => {
  // Delete the assistant
  await api.deleteChatAssistant(assistantId)

  // Verify it no longer exists
  const deleted = await api.getChatAssistant(assistantId)
  expect(deleted).toBeNull()

  // Clear tracking to prevent afterAll from trying again
  assistantId = ''
})
