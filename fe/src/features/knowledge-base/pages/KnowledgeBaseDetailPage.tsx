/**
 * @fileoverview Knowledge base detail page with 3 category tabs and settings sheet.
 *
 * Features:
 * - Header with back button, project name (display size), status badge, gear icon for settings
 * - Three fixed tabs: Documents, Standard, Code — each with CategorySidebar + content area
 * - URL state for active tab (?tab=) and active category (?category=)
 * - Settings accessible via KnowledgeBaseSettingsSheet (gear icon)
 * - Dark/light theme support, full i18n
 *
 * @module features/knowledge-base/pages/KnowledgeBaseDetailPage
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import { useNavigateWithLoader, usePageReady } from '@/components/NavigationLoader'
import {
  ArrowLeft,
  FolderOpen,
  FileText,
  Code2,
  Network,
  Settings,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { globalMessage } from '@/lib/globalMessage'
import {
  ADMIN_KNOWLEDGE_BASE_ROUTE,
} from '@/app/adminRoutes'

import {
  getKnowledgeBaseById,
  getDocumentCategories,
  type KnowledgeBase,
  type DocumentCategory,
  type DocumentCategoryType,
} from '../api/knowledgeBaseApi'
import DocumentsTabRedesigned from '../components/DocumentsTabRedesigned'
import StandardTabRedesigned from '../components/StandardTabRedesigned'
import CodeTabRedesigned from '../components/CodeTabRedesigned'
import HealthcareOrgChart from '../components/HealthcareOrgChart'
import KnowledgeBaseSettingsSheet from '../components/KnowledgeBaseSettingsSheet'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Knowledge base detail page with 3 category tabs (Documents, Standard, Code) and a settings sheet.
 * Categories are fetched once and filtered client-side per tab. Tab and category selection are URL-persisted.
 * @returns {JSX.Element} Rendered knowledge base detail page
 */
const KnowledgeBaseDetailPage = () => {
  const { t } = useTranslation()
  const { knowledgeBaseId } = useParams<{ knowledgeBaseId: string }>()
  const navigate = useNavigateWithLoader()

  // URL state for tab selection
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') || 'documents') as DocumentCategoryType

  // Project data
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [loading, setLoading] = useState(true)

  // Signal navigation overlay to dismiss when data is loaded
  usePageReady(!loading)

  // All categories fetched once, filtered client-side per tab
  const [allCategories, setAllCategories] = useState<DocumentCategory[]>([])

  // Settings sheet state
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Derive filtered categories per tab type
  const documentCategories = allCategories.filter(c => c.category_type === 'documents')
  const standardCategories = allCategories.filter(c => c.category_type === 'standard')
  const codeCategories = allCategories.filter(c => c.category_type === 'code')

  /**
   * @description Fetch project and all categories
   */
  const fetchKnowledgeBase = async () => {
    if (!knowledgeBaseId) return
    try {
      setLoading(true)
      const [kbData, categoryData] = await Promise.all([
        getKnowledgeBaseById(knowledgeBaseId),
        getDocumentCategories(knowledgeBaseId),
      ])
      setKnowledgeBase(kbData)
      setAllCategories(categoryData)
    } catch (err) {
      console.error('Failed to load project:', err)
      globalMessage.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  // Load project on mount
  useEffect(() => {
    fetchKnowledgeBase()
  }, [knowledgeBaseId])

  /**
   * @description Handle tab change — update URL
   * @param {string} tab - New tab value
   */
  const handleTabChange = (tab: string) => {
    setSearchParams({ tab })
  }

  // ── Loading state ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  // ── Not found state ──────────────────────────────────────────────────

  if (!knowledgeBase) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">{t('knowledgeBase.loadError', 'Failed to load project. Check your connection and try again.')}</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden px-6 pt-6">
        {/* Back + title + status + settings gear */}
        <div className="mb-6 shrink-0">
          <Button
            variant="ghost"
            onClick={() => navigate(ADMIN_KNOWLEDGE_BASE_ROUTE)}
            className="mb-2"
          >
            <ArrowLeft size={16} className="mr-2" />
            {t('knowledgeBase.title')}
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Display size per UI-SPEC typography contract */}
              <h1 className="text-[28px] font-semibold leading-[1.2] text-foreground">{knowledgeBase.name}</h1>
              <Badge variant={knowledgeBase.status === 'active' ? 'success' : 'secondary'}>
                {knowledgeBase.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {knowledgeBase.description && (
                <p className="text-muted-foreground text-sm mr-4">{knowledgeBase.description}</p>
              )}
              {/* Gear icon to open settings sheet */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* 3 fixed category tabs per UI-SPEC */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="documents">
              <FolderOpen className="h-4 w-4 mr-1.5" />
              {t('knowledgeBase.documentsTab', 'Documents')}
              <Badge variant="secondary" className="ml-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {documentCategories.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="standard">
              <FileText className="h-4 w-4 mr-1.5" />
              {t('knowledgeBase.standardTab', 'Standard')}
              <Badge variant="secondary" className="ml-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {standardCategories.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="code">
              <Code2 className="h-4 w-4 mr-1.5" />
              {t('knowledgeBase.codeTab', 'Code')}
              <Badge variant="secondary" className="ml-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {codeCategories.length}
              </Badge>
            </TabsTrigger>
            {/* Healthcare org chart — read-only landscape tree with dropdown highlight */}
            <TabsTrigger value="org-chart">
              <Network className="h-4 w-4 mr-1.5" />
              {t('knowledgeBase.orgChartTab', 'Org Chart')}
            </TabsTrigger>
          </TabsList>

          {/* Documents tab: 3-column progressive-reveal layout */}
          <TabsContent value="documents" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <DocumentsTabRedesigned
              knowledgeBaseId={knowledgeBaseId!}
              initialCategories={documentCategories}
              embeddingModels={[]}
            />
          </TabsContent>

          {/* Standard tab: 2-column layout matching Documents pattern */}
          <TabsContent value="standard" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <StandardTabRedesigned
              knowledgeBaseId={knowledgeBaseId!}
              initialCategories={standardCategories}
              embeddingModels={[]}
            />
          </TabsContent>

          {/* Code tab: 2-column layout with code graph panel */}
          <TabsContent value="code" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <CodeTabRedesigned
              knowledgeBaseId={knowledgeBaseId!}
              initialCategories={codeCategories}
              embeddingModels={[]}
            />
          </TabsContent>

          {/* Org Chart tab: landscape healthcare organization chart with dropdown highlighting */}
          <TabsContent value="org-chart" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <HealthcareOrgChart />
          </TabsContent>
        </Tabs>
      </div>

      {/* Settings sheet */}
      <KnowledgeBaseSettingsSheet
        knowledgeBase={knowledgeBase}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onKnowledgeBaseUpdated={fetchKnowledgeBase}
        onKnowledgeBaseDeleted={() => navigate(ADMIN_KNOWLEDGE_BASE_ROUTE)}
      />

    </div>
  )
}

export default KnowledgeBaseDetailPage
