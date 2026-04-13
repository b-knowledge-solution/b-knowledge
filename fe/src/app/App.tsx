/**
 * @fileoverview Main application router.
 *
 * Defines public routes plus the authenticated user and admin shells. The
 * admin shell is explicitly role-gated and mounted under `/admin/...`.
 *
 * @module app/App
 */

import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import {
  ADMIN_HOME_PATH,
  ADMIN_AGENT_CANVAS_ROUTE,
  ADMIN_AGENTS_ROUTE,
  ADMIN_AUDIT_LOG_ROUTE,
  ADMIN_BROADCAST_MESSAGES_ROUTE,

  
  ADMIN_CODE_GRAPH_ROUTE,
  ADMIN_DASHBOARD_ROUTE,
  ADMIN_DATASETS_ROUTE,
  ADMIN_DOCUMENT_REVIEW_ROUTE,
  ADMIN_HISTORIES_ROUTE,
  ADMIN_KNOWLEDGE_BASE_ROUTE,
  ADMIN_LLM_PROVIDERS_ROUTE,
  ADMIN_MEMORY_DETAIL_ROUTE,
  ADMIN_MEMORY_ROUTE,
  ADMIN_PERMISSIONS_ROUTE,

  
  ADMIN_SYSTEM_MONITOR_ROUTE,
  ADMIN_SYSTEM_TOOLS_ROUTE,
  ADMIN_TEAMS_ROUTE,
  ADMIN_TOKENIZER_ROUTE,
  ADMIN_USERS_ROUTE,
  ADMIN_USER_DETAIL_ROUTE,
  toAdminChildPath,
} from '@/app/adminRoutes'
import { Providers } from '@/app/Providers'
import { FeatureErrorBoundary } from '@/components/ErrorBoundary'
import { config } from '@/config'
import { AdminRoute, ProtectedRoute } from '@/features/auth'
import MainLayout from '@/layouts/MainLayout'
import { ADMIN_SIDEBAR_NAV, getRoutePermission, USER_SIDEBAR_NAV } from '@/layouts/sidebarNav'
import { useAbilityLoading } from '@/lib/ability'
import { useHasPermission } from '@/lib/permissions'
import '@/i18n'

/**
 * @description Resolves the permission mapped to the current pathname and redirects on denial
 * @param {{ requiredPermission: ReturnType<typeof getRoutePermission>; children: React.ReactNode }} props - Guard inputs
 * @returns {JSX.Element} Children when allowed or a redirect to `/403`
 */
function PermissionGate({
  requiredPermission,
  children,
}: {
  requiredPermission: ReturnType<typeof getRoutePermission>
  children: ReactNode
}) {
  const isAbilityLoading = useAbilityLoading()
  const hasRequiredPermission = useHasPermission(
    requiredPermission as NonNullable<typeof requiredPermission>,
  )

  if (isAbilityLoading) {
    return null
  }

  if (!hasRequiredPermission) {
    return <Navigate to="/403" replace />
  }

  return <>{children}</>
}

/**
 * @description Route guard that looks up the current pathname in the route-permission registry
 * @param {{ children: React.ReactNode }} props - Guarded child route element
 * @returns {JSX.Element} Children when unrestricted or authorized, otherwise a redirect
 */
function NavRoleGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const requiredPermission = getRoutePermission(pathname)

  if (!requiredPermission) {
    return <>{children}</>
  }

  return <PermissionGate requiredPermission={requiredPermission}>{children}</PermissionGate>
}

const LandingPage = lazy(() => import('@/features/landing/pages/LandingPage'))
const AiChatPage = lazy(() => import('@/features/chat/pages/ChatPage'))
const AiSearchPage = lazy(() => import('@/features/search/pages/SearchPage'))
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'))
const LogoutPage = lazy(() => import('@/features/auth/pages/LogoutPage'))
const UserManagementPage = lazy(() => import('@/features/users/pages/UserManagementPage'))
const UserDetailPage = lazy(() => import('@/features/users/pages/UserDetailPage'))
const PermissionManagementPage = lazy(() => import('@/features/permissions/pages/PermissionManagementPage'))
const TeamManagementPage = lazy(() => import('@/features/teams/pages/TeamManagementPage'))
const SystemToolsPage = lazy(() => import('@/features/system/pages/SystemToolsPage'))
const SystemMonitorPage = lazy(() => import('@/features/system/pages/SystemMonitorPage'))
const ErrorPage = lazy(() => import('@/components/ErrorPage'))
const AuditLogPage = lazy(() => import('@/features/audit/pages/AuditLogPage'))
const TokenizerPage = lazy(() => import('@/features/ai/pages/TokenizerPage'))
const BroadcastMessagePage = lazy(() => import('@/features/broadcast/pages/BroadcastMessagePage'))
const HistoriesPage = lazy(() => import('@/features/histories/pages/HistoriesPage'))
const AdminDashboardPage = lazy(() => import('@/features/dashboard/pages/AdminDashboardPage'))
const DatasetsPage = lazy(() => import('@/features/datasets/pages/DatasetsPage'))
const DatasetDetailPage = lazy(() => import('@/features/datasets/pages/DatasetDetailPage'))
const KnowledgeBaseListPage = lazy(() => import('@/features/knowledge-base/pages/KnowledgeBaseListPage'))
const KnowledgeBaseDetailPage = lazy(() => import('@/features/knowledge-base/pages/KnowledgeBaseDetailPage'))
const LLMProviderPage = lazy(() => import('@/features/llm-provider/pages/LLMProviderPage'))
const DocumentReviewerPage = lazy(() => import('@/features/datasets/pages/DocumentReviewerPage'))
const ChunkDetailPage = lazy(() => import('@/features/datasets/pages/ChunkDetailPage'))
const AgentListPage = lazy(() => import('@/features/agents/pages/AgentListPage'))
const AgentCanvasPage = lazy(() => import('@/features/agents/pages/AgentCanvasPage'))
const MemoryListPage = lazy(() => import('@/features/memory/pages/MemoryListPage'))
const MemoryDetailPage = lazy(() => import('@/features/memory/pages/MemoryDetailPage'))
const CodeGraphPage = lazy(() => import('@/features/code-graph/pages/CodeGraphPage'))
const SearchSharePage = lazy(() =>
  import('@/features/search/pages/SearchSharePage').then((module) => ({ default: module.SearchSharePage })),
)

/**
 * @description Displays a full-screen loading spinner while lazy routes resolve
 * @returns {JSX.Element} Suspense fallback content
 */
const PageLoader = () => (
  <div data-suspense-fallback="true" className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
  </div>
)

/**
 * @description Computes the default user-shell landing page from enabled feature flags
 * @returns {string} Authenticated default path outside the admin shell
 */
function getDefaultPath(): string {
  if (config.features.enableAiChat) {
    return '/chat'
  }

  if (config.features.enableAiSearch) {
    return '/search'
  }

  return '/chat'
}

/**
 * @description Root application component with public routes plus user/admin authenticated shells
 * @returns {JSX.Element} Full routed application tree
 */
function App() {
  useEffect(() => {
    let link = document.querySelector('link[rel~="icon"]') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }

    link.href = '/favicon.svg'
  }, [])

  return (
    <Providers>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/logout" element={<LogoutPage />} />

          <Route
            element={(
              <ProtectedRoute>
                <Outlet />
              </ProtectedRoute>
            )}
          >
            <Route element={<MainLayout navEntries={USER_SIDEBAR_NAV} />}>
              <Route path="/app" element={<Navigate to={getDefaultPath()} replace />} />

              {config.features.enableAiChat && (
                <Route path="/chat" element={<FeatureErrorBoundary><AiChatPage /></FeatureErrorBoundary>} />
              )}

              {config.features.enableAiSearch && (
                <>
                  <Route path="/search" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />
                  <Route path="/search/apps/:appId" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />
                </>
              )}
            </Route>

            <Route
              path="/admin"
              element={(
                <AdminRoute>
                  <MainLayout navEntries={ADMIN_SIDEBAR_NAV} />
                </AdminRoute>
              )}
            >
              <Route index element={<Navigate to={ADMIN_HOME_PATH} replace />} />

              <Route path={toAdminChildPath(ADMIN_DATASETS_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><DatasetsPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(`${ADMIN_DATASETS_ROUTE}/:id`)} element={<FeatureErrorBoundary><NavRoleGuard><DatasetDetailPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_DOCUMENT_REVIEW_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><DocumentReviewerPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(`${ADMIN_DOCUMENT_REVIEW_ROUTE}/chunks`)} element={<FeatureErrorBoundary><NavRoleGuard><ChunkDetailPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_KNOWLEDGE_BASE_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><KnowledgeBaseListPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(`${ADMIN_KNOWLEDGE_BASE_ROUTE}/:knowledgeBaseId`)} element={<FeatureErrorBoundary><NavRoleGuard><KnowledgeBaseDetailPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_CODE_GRAPH_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><CodeGraphPage /></NavRoleGuard></FeatureErrorBoundary>} />

              <Route path={toAdminChildPath(ADMIN_AGENTS_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><AgentListPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_AGENT_CANVAS_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><AgentCanvasPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_MEMORY_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><MemoryListPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_MEMORY_DETAIL_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><MemoryDetailPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_HISTORIES_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><HistoriesPage /></NavRoleGuard></FeatureErrorBoundary>} />

              <Route path={toAdminChildPath(ADMIN_USERS_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><UserManagementPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_USER_DETAIL_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><UserDetailPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_TEAMS_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><TeamManagementPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_PERMISSIONS_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><PermissionManagementPage /></NavRoleGuard></FeatureErrorBoundary>} />

              <Route path={toAdminChildPath(ADMIN_AUDIT_LOG_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><AuditLogPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_SYSTEM_TOOLS_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><SystemToolsPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_SYSTEM_MONITOR_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><SystemMonitorPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_TOKENIZER_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><TokenizerPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_BROADCAST_MESSAGES_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><BroadcastMessagePage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_LLM_PROVIDERS_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><LLMProviderPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path={toAdminChildPath(ADMIN_DASHBOARD_ROUTE)} element={<FeatureErrorBoundary><NavRoleGuard><AdminDashboardPage /></NavRoleGuard></FeatureErrorBoundary>} />
            </Route>
          </Route>

          <Route path="/public/chat" element={<FeatureErrorBoundary><AiChatPage /></FeatureErrorBoundary>} />
          <Route path="/public/search" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />
          <Route path="/public/search/apps/:appId" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />
          <Route path="/search/share/:token" element={<FeatureErrorBoundary><SearchSharePage /></FeatureErrorBoundary>} />

          <Route path="/403" element={<ErrorPage code={403} />} />
          <Route path="/404" element={<ErrorPage code={404} />} />
          <Route path="/500" element={<ErrorPage code={500} />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </Suspense>
    </Providers>
  )
}

export default App
