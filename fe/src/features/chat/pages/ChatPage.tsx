/**
 * @fileoverview Dataset Chat page - main chat interface.
 * Composes ChatSidebar, ChatMessageList, ChatInput, and ChatReferencePanel.
 * @module features/ai/pages/DatasetChatPage
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2, PanelRightOpen, PanelRightClose } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useFirstVisit, GuidelineDialog } from '@/features/guideline'
import ChatSidebar from '../components/ChatSidebar'
import ChatMessageList from '../components/ChatMessageList'
import ChatInput from '../components/ChatInput'
import ChatReferencePanel from '../components/ChatReferencePanel'
import ChatDialogConfig from '../components/ChatDialogConfig'
import { useChatDialogs } from '../hooks/useChatDialogs'
import { useChatConversations } from '../hooks/useChatConversations'
import { useChatStream } from '../hooks/useChatStream'
import { chatApi } from '../api/chatApi'
import type { ChatReference, ChatChunk, CreateDialogPayload } from '../types/chat.types'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Main dataset chat page with three-panel layout:
 * left sidebar (conversations), center (chat), right panel (references).
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

  // Dialog config modal
  const [showDialogConfig, setShowDialogConfig] = useState(false)
  const [availableDatasets, setAvailableDatasets] = useState<{ id: string; name: string }[]>([])

  // Hooks
  const dialogs = useChatDialogs()
  const conversations = useChatConversations(dialogs.activeDialog?.id || null)
  const stream = useChatStream(
    conversations.activeConversation?.id || null,
    dialogs.activeDialog?.id || null,
  )

  // Show first-visit guide
  useEffect(() => {
    if (isFirstVisit) {
      setShowGuide(true)
    }
  }, [isFirstVisit])

  // Load conversation messages when active conversation changes
  useEffect(() => {
    const conv = conversations.activeConversation
    if (conv?.messages) {
      stream.setMessages(conv.messages)
    } else {
      stream.clearMessages()
    }
    // Only trigger on conversation change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.activeConversation?.id])

  /**
   * Handle sending a message: auto-create conversation if none active.
   */
  const handleSendMessage = async (content: string) => {
    // Create conversation if none exists
    if (!conversations.activeConversation) {
      const conv = await conversations.createConversation(content.slice(0, 50))
      if (!conv) return
    }
    stream.sendMessage(content)
  }

  /**
   * Handle citation click: open reference panel.
   */
  const handleCitationClick = (reference: ChatReference) => {
    setActiveReference(reference)
    setShowReferences(true)
  }

  /**
   * Handle inline chunk citation click: open reference panel and highlight the chunk's document.
   */
  const handleChunkCitationClick = (chunk: ChatChunk) => {
    // Build a reference with just this chunk for focused preview
    const reference: ChatReference = {
      chunks: [chunk],
      doc_aggs: [{ doc_id: chunk.doc_id, doc_name: chunk.docnm_kwd, count: 1 }],
    }
    setActiveReference(reference)
    setShowReferences(true)
  }

  /**
   * Handle dialog config open: fetch datasets list.
   */
  const handleOpenConfig = async () => {
    try {
      const ds = await chatApi.listDatasets()
      setAvailableDatasets(ds)
    } catch {
      // Proceed with empty list
    }
    setShowDialogConfig(true)
  }

  /**
   * Handle dialog config save.
   */
  const handleSaveDialog = (data: CreateDialogPayload) => {
    if (dialogs.activeDialog) {
      chatApi.updateDialog(dialogs.activeDialog.id, data).then(() => dialogs.refresh())
    } else {
      dialogs.createDialog(data)
    }
  }

  // Loading state while dialogs are fetched
  if (dialogs.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner label={t('common.loading')} />
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full w-full overflow-hidden bg-background">
        {/* Left sidebar: conversation list */}
        <ChatSidebar
          className="w-72 shrink-0 hidden md:flex"
          conversations={conversations.conversations}
          loading={conversations.loading}
          activeConversationId={conversations.activeConversation?.id}
          onSelect={conversations.setActiveConversationId}
          onCreate={() => { conversations.createConversation() }}
          onDelete={conversations.deleteConversation}
          search={conversations.search}
          onSearchChange={conversations.setSearch}
        />

        {/* Center: chat area */}
        <div className="flex-1 flex flex-col min-w-0 chat-area-bg">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold truncate text-foreground/90">
                {conversations.activeConversation?.name || t('chat.newConversation')}
              </h2>
              {dialogs.activeDialog && (
                <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                  {dialogs.activeDialog.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Config button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted/60 transition-colors"
                onClick={handleOpenConfig}
                title={t('chat.dialogSettings')}
              >
                <Settings2 className="h-4 w-4" />
              </Button>

              {/* Toggle reference panel */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted/60 transition-colors"
                onClick={() => setShowReferences(!showReferences)}
                title={t('chat.toggleReferences')}
              >
                {showReferences ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
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
            className="flex-1"
          />

          {/* Chat input */}
          <ChatInput
            onSend={handleSendMessage}
            onStop={stream.stopStream}
            isStreaming={stream.isStreaming}
            disabled={!dialogs.activeDialog}
          />
        </div>

        {/* Right panel: document references */}
        {showReferences && (
          <ChatReferencePanel
            className={cn('w-80 shrink-0 hidden lg:flex')}
            reference={activeReference || stream.references}
            onClose={() => setShowReferences(false)}
          />
        )}
      </div>

      {/* Dialog config modal */}
      <ChatDialogConfig
        open={showDialogConfig}
        onClose={() => setShowDialogConfig(false)}
        onSave={handleSaveDialog}
        dialog={dialogs.activeDialog}
        datasets={availableDatasets}
      />

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
