/**
 * @fileoverview Composable providers wrapper.
 *
 * Flattens the nested provider tree into a single component.
 * Add new app-wide providers here instead of nesting in App.tsx.
 *
 * @module app/Providers
 */

import { ReactNode } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/features/auth';
import { SettingsProvider } from '@/app/contexts/SettingsContext';

import { GuidelineProvider } from '@/features/guideline';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { HeaderActionsProvider } from '@/components/HeaderActions';
import { NavigationProvider } from '@/components/NavigationLoader'
import { useSocketQueryInvalidation } from '@/hooks/useSocket';
import SettingsDialog from '@/components/SettingsDialog';

// ============================================================================
// Global Notification Bridge
// ============================================================================

/**
 * Global notification API using Sonner toast.
 * Provides the same interface as the previous Ant Design message bridge
 * so non-component code (e.g. TanStack Query mutations) can surface
 * notifications without refactoring.
 */
export const globalMessage = {
  success: (content: string) => toast.success(content),
  error: (content: string) => toast.error(content),
  info: (content: string) => toast.info(content),
  warning: (content: string) => toast.warning(content),
};

// ============================================================================
// Socket → Query Bridge
// ============================================================================

/**
 * Bridges socket events to TanStack Query cache invalidation.
 *
 * @description Renders nothing; exists solely to call the
 * `useSocketQueryInvalidation` hook inside the React provider tree.
 */
function SocketQueryBridge() {
  useSocketQueryInvalidation()
  return null
}

// ============================================================================
// Providers Component
// ============================================================================

/**
 * @description Props for the root Providers wrapper
 */
interface ProvidersProps {
  /** Application content to wrap with providers */
  children: ReactNode;
}

/**
 * Root-level providers wrapper.
 *
 * Composes all application-wide context providers into a flat structure.
 * When adding a new global provider, insert it here instead of nesting
 * further in App.tsx or other components.
 *
 * Provider order matters – outer providers are available to inner ones:
 * 1. AuthProvider (user session)
 * 2. SettingsProvider (theme, language)
 * 3. GuidelineProvider (in-app help)
 * 4. ConfirmProvider (confirmation dialogs)
 * 5. HeaderActionsProvider (page-level header actions)
 * 6. NavigationProvider (loading overlay)
 */
/**
 * @description Composes all application-wide context providers into a flat structure
 * @param {ProvidersProps} props - Contains the children to wrap
 * @returns {JSX.Element} Nested provider tree wrapping the application content
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <GuidelineProvider>
          <ConfirmProvider>
            <HeaderActionsProvider>
              <NavigationProvider>
                <SocketQueryBridge />
                {children}
                <SettingsDialog />
                <Toaster />
              </NavigationProvider>
            </HeaderActionsProvider>
          </ConfirmProvider>
        </GuidelineProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default Providers;
