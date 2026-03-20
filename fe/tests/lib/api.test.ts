/**
 * @fileoverview Tests for API utility functions.
 *
 * Tests:
 * - apiFetch: GET, POST with JSON body, FormData body, 401 redirect, skipAuthCheck, error messages, 204 No Content
 * - api object methods: get, post, put, patch, delete
 * - AuthenticationError custom error class
 * - Network error handling
 * - JSON parsing
 * - URL handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * @description Creates a mock Response object with configurable status and JSON body
 * @param {unknown} data - Response body data
 * @param {number} status - HTTP status code (default 200)
 * @returns {Response} Mock response object
 */
function createMockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  } as unknown as Response
}

// ============================================================================
// Tests
// ============================================================================

describe('API utilities', () => {
  const originalFetch = globalThis.fetch
  const originalLocation = window.location

  beforeEach(() => {
    // Reset fetch mock
    globalThis.fetch = vi.fn()

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: '', pathname: '/current', search: '' },
      writable: true,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
    vi.restoreAllMocks()
  })

  // Lazy-import to ensure mocks are in place before module evaluation
  /**
   * @description Dynamically imports the API module to pick up fresh mocks
   * @returns {Promise<typeof import('@/lib/api')>} The API module exports
   */
  async function getApiModule() {
    return await import('@/lib/api')
  }

  describe('AuthenticationError', () => {
    it('should create error with default message', async () => {
      const { AuthenticationError } = await getApiModule()
      const error = new AuthenticationError()
      expect(error.message).toBe('Not authenticated')
      expect(error.name).toBe('AuthenticationError')
    })

    it('should create error with custom message', async () => {
      const { AuthenticationError } = await getApiModule()
      const error = new AuthenticationError('Session expired')
      expect(error.message).toBe('Session expired')
      expect(error.name).toBe('AuthenticationError')
    })

    it('should be instance of Error', async () => {
      const { AuthenticationError } = await getApiModule()
      const error = new AuthenticationError()
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('apiFetch', () => {
    it('should make a successful GET request with credentials', async () => {
      const { apiFetch } = await getApiModule()
      const data = { id: 1, name: 'Test' };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(data))

      const result = await apiFetch('/api/test')

      // Verify credentials are included for session auth
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      )
      expect(result).toEqual(data)
    })

    it('should make a POST request with JSON body and Content-Type header', async () => {
      const { apiFetch } = await getApiModule()
      const body = { name: 'New Item' };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ id: 1 }))

      await apiFetch('/api/items', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      // Verify JSON Content-Type is set for non-FormData bodies
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      )
    })

    it('should not set Content-Type for FormData body', async () => {
      const { apiFetch } = await getApiModule()
      const formData = new FormData()
      formData.append('file', 'test-content');
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ uploaded: true }))

      await apiFetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      // Browser must set multipart/form-data with boundary automatically
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
      expect(callArgs.headers).not.toHaveProperty('Content-Type')
    })

    it('should redirect to login on 401 response', async () => {
      const { apiFetch, AuthenticationError } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ error: 'Unauthorized' }, 401))

      await expect(apiFetch('/api/test')).rejects.toThrow(AuthenticationError)

      // Verify redirect URL includes return path
      expect(window.location.href).toContain('/login?redirect=')
    })

    it('should NOT redirect on 401 when skipAuthCheck is true', async () => {
      const { apiFetch } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ error: 'Unauthorized' }, 401))

      // With skipAuthCheck, 401 is treated as a regular error (no redirect)
      await expect(apiFetch('/api/test', { skipAuthCheck: true })).rejects.toThrow()

      // Location should not be changed to login
      expect(window.location.href).not.toContain('/login')
    })

    it('should throw with error message from response body on non-OK response', async () => {
      const { apiFetch } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ error: 'Not Found' }, 404))

      await expect(apiFetch('/api/test')).rejects.toThrow('Not Found')
    })

    it('should throw generic error when response body has no error message', async () => {
      const { apiFetch } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({}, 500))

      await expect(apiFetch('/api/test')).rejects.toThrow('API error: 500')
    })

    it('should return undefined for 204 No Content response', async () => {
      const { apiFetch } = await getApiModule()
      const mockResponse = {
        ok: true,
        status: 204,
        json: vi.fn(),
        headers: new Headers(),
      } as unknown as Response;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

      const result = await apiFetch('/api/resource/1')

      // 204 has no body — should return undefined without calling .json()
      expect(result).toBeUndefined()
      expect(mockResponse.json).not.toHaveBeenCalled()
    })

    it('should preserve absolute URLs', async () => {
      const { apiFetch } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({}))

      await apiFetch('https://external.com/api/test')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://external.com/api/test',
        expect.any(Object)
      )
    })
  })

  describe('api.get', () => {
    it('should set HTTP method to GET', async () => {
      const { api } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ id: 1 }))

      await api.get('/api/users/1')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/1'),
        expect.objectContaining({ method: 'GET' })
      )
    })
  })

  describe('api.post', () => {
    it('should set HTTP method to POST with JSON body', async () => {
      const { api } = await getApiModule()
      const requestData = { name: 'New User' };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ id: 1 }))

      await api.post('/api/users', requestData)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        })
      )
    })

    it('should handle POST without body', async () => {
      const { api } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ success: true }))

      await api.post('/api/action')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/action'),
        expect.objectContaining({
          method: 'POST',
          body: null,
        })
      )
    })
  })

  describe('api.put', () => {
    it('should set HTTP method to PUT with JSON body', async () => {
      const { api } = await getApiModule()
      const requestData = { name: 'Updated' };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ id: 1 }))

      await api.put('/api/users/1', requestData)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(requestData),
        })
      )
    })
  })

  describe('api.patch', () => {
    it('should set HTTP method to PATCH with JSON body', async () => {
      const { api } = await getApiModule()
      const requestData = { name: 'Patched' };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ id: 1 }))

      await api.patch('/api/users/1', requestData)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(requestData),
        })
      )
    })

    it('should handle PATCH without body', async () => {
      const { api } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ success: true }))

      await api.patch('/api/resource/1')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/resource/1'),
        expect.objectContaining({
          method: 'PATCH',
          body: null,
        })
      )
    })
  })

  describe('api.delete', () => {
    it('should set HTTP method to DELETE', async () => {
      const { api } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({ success: true }))

      await api.delete('/api/users/1')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  describe('network error handling', () => {
    it('should propagate network errors from fetch', async () => {
      const { apiFetch } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

      await expect(apiFetch('/api/test')).rejects.toThrow('Network error')
    })

    it('should propagate network errors through api methods', async () => {
      const { api } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed to fetch'))

      await expect(api.get('/api/test')).rejects.toThrow('Failed to fetch')
    })
  })

  describe('JSON parsing', () => {
    it('should handle array responses', async () => {
      const { api } = await getApiModule()
      const testData = [{ id: 1 }, { id: 2 }];
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(testData))

      const result = await api.get('/api/items')
      expect(result).toEqual(testData)
    })

    it('should handle complex nested objects', async () => {
      const { api } = await getApiModule()
      const testData = {
        user: { id: 1, profile: { name: 'Test', settings: { theme: 'dark' } } },
        items: [1, 2, 3],
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(testData))

      const result = await api.get('/api/complex')
      expect(result).toEqual(testData)
    })
  })

  describe('request URL handling', () => {
    it('should handle relative URLs', async () => {
      const { api } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({}))

      await api.get('/api/test')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        expect.any(Object)
      )
    })

    it('should handle URLs with query parameters', async () => {
      const { api } = await getApiModule();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse({}))

      await api.get('/api/search?q=test&page=1')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/search?q=test&page=1'),
        expect.any(Object)
      )
    })
  })
})
