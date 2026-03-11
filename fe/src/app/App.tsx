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
import '@/i18n';
import icon from '@/assets/icon.png';

// Re-export globalMessage for backward compatibility
export { globalMessage } from '@/app/Providers';

// ============================================================================
// Lazy-loaded Pages (Code Splitting)
// ============================================================================

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
const ChatDialogManagementPage = lazy(() => import('@/features/chat/pages/ChatDialogManagementPage'));
const SearchAppManagementPage = lazy(() => import('@/features/search/pages/SearchAppManagementPage'));
const ProjectListPage = lazy(() => import('@/features/projects/pages/ProjectListPage'));
const ProjectDetailPage = lazy(() => import('@/features/projects/pages/ProjectDetailPage'));
const LLMProviderPage = lazy(() => import('@/features/llm-provider/pages/LLMProviderPage'));

// ============================================================================
// Loading Component
// ============================================================================

/**
 * Full-screen loader shown during initial app load or non-layout routes.
 * Layout pages use their own ContentLoader inside the layout.
 */
const PageLoader = () => (
  <div data-suspense-fallback="true" className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
  </div>
);

// ============================================================================
// Main App Component
// ============================================================================

function App() {
  /** Set the icon of the app */
  useEffect(() => {
    let link: HTMLLinkElement = document.querySelector('link[rel~="icon"]') as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = icon;
  }, []);

  const getDefaultPath = () => {
    if (config.features.enableAiChat) return '/chat';
    if (config.features.enableAiSearch) return '/search';
    return '/chat';
  };

  return (
    <Providers>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/logout" element={<LogoutPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to={getDefaultPath()} replace />} />

              {/* Chat routes */}
              {config.features.enableAiChat && (
                <Route path="chat" element={<AiChatPage />} />
              )}
              {/* Search routes */}
              {config.features.enableAiSearch && (
                <Route path="search" element={<AiSearchPage />} />
              )}
              {/* Knowledge Base routes */}

              <Route path="knowledge-base/glossary" element={
                <RoleRoute allowedRoles={['admin', 'leader']}>
                  <GlossaryPage />
                </RoleRoute>
              } />

              {/* Dataset routes */}
              <Route path="datasets" element={
                <RoleRoute allowedRoles={['admin', 'leader']}>
                  <DatasetsPage />
                </RoleRoute>
              } />
              <Route path="datasets/:id" element={
                <RoleRoute allowedRoles={['admin', 'leader']}>
                  <DatasetDetailPage />
                </RoleRoute>
              } />

              {/* Project routes */}
              <Route path="knowledge-base/projects" element={
                <RoleRoute allowedRoles={['admin', 'leader']}>
                  <ProjectListPage />
                </RoleRoute>
              } />
              <Route path="knowledge-base/projects/:projectId" element={
                <RoleRoute allowedRoles={['admin', 'leader']}>
                  <ProjectDetailPage />
                </RoleRoute>
              } />

              {/* IAM routes */}
              <Route path="iam/users" element={
                <AdminRoute>
                  <UserManagementPage />
                </AdminRoute>
              } />

              <Route path="iam/teams" element={
                <AdminRoute>
                  <TeamManagementPage />
                </AdminRoute>
              } />

              {/* Admin routes */}
              <Route path="admin/audit-log" element={<AdminRoute><AuditLogPage /></AdminRoute>} />
              <Route path="admin/system-tools" element={<AdminRoute><SystemToolsPage /></AdminRoute>} />
              <Route path="admin/system-monitor" element={<AdminRoute><SystemMonitorPage /></AdminRoute>} />
              <Route path="admin/tokenizer" element={<AdminRoute><TokenizerPage /></AdminRoute>} />
              <Route path="admin/broadcast-messages" element={<AdminRoute><BroadcastMessagePage /></AdminRoute>} />
              <Route path="admin/histories" element={<AdminRoute><HistoriesPage /></AdminRoute>} />
              <Route path="admin/chat-dialogs" element={<AdminRoute><ChatDialogManagementPage /></AdminRoute>} />
              <Route path="admin/search-apps" element={<AdminRoute><SearchAppManagementPage /></AdminRoute>} />
              <Route path="admin/dashboard" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
              <Route path="admin/llm-providers" element={<AdminRoute><LLMProviderPage /></AdminRoute>} />
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
