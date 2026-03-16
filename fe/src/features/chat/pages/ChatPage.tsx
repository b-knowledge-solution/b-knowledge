/**
 * @fileoverview Dataset Chat page - main chat interface.
 * Composes ChatSidebar, ChatMessageList, ChatInput, ChatReferencePanel, and ChatDocumentPreviewDrawer.
 * Shows a variable form when the assistant has required variables without defaults.
 * @module features/chat/pages/ChatPage
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelRightOpen, PanelRightClose, Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useFirstVisit, GuidelineDialog } from '@/features/guideline'
import ChatSidebar from '../components/ChatSidebar'
import ChatMessageList from '../components/ChatMessageList'
import ChatInput from '../components/ChatInput'
import ChatFileUpload from '../components/ChatFileUpload'
import ChatReferencePanel from '../components/ChatReferencePanel'
import ChatDocumentPreviewDrawer from '../components/ChatDocumentPreviewDrawer'
import { useChatAssistants } from '../api/chatQueries'
import { useChatConversations, useRenameConversation } from '../api/chatQueries'
import { useChatStream } from '../hooks/useChatStream'
import { useChatFiles } from '../hooks/useChatFiles'
import type { ChatReference, ChatChunk, PromptVariable, SendMessageOptions } from '../types/chat.types'

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Determine which variables require user input (required, no default).
 * @param variables - Variable definitions from the assistant
 * @returns Array of variables that the user must fill
 */
function getRequiredVariables(variables?: PromptVariable[]): PromptVariable[] {
  if (!variables) return []
  return variables.filter((v) => !v.optional && !v.default_value)
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Main dataset chat page with three-panel layout:
 * left sidebar (conversations), center (chat), right panel (references).
 * When an assistant has required variables without defaults, a small form is shown
 * above the chat input before the first message can be sent.
 *
 * @returns {JSX.Element} The rendered dataset chat page
 */
function DatasetChatPage() {
  const { t } = useTranslation()
  const { isFirstVisit } = useFirstVisit('ai-chat')
  const [showGuide, setShowGuide] = useState(false)

  // Reference panel visibility
  const [showReferences, setShowReferences] = useState(false)
  const [activeReference, setActiveReference] = useState<ChatReference | null>(null)

  // Document preview drawer state
  const [showDocPreview, setShowDocPreview] = useState(false)
  const [previewChunk, setPreviewChunk] = useState<ChatChunk | null>(null)

  // Variable values state (user-provided values for required variables)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})

  // Mobile sidebar drawer state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Hooks
  const assistants = useChatAssistants()
  const conversations = useChatConversations(assistants.activeAssistant?.id || null)
  const stream = useChatStream(
    conversations.activeConversation?.id || null,
    assistants.activeAssistant?.id || null,
  )
  const chatFiles = useChatFiles(conversations.activeConversation?.id || null)
  const renameMutation = useRenameConversation()

  // Compute required variables from the active assistant
  const assistantVariables = assistants.activeAssistant?.prompt_config?.variables
  const requiredVars = getRequiredVariables(assistantVariables)
  const hasRequiredVars = requiredVars.length > 0

  // Show first-visit guide
  useEffect(() => {
    if (isFirstVisit) {
      setShowGuide(true)
    }
  }, [isFirstVisit])

  // Load conversation messages when active conversation changes
  useEffect(() => {
    // Abort any in-flight stream when switching conversations
    if (stream.isStreaming) {
      stream.stopStream()
    }

    const conv = conversations.activeConversation
    if (conv?.messages) {
      stream.setMessages(conv.messages)
    } else {
      stream.clearMessages()
    }
    // Only trigger on conversation change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.activeConversation?.id])

  // Reset variable values when assistant changes
  useEffect(() => {
    setVariableValues({})
  }, [assistants.activeAssistant?.id])

  /**
   * @description Check if all required variables have been filled.
   * @returns True if all required variables have non-empty values
   */
  const areVariablesFilled = (): boolean => {
    if (!hasRequiredVars) return true
    return requiredVars.every((v) => {
      const val = variableValues[v.key]
      return val !== undefined && val.trim().length > 0
    })
  }

  /**
   * @description Handle sending a message: auto-create conversation if none active.
   * Passes variable values and toggle options to sendMessage.
   */
  const handleSendMessage = async (
    content: string,
    options?: { reasoning?: boolean; useInternet?: boolean; file_ids?: string[] },
  ) => {
    // Create conversation if none exists
    if (!conversations.activeConversation) {
      const conv = await conversations.createConversation(content.slice(0, 50))
      if (!conv) return
    }

    // Build send options including variables
    const sendOptions: SendMessageOptions = {
      ...options,
    }

    // Include variable values (merge user-provided with defaults)
    if (assistantVariables && assistantVariables.length > 0) {
      const vars: Record<string, string> = {}
      for (const v of assistantVariables) {
        const userVal = variableValues[v.key]
        if (userVal !== undefined && userVal.trim().length > 0) {
          vars[v.key] = userVal
        }
      }
      if (Object.keys(vars).length > 0) {
        sendOptions.variables = vars
      }
    }

    // Include file attachment IDs
    if (chatFiles.fileIds.length > 0) {
      sendOptions.file_ids = chatFiles.fileIds
    }

    stream.sendMessage(content, sendOptions)

    // Clear files after sending
    chatFiles.clearFiles()
  }

  /**
   * @description Handle citation click: open reference panel with clicked reference.
   */
  const handleCitationClick = (reference: ChatReference) => {
    setActiveReference(reference)
    setShowReferences(true)
  }

  /**
   * @description Handle inline chunk citation click: open document preview drawer.
   */
  const handleChunkCitationClick = (chunk: ChatChunk) => {
    setPreviewChunk(chunk)
    setShowDocPreview(true)
  }

  /**
   * @description Handle document click from reference panel: find chunk and open preview drawer.
   */
  const handleDocumentClick = (docId: string) => {
    const ref = activeReference || stream.references
    const chunk = ref?.chunks.find((c) => c.doc_id === docId)
    if (chunk) {
      setPreviewChunk(chunk)
      setShowDocPreview(true)
    }
  }

  /**
   * @description Handle regenerating the last assistant message.
   */
  const handleRegenerate = () => {
    stream.regenerateLastMessage()
  }

  /**
   * @description Handle renaming a conversation from the sidebar.
   */
  const handleRenameConversation = (id: string, newName: string) => {
    renameMutation.mutate(
      { conversationId: id, name: newName },
      {
        onSuccess: () => {
          conversations.refresh()
        },
      },
    )
  }

  // Loading state while assistants are fetched
  if (assistants.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-blue-600" />
          {t('common.loading')}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full w-full overflow-hidden bg-white dark:bg-slate-900">
        {/* Left sidebar: conversation list */}
        <ChatSidebar
          className="w-72 shrink-0 hidden md:flex"
          conversations={conversations.conversations}
          loading={conversations.loading}
          activeConversationId={conversations.activeConversation?.id}
          onSelect={conversations.setActiveConversationId}
          onCreate={() => { conversations.createConversation() }}
          onDelete={conversations.deleteConversation}
          onRename={handleRenameConversation}
          search={conversations.search}
          onSearchChange={conversations.setSearch}
        />

        {/* Center: chat area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              {/* Mobile hamburger menu */}
              <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors md:hidden">
                    <Menu className="h-4 w-4" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <ChatSidebar
                    className="w-full h-full flex"
                    conversations={conversations.conversations}
                    loading={conversations.loading}
                    activeConversationId={conversations.activeConversation?.id}
                    onSelect={(id) => { conversations.setActiveConversationId(id); setMobileSidebarOpen(false) }}
                    onCreate={() => { conversations.createConversation(); setMobileSidebarOpen(false) }}
                    onDelete={conversations.deleteConversation}
                    onRename={handleRenameConversation}
                    search={conversations.search}
                    onSearchChange={conversations.setSearch}
                  />
                </SheetContent>
              </Sheet>
              <h2 className="text-sm font-semibold truncate text-slate-800 dark:text-slate-200">
                {conversations.activeConversation?.name || t('chat.newConversation')}
              </h2>
              {assistants.activeAssistant && (
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                  {assistants.activeAssistant.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Toggle reference panel */}
              <button
                className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                onClick={() => setShowReferences(!showReferences)}
                title={t('chat.toggleReferences')}
              >
                {showReferences ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Message list */}
          <ChatMessageList
            messages={stream.messages}
            isStreaming={stream.isStreaming}
            currentAnswer={stream.currentAnswer}
            onCitationClick={handleCitationClick}
            onChunkCitationClick={handleChunkCitationClick}
            onSuggestedPrompt={handleSendMessage}
            onRegenerate={handleRegenerate}
            className="flex-1"
            conversationId={conversations.activeConversation?.id}
          />

          {/* Variable form - shown when assistant has required variables without defaults */}
          {hasRequiredVars && stream.messages.length === 0 && (
            <div className="px-4 py-3 border-t border-slate-200/60 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
              <div className="max-w-3xl mx-auto space-y-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('chat.fillVariables')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {requiredVars.map((v) => (
                    <div key={v.key} className="space-y-1">
                      <label className="text-xs text-slate-600 dark:text-slate-400">
                        {v.description || v.key}
                        <span className="text-red-500 ml-0.5">*</span>
                      </label>
                      <input
                        value={variableValues[v.key] ?? ''}
                        onChange={(e) =>
                          setVariableValues((prev) => ({ ...prev, [v.key]: e.target.value }))
                        }
                        placeholder={v.default_value || v.key}
                        className="w-full h-8 px-2.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* File attachment preview strip */}
          <ChatFileUpload
            files={chatFiles.files}
            isUploading={chatFiles.isUploading}
            uploadError={chatFiles.uploadError}
            onRemove={chatFiles.removeFile}
          />

          {/* Chat input with reasoning and internet search toggles */}
          <ChatInput
            onSend={handleSendMessage}
            onStop={stream.stopStream}
            isStreaming={stream.isStreaming}
            disabled={!assistants.activeAssistant || (hasRequiredVars && !areVariablesFilled())}
            showReasoningToggle={true}
            showInternetToggle={true}
            showFileUpload={true}
            onFilesSelected={(files) => chatFiles.uploadFiles(files)}
            fileIds={chatFiles.fileIds}
          />
        </div>

        {/* Right panel: document references (desktop) */}
        {showReferences && (
          <ChatReferencePanel
            className="w-80 shrink-0 hidden lg:flex"
            reference={activeReference || stream.references}
            onClose={() => setShowReferences(false)}
            onDocumentClick={handleDocumentClick}
          />
        )}

        {/* Right panel: document references (mobile drawer) */}
        <Sheet open={showReferences} onOpenChange={setShowReferences}>
          <SheetContent side="right" className="w-80 p-0 lg:hidden">
            <ChatReferencePanel
              className="w-full h-full flex"
              reference={activeReference || stream.references}
              onClose={() => setShowReferences(false)}
              onDocumentClick={handleDocumentClick}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Document preview drawer */}
      {(() => {
        // Find the dataset_id for the preview chunk from references
        const previewDatasetId = (() => {
          if (!previewChunk) return assistants.activeAssistant?.kb_ids[0]
          const ref = stream.references
          const match = ref?.chunks.find((c) => c.doc_id === previewChunk.doc_id)
          // If chunk has dataset_id (from backend), use it; otherwise fall back to first KB
          return (match as any)?.dataset_id || assistants.activeAssistant?.kb_ids[0]
        })()

        return (
          <ChatDocumentPreviewDrawer
            open={showDocPreview}
            onClose={() => setShowDocPreview(false)}
            chunk={previewChunk}
            datasetId={previewDatasetId}
          />
        )
      })()}

      {/* First visit guide */}
      <GuidelineDialog
        open={showGuide}
        onClose={() => setShowGuide(false)}
        featureId="ai-chat"
      />
    </>
  )
}

export default DatasetChatPage
