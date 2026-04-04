/**
 * @fileoverview Composable providers wrapper.
 *
 * Flattens the nested provider tree into a single component.
 * Add new app-wide providers here instead of nesting in App.tsx.
 *
 * @module app/Providers
 */

import { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/features/auth';
import { AbilityProvider } from '@/lib/ability';
import { SettingsProvider } from '@/app/contexts/SettingsContext';

import { GuidelineProvider } from '@/features/guideline';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { HeaderActionsProvider } from '@/components/HeaderActions';
import { NavigationProvider } from '@/components/NavigationLoader'
import { useSocketQueryInvalidation } from '@/hooks/useSocket';
import { globalMessage } from '@/lib/globalMessage'
import SettingsDialog from '@/components/SettingsDialog';
import { ApiKeysDialog } from '@/features/api-keys';

// ============================================================================
// Global Notification Bridge
// ============================================================================

export { globalMessage }

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
 * 2. AbilityProvider (CASL permissions)
 * 3. SettingsProvider (theme, language)
 * 4. GuidelineProvider (in-app help)
 * 5. ConfirmProvider (confirmation dialogs)
 * 6. HeaderActionsProvider (page-level header actions)
 * 7. NavigationProvider (loading overlay)
 */
/**
 * @description Composes all application-wide context providers into a flat structure
 * @param {ProvidersProps} props - Contains the children to wrap
 * @returns {JSX.Element} Nested provider tree wrapping the application content
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <AbilityProvider>
        <SettingsProvider>
        <GuidelineProvider>
          <ConfirmProvider>
            <HeaderActionsProvider>
              <NavigationProvider>
                <SocketQueryBridge />
                {children}
                <SettingsDialog />
                <ApiKeysDialog />
                <Toaster />
              </NavigationProvider>
            </HeaderActionsProvider>
          </ConfirmProvider>
        </GuidelineProvider>
        </SettingsProvider>
      </AbilityProvider>
    </AuthProvider>
  );
}

export default Providers;
