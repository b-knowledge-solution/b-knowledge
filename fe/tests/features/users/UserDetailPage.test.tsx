/**
 * @fileoverview Tests for the UserDetailPage tab + deep-linking behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Override the global setup.ts mock that stubs out useSearchParams.
// We need the REAL hooks here so MemoryRouter can drive ?tab= behavior.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return actual
})

import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the user-by-id hook BEFORE importing the page.
vi.mock('@/features/users/api/userQueries', () => ({
  useUser: vi.fn(() => ({
    data: {
      id: '42',
      email: 'jane@example.com',
      displayName: 'Jane Doe',
      name: 'Jane Doe',
      role: 'admin',
      permissions: [],
    },
    isLoading: false,
  })),
}))

// Mock the OverrideEditor so we don't pull the entire permissions tree into this test.
vi.mock('@/features/permissions/components/OverrideEditor', () => ({
  OverrideEditor: () => <div data-testid="override-editor-stub" />,
}))

// i18n stub: return the key as the translated value so assertions can match by key.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

import UserDetailPage from '@/features/users/pages/UserDetailPage'

/**
 * @description Render UserDetailPage at the given URL with required providers.
 */
function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/iam/users/:id" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to the profile tab when no ?tab param is set', () => {
    renderAt('/iam/users/42')
    const profileTrigger = screen.getByRole('tab', { name: 'users.detail.tabs.profile' })
    expect(profileTrigger.getAttribute('data-state')).toBe('active')
  })

  it('opens the permissions tab when ?tab=permissions is in the URL', () => {
    const { container } = renderAt('/iam/users/42?tab=permissions')
    // The perms TabsContent should not be hidden by Radix
    const permsContent = container.querySelector('[id$="content-permissions"]')
    expect(permsContent?.getAttribute('data-state')).toBe('active')
  })

  it('switches tabs on click', () => {
    renderAt('/iam/users/42')
    // Profile tab is active initially → no override-editor stub yet
    expect(screen.queryByTestId('override-editor-stub')).toBeNull()
    const permsTrigger = screen.getByRole('tab', { name: 'users.detail.tabs.permissions' })
    // Radix Tabs activates on mousedown/keydown rather than synthetic click in jsdom
    fireEvent.mouseDown(permsTrigger)
    fireEvent.keyDown(permsTrigger, { key: 'Enter' })
    fireEvent.click(permsTrigger)
    // After interaction the perms content should mount
    expect(screen.getByTestId('override-editor-stub')).toBeTruthy()
  })
})
