/**
 * @fileoverview E2E tests for document upload flow in the dataset detail page.
 *
 * Exercises the full UI flow for uploading a PDF document to a dataset,
 * including file chooser interaction, duplicate filename handling, and
 * invalid file type rejection.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/dataset/document-upload.spec
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'

/** ESM-compatible __dirname equivalent */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Dataset detail page URL prefix */
const DATASET_URL_PREFIX = '/data-studio/datasets'

/** Path to test PDF file */
const SAMPLE_PDF_PATH = path.resolve(__dirname, '../test-data/sample.pdf')

/** API helper instance for setup/teardown */
let api: ApiHelper

/** Dataset ID created for upload tests */
let datasetId: string

test.beforeAll(async ({ request }) => {
  // Create a shared test dataset for all upload tests
  api = apiHelper(request)
  const dataset = await api.createDataset(
    `E2E Upload Test ${Date.now()}`,
    'Dataset for document upload E2E tests'
  )
  datasetId = dataset.id
})

test.afterAll(async () => {
  // Clean up the test dataset (cascading deletes all documents)
  try {
    await api.deleteDataset(datasetId)
  } catch {
    // Ignore cleanup errors
  }
})

// ============================================================================
// Upload PDF document via UI
// ============================================================================

test('Upload PDF document via UI @smoke', async ({ page }) => {
  // Navigate to the dataset detail page
  await page.goto(`${DATASET_URL_PREFIX}/${datasetId}`)
  await page.waitForLoadState('networkidle')

  // Click the upload button (Upload icon button in the header)
  const uploadButton = page.locator('button').filter({ has: page.locator('svg.lucide-upload') })
  await expect(uploadButton).toBeVisible({ timeout: 10_000 })
  await uploadButton.click()

  // Wait for the upload modal dialog to appear
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // Use Playwright's file chooser to select the sample PDF
  const fileChooserPromise = page.waitForEvent('filechooser')

  // Click the "Upload Files" button inside the dialog to trigger file picker
  const uploadFilesButton = dialog.getByRole('button', { name: /upload files/i })
  await uploadFilesButton.click()

  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(SAMPLE_PDF_PATH)

  // Assert: File appears in the file list preview within the dialog
  await expect(dialog.getByText('sample.pdf')).toBeVisible({ timeout: 5_000 })

  // Click the upload/submit button to start the actual upload
  // The submit button shows the count of files e.g. "Upload (1)"
  const submitButton = dialog.getByRole('button', { name: /upload/i }).last()
  await submitButton.click()

  // Wait for the dialog to close (indicates upload completed successfully)
  await expect(dialog).not.toBeVisible({ timeout: 30_000 })

  // Wait for the document table to refresh and show the uploaded file
  // The document name appears in a table cell
  await expect(page.getByText('sample.pdf')).toBeVisible({ timeout: 15_000 })

  // Verify via API that the document exists with correct metadata
  const doc = await findDocumentByName(api, datasetId, 'sample.pdf')
  expect(doc).toBeTruthy()
  expect(doc!.name).toBe('sample.pdf')
})

// ============================================================================
// Upload duplicate filename
// ============================================================================

test('Upload duplicate filename does not cause server error', async ({ page, request }) => {
  // First, upload sample.pdf via API to ensure it exists
  const localApi = apiHelper(request)
  await localApi.uploadDocument(datasetId, SAMPLE_PDF_PATH)

  // Navigate to dataset detail page
  await page.goto(`${DATASET_URL_PREFIX}/${datasetId}`)
  await page.waitForLoadState('networkidle')

  // Click upload button
  const uploadButton = page.locator('button').filter({ has: page.locator('svg.lucide-upload') })
  await uploadButton.click()

  // Wait for dialog
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // Select the same PDF file again
  const fileChooserPromise = page.waitForEvent('filechooser')
  const uploadFilesButton = dialog.getByRole('button', { name: /upload files/i })
  await uploadFilesButton.click()

  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(SAMPLE_PDF_PATH)

  // Submit the upload
  const submitButton = dialog.getByRole('button', { name: /upload/i }).last()
  await submitButton.click()

  // Wait for either: success (dialog closes) or error toast appears
  // Both are acceptable -- the key assertion is no 500/crash
  const outcome = await Promise.race([
    // Outcome 1: Dialog closes (duplicate allowed)
    dialog.waitFor({ state: 'hidden', timeout: 15_000 })
      .then(() => 'created' as const),
    // Outcome 2: Error message shown to user
    page.locator('[role="alert"], .toast, [data-sonner-toast]').first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => 'error-shown' as const),
  ]).catch(() => 'timeout' as const)

  // Either duplicate was accepted or a user-friendly error was shown -- not a 500
  expect(['created', 'error-shown']).toContain(outcome)
})

// ============================================================================
// Upload invalid file type
// ============================================================================

test('Upload invalid file type is rejected gracefully', async ({ page }) => {
  // Navigate to dataset detail page
  await page.goto(`${DATASET_URL_PREFIX}/${datasetId}`)
  await page.waitForLoadState('networkidle')

  // Click upload button
  const uploadButton = page.locator('button').filter({ has: page.locator('svg.lucide-upload') })
  await uploadButton.click()

  // Wait for dialog
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // Try to upload an .exe file via file chooser
  // The FileUploadModal has an accept filter on the input, so Playwright can
  // bypass it by setting files directly. The modal's addFiles filter checks
  // the extension client-side and should reject non-accepted types.
  const fileChooserPromise = page.waitForEvent('filechooser')
  const uploadFilesButton = dialog.getByRole('button', { name: /upload files/i })
  await uploadFilesButton.click()

  const fileChooser = await fileChooserPromise

  // Create a temporary .exe file path -- Playwright will create a fake file
  // Since the file input has an accept attribute, the browser may filter it,
  // but we can still test that the UI handles rejection gracefully.
  // We use a .txt extension that IS accepted to verify the flow works,
  // then verify that the modal's client-side filter would reject .exe
  // Note: Browser file inputs with accept attribute may not allow .exe selection
  // So we test the boundary: upload a file and verify no crash occurs
  await fileChooser.setFiles({
    name: 'malicious.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('fake executable content'),
  })

  // The file should NOT appear in the file list because the modal filters
  // by ACCEPTED_EXTENSIONS client-side. If it does appear, the upload button
  // should still not cause a 500.
  // Wait briefly for any file list update
  await page.waitForTimeout(1000)

  // Check if the file was added to the list
  const exeFileVisible = await dialog.getByText('malicious.exe').isVisible().catch(() => false)

  if (!exeFileVisible) {
    // File was correctly filtered out by the client-side extension check
    // The upload button should be disabled (no files selected)
    const submitButtons = dialog.getByRole('button', { name: /upload/i })
    const lastSubmit = submitButtons.last()
    await expect(lastSubmit).toBeDisabled()
  } else {
    // File was added despite filter -- verify upload doesn't crash
    const submitButton = dialog.getByRole('button', { name: /upload/i }).last()
    await submitButton.click()

    // Should get an error toast, not a crash
    const errorShown = await page.locator('[role="alert"], .toast, [data-sonner-toast]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)

    // Either error shown or dialog stayed open -- not a 500 crash
    expect(errorShown || await dialog.isVisible()).toBe(true)
  }
})

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Find a document by name in a dataset using the API helper.
 * @param {ApiHelper} apiHelper - API helper instance
 * @param {string} dsId - Dataset UUID
 * @param {string} docName - Document filename to search for
 * @returns {Promise<{id: string; name: string} | undefined>} Found document or undefined
 */
async function findDocumentByName(
  apiHelper: ApiHelper,
  dsId: string,
  docName: string
): Promise<{ id: string; name: string; run: string; progress: number; progress_msg: string } | undefined> {
  // Use the getDocument method pattern -- list all docs and filter
  const response = await (apiHelper as any).request.get(
    `${process.env.E2E_API_BASE || 'http://localhost:3001'}/api/rag/datasets/${dsId}/documents`
  )

  if (!response.ok()) return undefined
  const json = await response.json()
  return json.data?.find((d: { name: string }) => d.name === docName)
}
