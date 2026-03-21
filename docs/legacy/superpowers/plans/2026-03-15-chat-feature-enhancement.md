# Chat Feature Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance B-Knowledge chat to match RAGFlow feature parity while preserving the admin-managed dialog model (admin creates chat assistants, grants access to users/teams).

**Architecture:** Three-phase approach — Phase 1 delivers core UX improvements (grounded citations, file upload, message regeneration, conversation management), Phase 2 adds advanced RAG features (custom variables, metadata filtering, per-message overrides), Phase 3 adds external integration (embeddable widget, OpenAI-compatible API). Each phase is independently deployable and testable.

**Tech Stack:** Express 4.21 + TypeScript (BE), React 19 + TanStack Query + shadcn/ui (FE), OpenAI SDK for LLM, Multer + RustFS/S3 for file storage, Vitest for tests, OpenSearch for retrieval.

**Key Business Logic Difference from RAGFlow:** In B-Knowledge, admins create and configure chat assistants (dialogs) and grant access to users/teams. Users only consume chat — they cannot create or configure assistants. All dialog management requires `manage_users` permission.

---

## File Structure Overview

### New Files to Create

```
be/src/modules/chat/
├── routes/chat-file.routes.ts          # File upload routes for chat
├── services/chat-file.service.ts       # File upload + S3 storage logic
├── models/chat-file.model.ts           # Chat file attachment model
├── schemas/chat-file.schemas.ts        # Zod schemas for file upload
├── controllers/chat-file.controller.ts # File upload handlers
├── routes/chat-openai.routes.ts        # OpenAI-compatible API routes
├── controllers/chat-openai.controller.ts # OpenAI-compatible handlers
├── services/chat-openai.service.ts     # OpenAI response format mapper

be/src/shared/db/migrations/
├── 20260316000000_chat_files.ts        # chat_files table
├── 20260316000001_chat_dialog_variables.ts # prompt variables support

fe/src/features/chat/
├── components/ChatDocumentPreviewDrawer.tsx  # Document viewer drawer
├── components/ChatFileUpload.tsx             # File upload in chat input
├── components/ChatVariableForm.tsx           # Custom prompt variables
├── components/ChatMetadataFilter.tsx         # Metadata filter config
├── hooks/useChatFiles.ts                     # File upload hook

fe/src/features/chat-widget/
├── index.ts                            # Widget barrel export
├── ChatWidget.tsx                      # Embeddable widget root
├── ChatWidgetButton.tsx                # Floating trigger button
├── ChatWidgetWindow.tsx                # Chat window overlay
├── chatWidgetApi.ts                    # Token-based API client
├── vite.widget.config.ts              # Separate Vite build for widget bundle
```

### Existing Files to Modify

```
BE:
├── be/src/modules/chat/index.ts                              # Export new routes/services
├── be/src/modules/chat/schemas/chat-conversation.schemas.ts  # Add file_ids, doc_ids, variables, metadata
├── be/src/modules/chat/schemas/chat-dialog.schemas.ts        # Add variables to prompt_config
├── be/src/modules/chat/services/chat-conversation.service.ts # File URL injection, variables, metadata filter
├── be/src/modules/chat/services/chat-dialog.service.ts       # Name uniqueness, pagination
├── be/src/modules/chat/routes/chat-conversation.routes.ts    # Rename endpoint, regenerate endpoint
├── be/src/modules/chat/routes/chat-dialog.routes.ts          # Pagination params
├── be/src/modules/chat/controllers/chat-conversation.controller.ts # New handlers
├── be/src/modules/chat/controllers/chat-dialog.controller.ts      # Pagination
├── be/src/modules/chat/models/chat-session.model.ts          # Add rename method
├── be/src/modules/rag/services/rag-search.service.ts         # Position data + metadata filter
├── be/src/shared/services/llm-client.service.ts              # Multimodal message support
├── be/src/shared/models/types.ts                             # New interfaces
├── be/src/shared/db/migrations/20260312000000_initial_schema.ts # Reference only (no modify)
├── be/src/app/routes.ts                                      # Mount new routes

FE:
├── fe/src/features/chat/api/chatApi.ts                  # New API functions
├── fe/src/features/chat/api/chatQueries.ts              # New hooks
├── fe/src/features/chat/hooks/useChatStream.ts          # Regeneration support
├── fe/src/features/chat/pages/ChatPage.tsx               # Document preview, file upload, prologue
├── fe/src/features/chat/pages/ChatDialogManagementPage.tsx # Pagination, search
├── fe/src/features/chat/components/ChatInput.tsx         # File upload, toggles
├── fe/src/features/chat/components/ChatMessage.tsx       # Regenerate button, doc viewer click
├── fe/src/features/chat/components/ChatMessageList.tsx   # Prologue message
├── fe/src/features/chat/components/ChatReferencePanel.tsx # Connect document click
├── fe/src/features/chat/components/ChatDialogConfig.tsx  # Variables, metadata filter
├── fe/src/features/chat/components/ChatSidebar.tsx       # Rename, batch delete
├── fe/src/features/chat/types/chat.types.ts              # New types
├── fe/src/components/CitationInline.tsx                   # Enhanced click handler
├── fe/src/app/routeConfig.ts                             # Widget route (if needed)
├── fe/src/i18n/locales/en.json                           # New i18n keys
├── fe/src/i18n/locales/vi.json                           # New i18n keys
├── fe/src/i18n/locales/ja.json                           # New i18n keys
```

---

## Chunk 1: Phase 1 — Core Chat UX

### Task 1.0: Remove All Config/Settings UI from User-Facing Chat Page (PRIORITY)

**Files:**
- Modify: `fe/src/features/chat/pages/ChatPage.tsx:45-46, 111-130, 173-181, 231-237`

**Context:** The user-facing `/chat` page MUST be pure consumption — zero configuration UI. All chat assistant configuration belongs exclusively in the Data Studio admin page at `/data-studio/chat-dialogs` (ChatDialogManagementPage). Currently, ChatPage.tsx has:
1. A Settings2 button (line 173-181) that opens ChatDialogConfig
2. ChatDialogConfig modal (line 231-237) with temperature, KB selection, system prompt, etc.
3. State and handlers for config: `showDialogConfig`, `availableDatasets`, `handleOpenConfig`, `handleSaveDialog`

All of this must be removed — not hidden behind a role check, but fully removed from the user page.

- [ ] **Step 1: Remove config state variables**

In `fe/src/features/chat/pages/ChatPage.tsx`, remove these state declarations:
```tsx
// DELETE line 45: const [showDialogConfig, setShowDialogConfig] = useState(false)
// DELETE line 46: const [availableDatasets, setAvailableDatasets] = useState<...>([])
```

- [ ] **Step 2: Remove config handlers**

Remove `handleOpenConfig` (lines 111-119) and `handleSaveDialog` (lines 124-130) entirely.

- [ ] **Step 3: Remove Settings button from header**

Remove the Settings2 button block entirely (lines 173-181):
```tsx
// DELETE this entire block:
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 hover:bg-muted/60 transition-colors"
  onClick={handleOpenConfig}
  title={t('chat.dialogSettings')}
>
  <Settings2 className="h-4 w-4" />
</Button>
```

- [ ] **Step 4: Remove ChatDialogConfig modal**

Remove the ChatDialogConfig component rendering (lines 231-237):
```tsx
// DELETE this entire block:
<ChatDialogConfig
  open={showDialogConfig}
  onClose={() => setShowDialogConfig(false)}
  onSave={handleSaveDialog}
  dialog={dialogs.activeDialog}
  datasets={availableDatasets}
/>
```

- [ ] **Step 5: Clean up unused imports**

Remove `Settings2` from lucide-react imports and `ChatDialogConfig` from component imports if no longer used.

- [ ] **Step 6: Verify build**

Run: `cd fe && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add fe/src/features/chat/pages/ChatPage.tsx
git commit -m "fix: remove all config/settings UI from user-facing chat page

Config belongs exclusively in Data Studio admin page (/data-studio/chat-dialogs).
User chat page is pure consumption — no settings, no config modals."
```

---

### Task 1.1: Grounded Citations — Fix Backend Position Data

**Files:**
- Modify: `be/src/modules/rag/services/rag-search.service.ts:338-352` (mapHits)
- Modify: `be/src/shared/models/types.ts` (ChunkResult interface)
- Test: `be/tests/rag/rag-search.service.test.ts`

**Context:** Currently `position_int` is mapped as a scalar. OpenSearch stores it as integer, but the advance-rag worker may store full position arrays in a different field. We need to also retrieve `positions` field (array of `[page, x1, x2, y1, y2]`) if available, falling back to constructing from `page_num_int` + `top_int`.

- [ ] **Step 1: Write failing test for position data mapping**

```typescript
// be/tests/rag/rag-search.service.test.ts
describe('mapHits position data', () => {
  it('should return positions as number[][] when available', () => {
    const hits = [{
      _id: 'chunk-1',
      _score: 0.95,
      _source: {
        content_with_weight: 'test content',
        doc_id: 'doc-1',
        docnm_kwd: 'test.pdf',
        page_num_int: 2,
        position_int: [[2, 100, 500, 200, 300]],
        top_int: 200,
      }
    }]
    const result = service['mapHits'](hits)
    expect(result[0].positions).toEqual([[2, 100, 500, 200, 300]])
    expect(result[0].page_num).toBe(2)
  })

  it('should construct positions from page_num + top_int when position_int is scalar', () => {
    const hits = [{
      _id: 'chunk-2',
      _score: 0.8,
      _source: {
        content_with_weight: 'test',
        doc_id: 'doc-1',
        docnm_kwd: 'test.pdf',
        page_num_int: 3,
        position_int: 0,
        top_int: 450,
      }
    }]
    const result = service['mapHits'](hits)
    expect(result[0].positions).toEqual([[3, 0, 0, 450, 0]])
    expect(result[0].page_num).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd be && npx vitest run tests/rag/rag-search.service.test.ts --reporter=verbose`
Expected: FAIL — positions not mapped correctly

- [ ] **Step 3: Fix mapHits to handle both position formats**

In `be/src/modules/rag/services/rag-search.service.ts`, update the `mapHits` method (around line 338-352):

```typescript
private mapHits(hits: any[], method?: string): ChunkResult[] {
  return hits.map(hit => {
    const src = hit._source || {}
    const pageNum = src.page_num_int ?? 0
    const topInt = src.top_int ?? 0

    // position_int can be: array of arrays (full coords), scalar (legacy), or missing
    let positions: number[][] = []
    if (Array.isArray(src.position_int) && src.position_int.length > 0) {
      // Full coordinate arrays: [[page, x1, x2, y1, y2], ...]
      positions = Array.isArray(src.position_int[0])
        ? src.position_int
        : [[pageNum, 0, 0, topInt, 0]]
    } else if (typeof src.position_int === 'number' || typeof src.positions === 'object') {
      // Legacy scalar or separate positions field
      const posField = src.positions ?? src.position_int
      if (Array.isArray(posField)) {
        positions = posField
      } else {
        positions = pageNum > 0 ? [[pageNum, 0, 0, topInt, 0]] : []
      }
    }

    return {
      chunk_id: hit._id,
      text: src.content_with_weight || src.content_ltks || '',
      doc_id: src.doc_id || '',
      doc_name: src.docnm_kwd || '',
      page_num: pageNum,
      positions,
      score: hit._score || 0,
      img_id: src.img_id,
      method,
    }
  })
}
```

- [ ] **Step 4: Update ChunkResult type if needed**

In `be/src/shared/models/types.ts`, ensure ChunkResult has:
```typescript
positions: number[][]  // [[page, x1, x2, y1, y2], ...]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd be && npx vitest run tests/rag/rag-search.service.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add be/src/modules/rag/services/rag-search.service.ts be/src/shared/models/types.ts be/tests/rag/rag-search.service.test.ts
git commit -m "fix: return proper position arrays from OpenSearch for PDF highlighting"
```

---

### Task 1.2: Grounded Citations — Connect Document Viewer in Frontend

**Files:**
- Create: `fe/src/features/chat/components/ChatDocumentPreviewDrawer.tsx`
- Modify: `fe/src/features/chat/pages/ChatPage.tsx:37-130`
- Modify: `fe/src/features/chat/components/ChatReferencePanel.tsx:114-126`
- Modify: `fe/src/features/chat/components/ChatMessage.tsx:125-138`
- Modify: `fe/src/components/CitationInline.tsx:86`
- Modify: `fe/src/i18n/locales/en.json`, `vi.json`, `ja.json`
- Reference: `fe/src/components/DocumentPreviewer/DocumentPreviewer.tsx:25-33` (existing component)

**Context:** DocumentPreviewer exists and works in datasets feature. We need a drawer wrapper for chat that opens it with the selected chunk highlighted.

- [ ] **Step 1: Create ChatDocumentPreviewDrawer component**

```tsx
// fe/src/features/chat/components/ChatDocumentPreviewDrawer.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DocumentPreviewer } from '@/components/DocumentPreviewer'
import { useTranslation } from 'react-i18next'
import type { ChatChunk } from '../types/chat.types'

interface ChatDocumentPreviewDrawerProps {
  open: boolean
  onClose: () => void
  chunk: ChatChunk | null
  datasetId: string
}

export function ChatDocumentPreviewDrawer({
  open,
  onClose,
  chunk,
  datasetId,
}: ChatDocumentPreviewDrawerProps) {
  const { t } = useTranslation()

  if (!chunk) return null

  const downloadUrl = `/api/rag/datasets/${datasetId}/documents/${chunk.doc_id}/download`

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[80vw] max-w-[1200px] sm:max-w-[1200px] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-sm font-medium truncate">
            {chunk.docnm_kwd}
          </SheetTitle>
        </SheetHeader>
        <div className="h-[calc(100vh-60px)]">
          <DocumentPreviewer
            datasetId={datasetId}
            docId={chunk.doc_id}
            fileName={chunk.docnm_kwd}
            downloadUrl={downloadUrl}
            showChunks
            selectedChunk={{
              id: chunk.chunk_id,
              content: chunk.content_with_weight,
              page_num: chunk.page_num_int,
              positions: chunk.positions ?? [],
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Add drawer state to ChatPage**

In `fe/src/features/chat/pages/ChatPage.tsx`, add state and handler:

```tsx
// After line 42 (activeReference state)
const [previewChunk, setPreviewChunk] = useState<ChatChunk | null>(null)
const [showDocPreview, setShowDocPreview] = useState(false)

// New handler — opens document viewer for a chunk
const handleOpenDocument = (chunk: ChatChunk) => {
  setPreviewChunk(chunk)
  setShowDocPreview(true)
}

// In the JSX, add the drawer (after ChatReferencePanel):
<ChatDocumentPreviewDrawer
  open={showDocPreview}
  onClose={() => setShowDocPreview(false)}
  chunk={previewChunk}
  datasetId={dialogs.activeDialog?.kb_ids?.[0] ?? ''}
/>
```

- [ ] **Step 3: Wire onDocumentClick in ChatReferencePanel**

In `fe/src/features/chat/pages/ChatPage.tsx`, pass handler to ChatReferencePanel:

```tsx
<ChatReferencePanel
  reference={activeReference}
  onClose={() => setShowReferences(false)}
  onChunkClick={handleOpenDocument}
/>
```

Update `ChatReferencePanel.tsx` to add chunk click on "Open document" button (line 114-126):
```tsx
// Change onDocumentClick prop to onChunkClick
onChunkClick?: (chunk: ChatChunk) => void

// In DocumentItem, pass first chunk for the document:
<Button
  variant="ghost"
  size="sm"
  onClick={() => onChunkClick?.(docChunks[0])}
>
  {t('chat.openDocument')}
</Button>
```

- [ ] **Step 4: Wire citation inline click to open document**

In `ChatMessage.tsx`, update `onChunkCitationClick` to call the document viewer:
The prop is already passed from ChatPage. Ensure CitationInline badge click calls `onChunkCitationClick`.

In `CitationInline.tsx` (line 86), the click handler already calls `onCitationClick?.(chunk)`. This flows up through ChatMessage → ChatPage → `handleChunkCitationClick`. Update ChatPage's handler:

```tsx
const handleChunkCitationClick = (chunk: ChatChunk) => {
  // Open reference panel AND set chunk for potential document viewing
  setActiveReference({
    chunks: [chunk],
    doc_aggs: [{ doc_id: chunk.doc_id, doc_name: chunk.docnm_kwd, count: 1 }],
  })
  setShowReferences(true)
  // Also allow direct document opening
  setPreviewChunk(chunk)
}
```

- [ ] **Step 5: Add i18n keys**

Add to all 3 locale files:
```json
{
  "chat": {
    "viewInDocument": "View in document",
    "documentPreview": "Document Preview"
  }
}
```

- [ ] **Step 6: Verify build**

Run: `cd fe && npx tsc --noEmit && npx vite build`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add fe/src/features/chat/components/ChatDocumentPreviewDrawer.tsx fe/src/features/chat/pages/ChatPage.tsx fe/src/features/chat/components/ChatReferencePanel.tsx fe/src/features/chat/components/ChatMessage.tsx fe/src/components/CitationInline.tsx fe/src/i18n/locales/
git commit -m "feat: connect grounded citations to document viewer with chunk highlighting"
```

---

### Task 1.3: Message Regeneration

**Files:**
- Modify: `be/src/modules/chat/routes/chat-conversation.routes.ts:89-94`
- Modify: `be/src/modules/chat/controllers/chat-conversation.controller.ts`
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts`
- Modify: `be/src/modules/chat/schemas/chat-conversation.schemas.ts`
- Modify: `fe/src/features/chat/hooks/useChatStream.ts`
- Modify: `fe/src/features/chat/components/ChatMessage.tsx`
- Modify: `fe/src/features/chat/components/ChatMessageList.tsx`
- Test: `be/tests/chat/chat-conversation.service.test.ts`

**Context:** Regeneration = delete last assistant message + re-send last user message to the completion endpoint. We handle this mostly on the frontend by re-triggering `sendMessage` with the previous user content.

- [ ] **Step 1: Add regenerate to useChatStream hook**

In `fe/src/features/chat/hooks/useChatStream.ts`, add:

```typescript
const regenerateLastMessage = useCallback(async () => {
  // Find last user message
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUserMsg || !conversationId) return

  // Remove last assistant message from local state
  setMessages(prev => {
    const lastAssistantIdx = prev.findLastIndex(m => m.role === 'assistant')
    if (lastAssistantIdx >= 0) {
      return prev.filter((_, i) => i !== lastAssistantIdx)
    }
    return prev
  })

  // Delete last assistant message from server
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')
  if (lastAssistantMsg) {
    try {
      await fetch(`/api/chat/conversations/${conversationId}/messages/${lastAssistantMsg.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch { /* best-effort delete */ }
  }

  // Re-send the last user message
  await sendMessage(lastUserMsg.content)
}, [messages, conversationId, sendMessage])
```

Return `regenerateLastMessage` from the hook.

- [ ] **Step 2: Add regenerate button to ChatMessage**

In `fe/src/features/chat/components/ChatMessage.tsx`, add a regenerate icon button on the last assistant message:

```tsx
// In the action bar section, after thumbs down button:
{isLast && message.role === 'assistant' && (
  <Button
    variant="ghost"
    size="icon"
    className="h-7 w-7"
    onClick={onRegenerate}
    title={t('chat.regenerate')}
  >
    <RefreshCw className="h-3.5 w-3.5" />
  </Button>
)}
```

Add `onRegenerate?: () => void` to ChatMessage props.

- [ ] **Step 3: Wire regenerate in ChatPage**

Pass `stream.regenerateLastMessage` through ChatMessageList to ChatMessage.

- [ ] **Step 4: Add i18n key**

```json
{ "chat": { "regenerate": "Regenerate response" } }
```

- [ ] **Step 5: Commit**

```bash
git add fe/src/features/chat/hooks/useChatStream.ts fe/src/features/chat/components/ChatMessage.tsx fe/src/features/chat/components/ChatMessageList.tsx fe/src/features/chat/pages/ChatPage.tsx fe/src/i18n/locales/
git commit -m "feat: add message regeneration to chat"
```

---

### Task 1.4: Conversation Rename

**Files:**
- Modify: `be/src/modules/chat/routes/chat-conversation.routes.ts`
- Modify: `be/src/modules/chat/controllers/chat-conversation.controller.ts`
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts`
- Modify: `be/src/modules/chat/schemas/chat-conversation.schemas.ts`
- Modify: `fe/src/features/chat/api/chatApi.ts`
- Modify: `fe/src/features/chat/api/chatQueries.ts`
- Modify: `fe/src/features/chat/components/ChatSidebar.tsx`
- Test: `be/tests/chat/chat-conversation.service.test.ts`

- [ ] **Step 1: Add rename schema**

In `be/src/modules/chat/schemas/chat-conversation.schemas.ts`:
```typescript
export const renameConversationSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(256),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
})
```

- [ ] **Step 2: Add rename service method**

In `be/src/modules/chat/services/chat-conversation.service.ts`:
```typescript
async renameConversation(conversationId: string, name: string, userId: string): Promise<ChatSession | undefined> {
  const session = await this.chatSession.findById(conversationId)
  if (!session || session.user_id !== userId) return undefined
  return this.chatSession.update(conversationId, { title: name, updated_by: userId })
}
```

- [ ] **Step 3: Add rename controller**

In `be/src/modules/chat/controllers/chat-conversation.controller.ts`:
```typescript
async renameConversation(req: Request, res: Response) {
  const { id } = req.params
  const { name } = req.body
  const userId = req.user!.id
  const session = await chatConversationService.renameConversation(id, name, userId)
  if (!session) return res.status(404).json({ error: 'Conversation not found' })
  res.json(session)
}
```

- [ ] **Step 4: Add rename route**

In `be/src/modules/chat/routes/chat-conversation.routes.ts`:
```typescript
router.patch(
  '/conversations/:id',
  requireAuth,
  validate(renameConversationSchema),
  chatConversationController.renameConversation.bind(chatConversationController)
)
```

- [ ] **Step 5: Add FE API function**

In `fe/src/features/chat/api/chatApi.ts`:
```typescript
async renameConversation(id: string, name: string): Promise<Conversation> {
  const res = await api.patch(`/api/chat/conversations/${id}`, { name })
  return res.data
}
```

- [ ] **Step 6: Add rename mutation to chatQueries**

In `fe/src/features/chat/api/chatQueries.ts`:
```typescript
const renameMutation = useMutation({
  mutationFn: ({ id, name }: { id: string; name: string }) =>
    chatApi.renameConversation(id, name),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] }),
})
```

- [ ] **Step 7: Add rename UI in ChatSidebar**

Add inline rename on double-click or via context menu dropdown with a text input that submits on Enter/blur.

- [ ] **Step 8: Commit**

```bash
git add be/src/modules/chat/ fe/src/features/chat/
git commit -m "feat: add conversation rename"
```

---

### Task 1.5: Prologue / Welcome Message

**Files:**
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:430-451`
- Modify: `fe/src/features/chat/components/ChatMessageList.tsx`
- Modify: `fe/src/features/chat/hooks/useChatStream.ts`

**Context:** When a new conversation is created (or empty conversation loaded), show the dialog's prologue as the first assistant message. This matches RAGFlow behavior.

- [ ] **Step 1: Return prologue from createConversation**

In `be/src/modules/chat/services/chat-conversation.service.ts`, modify `createConversation()`:
```typescript
async createConversation(dialogId: string, name: string, userId: string) {
  const dialog = await this.chatDialog.findById(dialogId)
  if (!dialog) throw new Error('Dialog not found')

  const session = await this.chatSession.create({
    id: crypto.randomUUID(),
    user_id: userId,
    title: name,
    dialog_id: dialogId,
    created_by: userId,
    updated_by: userId,
  })

  // If dialog has prologue, insert it as first assistant message
  const prologue = (dialog.prompt_config as any)?.prologue
  if (prologue) {
    await this.chatMessage.create({
      id: crypto.randomUUID(),
      session_id: session.id,
      role: 'assistant',
      content: prologue,
      created_by: 'system',
      timestamp: new Date(),
    })
  }

  return session
}
```

- [ ] **Step 2: Show prologue in ChatMessageList empty state**

In `ChatMessageList.tsx`, when messages are empty but dialog has prologue, show it as a system greeting (already returned from getConversation as first message).

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/chat/services/chat-conversation.service.ts fe/src/features/chat/components/ChatMessageList.tsx
git commit -m "feat: show dialog prologue as welcome message in new conversations"
```

---

### Task 1.6: File Upload in Chat

**Files:**
- Create: `be/src/modules/chat/routes/chat-file.routes.ts`
- Create: `be/src/modules/chat/controllers/chat-file.controller.ts`
- Create: `be/src/modules/chat/services/chat-file.service.ts`
- Create: `be/src/modules/chat/models/chat-file.model.ts`
- Create: `be/src/modules/chat/schemas/chat-file.schemas.ts`
- Create: `be/src/shared/db/migrations/20260316000000_chat_files.ts`
- Modify: `be/src/modules/chat/schemas/chat-conversation.schemas.ts:29-34`
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:858-868`
- Modify: `be/src/shared/services/llm-client.service.ts:166-235`
- Modify: `be/src/modules/chat/index.ts`
- Modify: `be/src/app/routes.ts`
- Create: `fe/src/features/chat/components/ChatFileUpload.tsx`
- Create: `fe/src/features/chat/hooks/useChatFiles.ts`
- Modify: `fe/src/features/chat/components/ChatInput.tsx`
- Modify: `fe/src/features/chat/api/chatApi.ts`
- Modify: `fe/src/features/chat/types/chat.types.ts`
- Test: `be/tests/chat/chat-file.service.test.ts`

**Context:** User can attach images (jpg/png/gif/webp) and PDFs to chat messages. Files upload to S3 first, then the file URL is passed to the LLM as a multimodal content array (OpenAI vision format). Files have retention — auto-deleted after configurable period.

- [ ] **Step 1: Create migration for chat_files table**

```typescript
// be/src/shared/db/migrations/20260316000000_chat_files.ts
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('chat_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.text('session_id').notNullable().references('id').inTable('chat_sessions').onDelete('CASCADE')
    table.text('message_id').nullable() // linked after message is sent
    table.string('original_name', 256).notNullable()
    table.string('mime_type', 128).notNullable()
    table.bigInteger('size').notNullable()
    table.string('s3_key', 1024).notNullable()
    table.string('s3_bucket', 256).notNullable()
    table.text('url').notNullable() // presigned or internal URL
    table.text('uploaded_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable()
    table.timestamp('expires_at').nullable() // retention: auto-delete after this
    table.index('session_id', 'idx_chat_files_session')
    table.index('expires_at', 'idx_chat_files_expiry')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chat_files')
}
```

- [ ] **Step 2: Run migration**

Run: `cd be && npm run db:migrate`

- [ ] **Step 3: Create chat file model**

```typescript
// be/src/modules/chat/models/chat-file.model.ts
import { BaseModel } from '@/shared/models/base.model.js'
import type { ChatFile } from '@/shared/models/types.js'

export class ChatFileModel extends BaseModel<ChatFile> {
  constructor() {
    super('chat_files')
  }

  async findBySessionId(sessionId: string): Promise<ChatFile[]> {
    return this.knex(this.tableName).where('session_id', sessionId).orderBy('created_at', 'asc')
  }

  async findExpired(): Promise<ChatFile[]> {
    return this.knex(this.tableName).where('expires_at', '<', new Date())
  }
}
```

Add `ChatFile` interface to `be/src/shared/models/types.ts`:
```typescript
export interface ChatFile {
  id: string
  session_id: string
  message_id: string | null
  original_name: string
  mime_type: string
  size: number
  s3_key: string
  s3_bucket: string
  url: string
  uploaded_by: string | null
  created_at: Date
  expires_at: Date | null
}
```

- [ ] **Step 4: Create chat file service**

```typescript
// be/src/modules/chat/services/chat-file.service.ts
import { ChatFileModel } from '../models/chat-file.model.js'
import { minioService } from '@/shared/services/minio.service.js'
import { config } from '@/shared/config/index.js'
import { logger } from '@/shared/utils/logger.js'

const ALLOWED_CHAT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
])
const MAX_CHAT_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const RETENTION_DAYS = 30

class ChatFileService {
  private chatFile = new ChatFileModel()

  async uploadFile(
    file: Express.Multer.File,
    sessionId: string,
    userId: string,
  ): Promise<{ id: string; url: string; original_name: string; mime_type: string }> {
    if (!ALLOWED_CHAT_TYPES.has(file.mimetype)) {
      throw new Error(`File type ${file.mimetype} not allowed. Only images and PDFs are supported.`)
    }
    if (file.size > MAX_CHAT_FILE_SIZE) {
      throw new Error(`File too large. Maximum size is ${MAX_CHAT_FILE_SIZE / 1024 / 1024}MB.`)
    }

    const fileId = crypto.randomUUID()
    const bucket = config.s3.bucket
    const s3Key = `chat-files/${sessionId}/${fileId}/${file.originalname}`

    // Upload to S3
    await minioService.putObject(bucket, s3Key, file.buffer, file.size, file.mimetype)

    // Generate internal URL (backend-proxied for LLM access)
    const url = `/api/chat/files/${fileId}/content`

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + RETENTION_DAYS)

    const record = await this.chatFile.create({
      id: fileId,
      session_id: sessionId,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      s3_key: s3Key,
      s3_bucket: bucket,
      url,
      uploaded_by: userId,
      expires_at: expiresAt,
    })

    return {
      id: record.id,
      url: record.url,
      original_name: record.original_name,
      mime_type: record.mime_type,
    }
  }

  async getFileContent(fileId: string): Promise<{ stream: NodeJS.ReadableStream; mime_type: string; filename: string } | null> {
    const file = await this.chatFile.findById(fileId)
    if (!file) return null
    const stream = await minioService.getObjectStream(file.s3_bucket, file.s3_key)
    return { stream, mime_type: file.mime_type, filename: file.original_name }
  }

  async cleanupExpired(): Promise<number> {
    const expired = await this.chatFile.findExpired()
    let deleted = 0
    for (const file of expired) {
      try {
        await minioService.removeObject(file.s3_bucket, file.s3_key)
        await this.chatFile.delete(file.id)
        deleted++
      } catch (err) {
        logger.error(`Failed to cleanup chat file ${file.id}:`, err)
      }
    }
    return deleted
  }
}

export const chatFileService = new ChatFileService()
```

- [ ] **Step 5: Create file upload routes and controller**

```typescript
// be/src/modules/chat/routes/chat-file.routes.ts
import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '@/shared/middleware/auth.middleware.js'
import { chatFileController } from '../controllers/chat-file.controller.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.post(
  '/conversations/:id/files',
  requireAuth,
  upload.array('files', 5),
  chatFileController.uploadFiles.bind(chatFileController)
)

router.get(
  '/files/:fileId/content',
  requireAuth,
  chatFileController.getFileContent.bind(chatFileController)
)

export default router
```

```typescript
// be/src/modules/chat/controllers/chat-file.controller.ts
import type { Request, Response } from 'express'
import { chatFileService } from '../services/chat-file.service.js'

class ChatFileController {
  async uploadFiles(req: Request, res: Response) {
    const sessionId = req.params.id
    const userId = req.user!.id
    const files = req.files as Express.Multer.File[]

    if (!files?.length) {
      return res.status(400).json({ error: 'No files provided' })
    }

    const results = []
    const errors = []
    for (const file of files) {
      try {
        const result = await chatFileService.uploadFile(file, sessionId, userId)
        results.push(result)
      } catch (err: any) {
        errors.push({ file: file.originalname, error: err.message })
      }
    }

    res.json({ uploaded: results, errors })
  }

  async getFileContent(req: Request, res: Response) {
    const { fileId } = req.params
    const file = await chatFileService.getFileContent(fileId)
    if (!file) return res.status(404).json({ error: 'File not found' })

    res.setHeader('Content-Type', file.mime_type)
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`)
    file.stream.pipe(res)
  }
}

export const chatFileController = new ChatFileController()
```

- [ ] **Step 6: Update LLM client to support multimodal messages**

In `be/src/shared/services/llm-client.service.ts`, update the `LlmMessage` interface:

```typescript
interface LlmMessageContent {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' }
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | LlmMessageContent[]
}
```

The OpenAI SDK already supports this format natively — no changes needed to the `chatCompletionStream` method body since it passes messages through to OpenAI.

- [ ] **Step 7: Update completion schema to accept file_ids**

In `be/src/modules/chat/schemas/chat-conversation.schemas.ts`:
```typescript
export const chatCompletionSchema = z.object({
  body: z.object({
    content: z.string().min(1),
    dialog_id: z.string().uuid().optional(),
    file_ids: z.array(z.string().uuid()).max(5).optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
})
```

- [ ] **Step 8: Inject file URLs into LLM messages in streamChat**

In `be/src/modules/chat/services/chat-conversation.service.ts`, before the LLM call (around line 858-868), build multimodal content:

```typescript
// Build user message content with file attachments
let userContent: string | LlmMessageContent[] = refinedQuestion

if (fileIds?.length) {
  const files = await Promise.all(fileIds.map(id => chatFileService.getFileContent(id)))
  const parts: LlmMessageContent[] = [{ type: 'text', text: refinedQuestion }]

  for (const file of files) {
    if (file && file.mime_type.startsWith('image/')) {
      // For images, pass the URL for vision models
      const absoluteUrl = `${config.server.baseUrl}/api/chat/files/${file.id}/content`
      parts.push({
        type: 'image_url',
        image_url: { url: absoluteUrl, detail: 'auto' },
      })
    }
    // PDFs: extract text and append to context (vision models may not read PDFs)
  }

  userContent = parts
}
```

- [ ] **Step 9: Mount file routes**

In `be/src/app/routes.ts`:
```typescript
import chatFileRoutes from '@/modules/chat/routes/chat-file.routes.js'
apiRouter.use('/chat', chatFileRoutes)
```

- [ ] **Step 10: Create FE file upload hook and component**

```typescript
// fe/src/features/chat/hooks/useChatFiles.ts
import { useState, useCallback } from 'react'
import { chatApi } from '../api/chatApi'

interface UploadedFile {
  id: string
  url: string
  original_name: string
  mime_type: string
  preview?: string
}

export function useChatFiles(conversationId: string | null) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const uploadFiles = useCallback(async (fileList: File[]) => {
    if (!conversationId || !fileList.length) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      fileList.forEach(f => formData.append('files', f))
      const result = await chatApi.uploadChatFiles(conversationId, formData)
      const uploaded = result.uploaded.map((f: UploadedFile) => ({
        ...f,
        preview: f.mime_type.startsWith('image/')
          ? URL.createObjectURL(fileList.find(fl => fl.name === f.original_name)!)
          : undefined,
      }))
      setFiles(prev => [...prev, ...uploaded])
    } finally {
      setIsUploading(false)
    }
  }, [conversationId])

  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === fileId)
      if (file?.preview) URL.revokeObjectURL(file.preview)
      return prev.filter(f => f.id !== fileId)
    })
  }, [])

  const clearFiles = useCallback(() => {
    files.forEach(f => f.preview && URL.revokeObjectURL(f.preview))
    setFiles([])
  }, [files])

  return { files, isUploading, uploadFiles, removeFile, clearFiles }
}
```

- [ ] **Step 11: Add upload API function**

In `fe/src/features/chat/api/chatApi.ts`:
```typescript
async uploadChatFiles(conversationId: string, formData: FormData) {
  const res = await fetch(`/api/chat/conversations/${conversationId}/files`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}
```

- [ ] **Step 12: Update ChatInput to show file upload**

Add a paperclip icon button in `ChatInput.tsx` that opens a file picker (accept: `image/*,.pdf`). Show file previews above the input area. Pass file_ids to sendMessage.

- [ ] **Step 13: Update sendMessage in useChatStream to pass file_ids**

```typescript
const sendMessage = useCallback(async (content: string, fileIds?: string[]) => {
  // ... existing code ...
  const res = await chatApi.sendMessage(conversationId, content, dialogId, fileIds)
  // ... existing streaming code ...
}, [conversationId, dialogId])
```

Update `chatApi.sendMessage`:
```typescript
async sendMessage(conversationId: string, content: string, dialogId?: string, fileIds?: string[]) {
  return fetch(`/api/chat/conversations/${conversationId}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ content, dialog_id: dialogId, file_ids: fileIds }),
    credentials: 'include',
  })
}
```

- [ ] **Step 14: Test and commit**

Run: `cd be && npx vitest run && cd ../fe && npx tsc --noEmit`

```bash
git add be/src/modules/chat/ be/src/shared/ be/src/app/routes.ts fe/src/features/chat/
git commit -m "feat: add file upload in chat (images + PDF) with S3 storage and retention"
```

---

### Task 1.7: Dialog List Pagination and Search (Backend)

**Files:**
- Modify: `be/src/modules/chat/routes/chat-dialog.routes.ts:53-57`
- Modify: `be/src/modules/chat/schemas/chat-dialog.schemas.ts`
- Modify: `be/src/modules/chat/services/chat-dialog.service.ts:85-113`
- Modify: `be/src/modules/chat/controllers/chat-dialog.controller.ts`
- Modify: `fe/src/features/chat/pages/ChatDialogManagementPage.tsx`
- Modify: `fe/src/features/chat/api/chatApi.ts`
- Modify: `fe/src/features/chat/api/chatQueries.ts`

- [ ] **Step 1: Add pagination schema**

```typescript
export const listDialogsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    sort_by: z.enum(['created_at', 'name']).default('created_at'),
    sort_order: z.enum(['asc', 'desc']).default('desc'),
  }),
})
```

- [ ] **Step 2: Update service for pagination**

```typescript
async listAccessibleDialogs(userId: string, userRole: string, teamIds: string[], options: {
  page: number
  pageSize: number
  search?: string
  sortBy: string
  sortOrder: string
}): Promise<{ data: ChatDialog[]; total: number }> {
  let query = this.chatDialog.knex('chat_dialogs')

  // RBAC filtering (existing logic)
  if (userRole !== 'admin' && userRole !== 'superadmin') {
    const accessibleIds = await this.chatDialogAccess.findAccessibleDialogIds(userId, teamIds)
    query = query.where(function() {
      this.where('created_by', userId)
        .orWhere('is_public', true)
        .orWhereIn('id', accessibleIds)
    })
  }

  // Search filter
  if (options.search) {
    query = query.where(function() {
      this.whereILike('name', `%${options.search}%`)
        .orWhereILike('description', `%${options.search}%`)
    })
  }

  // Count total before pagination
  const [{ count }] = await query.clone().count('* as count')
  const total = Number(count)

  // Apply sort and pagination
  const data = await query
    .orderBy(options.sortBy, options.sortOrder)
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize)

  return { data, total }
}
```

- [ ] **Step 3: Add name uniqueness validation**

In `be/src/modules/chat/services/chat-dialog.service.ts`, in `createDialog()`:
```typescript
// Check name uniqueness
const existing = await this.chatDialog.knex('chat_dialogs')
  .whereRaw('LOWER(name) = LOWER(?)', [data.name])
  .first()
if (existing) {
  throw new Error('A dialog with this name already exists')
}
```

- [ ] **Step 4: Update FE admin page with server-side pagination**

Update `ChatDialogManagementPage` to use URL-based pagination state and pass params to API.

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/chat/ fe/src/features/chat/
git commit -m "feat: add pagination, search, and name validation to dialog management"
```

---

## Chunk 2: Phase 2 — Advanced RAG Features

### Task 2.1: Custom Prompt Variables

**Files:**
- Create: `be/src/shared/db/migrations/20260316000001_chat_dialog_variables.ts`
- Modify: `be/src/modules/chat/schemas/chat-dialog.schemas.ts`
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:307-331`
- Modify: `be/src/modules/chat/schemas/chat-conversation.schemas.ts:29-34`
- Create: `fe/src/features/chat/components/ChatVariableForm.tsx`
- Modify: `fe/src/features/chat/components/ChatDialogConfig.tsx`
- Modify: `fe/src/features/chat/pages/ChatPage.tsx`
- Modify: `fe/src/features/chat/types/chat.types.ts`

**Context:** Admin defines variables (e.g., `{language}`, `{audience}`) in the system prompt. Users provide values per-conversation or per-message. Variables are injected into the system prompt before sending to LLM.

- [ ] **Step 1: Extend PromptConfig type with variables**

In `be/src/shared/models/types.ts`:
```typescript
interface PromptVariable {
  key: string
  description?: string
  optional: boolean
  default_value?: string
}

// Add to PromptConfig:
variables?: PromptVariable[]
```

No migration needed — `prompt_config` is JSONB, variables stored inside it.

- [ ] **Step 2: Update dialog schema to accept variables**

In `be/src/modules/chat/schemas/chat-dialog.schemas.ts`:
```typescript
const promptVariableSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  description: z.string().max(256).optional(),
  optional: z.boolean().default(false),
  default_value: z.string().max(1024).optional(),
})

// In createDialogSchema.body.prompt_config, add:
variables: z.array(promptVariableSchema).max(20).optional()
```

- [ ] **Step 3: Update completion schema to accept variable values**

In `be/src/modules/chat/schemas/chat-conversation.schemas.ts`:
```typescript
export const chatCompletionSchema = z.object({
  body: z.object({
    content: z.string().min(1),
    dialog_id: z.string().uuid().optional(),
    file_ids: z.array(z.string().uuid()).max(5).optional(),
    variables: z.record(z.string(), z.string()).optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
})
```

- [ ] **Step 4: Inject variables into system prompt in streamChat**

In `be/src/modules/chat/services/chat-conversation.service.ts`, in `buildContextPrompt()`:
```typescript
private buildContextPrompt(
  systemPrompt: string,
  chunks: ChunkResult[],
  enableCitations: boolean,
  variables?: Record<string, string>,
  variableDefinitions?: PromptVariable[],
): string {
  let prompt = systemPrompt

  // Replace {variable_name} placeholders with provided values or defaults
  if (variableDefinitions) {
    for (const v of variableDefinitions) {
      const value = variables?.[v.key] ?? v.default_value ?? ''
      prompt = prompt.replaceAll(`{${v.key}}`, value)
    }
  }

  // ... existing chunk context assembly ...
}
```

- [ ] **Step 5: Validate required variables in streamChat**

Before calling `buildContextPrompt`, check that all non-optional variables have values:
```typescript
const vars = dialog.prompt_config?.variables ?? []
const missingRequired = vars
  .filter(v => !v.optional && !requestVariables?.[v.key] && !v.default_value)
  .map(v => v.key)

if (missingRequired.length > 0) {
  res.write(`data: ${JSON.stringify({ error: `Missing required variables: ${missingRequired.join(', ')}` })}\n\n`)
  res.end()
  return
}
```

- [ ] **Step 6: Create FE ChatVariableForm component**

```tsx
// fe/src/features/chat/components/ChatVariableForm.tsx
// Renders a form with inputs for each variable defined in the dialog
// Used in ChatDialogConfig (admin defines variables) and ChatPage (user provides values)
```

- [ ] **Step 7: Update ChatDialogConfig to manage variables**

Add a "Variables" section with a dynamic table: variable key, description, optional toggle, default value. Admin can add/remove/edit rows.

- [ ] **Step 8: Update ChatPage to prompt user for variable values**

When a dialog has required variables without defaults, show a small form above the chat input or in a modal before first message.

- [ ] **Step 9: Update FE types**

```typescript
// fe/src/features/chat/types/chat.types.ts
interface PromptVariable {
  key: string
  description?: string
  optional: boolean
  default_value?: string
}

// Add to PromptConfig:
variables?: PromptVariable[]

// Add to SendMessagePayload:
variables?: Record<string, string>
```

- [ ] **Step 10: Commit**

```bash
git add be/src/modules/chat/ be/src/shared/ fe/src/features/chat/
git commit -m "feat: add custom prompt variables with admin-defined templates and user-provided values"
```

---

### Task 2.2: Metadata Filtering

**Files:**
- Modify: `be/src/modules/chat/schemas/chat-dialog.schemas.ts`
- Modify: `be/src/modules/chat/schemas/chat-conversation.schemas.ts`
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:725-756`
- Modify: `be/src/modules/rag/services/rag-search.service.ts:54-193`
- Create: `fe/src/features/chat/components/ChatMetadataFilter.tsx`
- Modify: `fe/src/features/chat/components/ChatDialogConfig.tsx`
- Modify: `fe/src/features/chat/types/chat.types.ts`

**Context:** Admin can configure metadata filters on dialogs (e.g., filter by document type, department, date range). Optionally, users can pass per-message metadata conditions to narrow retrieval.

- [ ] **Step 1: Define metadata filter schema**

```typescript
// In chat-dialog.schemas.ts
const metadataConditionSchema = z.object({
  name: z.string().min(1),
  comparison_operator: z.enum(['is', 'is_not', 'contains', 'not_contains', 'gt', 'lt', 'gte', 'lte', 'range']),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
})

const metadataFilterSchema = z.object({
  logic: z.enum(['and', 'or']).default('and'),
  conditions: z.array(metadataConditionSchema).max(10),
})

// Add to createDialogSchema.body:
metadata_filter: metadataFilterSchema.optional()
```

- [ ] **Step 2: Store metadata_filter in dialog prompt_config**

No migration needed — stored in JSONB `prompt_config` field.

- [ ] **Step 3: Add metadata filter to OpenSearch queries**

In `be/src/modules/rag/services/rag-search.service.ts`, add a helper:

```typescript
private buildMetadataFilter(conditions: MetadataCondition[], logic: 'and' | 'or'): any {
  const clauses = conditions.map(c => {
    switch (c.comparison_operator) {
      case 'is': return { term: { [c.name]: c.value } }
      case 'is_not': return { bool: { must_not: { term: { [c.name]: c.value } } } }
      case 'contains': return { wildcard: { [c.name]: `*${c.value}*` } }
      case 'gt': return { range: { [c.name]: { gt: c.value } } }
      case 'lt': return { range: { [c.name]: { lt: c.value } } }
      case 'range': return { range: { [c.name]: { gte: (c.value as any[])[0], lte: (c.value as any[])[1] } } }
      default: return { term: { [c.name]: c.value } }
    }
  })
  return logic === 'and' ? { bool: { must: clauses } } : { bool: { should: clauses } }
}
```

Apply this filter in `search()`, `hybridSearch()`, `fullTextSearch()`, and `semanticSearch()` methods by merging into the existing query `bool.filter` clause.

- [ ] **Step 4: Pass metadata filter from streamChat to search**

In `chat-conversation.service.ts`, when calling search (around line 725-756):
```typescript
const metadataFilter = dialog.prompt_config?.metadata_filter ?? requestMetadata
const chunks = await ragSearchService.search(query, kbIds, {
  topK: cfg.top_n * 2,
  method: 'hybrid',
  metadataFilter,
})
```

- [ ] **Step 5: Add per-message metadata_condition to completion schema**

```typescript
// In chatCompletionSchema.body:
metadata_condition: metadataFilterSchema.optional()
```

- [ ] **Step 6: Create FE ChatMetadataFilter component**

A form to add/remove metadata conditions with operator selection. Used in ChatDialogConfig.

- [ ] **Step 7: Commit**

```bash
git add be/src/modules/chat/ be/src/modules/rag/ fe/src/features/chat/
git commit -m "feat: add metadata filtering for document retrieval in chat"
```

---

### Task 2.3: Document ID Filtering Per Message

**Files:**
- Modify: `be/src/modules/chat/schemas/chat-conversation.schemas.ts`
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:725-756`
- Modify: `be/src/modules/rag/services/rag-search.service.ts`

- [ ] **Step 1: Add doc_ids to completion schema**

```typescript
// In chatCompletionSchema.body:
doc_ids: z.array(z.string()).max(50).optional()
```

- [ ] **Step 2: Apply doc_ids filter in search**

In `rag-search.service.ts`, add `docIds` parameter to search methods and inject as:
```typescript
if (docIds?.length) {
  query.bool.filter.push({ terms: { doc_id: docIds } })
}
```

- [ ] **Step 3: Pass doc_ids from streamChat**

In the retrieval step (line 725-756), forward `doc_ids` from request body to the search call.

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/chat/ be/src/modules/rag/
git commit -m "feat: add per-message document ID filtering in chat completion"
```

---

### Task 2.4: Per-Message LLM Overrides

**Files:**
- Modify: `be/src/modules/chat/schemas/chat-conversation.schemas.ts:29-34`
- Modify: `be/src/modules/chat/services/chat-conversation.service.ts:617-632`

- [ ] **Step 1: Add override fields to completion schema**

```typescript
// In chatCompletionSchema.body:
llm_id: z.string().max(128).optional(),
temperature: z.number().min(0).max(2).optional(),
max_tokens: z.number().int().min(1).max(128000).optional(),
```

- [ ] **Step 2: Apply overrides in streamChat**

After loading dialog config (line 617-632), merge per-request overrides:
```typescript
const effectiveConfig = {
  ...cfg,
  ...(body.temperature !== undefined && { temperature: body.temperature }),
  ...(body.max_tokens !== undefined && { max_tokens: body.max_tokens }),
}
const effectiveLlmId = body.llm_id ?? dialog.llm_id
```

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/chat/
git commit -m "feat: support per-message LLM model and parameter overrides"
```

---

### Task 2.5: Thinking/Reasoning and Internet Search Toggles (FE)

**Files:**
- Modify: `fe/src/features/chat/components/ChatInput.tsx`
- Modify: `fe/src/features/chat/hooks/useChatStream.ts`
- Modify: `fe/src/features/chat/api/chatApi.ts`

**Context:** Backend already supports `reasoning` flag and `tavily_api_key` in prompt_config. We just need UI toggles.

- [ ] **Step 1: Add toggle buttons to ChatInput**

Add two icon buttons (Brain for thinking, Globe for internet search) to the ChatInput toolbar. Show them only when the dialog's prompt_config supports them.

```tsx
// In ChatInput.tsx, add to the button area:
{showReasoningToggle && (
  <Button
    variant={reasoningEnabled ? 'default' : 'ghost'}
    size="icon"
    className="h-7 w-7"
    onClick={() => setReasoningEnabled(v => !v)}
    title={t('chat.deepThinking')}
  >
    <Brain className="h-4 w-4" />
  </Button>
)}
{showInternetToggle && (
  <Button
    variant={internetEnabled ? 'default' : 'ghost'}
    size="icon"
    className="h-7 w-7"
    onClick={() => setInternetEnabled(v => !v)}
    title={t('chat.internetSearch')}
  >
    <Globe className="h-4 w-4" />
  </Button>
)}
```

- [ ] **Step 2: Pass toggle states to sendMessage**

Update `useChatStream.sendMessage` and `chatApi.sendMessage` to accept and pass `reasoning` and `use_internet` flags.

Update BE completion schema to accept:
```typescript
reasoning: z.boolean().optional(),
use_internet: z.boolean().optional(),
```

- [ ] **Step 3: Add i18n keys**

```json
{ "chat": { "deepThinking": "Deep thinking mode", "internetSearch": "Search the internet" } }
```

- [ ] **Step 4: Commit**

```bash
git add fe/src/features/chat/ be/src/modules/chat/ fe/src/i18n/locales/
git commit -m "feat: add thinking/reasoning and internet search toggle buttons to chat input"
```

---

## Chunk 3: Phase 3 — External Integration

### Task 3.1: Embeddable Chat Widget (Dual-Mode: Internal + External)

**Files:**
- Create: `fe/src/features/chat-widget/ChatWidget.tsx` — Shared root component (both modes)
- Create: `fe/src/features/chat-widget/ChatWidgetButton.tsx` — Floating trigger button
- Create: `fe/src/features/chat-widget/ChatWidgetWindow.tsx` — Chat window overlay (reuses ChatMessage, ChatInput, CitationInline)
- Create: `fe/src/features/chat-widget/ChatWidgetProvider.tsx` — Context provider (auth mode, config)
- Create: `fe/src/features/chat-widget/chatWidgetApi.ts` — Dual API client (session auth OR API key)
- Create: `fe/src/features/chat-widget/index.ts` — Barrel export + IIFE init for external
- Create: `be/src/modules/chat/routes/chat-embed.routes.ts` — Token-based public endpoints
- Create: `be/src/modules/chat/controllers/chat-embed.controller.ts`
- Create: `be/src/modules/chat/services/chat-embed.service.ts` — Token CRUD + validation
- Create: `be/src/modules/chat/models/chat-embed-token.model.ts`
- Create: `be/src/shared/db/migrations/20260316000002_chat_embed_tokens.ts`
- Modify: `be/src/app/routes.ts`
- Modify: `fe/vite.config.ts` (add widget build entry)

**Context:** The widget supports TWO authentication modes:
1. **Internal mode** — Used within B-Knowledge app. Uses current session/cookie auth. Embedded as a React component in any page (e.g., sidebar, floating button).
2. **External mode** — Used on third-party websites. Uses API key (embed token) in Authorization header. Embedded via `<script>` tag (IIFE bundle). No cookies.

Both modes share the same UI components (ChatWidgetWindow, ChatWidgetButton) but differ in auth strategy.

- [ ] **Step 1: Create embed token migration + model (BE)**

```typescript
// be/src/shared/db/migrations/20260316000002_chat_embed_tokens.ts
await knex.schema.createTable('chat_embed_tokens', (table) => {
  table.uuid('id').primary().defaultTo(knex.fn.uuid())
  table.uuid('dialog_id').notNullable().references('id').inTable('chat_dialogs').onDelete('CASCADE')
  table.string('token', 64).notNullable().unique()
  table.string('name', 128).notNullable()
  table.boolean('is_active').defaultTo(true)
  table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
  table.timestamp('created_at').defaultTo(knex.fn.now())
  table.timestamp('expires_at').nullable()
  table.index('dialog_id', 'idx_embed_tokens_dialog')
  table.index('token', 'idx_embed_tokens_token')
})
```

- [ ] **Step 2: Create embed token CRUD endpoints (admin only)**

```
POST   /api/chat/dialogs/:id/embed-tokens    — Create token (admin, manage_users)
GET    /api/chat/dialogs/:id/embed-tokens    — List tokens (admin, manage_users)
DELETE /api/chat/embed-tokens/:tokenId       — Revoke token (admin, manage_users)
```

- [ ] **Step 3: Create public embed endpoints (API key auth)**

```
POST /api/chat/embed/:token/completions — Token-based completion (SSE streaming)
GET  /api/chat/embed/:token/info        — Get dialog info (name, icon, prologue, has_web_search)
POST /api/chat/embed/:token/sessions    — Create anonymous session
```

The embed controller:
1. Validates token (active + not expired)
2. Resolves dialog from token
3. Creates or continues anonymous session (session_id in body)
4. Delegates to `chatConversationService.streamChat()` with synthetic user ID (`embed:<token_id>`)

- [ ] **Step 4: Create ChatWidgetProvider — dual auth context**

```tsx
// fe/src/features/chat-widget/ChatWidgetProvider.tsx
type AuthMode = 'internal' | 'external'

interface WidgetConfig {
  mode: AuthMode
  dialogId?: string      // Internal mode: which dialog to use
  token?: string          // External mode: API key
  baseUrl?: string        // External mode: API base URL
  position?: 'bottom-right' | 'bottom-left'
  theme?: 'light' | 'dark' | 'auto'
  locale?: string
}

const ChatWidgetContext = createContext<WidgetConfig>(null!)

export function ChatWidgetProvider({ config, children }: { config: WidgetConfig; children: ReactNode }) {
  return <ChatWidgetContext.Provider value={config}>{children}</ChatWidgetContext.Provider>
}

export const useWidgetConfig = () => useContext(ChatWidgetContext)
```

- [ ] **Step 5: Create dual-mode API client**

```typescript
// fe/src/features/chat-widget/chatWidgetApi.ts
class ChatWidgetApi {
  constructor(private config: WidgetConfig) {}

  private getHeaders(): HeadersInit {
    if (this.config.mode === 'external') {
      return {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${this.config.token}`,
      }
    }
    // Internal mode: use session cookies
    return { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' }
  }

  private getBaseUrl(): string {
    return this.config.mode === 'external' ? (this.config.baseUrl ?? '') : ''
  }

  async getInfo() {
    if (this.config.mode === 'external') {
      const res = await fetch(`${this.getBaseUrl()}/api/chat/embed/${this.config.token}/info`)
      return res.json()
    }
    // Internal: use existing chatApi.getDialog()
    const res = await fetch(`/api/chat/dialogs/${this.config.dialogId}`, { credentials: 'include' })
    return res.json()
  }

  async sendMessage(conversationId: string, content: string) {
    if (this.config.mode === 'external') {
      return fetch(`${this.getBaseUrl()}/api/chat/embed/${this.config.token}/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ content, session_id: conversationId }),
      })
    }
    // Internal: reuse existing completion endpoint with session cookies
    return fetch(`/api/chat/conversations/${conversationId}/completion`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ content, dialog_id: this.config.dialogId }),
      credentials: 'include',
    })
  }
}
```

- [ ] **Step 6: Create shared ChatWidget component**

```tsx
// fe/src/features/chat-widget/ChatWidget.tsx
// Root component used in BOTH modes:
// - Internal: <ChatWidget mode="internal" dialogId="..." />
// - External: BKnowledgeChat.init({ token: '...', position: 'bottom-right' })
// Renders: ChatWidgetProvider → ChatWidgetButton + ChatWidgetWindow
// Manages: open/close, session creation, message streaming
```

- [ ] **Step 7: Create ChatWidgetButton (FAB)**

Floating action button with chat icon, unread message badge, pulse animation on new messages. Position configurable (bottom-right/left).

- [ ] **Step 8: Create ChatWidgetWindow**

Overlay window reusing SHARED components from chat feature:
- Header: dialog name/icon, minimize, close buttons
- Message list: reuses `ChatMessage` component (markdown, citations, feedback)
- Input area: reuses `ChatInput` component (simplified — no file upload in widget)
- Reference display: simplified inline citations (no sidebar panel)

**Key: these are the SAME components as ChatPage, not copies.** Import from `fe/src/features/chat/components/`.

- [ ] **Step 9: Create IIFE bundle for external mode**

```typescript
// fe/vite.widget.config.ts — separate Vite config for widget build
export default defineConfig({
  build: {
    lib: {
      entry: 'src/features/chat-widget/index.ts',
      name: 'BKnowledgeChat',
      fileName: 'bk-chat-widget',
      formats: ['iife'],
    },
    outDir: 'dist-widget',
    cssCodeSplit: false, // Bundle CSS inline
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
```

External usage:
```html
<script src="https://your-domain.com/widget/bk-chat-widget.js"></script>
<script>
  BKnowledgeChat.init({
    token: 'your-embed-token',
    baseUrl: 'https://your-bk-instance.com',
    position: 'bottom-right',
    theme: 'auto',
    locale: 'en',
  })
</script>
```

Internal usage (React):
```tsx
import { ChatWidget } from '@/features/chat-widget'
<ChatWidget mode="internal" dialogId={selectedDialogId} position="bottom-right" />
```

- [ ] **Step 10: Add embed token management UI to admin page**

In `ChatDialogManagementPage`, add "Embed" action per dialog that opens a modal:
- Lists existing tokens (name, created_at, active/expired)
- Create new token button (generates random 64-char token)
- Copy token / copy embed code buttons
- Delete/revoke token button
- Preview of embed snippet (HTML + JS)

- [ ] **Step 11: Test both modes**

External: `cd fe && npx vite build --config vite.widget.config.ts` → `dist-widget/bk-chat-widget.js`
Internal: `cd fe && npx tsc --noEmit && npx vite build`

- [ ] **Step 11: Commit**

```bash
git add be/src/modules/chat/ fe/src/features/chat-widget/ fe/vite.widget.config.ts
git commit -m "feat: add embeddable chat widget with token-based auth"
```

---

### Task 3.2: OpenAI-Compatible API

**Files:**
- Create: `be/src/modules/chat/routes/chat-openai.routes.ts`
- Create: `be/src/modules/chat/controllers/chat-openai.controller.ts`
- Create: `be/src/modules/chat/services/chat-openai.service.ts`
- Modify: `be/src/modules/chat/index.ts`
- Modify: `be/src/app/routes.ts`
- Test: `be/tests/chat/chat-openai.service.test.ts`

**Context:** Provide an OpenAI-compatible `/v1/chat/completions` endpoint for external evaluation tools (RAGAS, LangChain, etc.). Uses API key auth from embed tokens or a dedicated API key system.

- [ ] **Step 1: Create OpenAI-compatible route**

```typescript
// be/src/modules/chat/routes/chat-openai.routes.ts
import { Router } from 'express'
import { chatOpenaiController } from '../controllers/chat-openai.controller.js'

const router = Router()

// OpenAI-compatible: POST /v1/chat/completions
router.post('/chat/completions', chatOpenaiController.chatCompletion.bind(chatOpenaiController))

// Model listing: GET /v1/models
router.get('/models', chatOpenaiController.listModels.bind(chatOpenaiController))

export default router
```

Mount at `/api/v1`:
```typescript
// In be/src/app/routes.ts:
import chatOpenaiRoutes from '@/modules/chat/routes/chat-openai.routes.js'
apiRouter.use('/v1', chatOpenaiRoutes)
```

- [ ] **Step 2: Create OpenAI response format mapper**

```typescript
// be/src/modules/chat/services/chat-openai.service.ts
class ChatOpenaiService {
  /**
   * Maps B-Knowledge chat completion to OpenAI format
   */
  formatStreamChunk(content: string, model: string, id: string): string {
    return JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        delta: { content },
        finish_reason: null,
      }],
    })
  }

  formatFinalChunk(model: string, id: string, usage: { prompt_tokens: number; completion_tokens: number }): string {
    return JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
      usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens },
    })
  }

  formatNonStreamResponse(content: string, model: string, id: string, reference?: any): object {
    return {
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content, ...(reference && { reference }) },
        finish_reason: 'stop',
      }],
    }
  }
}

export const chatOpenaiService = new ChatOpenaiService()
```

- [ ] **Step 3: Create controller with Bearer token auth**

```typescript
// be/src/modules/chat/controllers/chat-openai.controller.ts
class ChatOpenaiController {
  async chatCompletion(req: Request, res: Response) {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'Missing API key', type: 'invalid_request_error' } })
    }
    const apiKey = authHeader.slice(7)

    // Validate token and get dialog
    const token = await chatEmbedService.validateToken(apiKey)
    if (!token) {
      return res.status(401).json({ error: { message: 'Invalid API key', type: 'authentication_error' } })
    }

    const { messages, stream = true, model } = req.body
    const lastUserMessage = messages?.filter((m: any) => m.role === 'user').pop()
    if (!lastUserMessage) {
      return res.status(400).json({ error: { message: 'No user message found', type: 'invalid_request_error' } })
    }

    // Route to existing chat completion logic, but format as OpenAI response
    // ... (delegates to chatConversationService with OpenAI response wrapping)
  }

  async listModels(req: Request, res: Response) {
    // Return available models
    res.json({
      object: 'list',
      data: [{ id: 'b-knowledge-rag', object: 'model', created: 0, owned_by: 'b-knowledge' }],
    })
  }
}
```

- [ ] **Step 4: Write tests**

Test OpenAI format compliance:
```typescript
describe('ChatOpenaiService', () => {
  it('should format stream chunk correctly', () => {
    const chunk = service.formatStreamChunk('Hello', 'b-knowledge-rag', 'chatcmpl-123')
    const parsed = JSON.parse(chunk)
    expect(parsed.object).toBe('chat.completion.chunk')
    expect(parsed.choices[0].delta.content).toBe('Hello')
  })

  it('should format final chunk with usage', () => {
    const chunk = service.formatFinalChunk('b-knowledge-rag', 'chatcmpl-123', { prompt_tokens: 100, completion_tokens: 50 })
    const parsed = JSON.parse(chunk)
    expect(parsed.choices[0].finish_reason).toBe('stop')
    expect(parsed.usage.total_tokens).toBe(150)
  })
})
```

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/chat/ be/src/app/routes.ts be/tests/chat/
git commit -m "feat: add OpenAI-compatible API endpoint for chat completions"
```

---

## Dependency Graph

```
Phase 1 (Core UX):
  Task 1.1 (Position data) → Task 1.2 (Document viewer) [sequential]
  Task 1.3 (Regeneration) [independent]
  Task 1.4 (Rename) [independent]
  Task 1.5 (Prologue) [independent]
  Task 1.6 (File upload) [independent]
  Task 1.7 (Pagination) [independent]

Phase 2 (Advanced RAG):
  Task 2.1 (Variables) [independent]
  Task 2.2 (Metadata filter) [independent]
  Task 2.3 (Doc ID filter) [independent, can parallel with 2.2]
  Task 2.4 (LLM overrides) [independent]
  Task 2.5 (UI toggles) [independent]

Phase 3 (Integration):
  Task 3.1 (Widget) [depends on Phase 1 completion for shared components]
  Task 3.2 (OpenAI API) [depends on Task 3.1 for token system, or can share token table]
```

**Parallelization opportunities:**
- Phase 1: Tasks 1.3, 1.4, 1.5, 1.6, 1.7 can all run in parallel
- Phase 2: All tasks can run in parallel
- Phase 3: Task 3.2 depends on token table from 3.1, but OpenAI format service is independent
