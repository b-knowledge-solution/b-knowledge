/**
 * @fileoverview API utility module with authentication interceptor.
 * 
 * Provides a fetch wrapper that:
 * - Automatically includes credentials (cookies) for session auth
 * - Handles 401 responses by redirecting to login page
 * - Provides typed HTTP methods (GET, POST, PUT, DELETE)
 * 
 * @module lib/api
 */

/** Backend API base URL from environment */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ============================================================================
// Error Types
// ============================================================================

/**
 * @description Custom error class for authentication failures, thrown when a 401 response is received
 */
export class AuthenticationError extends Error {
  constructor(message: string = 'Not authenticated') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// ============================================================================
// Authentication Handler
// ============================================================================

/**
 * @description Handles 401 Unauthorized responses by redirecting to login with a return URL.
 * Skips redirect if already on a public page (login, logout, landing) to prevent infinite loops.
 * @throws {AuthenticationError} Always throws after initiating redirect to stop further execution
 */
function handleUnauthorized(): never {
  const currentPath = window.location.pathname;

  // Skip redirect if already on login or other public pages to prevent redirect loops
  const publicPaths = ['/login', '/logout', '/403', '/404', '/500']
  if (currentPath === '/' || publicPaths.some(p => currentPath.startsWith(p))) {
    console.log('[API] Unauthorized (401) on public path, skipping redirect:', currentPath)
    throw new AuthenticationError()
  }

  // Capture current path + query for redirect back after login
  const fullPath = currentPath + window.location.search
  const loginUrl = `/login?redirect=${encodeURIComponent(fullPath)}`

  console.log('[API] Unauthorized (401), redirecting to login:', loginUrl)

  // Force full page redirect to clear any stale state
  window.location.href = loginUrl

  // Throw to stop further execution
  throw new AuthenticationError()
}

// ============================================================================
// Types
// ============================================================================

/**
 * @description Extended fetch options with an optional flag to skip 401 auth handling
 */
interface FetchOptions extends RequestInit {
  /** Skip 401 handling (used for login/logout endpoints) */
  skipAuthCheck?: boolean;
}

// ============================================================================
// Core Fetch Function
// ============================================================================

/**
 * @description Fetch wrapper that prepends the API base URL, includes session cookies, handles 401 redirects, and parses JSON responses
 * @template T - Expected response type
 * @param {string} endpoint - API endpoint (relative or absolute URL)
 * @param {FetchOptions} [options] - Fetch options with optional auth skip
 * @returns {Promise<T>} Parsed JSON response
 * @throws {AuthenticationError} On 401 responses (after redirect)
 * @throws {Error} On non-OK responses with error message from response body
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { skipAuthCheck = false, ...fetchOptions } = options;

  // Build full URL (preserve absolute URLs)
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint}`;

  // Don't set Content-Type for FormData — browser must set multipart/form-data with boundary
  const isFormData = fetchOptions.body instanceof FormData
  const defaultHeaders: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' }

  const response = await fetch(url, {
    ...fetchOptions,
    credentials: 'include', // Always include cookies for session auth
    headers: {
      ...defaultHeaders,
      ...fetchOptions.headers,
    },
  });

  // Handle 401 Unauthorized - redirect to login
  if (response.status === 401 && !skipAuthCheck) {
    handleUnauthorized();
  }

  // Handle other errors
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  // Handle 204 No Content - return undefined (no body to parse)
  if (response.status === 204) {
    return undefined as T;
  }

  // Return parsed JSON response
  return response.json() as Promise<T>;
}

// ============================================================================
// Convenience Methods
// ============================================================================

/**
 * @description API helper object with typed HTTP method shortcuts that include credentials and handle authentication
 */
export const api = {
  /**
   * @description Performs a GET request to the specified endpoint
   * @template T - Expected response type
   */
  get: <T = unknown>(endpoint: string, options?: FetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'GET' }),

  /**
   * @description Performs a POST request with a JSON-serialized body
   * @template T - Expected response type
   */
  post: <T = unknown>(endpoint: string, data?: unknown, options?: FetchOptions) => {
    const body = data ? JSON.stringify(data) : null;
    return apiFetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body,
    });
  },

  /**
   * @description Performs a PUT request with a JSON-serialized body
   * @template T - Expected response type
   */
  put: <T = unknown>(endpoint: string, data?: unknown, options?: FetchOptions) => {
    const body = data ? JSON.stringify(data) : null;
    return apiFetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body,
    });
  },

  /**
   * @description Performs a PATCH request with a JSON-serialized body
   * @template T - Expected response type
   */
  patch: <T = unknown>(endpoint: string, data?: unknown, options?: FetchOptions) => {
    const body = data ? JSON.stringify(data) : null;
    return apiFetch<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body,
    });
  },

  /**
   * @description Performs a DELETE request to the specified endpoint
   * @template T - Expected response type
   */
  delete: <T = unknown>(endpoint: string, options?: FetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
