/**
 * @fileoverview Admin page for managing chat dialog (assistant) configurations.
 * Provides CRUD operations, search filtering, and RBAC access control per dialog.
 * @module features/ai/pages/ChatDialogManagementPage
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { HeaderActions } from '@/components/HeaderActions'
import { useConfirm } from '@/components/ConfirmDialog'
import { useChatDialogs } from '../hooks/useChatDialogs'
import ChatDialogConfig from '../components/ChatDialogConfig'
import ChatDialogAccessDialog from '../components/ChatDialogAccessDialog'
import type { ChatDialog, CreateDialogPayload } from '../types/chat.types'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Admin management page for chat assistants (dialogs).
 * Lists all dialogs in a table with search, CRUD actions, and access control.
 * @returns {JSX.Element} The rendered page
 */
export default function ChatDialogManagementPage() {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // Dialog data hook
  const {
    dialogs,
    loading,
    createDialog,
    deleteDialog,
    refresh,
  } = useChatDialogs()

  // Search filter state
  const [searchTerm, setSearchTerm] = useState('')

  // Config dialog state
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [editingDialog, setEditingDialog] = useState<ChatDialog | null>(null)

  // Access dialog state
  const [isAccessOpen, setIsAccessOpen] = useState(false)
  const [accessDialog, setAccessDialog] = useState<ChatDialog | null>(null)

  // Filter dialogs by search term
  const filteredDialogs = dialogs.filter((d) =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  /**
   * Open the config dialog in create mode.
   */
  const openCreate = () => {
    setEditingDialog(null)
    setIsConfigOpen(true)
  }

  /**
   * Open the config dialog in edit mode.
   * @param dialog - The dialog to edit
   */
  const openEdit = (dialog: ChatDialog) => {
    setEditingDialog(dialog)
    setIsConfigOpen(true)
  }

  /**
   * Handle save from config dialog (create or update).
   * @param data - The dialog payload
   */
  const handleSave = async (data: CreateDialogPayload) => {
    if (editingDialog) {
      // Update existing dialog via API
      const { chatApi } = await import('../api/chatApi')
      await chatApi.updateDialog(editingDialog.id, data)
      refresh()
    } else {
      // Create new dialog
      await createDialog(data)
    }
  }

  /**
   * Confirm and delete a dialog.
   * @param dialog - The dialog to delete
   */
  const handleDelete = async (dialog: ChatDialog) => {
    const confirmed = await confirm({
      title: t('chatAdmin.deleteDialog'),
      message: t('chatAdmin.confirmDelete'),
      variant: 'danger',
    })
    if (confirmed) {
      await deleteDialog(dialog.id)
    }
  }

  /**
   * Open the access control dialog for a specific dialog.
   * @param dialog - The dialog to manage access for
   */
  const openAccess = (dialog: ChatDialog) => {
    setAccessDialog(dialog)
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
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-10 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          />
        </div>
      </div>

      {/* Dialogs table */}
      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredDialogs.length === 0 ? (
        <div className="flex-1 flex justify-center items-center text-slate-500 dark:text-slate-400">
          {t('chatAdmin.noDialogs')}
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
              {filteredDialogs.map((dialog) => (
                <TableRow key={dialog.id}>
                  {/* Name */}
                  <TableCell className="font-medium text-slate-900 dark:text-white">
                    {dialog.name}
                  </TableCell>

                  {/* Description */}
                  <TableCell className="text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                    {dialog.description || '-'}
                  </TableCell>

                  {/* Knowledge bases count */}
                  <TableCell>
                    <Badge variant="secondary">{dialog.kb_ids.length}</Badge>
                  </TableCell>

                  {/* LLM model */}
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {dialog.llm_id || '-'}
                  </TableCell>

                  {/* Public / Private badge */}
                  <TableCell>
                    {dialog.is_public ? (
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
                        onClick={() => openEdit(dialog)}
                        title={t('chatAdmin.editDialog')}
                      >
                        <Pencil size={16} />
                      </Button>

                      {/* Manage access button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAccess(dialog)}
                        title={t('chatAdmin.manageAccess')}
                      >
                        <Shield size={16} />
                      </Button>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => handleDelete(dialog)}
                        title={t('chatAdmin.deleteDialog')}
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

      {/* Create button in header actions */}
      <HeaderActions>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={20} />
          {t('chatAdmin.createDialog')}
        </Button>
      </HeaderActions>

      {/* Create / Edit config dialog */}
      <ChatDialogConfig
        open={isConfigOpen}
        onClose={() => { setIsConfigOpen(false); setEditingDialog(null) }}
        onSave={handleSave}
        dialog={editingDialog}
      />

      {/* Access control dialog */}
      <ChatDialogAccessDialog
        open={isAccessOpen}
        onClose={() => { setIsAccessOpen(false); setAccessDialog(null) }}
        dialog={accessDialog}
      />
    </div>
  )
}
