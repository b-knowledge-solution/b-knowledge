/**
 * @fileoverview Page header component.
 *
 * Renders the header bar with:
 * - Dynamic page title from route config
 * - Guideline help button
 * - Page-level header actions (injected from pages)
 */

import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useHeaderActionsContent } from '@/components/HeaderActions';
import { GuidelineHelpButton } from '@/features/guideline';
import { getRouteMetadata } from '@/app/routeConfig';



// ============================================================================
// Header Component
// ============================================================================

/**
 * @description Renders the page header bar with dynamic title from route config, guideline help button, and injected page-level actions
 * @returns {JSX.Element | null} Header element or null when route hides the header
 */
export function Header() {
  const { t } = useTranslation();
  const location = useLocation();
  const headerActionsContent = useHeaderActionsContent();

  // Look up metadata for the current route to determine title and layout flags
  const routeMetadata = getRouteMetadata(location.pathname);

  // Skip header rendering if the route config explicitly hides it
  if (routeMetadata.hideHeader) {
    return null;
  }

  return (
    <header className="layout-glass px-8 h-16 flex justify-between items-center">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
        {t(routeMetadata.titleKey)}
      </h1>

      <div id="header-actions" className="flex items-center gap-2 ml-auto">
        {/* Show guideline help button only when the route specifies a feature ID */}
        {routeMetadata.guidelineFeatureId && (
          <GuidelineHelpButton featureId={routeMetadata.guidelineFeatureId} className="mr-1" />
        )}
        {headerActionsContent}
      </div>
    </header>
  );
}

export default Header;
