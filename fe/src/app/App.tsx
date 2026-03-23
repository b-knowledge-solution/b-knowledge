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
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ProtectedRoute, AdminRoute, RoleRoute } from '@/features/auth';
import { Providers } from '@/app/Providers';
import Layout from '@/layouts/MainLayout';
import { config } from '@/config';
import { FeatureErrorBoundary } from '@/components/ErrorBoundary'
import '@/i18n';

// Re-export globalMessage for backward compatibility
export { globalMessage } from '@/app/Providers';

// ============================================================================
// Lazy-loaded Pages (Code Splitting)
// ============================================================================

const LandingPage = lazy(() => import('@/features/landing/pages/LandingPage'));
const AiChatPage = lazy(() => import('@/features/chat/pages/ChatPage'));
const AiSearchPage = lazy(() => import('@/features/search/pages/SearchPage'));
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const LogoutPage = lazy(() => import('@/features/auth/pages/LogoutPage'));
const UserManagementPage = lazy(() => import('@/features/users/pages/UserManagementPage'));
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
const ProjectListPage = lazy(() => import('@/features/projects/pages/ProjectListPage'));
const ProjectDetailPage = lazy(() => import('@/features/projects/pages/ProjectDetailPage'));
const LLMProviderPage = lazy(() => import('@/features/llm-provider/pages/LLMProviderPage'));
const DocumentReviewerPage = lazy(() => import('@/features/datasets/pages/DocumentReviewerPage'));
const ChunkDetailPage = lazy(() => import('@/features/datasets/pages/ChunkDetailPage'));
const ApiKeysPage = lazy(() => import('@/features/api-keys/pages/ApiKeysPage'));
const AgentListPage = lazy(() => import('@/features/agents/pages/AgentListPage'));
const AgentCanvasPage = lazy(() => import('@/features/agents/pages/AgentCanvasPage'));
const MemoryListPage = lazy(() => import('@/features/memory/pages/MemoryListPage'));

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
                <Route path="search" element={<FeatureErrorBoundary><AiSearchPage /></FeatureErrorBoundary>} />
              )}
              {/* Agent routes */}
              <Route path="agents" element={<FeatureErrorBoundary><AgentListPage /></FeatureErrorBoundary>} />
              <Route path="agents/:id" element={<FeatureErrorBoundary><AgentCanvasPage /></FeatureErrorBoundary>} />

              {/* Memory route */}
              <Route path="memory" element={<FeatureErrorBoundary><MemoryListPage /></FeatureErrorBoundary>} />

              {/* Glossary route */}
              <Route path="glossary" element={
                <FeatureErrorBoundary>
                  <RoleRoute allowedRoles={['super-admin', 'admin', 'leader']}>
                    <GlossaryPage />
                  </RoleRoute>
                </FeatureErrorBoundary>
              } />

              {/* Dataset routes */}
              <Route path="data-studio/datasets" element={
                <FeatureErrorBoundary>
                  <RoleRoute allowedRoles={['super-admin', 'admin', 'leader']}>
                    <DatasetsPage />
                  </RoleRoute>
                </FeatureErrorBoundary>
              } />
              <Route path="data-studio/datasets/:id" element={
                <FeatureErrorBoundary>
                  <RoleRoute allowedRoles={['super-admin', 'admin', 'leader']}>
                    <DatasetDetailPage />
                  </RoleRoute>
                </FeatureErrorBoundary>
              } />
              <Route path="data-studio/datasets/:id/documents/:docId" element={
                <FeatureErrorBoundary>
                  <RoleRoute allowedRoles={['super-admin', 'admin', 'leader']}>
                    <DocumentReviewerPage />
                  </RoleRoute>
                </FeatureErrorBoundary>
              } />
              <Route path="data-studio/datasets/:id/documents/:docId/chunks" element={
                <FeatureErrorBoundary>
                  <RoleRoute allowedRoles={['super-admin', 'admin', 'leader']}>
                    <ChunkDetailPage />
                  </RoleRoute>
                </FeatureErrorBoundary>
              } />

              {/* Project routes */}
              <Route path="data-studio/projects" element={
                <FeatureErrorBoundary>
                  <RoleRoute allowedRoles={['super-admin', 'admin', 'leader']}>
                    <ProjectListPage />
                  </RoleRoute>
                </FeatureErrorBoundary>
              } />
              <Route path="data-studio/projects/:projectId" element={
                <FeatureErrorBoundary>
                  <RoleRoute allowedRoles={['super-admin', 'admin', 'leader']}>
                    <ProjectDetailPage />
                  </RoleRoute>
                </FeatureErrorBoundary>
              } />

              {/* IAM routes */}
              <Route path="iam/users" element={
                <FeatureErrorBoundary>
                  <AdminRoute>
                    <UserManagementPage />
                  </AdminRoute>
                </FeatureErrorBoundary>
              } />

              <Route path="iam/teams" element={
                <FeatureErrorBoundary>
                  <AdminRoute>
                    <TeamManagementPage />
                  </AdminRoute>
                </FeatureErrorBoundary>
              } />

              {/* Admin routes */}
              <Route path="admin/audit-log" element={<FeatureErrorBoundary><AdminRoute><AuditLogPage /></AdminRoute></FeatureErrorBoundary>} />
              <Route path="admin/system-tools" element={<FeatureErrorBoundary><AdminRoute><SystemToolsPage /></AdminRoute></FeatureErrorBoundary>} />
              <Route path="admin/system-monitor" element={<FeatureErrorBoundary><AdminRoute><SystemMonitorPage /></AdminRoute></FeatureErrorBoundary>} />
              <Route path="admin/tokenizer" element={<FeatureErrorBoundary><AdminRoute><TokenizerPage /></AdminRoute></FeatureErrorBoundary>} />
              <Route path="admin/broadcast-messages" element={<FeatureErrorBoundary><AdminRoute><BroadcastMessagePage /></AdminRoute></FeatureErrorBoundary>} />
              <Route path="admin/dashboard" element={<FeatureErrorBoundary><AdminRoute><AdminDashboardPage /></AdminRoute></FeatureErrorBoundary>} />

              {/* Data Studio — Chat & Search config, Histories, LLM Providers (admin) */}
              <Route path="data-studio/chat-assistants" element={<FeatureErrorBoundary><AdminRoute><ChatAssistantManagementPage /></AdminRoute></FeatureErrorBoundary>} />
              <Route path="data-studio/search-apps" element={<FeatureErrorBoundary><AdminRoute><SearchAppManagementPage /></AdminRoute></FeatureErrorBoundary>} />
              <Route path="data-studio/histories" element={<FeatureErrorBoundary><AdminRoute><HistoriesPage /></AdminRoute></FeatureErrorBoundary>} />
              <Route path="data-studio/llm-providers" element={<FeatureErrorBoundary><AdminRoute><LLMProviderPage /></AdminRoute></FeatureErrorBoundary>} />

              {/* API Keys (all authenticated users) */}
              <Route path="api-keys" element={
                <FeatureErrorBoundary>
                  <ApiKeysPage />
                </FeatureErrorBoundary>
              } />
            </Route>
          </Route>

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
