/**
 * @fileoverview Composable providers wrapper.
 *
 * Flattens the nested provider tree into a single component.
 * Add new app-wide providers here instead of nesting in App.tsx.
 *
 * @module app/Providers
 */

import { ReactNode } from 'react';
import { App as AntdApp } from 'antd';
import { AuthProvider } from '@/features/auth';
import { SettingsProvider } from '@/app/contexts/SettingsContext';
import { KnowledgeBaseProvider } from '@/features/knowledge-base';
import { GuidelineProvider } from '@/features/guideline';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { HeaderActionsProvider } from '@/components/HeaderActions';
import { NavigationProvider } from '@/components/NavigationLoader';
import SettingsDialog from '@/components/SettingsDialog';

// ============================================================================
// Global Notification Bridge
// ============================================================================

import { message as antdMessage } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

/**
 * Ref container for the Ant Design message API.
 * Using an object ref to avoid module-level reassignment
 * that React Compiler flags as impure.
 */
const messageApiRef: { current: MessageInstance | null } = { current: null };

/**
 * Bridge Ant Design message API so non-component code
 * (e.g. TanStack Query mutations) can surface notifications.
 */
export const globalMessage = {
  success: (content: string) => {
    if (messageApiRef.current) messageApiRef.current.success(content);
    else antdMessage.success(content);
  },
  error: (content: string) => {
    if (messageApiRef.current) messageApiRef.current.error(content);
    else antdMessage.error(content);
  },
  info: (content: string) => {
    if (messageApiRef.current) messageApiRef.current.info(content);
    else antdMessage.info(content);
  },
  warning: (content: string) => {
    if (messageApiRef.current) messageApiRef.current.warning(content);
    else antdMessage.warning(content);
  },
};

/** Captures Ant Design's useApp().message API for the globalMessage bridge. */
const GlobalNotifications = () => {
  const { message } = AntdApp.useApp();
  messageApiRef.current = message;
  return null;
};

// ============================================================================
// Providers Component
// ============================================================================

interface ProvidersProps {
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
 * 1. AntdApp (UI framework config)
 * 2. AuthProvider (user session)
 * 3. SettingsProvider (theme, language)
 * 4. KnowledgeBaseProvider (RAG sources)
 * 5. GuidelineProvider (in-app help)
 * 6. ConfirmProvider (confirmation dialogs)
 * 7. HeaderActionsProvider (page-level header actions)
 * 8. NavigationProvider (loading overlay)
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <AntdApp>
      <GlobalNotifications />
      <AuthProvider>
        <SettingsProvider>
          <KnowledgeBaseProvider>
            <GuidelineProvider>
              <ConfirmProvider>
                <HeaderActionsProvider>
                  <NavigationProvider>
                    {children}
                    <SettingsDialog />
                  </NavigationProvider>
                </HeaderActionsProvider>
              </ConfirmProvider>
            </GuidelineProvider>
          </KnowledgeBaseProvider>
        </SettingsProvider>
      </AuthProvider>
    </AntdApp>
  );
}

export default Providers;
