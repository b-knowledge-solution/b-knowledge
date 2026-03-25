/**
 * @fileoverview Version card list for Documents categories.
 *
 * Renders a vertical list of VersionCard components sorted newest first.
 * Includes a "New Version" button that opens VersionModal.
 * Clicking a card expands it inline to show DocumentListPanel with the version's dataset.
 *
 * @module features/projects/components/VersionList
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'

import {
  createCategoryVersion,
  deleteCategoryVersion,
  archiveCategoryVersion,
  type DocumentCategoryVersion,
} from '../api/projectApi'
import VersionModal, { type VersionFormData } from './VersionModal'
import VersionCard from './VersionCard'
import DocumentListPanel from './DocumentListPanel'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the VersionList component
 */
interface VersionListProps {
  /** Project UUID for API calls */
  projectId: string
  /** Category UUID that owns these versions */
  categoryId: string
  /** Array of versions to display */
  versions: DocumentCategoryVersion[]
  /** Callback after a version is created (parent should re-fetch) */
  onVersionCreated: () => void
  /** Callback after a version is deleted (parent should re-fetch) */
  onVersionDeleted: () => void
  /** Optional category-level dataset config for pre-filling version modal */
  categoryConfig?: Record<string, any> | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders a sortable list of version cards for a Documents category.
 * Newest versions appear first. Clicking a card expands it inline to show DocumentListPanel.
 * Provides "New Version" button to create versions via VersionModal.
 * @param {VersionListProps} props - Component props including versions, callbacks, and identifiers
 * @returns {JSX.Element} Rendered version list with expandable cards
 */
const VersionList = ({
  projectId,
  categoryId,
  versions,
  onVersionCreated,
  onVersionDeleted,
  categoryConfig,
}: VersionListProps) => {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // Track which version is expanded to show DocumentListPanel inline
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)

  // Version creation modal state
  const [versionModalOpen, setVersionModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Sort versions newest first by created_at
  const sortedVersions = [...versions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  /**
   * @description Handle version card click — toggle expansion
   * @param {string} versionId - Version ID to toggle
   */
  const handleCardClick = (versionId: string) => {
    // Toggle: collapse if already active, otherwise expand
    setActiveVersionId(prev => (prev === versionId ? null : versionId))
  }

  /**
   * @description Create a new version via the modal form
   * @param {VersionFormData} formData - Version creation form data
   */
  const handleCreateVersion = async (formData: VersionFormData) => {
    setSaving(true)
    try {
      const payload: {
        version_label: string
        language?: string
        pagerank?: number
        pipeline_id?: string
        parse_type?: number
        chunk_method?: string
        parser_config?: Record<string, any>
      } = {
        version_label: formData.version_label,
        language: formData.language,
        pagerank: formData.pagerank,
        parser_config: formData.parser_config,
      }

      if (formData.pipeline_id !== undefined) {
        payload.pipeline_id = formData.pipeline_id
      }
      if (formData.parse_type !== undefined) {
        payload.parse_type = formData.parse_type
      }
      if (formData.chunk_method !== undefined) {
        payload.chunk_method = formData.chunk_method
      }

      await createCategoryVersion(projectId, categoryId, payload)
      setVersionModalOpen(false)
      onVersionCreated()
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * @description Delete a version after confirmation
   * @param {string} versionId - Version ID to delete
   */
  const handleDeleteVersion = async (versionId: string) => {
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('projects.deleteVersionConfirm', 'This will delete this version and its files. Other versions are not affected.'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteCategoryVersion(projectId, categoryId, versionId)

      // Clear active version if it was the deleted one
      if (activeVersionId === versionId) {
        setActiveVersionId(null)
      }
      onVersionDeleted()
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  /**
   * @description Archive a version
   * @param {string} versionId - Version ID to archive
   */
  const handleArchiveVersion = async (versionId: string) => {
    try {
      await archiveCategoryVersion(projectId, categoryId, versionId)
      onVersionCreated() // Re-fetch to update status
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with "New Version" button */}
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700">
        <h3 className="text-sm font-semibold text-foreground">
          {t('projects.versionCount', '{{count}} version(s)', { count: versions.length })}
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setVersionModalOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('projects.newVersion', 'New Version')}
        </Button>
      </div>

      {/* Version list or empty state */}
      <div className="flex-1 overflow-auto p-4">
        {sortedVersions.length === 0 ? (
          // Empty state per copywriting contract
          <EmptyState
            icon={<FolderOpen className="h-10 w-10 text-muted-foreground" />}
            title={t('projects.emptyVersionTitle', 'No versions')}
            description={t('projects.emptyVersionDescription', 'Create the first version to upload documents.')}
          />
        ) : (
          <div className="space-y-3">
            {sortedVersions.map(version => (
              <div key={version.id}>
                {/* Version card */}
                <VersionCard
                  version={version}
                  isActive={activeVersionId === version.id}
                  onClick={() => handleCardClick(version.id)}
                  onDelete={handleDeleteVersion}
                  onArchive={handleArchiveVersion}
                />

                {/* Expanded inline DocumentListPanel when version is active */}
                {activeVersionId === version.id && version.ragflow_dataset_id && (
                  <div className="mt-2 border rounded-lg dark:border-slate-700 overflow-hidden">
                    <DocumentListPanel
                      projectId={projectId}
                      categoryId={categoryId}
                      versionId={version.id}
                      versionLabel={version.version_label}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version creation modal */}
      <VersionModal
        open={versionModalOpen}
        saving={saving}
        categoryConfig={categoryConfig}
        onOk={handleCreateVersion}
        onCancel={() => setVersionModalOpen(false)}
      />
    </div>
  )
}

export default VersionList
