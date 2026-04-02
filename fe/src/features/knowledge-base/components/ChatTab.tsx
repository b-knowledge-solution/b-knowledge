/**
 * @fileoverview Chat tab content for the knowledge base detail page.
 *
 * Displays the chat assistant list with add/edit/delete/sync actions.
 * Resolves category selections into ragflow_dataset_ids on chat creation/update.
 *
 * @module features/knowledge-base/components/ChatTab
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, RefreshCw, Pencil, Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getKnowledgeBaseChats,
  createKnowledgeBaseChat,
  updateKnowledgeBaseChat,
  deleteKnowledgeBaseChat,
  syncKnowledgeBaseChat,
  type KnowledgeBaseChat,
  type DocumentCategory,
  type DocumentCategoryVersion,
} from '../api/knowledgeBaseApi'
import ChatModal, { type ChatFormData } from './ChatModal'
import { EntityPermissionModal } from './EntityPermissionModal'

// ============================================================================
// Types
// ============================================================================

interface ChatTabProps {
  /** Current project ID */
  knowledgeBaseId: string
  /** Initial chat list fetched by the parent */
  initialChats: KnowledgeBaseChat[]
  /** Knowledge base document categories */
  categories: DocumentCategory[]
  /** Map of category ID -> its versions (pre-fetched by parent) */
  categoryVersions: Record<string, DocumentCategoryVersion[]>
  /** Available chat models from the RAGFlow server config */
  chatModels: string[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * Chat tab -- chat assistant list with CRUD.
 * Resolves selected categories -> ragflow_dataset_ids on creation/update.
 *
 * @param {ChatTabProps} props - Component props
 * @returns {JSX.Element} The rendered chat tab content
 */
const ChatTab = ({
  knowledgeBaseId,
  initialChats,
  categories,
  categoryVersions,
  chatModels,
}: ChatTabProps) => {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // -- State --
  const [chats, setChats] = useState<KnowledgeBaseChat[]>(initialChats)
  const [chatModalOpen, setChatModalOpen] = useState(false)
  const [editingChat, setEditingChat] = useState<KnowledgeBaseChat | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [permChatId, setPermChatId] = useState<string | null>(null)
  const [permChatName, setPermChatName] = useState('')

  // Sync with parent if initialChats changes
  useEffect(() => {
    setChats(initialChats)
  }, [initialChats])

  // -- Helpers --

  /**
   * Resolve selected category IDs into local version IDs and ragflow_dataset_ids.
   * Only active versions with a ragflow_dataset_id are included.
   *
   * @param categoryIds - Array of selected category IDs
   * @returns Object with dataset_ids (local) and ragflow_dataset_ids
   */
  const resolveDatasetIds = (categoryIds: string[]) => {
    const datasetIds: string[] = []
    const ragflowDatasetIds: string[] = []

    for (const catId of categoryIds) {
      const versions = categoryVersions[catId] || []
      for (const version of versions) {
        if (version.ragflow_dataset_id && version.status === 'active') {
          datasetIds.push(version.id)
          ragflowDatasetIds.push(version.ragflow_dataset_id)
        }
      }
    }
    return { datasetIds, ragflowDatasetIds }
  }

  /**
   * Build a display map: category ID -> category name for table column rendering.
   */
  const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]))

  /**
   * Resolve a chat's dataset_ids back to category names for display.
   *
   * @param chat - The chat record
   * @returns Array of category names that match
   */
  const getChatCategoryNames = (chat: KnowledgeBaseChat): string[] => {
    const names: string[] = []
    const matchedCatIds = new Set<string>()

    for (const versionId of chat.dataset_ids || []) {
      for (const [catId, versions] of Object.entries(categoryVersions)) {
        if (versions.some((v) => v.id === versionId) && !matchedCatIds.has(catId)) {
          matchedCatIds.add(catId)
          const name = categoryNameMap.get(catId)
          if (name) names.push(name)
        }
      }
    }
    return names
  }

  // -- Handlers --

  /**
   * Open modal in create mode.
   */
  const handleOpenCreate = () => {
    setEditingChat(null)
    setChatModalOpen(true)
  }

  /**
   * Open modal in edit mode with existing chat data.
   *
   * @param chat - Chat record to edit
   */
  const handleOpenEdit = (chat: KnowledgeBaseChat) => {
    setEditingChat(chat)
    setChatModalOpen(true)
  }

  /**
   * Create or update a chat assistant with full config.
   * Resolves category selections to ragflow_dataset_ids before submitting.
   *
   * @param data - Form data from ChatModal
   */
  const handleSaveChat = async (data: ChatFormData) => {
    try {
      setSaving(true)

      // Resolve selected categories -> dataset IDs
      const { datasetIds, ragflowDatasetIds } = resolveDatasetIds(
        data.category_ids || [],
      )

      // Build the payload
      const payload = {
        name: data.name,
        dataset_ids: datasetIds,
        ragflow_dataset_ids: ragflowDatasetIds,
        llm_config: (data.llm_config || {}) as unknown as Record<string, unknown>,
        prompt_config: (data.prompt_config || {}) as unknown as Record<string, unknown>,
      }

      if (editingChat) {
        // Update existing chat
        await updateKnowledgeBaseChat(knowledgeBaseId, editingChat.id, payload)
        globalMessage.success(t('knowledgeBase.chats.updateSuccess'))
      } else {
        // Create new chat
        await createKnowledgeBaseChat(knowledgeBaseId, payload)
        globalMessage.success(t('knowledgeBase.chats.createSuccess'))
      }

      setChatModalOpen(false)
      setEditingChat(null)
      const chatData = await getKnowledgeBaseChats(knowledgeBaseId)
      setChats(chatData)
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Delete a chat assistant after confirmation.
   *
   * @param chatId - Chat UUID to delete
   */
  const handleDeleteChat = async (chatId: string) => {
    // Prompt confirmation before deleting
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('knowledgeBase.chats.deleteConfirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteKnowledgeBaseChat(knowledgeBaseId, chatId)
      const chatData = await getKnowledgeBaseChats(knowledgeBaseId)
      setChats(chatData)
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  /**
   * Sync a chat assistant from RAGFlow.
   *
   * @param chatId - Chat UUID to sync
   */
  const handleSyncChat = async (chatId: string) => {
    try {
      setSyncingId(chatId)
      await syncKnowledgeBaseChat(knowledgeBaseId, chatId)
      const chatData = await getKnowledgeBaseChats(knowledgeBaseId)
      setChats(chatData)
      globalMessage.success(t('knowledgeBase.chats.syncSuccess'))
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setSyncingId(null)
    }
  }

  // -- Render --

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('knowledgeBase.chats.title')}
          </h3>
          <Button variant="outline" size="sm" onClick={handleOpenCreate}>
            <Plus size={14} className="mr-1" />
            {t('knowledgeBase.chats.add')}
          </Button>
        </div>

        {/* Chat assistant table */}
        {chats.length === 0 ? (
          <EmptyState description={t('knowledgeBase.chats.noChatsHint')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('knowledgeBase.chats.name')}</TableHead>
                <TableHead>{t('knowledgeBase.chats.datasets')}</TableHead>
                <TableHead>RAGFlow ID</TableHead>
                <TableHead className="w-[150px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {chats.map((chat) => {
                const names = getChatCategoryNames(chat)
                return (
                  <TableRow key={chat.id}>
                    {/* Name */}
                    <TableCell>{chat.name}</TableCell>

                    {/* Datasets (category names) */}
                    <TableCell>
                      {names.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {names.map((name) => (
                            <Badge key={name} variant="info">{name}</Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>

                    {/* RAGFlow ID */}
                    <TableCell className="truncate max-w-[200px]">
                      {chat.ragflow_chat_id || '—'}
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setPermChatId(chat.id); setPermChatName(chat.name) }}
                              >
                                <Lock size={14} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('knowledgeBase.entityPermissions.title', 'Permissions')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleOpenEdit(chat)}
                              >
                                <Pencil size={14} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('knowledgeBase.chats.edit')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={syncingId === chat.id}
                                onClick={() => handleSyncChat(chat.id)}
                              >
                                {syncingId === chat.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <RefreshCw size={14} />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('knowledgeBase.chats.sync')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteChat(chat.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('common.delete')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Chat create/edit modal */}
      <ChatModal
        open={chatModalOpen}
        saving={saving}
        onOk={handleSaveChat}
        onCancel={() => {
          setChatModalOpen(false)
          setEditingChat(null)
        }}
        categories={categories}
        categoryVersions={categoryVersions}
        chatModels={chatModels}
        editingChat={editingChat}
      />
      {permChatId && (
        <EntityPermissionModal
          open={!!permChatId}
          onClose={() => setPermChatId(null)}
          knowledgeBaseId={knowledgeBaseId}
          entityType="chat"
          entityId={permChatId}
          entityName={permChatName}
        />
      )}
    </>
  )
}

export default ChatTab
