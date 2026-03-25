/**
 * @fileoverview Memory pool detail page with tabbed view for messages and settings.
 * Includes header with back navigation and import history button.
 *
 * @module features/memory/pages/MemoryDetailPage
 */

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigateWithLoader, usePageReady } from '@/components/NavigationLoader'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { globalMessage } from '@/app/App'

import { useMemory, useUpdateMemory } from '../api/memoryQueries'
import { MemoryMessageTable } from '../components/MemoryMessageTable'
import { MemorySettingsPanel } from '../components/MemorySettingsPanel'
import { ImportHistoryDialog } from '../components/ImportHistoryDialog'
import type { UpdateMemoryDto } from '../types/memory.types'

// ============================================================================
// Skeleton Loading State
// ============================================================================

/**
 * @description Skeleton loading placeholder for the detail page
 * @returns {JSX.Element} Animated skeleton layout
 */
function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      <div className="h-10 w-64 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Memory pool detail page displaying a tabbed view with Messages and Settings tabs.
 * Uses URL param :id to fetch the memory pool, provides import dialog and settings save.
 * @returns {JSX.Element} Rendered detail page with tabs, or loading/404 state
 */
export default function MemoryDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigateWithLoader()

  // Fetch memory pool data
  const { data: memory, isLoading, isError } = useMemory(id ?? '')

  // Signal navigation overlay to dismiss when data is loaded
  usePageReady(!isLoading)
  const updateMemory = useUpdateMemory()

  // Import dialog open state
  const [importOpen, setImportOpen] = useState(false)

  /**
   * @description Handle settings save by calling the update mutation
   * @param {UpdateMemoryDto} data - Updated pool settings
   */
  const handleSave = async (data: UpdateMemoryDto) => {
    if (!id) return
    try {
      await updateMemory.mutateAsync({ id, data })
      globalMessage.success(t('memory.settingsSaved'))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex flex-col p-6 max-w-7xl mx-auto">
        <DetailSkeleton />
      </div>
    )
  }

  // 404 state if memory not found or fetch error
  if (isError || !memory) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <p className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          {t('common.notFound', { defaultValue: 'Not Found' })}
        </p>
        <Button variant="outline" onClick={() => navigate('/agent-studio/memory')}>
          <ArrowLeft size={16} className="mr-1" />
          {t('common.back', { defaultValue: 'Back' })}
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto">
      {/* Page header: back button, title, import button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/agent-studio/memory')}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {memory.name}
          </h1>
        </div>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload size={16} className="mr-1" />
          {t('memory.importHistory')}
        </Button>
      </div>

      {/* Tabbed content: Messages (default) and Settings */}
      <Tabs defaultValue="messages" className="flex-1">
        <TabsList>
          <TabsTrigger value="messages">{t('memory.messages')}</TabsTrigger>
          <TabsTrigger value="settings">{t('memory.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="mt-4">
          <MemoryMessageTable memoryId={memory.id} tenantId={memory.tenant_id} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <MemorySettingsPanel memory={memory} onSave={handleSave} />
        </TabsContent>
      </Tabs>

      {/* Import Chat History Dialog */}
      <ImportHistoryDialog
        memoryId={memory.id}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  )
}
