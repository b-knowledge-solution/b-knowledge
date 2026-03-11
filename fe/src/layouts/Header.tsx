/**
 * @fileoverview Page header component.
 *
 * Renders the header bar with:
 * - Dynamic page title from route config
 * - Guideline help button
 * - Page-level header actions (injected from pages)
 * - RAGFlow source selectors on Chat/Search pages
 *
 * @module layouts/Header
 */

import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useKnowledgeBase } from '@/features/knowledge-base';
import { useHeaderActionsContent } from '@/components/HeaderActions';
import { GuidelineHelpButton } from '@/features/guideline';
import { Select } from '@/components/Select';
import { getRouteMetadata } from '@/app/routeConfig';
import { MessageSquare, Search, Info } from 'lucide-react';

// ============================================================================
// Source Description Tooltip
// ============================================================================

function SourceTooltip({ description }: { description: string }) {
  return (
    <div className="relative group">
      <div className="p-2 text-slate-400 dark:text-slate-500 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-help">
        <Info size={18} />
      </div>
      <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-slate-800 dark:bg-slate-700 text-white text-sm rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="absolute -top-2 right-3 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-slate-800 dark:border-b-slate-700"></div>
        {description}
      </div>
    </div>
  );
}

// ============================================================================
// Header Component
// ============================================================================

export function Header() {
  const { t } = useTranslation();
  const location = useLocation();
  const knowledgeBase = useKnowledgeBase();
  const headerActionsContent = useHeaderActionsContent();

  const routeMetadata = getRouteMetadata(location.pathname);

  // Skip header rendering if route says so
  if (routeMetadata.hideHeader) {
    return null;
  }

  // Source selectors
  const showChatDropdown = location.pathname === '/chat'
    && knowledgeBase.config?.chatSources
    && knowledgeBase.config.chatSources.length > 0;
  const showSearchDropdown = location.pathname === '/search'
    && knowledgeBase.config?.searchSources
    && knowledgeBase.config.searchSources.length > 0;

  const currentChatSource = knowledgeBase.config?.chatSources?.find(s => s.id === knowledgeBase.selectedChatSourceId);
  const currentSearchSource = knowledgeBase.config?.searchSources?.find(s => s.id === knowledgeBase.selectedSearchSourceId);

  const sourceDescription = location.pathname === '/chat'
    ? currentChatSource?.description
    : location.pathname === '/search'
      ? currentSearchSource?.description
      : null;

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-8 h-16 flex justify-between items-center">
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
        {t(routeMetadata.titleKey)}
      </h1>

      <div id="header-actions" className="flex items-center gap-2 ml-auto">
        {routeMetadata.guidelineFeatureId && (
          <GuidelineHelpButton featureId={routeMetadata.guidelineFeatureId} className="mr-1" />
        )}
        {headerActionsContent}
      </div>

      {showChatDropdown && (
        <div id="agent-selector" className="flex items-center gap-2">
          {sourceDescription && <SourceTooltip description={sourceDescription} />}
          <Select
            value={knowledgeBase.selectedChatSourceId}
            onChange={knowledgeBase.setSelectedChatSource}
            options={knowledgeBase.config?.chatSources || []}
            icon={<MessageSquare size={18} />}
            disabled={(knowledgeBase.config?.chatSources?.length || 0) <= 1}
          />
        </div>
      )}

      {showSearchDropdown && (
        <div className="flex items-center gap-2">
          {sourceDescription && <SourceTooltip description={sourceDescription} />}
          <Select
            value={knowledgeBase.selectedSearchSourceId}
            onChange={knowledgeBase.setSelectedSearchSource}
            options={knowledgeBase.config?.searchSources || []}
            icon={<Search size={18} />}
            disabled={(knowledgeBase.config?.searchSources?.length || 0) <= 1}
          />
        </div>
      )}
    </header>
  );
}

export default Header;
