/**
 * @fileoverview Shared authenticated application shell.
 *
 * Composes the shell-specific sidebar and the shared header/banner layout while
 * route metadata controls page chrome and content padding.
 *
 * @module layouts/MainLayout
 */

import { Outlet, useLocation } from 'react-router-dom'
import { getRouteMetadata } from '@/app/routeConfig'
import BroadcastBanner from '@/features/broadcast/components/BroadcastBanner'
import type { SidebarNavEntry } from './sidebarNav'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

/**
 * @description Props for the shared authenticated layout shell
 */
interface MainLayoutProps {
  /** Navigation registry for the current shell */
  navEntries: SidebarNavEntry[]
}

/**
 * @description Renders the authenticated shell with shell-specific navigation and shared content chrome
 * @param {MainLayoutProps} props - Layout configuration including the sidebar nav registry
 * @returns {JSX.Element} Full-screen layout with sidebar, banner, header, and nested route outlet
 */
function MainLayout({ navEntries }: MainLayoutProps) {
  const location = useLocation()
  const routeMetadata = getRouteMetadata(location.pathname)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar navEntries={navEntries} />

      <main className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-850 dark:via-slate-800 dark:to-slate-900 overflow-hidden">
        <BroadcastBanner />
        <Header />
        {/* Let full-bleed routes manage their own padding and overflow behavior. */}
        <div className={`flex-1 overflow-hidden ${routeMetadata.fullBleed ? '' : 'p-8 overflow-auto'}`}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default MainLayout
