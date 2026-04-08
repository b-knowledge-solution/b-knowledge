/**
 * @fileoverview Main application component with routing configuration.
 *
 * This module defines the application's route structure, including:
 * - Public routes (login, logout)
 * - Protected routes requiring authentication
 * - Admin-only routes (user management, system tools)
 * - Role-based routes (storage for admin/manager)
 *
 * Uses React Router for navigation and lazy loading for code splitting.
 *
 * @module App
 */

import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth';
import { Providers } from '@/app/Providers';
import Layout from '@/layouts/MainLayout';
import { config } from '@/config';
import { FeatureErrorBoundary } from '@/components/ErrorBoundary'
import { getRoutePermission } from '@/layouts/sidebarNav'
import { useHasPermission } from '@/lib/permissions'
import '@/i18n';

// ============================================================================
// NavRoleGuard — auto-resolves required permission from sidebarNav config
// ============================================================================

/**
 * @description Route guard that reads the required permission key from sidebarNav.ts config
 *   and checks it via useHasPermission. Resolves the current pathname against the nav
 *   permission map (exact + prefix match). Redirects to /403 when the user lacks the key.
 *
 *   Phase 4: migrated from role-set membership to catalog permission keys. The guard
 *   component name is preserved for call-site stability; call sites in this file still
 *   wrap routes as `<NavRoleGuard>` with no explicit prop — the required permission is
 *   resolved from the route path.
 *
 * @param {{ children: React.ReactNode }} props - Child content to render when authorized
 * @returns {JSX.Element} The children when authorized, or a redirect to /403
 */
function PermissionGate({
  requiredPermission,
  children,
}: {
  requiredPermission: ReturnType<typeof getRoutePermission>;
  children: React.ReactNode;
}) {
  // requiredPermission is guaranteed defined here by the parent guard.
  const hasRequired = useHasPermission(requiredPermission as NonNullable<typeof requiredPermission>);
  if (!hasRequired) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}

function NavRoleGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const requiredPermission = getRoutePermission(pathname);

  // No permission mapped for this path → unrestricted.
  if (!requiredPermission) {
    return <>{children}</>;
  }

  return <PermissionGate requiredPermission={requiredPermission}>{children}</PermissionGate>;
}


// ============================================================================
// Lazy-loaded Pages (Code Splitting)
// ============================================================================

const LandingPage = lazy(() => import('@/features/landing/pages/LandingPage'));
const AiChatPage = lazy(() => import('@/features/chat/pages/ChatPage'));
const AiSearchPage = lazy(() => import('@/features/search/pages/SearchPage'));
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const LogoutPage = lazy(() => import('@/features/auth/pages/LogoutPage'));
const UserManagementPage = lazy(() => import('@/features/users/pages/UserManagementPage'));
const PermissionManagementPage = lazy(() => import('@/features/users/pages/PermissionManagementPage'));
const TeamManagementPage = lazy(() => import('@/features/teams/pages/TeamManagementPage'));
const SystemToolsPage = lazy(() => import('@/features/system/pages/SystemToolsPage'));
const SystemMonitorPage = lazy(() => import('@/features/system/pages/SystemMonitorPage'));
const ErrorPage = lazy(() => import('@/components/ErrorPage'));
const AuditLogPage = lazy(() => import('@/features/audit/pages/AuditLogPage'));
const TokenizerPage = lazy(() => import('@/features/ai/pages/TokenizerPage'));
const BroadcastMessagePage = lazy(() => import('@/features/broadcast/pages/BroadcastMessagePage'));
const HistoriesPage = lazy(() => import('@/features/histories/pages/HistoriesPage'));
const GlossaryPage = lazy(() => import('@/features/glossary/pages/GlossaryPage'));
const AdminDashboardPage = lazy(() => import('@/features/dashboard/pages/AdminDashboardPage'));
const DatasetsPage = lazy(() => import('@/features/datasets/pages/DatasetsPage'));
const DatasetDetailPage = lazy(() => import('@/features/datasets/pages/DatasetDetailPage'));
const ChatAssistantManagementPage = lazy(() => import('@/features/chat/pages/ChatAssistantManagementPage'));
const SearchAppManagementPage = lazy(() => import('@/features/search/pages/SearchAppManagementPage'));
const KnowledgeBaseListPage = lazy(() => import('@/features/knowledge-base/pages/KnowledgeBaseListPage'));
const KnowledgeBaseDetailPage = lazy(() => import('@/features/knowledge-base/pages/KnowledgeBaseDetailPage'));
const LLMProviderPage = lazy(() => import('@/features/llm-provider/pages/LLMProviderPage'));
const DocumentReviewerPage = lazy(() => import('@/features/datasets/pages/DocumentReviewerPage'));
const ChunkDetailPage = lazy(() => import('@/features/datasets/pages/ChunkDetailPage'));
const AgentListPage = lazy(() => import('@/features/agents/pages/AgentListPage'));
const AgentCanvasPage = lazy(() => import('@/features/agents/pages/AgentCanvasPage'));
const MemoryListPage = lazy(() => import('@/features/memory/pages/MemoryListPage'));
const MemoryDetailPage = lazy(() => import('@/features/memory/pages/MemoryDetailPage'));
const CodeGraphPage = lazy(() => import('@/features/code-graph/pages/CodeGraphPage'));
const SearchSharePage = lazy(() =>
  import('@/features/search/pages/SearchSharePage').then(m => ({ default: m.SearchSharePage }))
);

// ============================================================================
// Loading Component
// ============================================================================

/**
 * Full-screen loader shown during initial app load or non-layout routes.
 * Layout pages use their own ContentLoader inside the layout.
 */
/**
 * @description Displays a full-screen loading spinner during lazy-loaded page transitions
 * @returns {JSX.Element} Centered spinner with themed background
 */
const PageLoader = () => (
  <div data-suspense-fallback="true" className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
  </div>
);

// ============================================================================
// Main App Component
// ============================================================================

/**
 * @description Root application component that defines all routes, wraps them with providers, and manages favicon setup
 * @returns {JSX.Element} Complete application with routing, providers, and lazy-loaded pages
 */
function App() {
  // Set the favicon dynamically on mount
  useEffect(() => {
    let link: HTMLLinkElement = document.querySelector('link[rel~="icon"]') as HTMLLinkElement;
    // Create the link element if it doesn't exist in the HTML
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = '/favicon.svg';
  }, []);

  /**
   * @description Determines the default landing path based on enabled feature flags
   * @returns {string} The default route path for authenticated users
   */
  const getDefaultPath = () => {
    // Prefer chat if enabled, then search, fallback to chat
    if (config.features.enableAiChat) return '/chat';
    if (config.features.enableAiSearch) return '/search';
    return '/chat';
  };

  return (
    <Providers>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes — landing page is the root */}
          <Route index element={<LandingPage />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/logout" element={<LogoutPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
            <Route element={<Layout />}>
              <Route path="/app" element={<Navigate to={getDefaultPath()} replace />} />

              {/* Chat routes */}
              {config.features.enableAiChat && (
                <Route path="chat" element={<FeatureErrorBoundary><AiChatPage /></FeatureErrorBoundary>} />
              )}
              {/* Search routes */}
              {config.features.enableAiSearch && (
                <>
                  <Route path="search" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />
                  <Route path="search/apps/:appId" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />
                </>
              )}
              {/* ── All role-gated routes use NavRoleGuard ────────────────── */}
              {/* Roles are resolved automatically from sidebarNav.ts config */}

              {/* Agent Studio */}
              <Route path="agent-studio/agents" element={<FeatureErrorBoundary><NavRoleGuard><AgentListPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="agent-studio/agents/:id" element={<FeatureErrorBoundary><NavRoleGuard><AgentCanvasPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="agent-studio/memory" element={<FeatureErrorBoundary><NavRoleGuard><MemoryListPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="agent-studio/memory/:id" element={<FeatureErrorBoundary><NavRoleGuard><MemoryDetailPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="agent-studio/chat-assistants" element={<FeatureErrorBoundary><NavRoleGuard><ChatAssistantManagementPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="agent-studio/search-apps" element={<FeatureErrorBoundary><NavRoleGuard><SearchAppManagementPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="agent-studio/histories" element={<FeatureErrorBoundary><NavRoleGuard><HistoriesPage /></NavRoleGuard></FeatureErrorBoundary>} />

              {/* Glossary */}
              <Route path="glossary" element={<FeatureErrorBoundary><NavRoleGuard><GlossaryPage /></NavRoleGuard></FeatureErrorBoundary>} />

              {/* Data Studio */}
              <Route path="data-studio/datasets" element={<FeatureErrorBoundary><NavRoleGuard><DatasetsPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="data-studio/datasets/:id" element={<FeatureErrorBoundary><NavRoleGuard><DatasetDetailPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="data-studio/datasets/:id/documents/:docId" element={<FeatureErrorBoundary><NavRoleGuard><DocumentReviewerPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="data-studio/datasets/:id/documents/:docId/chunks" element={<FeatureErrorBoundary><NavRoleGuard><ChunkDetailPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="data-studio/knowledge-base" element={<FeatureErrorBoundary><NavRoleGuard><KnowledgeBaseListPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="data-studio/knowledge-base/:knowledgeBaseId" element={<FeatureErrorBoundary><NavRoleGuard><KnowledgeBaseDetailPage /></NavRoleGuard></FeatureErrorBoundary>} />

              {/* Code Graph */}
              <Route path="code-graph/:kbId" element={<FeatureErrorBoundary><NavRoleGuard><CodeGraphPage /></NavRoleGuard></FeatureErrorBoundary>} />


              {/* IAM */}
              <Route path="iam/users" element={<FeatureErrorBoundary><NavRoleGuard><UserManagementPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="iam/teams" element={<FeatureErrorBoundary><NavRoleGuard><TeamManagementPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="iam/permissions" element={<FeatureErrorBoundary><NavRoleGuard><PermissionManagementPage /></NavRoleGuard></FeatureErrorBoundary>} />

              {/* System */}
              <Route path="system/audit-log" element={<FeatureErrorBoundary><NavRoleGuard><AuditLogPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="system/system-tools" element={<FeatureErrorBoundary><NavRoleGuard><SystemToolsPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="system/system-monitor" element={<FeatureErrorBoundary><NavRoleGuard><SystemMonitorPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="system/tokenizer" element={<FeatureErrorBoundary><NavRoleGuard><TokenizerPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="system/broadcast-messages" element={<FeatureErrorBoundary><NavRoleGuard><BroadcastMessagePage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="system/llm-providers" element={<FeatureErrorBoundary><NavRoleGuard><LLMProviderPage /></NavRoleGuard></FeatureErrorBoundary>} />
              <Route path="system/dashboard" element={<FeatureErrorBoundary><NavRoleGuard><AdminDashboardPage /></NavRoleGuard></FeatureErrorBoundary>} />

            </Route>
          </Route>

          {/* Public access routes (no auth required — for is_public apps) */}
          <Route path="/public/chat" element={<FeatureErrorBoundary><AiChatPage /></FeatureErrorBoundary>} />
          <Route path="/public/search" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />
          <Route path="/public/search/apps/:appId" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />

          {/* Embed share page — standalone, no layout or auth wrapper */}
          <Route path="/search/share/:token" element={<FeatureErrorBoundary><SearchSharePage /></FeatureErrorBoundary>} />

          {/* Error routes */}
          <Route path="/403" element={<ErrorPage code={403} />} />
          <Route path="/404" element={<ErrorPage code={404} />} />
          <Route path="/500" element={<ErrorPage code={500} />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </Suspense>
    </Providers>
  );
}

export default App;
