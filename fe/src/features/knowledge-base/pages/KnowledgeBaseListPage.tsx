/**
 * @fileoverview Simplified knowledge base list page (D-04).
 *
 * Shows a card grid of projects with "Create Project" button.
 * Clicking a card navigates to the knowledge base detail page.
 * All management (edit, delete, permissions) is on the detail page.
 *
 * @module features/knowledge-base/pages/KnowledgeBaseListPage
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigateWithLoader, usePageReady } from '@/components/NavigationLoader'
import { Plus, Lock, Globe } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { globalMessage } from '@/app/App'

import { getKnowledgeBases, createKnowledgeBase, type KnowledgeBase } from '../api/knowledgeBaseApi'
import CreateKnowledgeBaseModal from '../components/CreateKnowledgeBaseModal'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Simplified knowledge base list page showing cards with create + navigate only.
 * Per D-04, no inline edit/delete/permissions on list page cards.
 * @returns {JSX.Element} Rendered knowledge base list page
 */
const KnowledgeBaseListPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigateWithLoader()

  // Data state
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [loading, setLoading] = useState(true)

  // Signal navigation overlay to dismiss when data is loaded
  usePageReady(!loading)

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)

  /**
   * @description Fetch all projects from the API.
   */
  const fetchData = async () => {
    try {
      setLoading(true)
      const projectData = await getKnowledgeBases()
      setKnowledgeBases(projectData)
    } catch (err) {
      console.error('Failed to fetch data:', err)
      globalMessage.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  /** Effect: Load data on mount */
  useEffect(() => {
    fetchData()
  }, [])

  /**
   * @description Handle create project submission from modal.
   * @param {Parameters<typeof createKnowledgeBase>[0]} data - Project creation payload
   */
  const handleCreateKnowledgeBase = async (data: Parameters<typeof createKnowledgeBase>[0]) => {
    setCreateSaving(true)
    try {
      await createKnowledgeBase(data)
      globalMessage.success(t('knowledgeBase.createSuccess'))
      setCreateModalOpen(false)
      fetchData()
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setCreateSaving(false)
    }
  }

  // Loading state with skeleton cards
  if (loading) {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          {/* Header placeholder */}
          <div className="mb-6 flex items-center justify-between">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-36" />
          </div>
          {/* Skeleton card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        {/* Header: page title + create button */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">
            {t('knowledgeBase.title', 'Projects')}
          </h1>
          <Button onClick={() => setCreateModalOpen(true)}>
            <Plus size={16} className="mr-2" />
            {t('knowledgeBase.addProject')}
          </Button>
        </div>

        {/* Project card grid or empty state */}
        {knowledgeBases.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <div className="text-center">
              <h3 className="text-lg font-medium text-foreground mb-1">
                {t('knowledgeBase.noProjects')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('knowledgeBase.noProjectsHint')}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {knowledgeBases.map((kb) => (
              <Card
                key={kb.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => navigate(`/data-studio/knowledge-base/${kb.id}`, { waitForReady: true })}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold text-foreground truncate">
                      {kb.name}
                    </h3>
                    {/* Visibility badge: lock for private, globe for public */}
                    {kb.is_private ? (
                      <Lock size={16} className="text-amber-500 shrink-0 mt-1" />
                    ) : (
                      <Globe size={16} className="text-green-500 shrink-0 mt-1" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Description with 2-line clamp */}
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {kb.description || t('knowledgeBase.noDescription', { defaultValue: '\u2014' })}
                  </p>
                  {/* Category count summary */}
                  <div className="flex items-center gap-2">
                    {typeof kb.dataset_count === 'number' && (
                      <Badge variant="outline">
                        {kb.dataset_count} {t('knowledgeBase.datasetCount')}
                      </Badge>
                    )}
                    <Badge variant="secondary">{kb.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      <CreateKnowledgeBaseModal
        open={createModalOpen}
        saving={createSaving}
        onSubmit={handleCreateKnowledgeBase}
        onCancel={() => setCreateModalOpen(false)}
      />
    </div>
  )
}

export default KnowledgeBaseListPage
