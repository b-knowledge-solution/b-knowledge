/**
 * @fileoverview Router-level regressions for the admin shell migration.
 *
 * Encodes the final `/admin` contract so later route edits cannot silently
 * restore legacy admin aliases or break the hidden admin pages.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_HOME_PATH,
  buildAdminAgentCanvasPath,
  buildAdminCodeGraphPath,
} from '@/app/adminRoutes'

const mockUseHasPermission = vi.fn(() => true)

vi.mock('@/app/Providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ErrorBoundary', () => ({
  FeatureErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/features/auth', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AdminRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/layouts/MainLayout', () => ({
  default: ({ navEntries }: { navEntries: Array<{ path?: string; labelKey: string }> }) => {
    const location = useLocation()

    return (
      <div data-testid="layout-shell" data-pathname={location.pathname}>
        <div data-testid="layout-nav">{navEntries.map((entry) => entry.labelKey).join('|')}</div>
        <Outlet />
      </div>
    )
  },
}))

vi.mock('@/lib/permissions', () => ({
  useHasPermission: (permissionKey: string) => mockUseHasPermission(permissionKey),
}))

vi.mock('@/features/landing/pages/LandingPage', () => ({
  default: () => <div>landing-page</div>,
}))

vi.mock('@/features/auth/pages/LoginPage', () => ({
  default: () => <div>login-page</div>,
}))

vi.mock('@/features/auth/pages/LogoutPage', () => ({
  default: () => <div>logout-page</div>,
}))

vi.mock('@/features/chat/pages/ChatPage', () => ({
  default: () => <div>chat-page</div>,
}))

vi.mock('@/features/search/pages/SearchPage', () => ({
  default: () => <div>search-page</div>,
}))

vi.mock('@/features/search/pages/SearchSharePage', () => ({
  SearchSharePage: () => <div>search-share-page</div>,
}))

vi.mock('@/features/knowledge-base/pages/KnowledgeBaseListPage', () => ({
  default: () => <div>knowledge-base-list-page</div>,
}))

vi.mock('@/features/code-graph/pages/CodeGraphPage', () => ({
  default: () => {
    const params = useParams()

    return <div>code-graph:{params.kbId}</div>
  },
}))

vi.mock('@/features/agents/pages/AgentCanvasPage', () => ({
  default: () => {
    const params = useParams()
    const location = useLocation()

    return <div>agent-canvas:{params.id}:{location.search}</div>
  },
}))

vi.mock('@/components/ErrorPage', () => ({
  default: ({ code }: { code: number }) => {
    const location = useLocation()

    return <div>error-page:{code}:{location.pathname}</div>
  },
}))

// Stub untouched lazy route modules so the App router can load without pulling
// full feature trees into this regression harness.
vi.mock('@/features/users/pages/UserManagementPage', () => ({ default: () => null }))
vi.mock('@/features/users/pages/UserDetailPage', () => ({ default: () => null }))
vi.mock('@/features/users/pages/PermissionManagementPage', () => ({ default: () => null }))
vi.mock('@/features/permissions/pages/EffectiveAccessPage', () => ({ default: () => null }))
vi.mock('@/features/teams/pages/TeamManagementPage', () => ({ default: () => null }))
vi.mock('@/features/system/pages/SystemToolsPage', () => ({ default: () => null }))
vi.mock('@/features/system/pages/SystemMonitorPage', () => ({ default: () => null }))
vi.mock('@/features/audit/pages/AuditLogPage', () => ({ default: () => null }))
vi.mock('@/features/ai/pages/TokenizerPage', () => ({ default: () => null }))
vi.mock('@/features/broadcast/pages/BroadcastMessagePage', () => ({ default: () => null }))
vi.mock('@/features/histories/pages/HistoriesPage', () => ({ default: () => null }))
vi.mock('@/features/dashboard/pages/AdminDashboardPage', () => ({ default: () => null }))
vi.mock('@/features/datasets/pages/DatasetsPage', () => ({ default: () => null }))
vi.mock('@/features/datasets/pages/DatasetDetailPage', () => ({ default: () => null }))
vi.mock('@/features/chat/pages/ChatAssistantManagementPage', () => ({ default: () => null }))
vi.mock('@/features/search/pages/SearchAppManagementPage', () => ({ default: () => null }))
vi.mock('@/features/knowledge-base/pages/KnowledgeBaseDetailPage', () => ({ default: () => null }))
vi.mock('@/features/llm-provider/pages/LLMProviderPage', () => ({ default: () => null }))
vi.mock('@/features/datasets/pages/DocumentReviewerPage', () => ({ default: () => null }))
vi.mock('@/features/datasets/pages/ChunkDetailPage', () => ({ default: () => null }))
vi.mock('@/features/agents/pages/AgentListPage', () => ({ default: () => null }))
vi.mock('@/features/memory/pages/MemoryListPage', () => ({ default: () => null }))
vi.mock('@/features/memory/pages/MemoryDetailPage', () => ({ default: () => null }))

describe('AdminRouting', () => {
  beforeEach(() => {
    mockUseHasPermission.mockReturnValue(true)
  })

  async function renderApp(initialPath: string) {
    window.history.replaceState({}, '', initialPath)
    const { default: App } = await import('@/app/App')

    render(
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>,
    )
  }

  it('redirects /admin to the canonical admin home path', async () => {
    await renderApp('/admin')

    expect(await screen.findByText('knowledge-base-list-page')).toBeInTheDocument()
    expect(screen.getByTestId('layout-shell')).toHaveAttribute('data-pathname', ADMIN_HOME_PATH)
  })

  it('keeps the hidden code-graph route inside the admin shell', async () => {
    await renderApp(buildAdminCodeGraphPath('kb-123'))

    expect(await screen.findByText('code-graph:kb-123')).toBeInTheDocument()
    expect(screen.getByTestId('layout-nav')).toHaveTextContent('nav.dataStudio')
  })

  it('keeps the hidden agent canvas new route under the admin tree', async () => {
    await renderApp(`${buildAdminAgentCanvasPath('new')}?mode=chat`)

    expect(await screen.findByText('agent-canvas:new:?mode=chat')).toBeInTheDocument()
    expect(screen.getByTestId('layout-shell')).toHaveAttribute(
      'data-pathname',
      buildAdminAgentCanvasPath('new'),
    )
  })

  it.each([
    '/iam/users',
    '/data-studio/knowledge-base',
  ])('sends removed legacy admin path %s to /404', async (legacyPath) => {
    await renderApp(legacyPath)

    expect(await screen.findByText(`error-page:404:/404`)).toBeInTheDocument()
  })
})
