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

export function Header() {
  const { t } = useTranslation();
  const location = useLocation();
  const headerActionsContent = useHeaderActionsContent();

  const routeMetadata = getRouteMetadata(location.pathname);

  // Skip header rendering if route says so
  if (routeMetadata.hideHeader) {
    return null;
  }

  return (
    <header className="layout-glass px-8 h-16 flex justify-between items-center">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
        {t(routeMetadata.titleKey)}
      </h1>

      <div id="header-actions" className="flex items-center gap-2 ml-auto">
        {routeMetadata.guidelineFeatureId && (
          <GuidelineHelpButton featureId={routeMetadata.guidelineFeatureId} className="mr-1" />
        )}
        {headerActionsContent}
      </div>
    </header>
  );
}

export default Header;
