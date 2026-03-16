/**
 * @fileoverview Admin page for managing chat assistant configurations.
 * Provides CRUD operations, server-side search/pagination, and RBAC access control per assistant.
 * @module features/ai/pages/ChatAssistantManagementPage
 */

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { Plus, Search, Pencil, Trash2, Shield, Globe, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { HeaderActions } from '@/components/HeaderActions'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'
import { chatApi } from '../api/chatApi'
import { useChatAssistantsAdmin } from '../api/chatQueries'
import ChatAssistantConfig from '../components/ChatAssistantConfig'
import ChatAssistantAccessDialog from '../components/ChatAssistantAccessDialog'
import type { ChatAssistant, CreateAssistantPayload } from '../types/chat.types'

/** Default number of items per page */
const PAGE_SIZE = 20

// ============================================================================
// Component
// ============================================================================

/**
 * @description Admin management page for chat assistants.
 * Lists all assistants in a table with server-side search, pagination, CRUD actions, and access control.
 * @returns {JSX.Element} The rendered page
 */
export default function ChatAssistantManagementPage() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  // Read pagination and search state from URL
  const page = Number(searchParams.get('page')) || 1
  const searchTerm = searchParams.get('search') || ''

  // Fetch assistants with server-side pagination
  const { assistants, total, isLoading: loading } = useChatAssistantsAdmin({
    page,
    page_size: PAGE_SIZE,
    search: searchTerm || undefined,
  })

  const totalPages = Math.ceil(total / PAGE_SIZE)

  /**
   * @description Update the search term in URL state, resetting to page 1.
   * @param value - New search term
   */
  const handleSearchChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set('search', value)
    } else {
      next.delete('search')
    }
    // Reset to first page when search changes
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  /**
   * @description Update the current page in URL state.
   * @param newPage - Target page number
   */
  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (newPage > 1) {
      next.set('page', String(newPage))
    } else {
      next.delete('page')
    }
    setSearchParams(next, { replace: true })
  }

  /**
   * @description Invalidate assistant cache to trigger refetch.
   */
  const refreshAssistants = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.all })

  // Config dialog state
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [editingAssistant, setEditingAssistant] = useState<ChatAssistant | null>(null)

  // Access dialog state
  const [isAccessOpen, setIsAccessOpen] = useState(false)
  const [accessAssistant, setAccessAssistant] = useState<ChatAssistant | null>(null)

  /**
   * @description Open the config dialog in create mode.
   */
  const openCreate = () => {
    setEditingAssistant(null)
    setIsConfigOpen(true)
  }

  /**
   * @description Open the config dialog in edit mode.
   * @param assistant - The assistant to edit
   */
  const openEdit = (assistant: ChatAssistant) => {
    setEditingAssistant(assistant)
    setIsConfigOpen(true)
  }

  /**
   * @description Handle save from config dialog (create or update).
   * @param data - The assistant payload
   */
  const handleSave = async (data: CreateAssistantPayload) => {
    try {
      if (editingAssistant) {
        // Update existing assistant via API
        await chatApi.updateAssistant(editingAssistant.id, data)
        globalMessage.success(t('common.updateSuccess'))
      } else {
        // Create new assistant
        await chatApi.createAssistant(data)
        globalMessage.success(t('common.createSuccess'))
      }
      refreshAssistants()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }

  /**
   * @description Confirm and delete an assistant with user confirmation.
   * @param assistant - The assistant to delete
   */
  const handleDelete = async (assistant: ChatAssistant) => {
    const confirmed = await confirm({
      title: t('chatAdmin.deleteAssistant'),
      message: t('chatAdmin.confirmDelete'),
      variant: 'danger',
    })
    if (confirmed) {
      try {
        await chatApi.deleteAssistant(assistant.id)
        refreshAssistants()
        globalMessage.success(t('common.deleteSuccess'))
      } catch (error: any) {
        globalMessage.error(error?.message || t('common.error'))
      }
    }
  }

  /**
   * @description Open the access control dialog for a specific assistant.
   * @param assistant - The assistant to manage access for
   */
  const openAccess = (assistant: ChatAssistant) => {
    setAccessAssistant(assistant)
    setIsAccessOpen(true)
  }

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto">
      {/* Search input */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 shrink-0">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <Input
            placeholder={t('chatAdmin.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 h-10 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          />
        </div>
        {/* Total count indicator */}
        {!loading && total > 0 && (
          <div className="flex items-center text-sm text-slate-500 dark:text-slate-400 shrink-0">
            {t('common.totalItems', { count: total })}
          </div>
        )}
      </div>

      {/* Assistants table */}
      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : assistants.length === 0 ? (
        <div className="flex-1 flex justify-center items-center text-slate-500 dark:text-slate-400">
          {t('chatAdmin.noAssistants')}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('common.description')}</TableHead>
                <TableHead>{t('chat.knowledgeBases')}</TableHead>
                <TableHead>{t('chat.llmModel')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assistants.map((assistant) => (
                <TableRow key={assistant.id}>
                  {/* Name */}
                  <TableCell className="font-medium text-slate-900 dark:text-white">
                    {assistant.name}
                  </TableCell>

                  {/* Description */}
                  <TableCell className="text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                    {assistant.description || '-'}
                  </TableCell>

                  {/* Knowledge bases count */}
                  <TableCell>
                    <Badge variant="secondary">{assistant.kb_ids.length}</Badge>
                  </TableCell>

                  {/* LLM model */}
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {assistant.llm_id || '-'}
                  </TableCell>

                  {/* Public / Private badge */}
                  <TableCell>
                    {assistant.is_public ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        <Globe size={12} className="mr-1" />
                        {t('chatAdmin.isPublic')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Lock size={12} className="mr-1" />
                        {t('chatAdmin.isPrivate')}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Action buttons */}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* Edit button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(assistant)}
                        title={t('chatAdmin.editAssistant')}
                      >
                        <Pencil size={16} />
                      </Button>

                      {/* Manage access button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAccess(assistant)}
                        title={t('chatAdmin.manageAccess')}
                      >
                        <Shield size={16} />
                      </Button>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => handleDelete(assistant)}
                        title={t('chatAdmin.deleteAssistant')}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-4 shrink-0">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      {/* Create button in header actions */}
      <HeaderActions>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={20} />
          {t('chatAdmin.createAssistant')}
        </Button>
      </HeaderActions>

      {/* Create / Edit config dialog */}
      <ChatAssistantConfig
        open={isConfigOpen}
        onClose={() => { setIsConfigOpen(false); setEditingAssistant(null) }}
        onSave={handleSave}
        dialog={editingAssistant}
      />

      {/* Access control dialog */}
      <ChatAssistantAccessDialog
        open={isAccessOpen}
        onClose={() => { setIsAccessOpen(false); setAccessAssistant(null) }}
        dialog={accessAssistant}
      />
    </div>
  )
}
