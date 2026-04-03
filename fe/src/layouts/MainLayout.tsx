/**
 * @fileoverview Main application layout component.
 *
 * Composes the Sidebar and Header into the overall app shell.
 * Content area behavior (padding, overflow) is driven by route config.
 *
 * @module layouts/MainLayout
 */

import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { getRouteMetadata } from '@/app/routeConfig';
import BroadcastBanner from '@/features/broadcast/components/BroadcastBanner';

// ============================================================================
// Main Layout Component
// ============================================================================

/**
 * @description Renders the main application shell with sidebar navigation, header bar, broadcast banner, and content outlet
 * @returns {JSX.Element} Full-screen layout with sidebar and content area
 */
function Layout() {
  const location = useLocation();
  // Determine layout behavior (padding, overflow) based on the current route
  const routeMetadata = getRouteMetadata(location.pathname);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-850 dark:via-slate-800 dark:to-slate-900 overflow-hidden">
        <BroadcastBanner />
        <Header />
        {/* Apply padding only for non-fullBleed routes; fullBleed pages manage their own padding */}
        <div className={`flex-1 overflow-hidden ${routeMetadata.fullBleed ? '' : 'p-8 overflow-auto'}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;
