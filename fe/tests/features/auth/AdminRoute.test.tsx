/**
 * @fileoverview Direct regression tests for the explicit admin-shell role gate.
 *
 * Keeps `/admin` access pinned to the locked role set instead of permission
 * inference or mixed-shell behavior.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@/constants/roles'
import AdminRoute from '@/features/auth/components/AdminRoute'

const mockUseAuth = vi.fn()

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

describe('AdminRoute', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'admin-user',
        email: 'admin@example.com',
        displayName: 'Admin User',
        role: UserRole.ADMIN,
      },
      isLoading: false,
    })
  })

  function renderAdminRoute() {
    render(
      <MemoryRouter initialEntries={['/admin/data-studio/knowledge-base']}>
        <Routes>
          <Route
            path="/admin/data-studio/knowledge-base"
            element={(
              <AdminRoute>
                <div>allowed-admin-content</div>
              </AdminRoute>
            )}
          />
          <Route path="/403" element={<div>forbidden-page</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('redirects a plain user away from the admin shell', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-only',
        email: 'user@example.com',
        displayName: 'User Only',
        role: UserRole.USER,
      },
      isLoading: false,
    })

    renderAdminRoute()

    expect(screen.getByText('forbidden-page')).toBeInTheDocument()
    expect(screen.queryByText('allowed-admin-content')).not.toBeInTheDocument()
  })

  it.each([UserRole.LEADER, UserRole.ADMIN, UserRole.SUPER_ADMIN])(
    'allows admin-shell role %s through the route guard',
    (role) => {
      mockUseAuth.mockReturnValue({
        user: {
          id: `${role}-user`,
          email: `${role}@example.com`,
          displayName: `${role} User`,
          role,
        },
        isLoading: false,
      })

      renderAdminRoute()

      expect(screen.getByText('allowed-admin-content')).toBeInTheDocument()
      expect(screen.queryByText('forbidden-page')).not.toBeInTheDocument()
    },
  )
})
