/**
 * @fileoverview Tests for CASL ability integration.
 *
 * Tests:
 * - useAppAbility: returns the ability from context
 * - AbilityProvider: fetches rules on mount when user is authenticated
 * - AbilityProvider: resets to default (no permissions) on logout
 * - AbilityProvider: keeps default ability on fetch error
 * - Can component: conditionally renders based on permissions
 *
 * Mocks `@/features/auth` and global `fetch` for ability rule loading.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

// ============================================================================
// Mocks
// ============================================================================

// Track mock user for auth context
let mockUser: { id: string; email: string } | null = null

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

// ============================================================================
// Tests
// ============================================================================

describe('ability', () => {
  beforeEach(() => {
    mockUser = null
    vi.clearAllMocks()
    // Reset fetch mock
    vi.mocked(global.fetch).mockReset()
  })

  /**
   * @description Dynamically imports the ability module so mocks are resolved
   * @returns {Promise<typeof import('@/lib/ability')>} Module exports
   */
  async function importModule() {
    return await import('@/lib/ability')
  }

  // --------------------------------------------------------------------------
  // useAppAbility
  // --------------------------------------------------------------------------

  describe('useAppAbility', () => {
    /** @description Should return default ability with no permissions when no provider wraps it */
    it('returns default ability with no permissions outside provider', async () => {
      const { useAppAbility } = await importModule()

      const { result } = renderHook(() => useAppAbility())

      // Default ability should deny everything
      expect(result.current.can('read', 'Dataset')).toBe(false)
      expect(result.current.can('manage', 'all')).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // AbilityProvider
  // --------------------------------------------------------------------------

  describe('AbilityProvider', () => {
    /** @description Should fetch abilities when user is authenticated */
    it('fetches ability rules from /api/auth/abilities when user exists', async () => {
      mockUser = { id: 'user-1', email: 'test@example.com' }

      // Mock successful ability fetch
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rules: [{ action: 'read', subject: 'Dataset' }],
        }),
      } as Response)

      const { AbilityProvider, useAppAbility } = await importModule()

      const { result } = renderHook(() => useAppAbility(), {
        wrapper: ({ children }) => (
          <AbilityProvider>{children}</AbilityProvider>
        ),
      })

      // Wait for the effect to fetch and update abilities
      await waitFor(() => {
        expect(result.current.can('read', 'Dataset')).toBe(true)
      })

      // Should have called fetch with the abilities endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/abilities'),
        expect.objectContaining({ credentials: 'include' }),
      )
    })

    /** @description Should not fetch abilities when user is null (logged out) */
    it('does not fetch when user is null', async () => {
      mockUser = null

      const { AbilityProvider, useAppAbility } = await importModule()

      const { result } = renderHook(() => useAppAbility(), {
        wrapper: ({ children }) => (
          <AbilityProvider>{children}</AbilityProvider>
        ),
      })

      // Ability should remain default (no permissions)
      expect(result.current.can('read', 'Dataset')).toBe(false)
      // No fetch call should have been made
      expect(global.fetch).not.toHaveBeenCalled()
    })

    /** @description Should keep default ability (no permissions) when fetch fails */
    it('keeps default ability on network error', async () => {
      mockUser = { id: 'user-1', email: 'test@example.com' }

      // Mock fetch failure
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      const { AbilityProvider, useAppAbility } = await importModule()

      // Suppress expected console error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useAppAbility(), {
        wrapper: ({ children }) => (
          <AbilityProvider>{children}</AbilityProvider>
        ),
      })

      // Wait for the effect to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      // Ability should still be default (no permissions)
      expect(result.current.can('read', 'Dataset')).toBe(false)

      consoleSpy.mockRestore()
    })

    /** @description Should keep default ability when response is not ok */
    it('keeps default ability on non-ok response', async () => {
      mockUser = { id: 'user-1', email: 'test@example.com' }

      // Mock 403 response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response)

      const { AbilityProvider, useAppAbility } = await importModule()

      const { result } = renderHook(() => useAppAbility(), {
        wrapper: ({ children }) => (
          <AbilityProvider>{children}</AbilityProvider>
        ),
      })

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      // Non-ok response should leave ability at default
      expect(result.current.can('read', 'Dataset')).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // Can component
  // --------------------------------------------------------------------------

  describe('Can component', () => {
    /** @description Should render children when user has the required permission */
    it('renders children when permission is granted', async () => {
      mockUser = { id: 'user-1', email: 'test@example.com' }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rules: [{ action: 'manage', subject: 'all' }],
        }),
      } as Response)

      const { AbilityProvider, Can } = await importModule()

      render(
        <AbilityProvider>
          <Can I="create" a="Dataset">
            <span data-testid="allowed">Create Button</span>
          </Can>
        </AbilityProvider>,
      )

      // Wait for ability rules to load and Can to render
      await waitFor(() => {
        expect(screen.getByTestId('allowed')).toBeInTheDocument()
      })
    })

    /** @description Should hide children when user lacks the required permission */
    it('hides children when permission is denied', async () => {
      mockUser = { id: 'user-1', email: 'test@example.com' }

      // Grant only read on Dataset — not create
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rules: [{ action: 'read', subject: 'Dataset' }],
        }),
      } as Response)

      const { AbilityProvider, Can } = await importModule()

      render(
        <AbilityProvider>
          <Can I="delete" a="User">
            <span data-testid="hidden">Delete Button</span>
          </Can>
        </AbilityProvider>,
      )

      // Wait for fetch to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      // The element should not be rendered
      expect(screen.queryByTestId('hidden')).not.toBeInTheDocument()
    })
  })
})
