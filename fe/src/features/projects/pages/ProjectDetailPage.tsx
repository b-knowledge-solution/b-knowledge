/**
 * @fileoverview Project detail page with 3 category tabs and settings sheet.
 *
 * Features:
 * - Header with back button, project name (display size), status badge, gear icon for settings
 * - Three fixed tabs: Documents, Standard, Code — each with CategorySidebar + content area
 * - URL state for active tab (?tab=) and active category (?category=)
 * - Settings accessible via ProjectSettingsSheet (gear icon)
 * - Dark/light theme support, full i18n
 *
 * @module features/projects/pages/ProjectDetailPage
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
  Settings,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { globalMessage } from '@/app/App'

import {
  getProjectById,
  getDocumentCategories,
  type Project,
  type DocumentCategory,
  type DocumentCategoryType,
} from '../api/projectApi'
import DocumentsTabRedesigned from '../components/DocumentsTabRedesigned'
import StandardTabRedesigned from '../components/StandardTabRedesigned'
import CodeTabRedesigned from '../components/CodeTabRedesigned'
import ProjectSettingsSheet from '../components/ProjectSettingsSheet'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Project detail page with 3 category tabs (Documents, Standard, Code) and a settings sheet.
 * Categories are fetched once and filtered client-side per tab. Tab and category selection are URL-persisted.
 * @returns {JSX.Element} Rendered project detail page
 */
const ProjectDetailPage = () => {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigateWithLoader()

  // URL state for tab selection
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') || 'documents') as DocumentCategoryType

  // Project data
  const [project, setProject] = useState<Project | null>(null)
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
  const fetchProject = async () => {
    if (!projectId) return
    try {
      setLoading(true)
      const [projectData, categoryData] = await Promise.all([
        getProjectById(projectId),
        getDocumentCategories(projectId),
      ])
      setProject(projectData)
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
    fetchProject()
  }, [projectId])

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

  if (!project) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">{t('projects.loadError', 'Failed to load project. Check your connection and try again.')}</p>
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
            onClick={() => navigate('/data-studio/projects')}
            className="mb-2"
          >
            <ArrowLeft size={16} className="mr-2" />
            {t('projectManagement.title')}
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Display size per UI-SPEC typography contract */}
              <h1 className="text-[28px] font-semibold leading-[1.2] text-foreground">{project.name}</h1>
              <Badge variant={project.status === 'active' ? 'success' : 'secondary'}>
                {project.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {project.description && (
                <p className="text-muted-foreground text-sm mr-4">{project.description}</p>
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
              {t('projects.documentsTab', 'Documents')}
              <Badge variant="secondary" className="ml-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {documentCategories.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="standard">
              <FileText className="h-4 w-4 mr-1.5" />
              {t('projects.standardTab', 'Standard')}
              <Badge variant="secondary" className="ml-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {standardCategories.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="code">
              <Code2 className="h-4 w-4 mr-1.5" />
              {t('projects.codeTab', 'Code')}
              <Badge variant="secondary" className="ml-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {codeCategories.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Documents tab: 3-column progressive-reveal layout */}
          <TabsContent value="documents" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <DocumentsTabRedesigned
              projectId={projectId!}
              initialCategories={documentCategories}
              embeddingModels={[]}
            />
          </TabsContent>

          {/* Standard tab: 2-column layout matching Documents pattern */}
          <TabsContent value="standard" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <StandardTabRedesigned
              projectId={projectId!}
              initialCategories={standardCategories}
              embeddingModels={[]}
            />
          </TabsContent>

          {/* Code tab: 2-column layout with code graph panel */}
          <TabsContent value="code" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <CodeTabRedesigned
              projectId={projectId!}
              initialCategories={codeCategories}
              embeddingModels={[]}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Settings sheet */}
      <ProjectSettingsSheet
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onProjectUpdated={fetchProject}
        onProjectDeleted={() => navigate('/data-studio/projects')}
      />

    </div>
  )
}

export default ProjectDetailPage
