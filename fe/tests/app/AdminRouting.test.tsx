/**
 * @fileoverview Router-level regressions for the admin shell migration.
 *
 * Encodes the final `/admin` contract so later route edits cannot silently
 * restore legacy admin aliases or break the hidden admin pages.
 */

import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAdminAgentCanvasPath,
  buildAdminCodeGraphPath,
} from '@/app/adminRoutes'

const mockUseHasPermission = vi.fn(() => true)

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')

  return {
    ...actual,
    lazy: (load: () => Promise<{ default: ComponentType<any> }>) => {
      return function LazyTestComponent(props: Record<string, unknown>) {
        const [LoadedComponent, setLoadedComponent] =
          actual.useState<ComponentType<Record<string, unknown>> | null>(null)

        actual.useEffect(() => {
          let isMounted = true

          void load().then((module) => {
            if (isMounted) {
              setLoadedComponent(() => module.default)
            }
          })

          return () => {
            isMounted = false
          }
        }, [])

        if (!LoadedComponent) {
          return null
        }

        return actual.createElement(LoadedComponent, props)
      }
    },
  }
})

vi.mock('@/app/Providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ErrorBoundary', () => ({
  FeatureErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/i18n', () => ({}))

vi.mock('@/features/auth', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AdminRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/layouts/sidebarNav', () => ({
  USER_SIDEBAR_NAV: [
    { path: '/chat', labelKey: 'nav.aiChat' },
    { path: '/search', labelKey: 'nav.aiSearch' },
  ],
  ADMIN_SIDEBAR_NAV: [
    { labelKey: 'nav.dataStudio', children: [] },
    { labelKey: 'nav.agentStudio', children: [] },
    { labelKey: 'nav.iam', children: [] },
    { labelKey: 'nav.system', children: [] },
  ],
  getRoutePermission: () => undefined,
}))

vi.mock('@/layouts/MainLayout', async () => {
  const router = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    default: ({ navEntries }: { navEntries: Array<{ path?: string; labelKey: string }> }) => (
      <div data-testid="layout-shell" data-nav={navEntries.map((entry) => entry.labelKey).join('|')}>
        <router.Outlet />
      </div>
    ),
  }
})

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

vi.mock('@/features/code-graph/pages/CodeGraphPage', async () => {
  const router = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    default: () => {
      const params = router.useParams()

      return <div>code-graph:{params.kbId}</div>
    },
  }
})

vi.mock('@/features/agents/pages/AgentCanvasPage', async () => {
  const router = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    default: () => {
      const params = router.useParams()
      const location = router.useLocation()

      return <div>agent-canvas:{params.id}:{location.search}</div>
    },
  }
})

vi.mock('@/components/ErrorPage', async () => {
  const router = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    default: ({ code }: { code: number }) => {
      const location = router.useLocation()

      return <div>error-page:{code}:{location.pathname}</div>
    },
  }
})

// Stub untouched lazy route modules so the App router can load without pulling
// full feature trees into this regression harness.
vi.mock('@/features/users/pages/UserManagementPage', () => ({ default: () => null }))
vi.mock('@/features/users/pages/UserDetailPage', () => ({ default: () => null }))
vi.mock('@/features/permissions/pages/PermissionManagementPage', () => ({ default: () => null }))
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
    expect(screen.getByTestId('layout-shell').getAttribute('data-nav')).toContain('nav.dataStudio')
  })

  it('keeps the hidden code-graph route inside the admin shell', async () => {
    await renderApp(buildAdminCodeGraphPath('kb-123'))

    expect(await screen.findByText('code-graph:kb-123')).toBeInTheDocument()
    expect(screen.getByTestId('layout-shell').getAttribute('data-nav')).toContain('nav.dataStudio')
  })

  it('keeps the hidden agent canvas new route under the admin tree', async () => {
    await renderApp(`${buildAdminAgentCanvasPath('new')}?mode=chat`)

    expect(await screen.findByText('agent-canvas:new:?mode=chat')).toBeInTheDocument()
    expect(screen.getByTestId('layout-shell').getAttribute('data-nav')).toContain('nav.agentStudio')
  })

  it.each([
    '/iam/users',
    '/data-studio/knowledge-base',
  ])('sends removed legacy admin path %s to /404', async (legacyPath) => {
    await renderApp(legacyPath)

    expect(await screen.findByText(`error-page:404:/404`)).toBeInTheDocument()
  })
})
