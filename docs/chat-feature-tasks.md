# Chat Feature Task List

**Date**: 2026-03-10
**Source**: RAGFlow `next-chats/` (34 files)
**Current Coverage**: 24/73 features done (33%)

---

## Tier 1 — Core UX (Must Have)

### Task 1.1: Chat Settings Panel (Collapsible Right Panel)

**Current**: Settings are in a modal dialog (`ChatDialogConfig`), missing most RAGFlow fields.
**Target**: Collapsible right-side panel matching RAGFlow's `chat-settings.tsx` pattern.

| # | Sub-task | Scope | Files to Create/Modify |
|---|----------|-------|----------------------|
| 1.1.1 | Create `ChatSettingsPanel` component (collapsible right panel with gear icon toggle) | FE | `fe/src/features/ai/components/ChatSettingsPanel.tsx` |
| 1.1.2 | Add **Basic Settings** section: name, description, avatar upload | FE | Same as above |
| 1.1.3 | Add **Empty response** field (custom message when no KB results) | FE | Same |
| 1.1.4 | Add **Prologue/opener** field (welcome message for new conversations) | FE | Same |
| 1.1.5 | Add **Quote toggle** (show/hide source citations) | FE | Same |
| 1.1.6 | Add **Keyword toggle** (enable keyword extraction) | FE | Same |
| 1.1.7 | Add **TTS toggle** (enable text-to-speech per dialog) | FE | Same |
| 1.1.8 | Add **TOC enhance toggle** | FE | Same |
| 1.1.9 | Add **Tavily API key** input (for web search) | FE | Same |
| 1.1.10 | Add **Knowledge base multi-select** (with embedding model validation, max 10) | FE | Same |
| 1.1.11 | Add **Prompt Engine** section: system prompt textarea | FE | Same |
| 1.1.12 | Add **Similarity threshold** slider (0-1) | FE | Same |
| 1.1.13 | Add **Top N documents** input | FE | Same |
| 1.1.14 | Add **Refine multiturn** toggle | FE | Same |
| 1.1.15 | Add **Knowledge graph** toggle (`use_kg`) | FE | Same |
| 1.1.16 | Add **Rerank model** select + toggle | FE | Same |
| 1.1.17 | Add **Cross-language** multi-select (English, Japanese, Vietnamese, etc.) | FE | Same |
| 1.1.18 | Add **Model Settings** section: LLM model dropdown | FE | Same |
| 1.1.19 | Add **Temperature** slider with enable toggle | FE | Same |
| 1.1.20 | Add **Top-P** slider with enable toggle | FE | Same |
| 1.1.21 | Add **Frequency penalty** slider with enable toggle | FE | Same |
| 1.1.22 | Add **Presence penalty** slider with enable toggle | FE | Same |
| 1.1.23 | Add **Max tokens** input with enable toggle | FE | Same |
| 1.1.24 | Replace `ChatDialogConfig` modal usage in `DatasetChatPage` with the new panel | FE | `DatasetChatPage.tsx` |
| 1.1.25 | Add Zod validation schema for all settings fields | FE | `fe/src/features/ai/hooks/useChatSettingSchema.ts` |
| 1.1.26 | Add i18n keys for all new fields (en, vi, ja) | FE | `fe/src/i18n/locales/*.json` |
| 1.1.27 | Ensure `updateDialog` API sends all fields to backend | FE/BE | `chatApi.ts`, dialog controller |

---

### Task 1.2: Message Regenerate

**Current**: No regenerate capability.
**Target**: Button on assistant messages to re-send the preceding user question and get a new response.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 1.2.1 | Add "Regenerate" button (RefreshCw icon) to assistant message action bar | FE | `ChatMessage.tsx` |
| 1.2.2 | Add `onRegenerate` callback prop to `ChatMessage` → `ChatMessageList` → `DatasetChatPage` | FE | Multiple |
| 1.2.3 | Implement `regenerateMessage(messageId)` in `useChatStream` — delete last assistant message, re-send last user message | FE | `useChatStream.ts` |
| 1.2.4 | Add BE endpoint or reuse existing: delete message + re-call completion | BE | `chat-conversation.service.ts` |

---

### Task 1.3: Document Preview from Chat Citations

**Current**: Clicking citation opens reference panel; no PDF viewer with highlighting.
**Target**: Clicking a citation chunk opens `DocumentPreviewer` with highlighted chunk position.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 1.3.1 | Add `DocumentPreviewDrawer` component wrapping existing `DocumentPreviewer` in a Sheet/Drawer | FE | `fe/src/features/ai/components/DocumentPreviewDrawer.tsx` |
| 1.3.2 | Wire `onChunkCitationClick` in `DatasetChatPage` to open drawer with doc ID + chunk | FE | `DatasetChatPage.tsx` |
| 1.3.3 | Call `buildChunkHighlights()` with chunk positions for PDF highlighting | FE | Same |
| 1.3.4 | Add `onDocumentClick` in `ChatReferencePanel` to open drawer | FE | `ChatReferencePanel.tsx` |
| 1.3.5 | Ensure BE returns `positions: number[][]` in chunk data from OpenSearch | BE | `chat-conversation.service.ts`, `rag-search.service.ts` |

---

### Task 1.4: Prologue / Welcome Message

**Current**: Empty state shows generic suggested prompts, ignores dialog's `prologue` config.
**Target**: Display dialog's configured welcome message as first assistant message in new conversations.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 1.4.1 | Read `dialog.prompt_config.prologue` when conversation is empty | FE | `DatasetChatPage.tsx` |
| 1.4.2 | Display prologue as a system/assistant message in `ChatMessageList` empty state | FE | `ChatMessageList.tsx` |

---

### Task 1.5: Related Questions

**Current**: Not implemented.
**Target**: Show 3-5 clickable follow-up question suggestions below assistant answers.

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 1.5.1 | Add BE endpoint `POST /api/chat/conversations/:id/related-questions` | BE | `chat-conversation.routes.ts`, controller, service |
| 1.5.2 | Use `relatedQuestionPrompt` from shared prompts to generate questions via LLM | BE | `chat-conversation.service.ts` |
| 1.5.3 | Add `RelatedQuestions` component (button chips below assistant message) | FE | `fe/src/features/ai/components/RelatedQuestions.tsx` |
| 1.5.4 | Wire click to send as new user message | FE | `DatasetChatPage.tsx` |
| 1.5.5 | Add i18n keys | FE | Locale files |

---

## Tier 2 — Power User Features

### Task 2.1: Batch Delete Conversations

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.1.1 | Add selection mode toggle button in `ChatSidebar` | FE | `ChatSidebar.tsx` |
| 2.1.2 | Add checkboxes on each conversation item when in selection mode | FE | Same |
| 2.1.3 | Add "Select all" toggle | FE | Same |
| 2.1.4 | Add "Delete selected" button with count badge | FE | Same |
| 2.1.5 | Call `deleteConversations(ids)` bulk API | FE | `chatApi.ts` |

---

### Task 2.2: Internet Search Toggle (Per-Message)

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.2.1 | Add "Internet" toggle button in `ChatInput` (only visible when Tavily key is configured) | FE | `ChatInput.tsx` |
| 2.2.2 | Pass `enableInternet` flag in send message payload | FE | `useChatStream.ts`, `chatApi.ts` |
| 2.2.3 | BE: respect per-message `enableInternet` flag to skip/include Tavily search | BE | `chat-conversation.service.ts` |

---

### Task 2.3: Reasoning / Thinking Mode Toggle

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.3.1 | Add "Reasoning" toggle button in `ChatInput` | FE | `ChatInput.tsx` |
| 2.3.2 | Pass `enableThinking` flag in payload | FE | `useChatStream.ts`, `chatApi.ts` |
| 2.3.3 | BE: include thinking/reasoning instructions in system prompt when enabled | BE | `chat-conversation.service.ts` |
| 2.3.4 | FE: render `<section class="think">` blocks with distinct styling | FE | `MarkdownRenderer.tsx` or `CitationInline.tsx` |

---

### Task 2.4: File Upload in Chat

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.4.1 | Add file attach button (Paperclip icon) in `ChatInput` | FE | `ChatInput.tsx` |
| 2.4.2 | Create `useUploadFile` hook (upload, progress, remove) | FE | `fe/src/features/ai/hooks/useUploadFile.ts` |
| 2.4.3 | Display attached files as chips above input | FE | `ChatInput.tsx` |
| 2.4.4 | Add BE endpoint `POST /api/chat/conversations/:id/upload` | BE | Routes, controller |
| 2.4.5 | BE: parse uploaded file, chunk it, add to conversation context | BE | Service |

---

### Task 2.5: Mind Map

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.5.1 | Add BE endpoint `POST /api/chat/conversations/:id/mindmap` | BE | Routes, controller, service |
| 2.5.2 | Generate hierarchical tree structure from answer + chunks via LLM | BE | Service |
| 2.5.3 | Add `MindMapDrawer` component with tree visualization | FE | `fe/src/features/ai/components/MindMapDrawer.tsx` |
| 2.5.4 | Add brain icon button in chat header or message actions | FE | `DatasetChatPage.tsx` |
| 2.5.5 | Add loading progress animation | FE | Same |

---

### Task 2.6: Chat App List Page

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 2.6.1 | Create `ChatListPage` with card grid layout | FE | `fe/src/features/ai/pages/ChatListPage.tsx` |
| 2.6.2 | Create `ChatAppCard` component (avatar, name, description, last update, dropdown menu) | FE | `fe/src/features/ai/components/ChatAppCard.tsx` |
| 2.6.3 | Add search/filter bar and pagination | FE | Same page |
| 2.6.4 | Add "Create Chat" button with rename dialog | FE | Same page |
| 2.6.5 | Add route to `routeConfig.ts` | FE | `app/routeConfig.ts` |
| 2.6.6 | Add sidebar nav entry | FE | `layouts/Sidebar.tsx` |

---

## Tier 3 — Sharing & Embedding

### Task 3.1: Share Token CRUD

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 3.1.1 | Create DB migration for `chat_share_tokens` table | BE | `be/src/shared/db/migrations/` |
| 3.1.2 | Add model for share tokens | BE | `be/src/shared/models/` |
| 3.1.3 | Add BE endpoints: `POST /api/chat/dialogs/:id/tokens`, `GET /tokens`, `DELETE /tokens` | BE | Routes, controller, service |
| 3.1.4 | Add `EmbedDialog` component with iframe snippet + copy button | FE | `fe/src/features/ai/components/EmbedDialog.tsx` |
| 3.1.5 | Add locale selector and profile toggle | FE | Same |

---

### Task 3.2: Public Chat Widget

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 3.2.1 | Add public chat route (no auth) at `/shared/chat/:sharedId` | FE | Route, new page |
| 3.2.2 | Add BE endpoint `POST /api/public/chat/:sharedId/completions` (token-validated, no user auth) | BE | Routes, controller |
| 3.2.3 | Read theme/locale from URL query params | FE | Page component |
| 3.2.4 | Create `SharedChatPage` component (simplified chat, no sidebar) | FE | New page |

---

### Task 3.3: Floating Chat Bubble Widget

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 3.3.1 | Create standalone `ChatBubbleWidget` entry point | FE | New entry point |
| 3.3.2 | Floating button that opens chat overlay | FE | Component |
| 3.3.3 | Build as separate Vite entry for embedding | FE | `vite.config.ts` |

---

## Tier 4 — Advanced / Nice-to-Have

### Task 4.1: Multi-Model Debug Mode

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 4.1.1 | Add debug mode toggle button in chat header | FE | `DatasetChatPage.tsx` |
| 4.1.2 | Create `MultipleChatBox` component rendering 1-3 chat cards side by side | FE | New component |
| 4.1.3 | Each card: LLM model dropdown, independent message history, "Apply" config button | FE | New component |
| 4.1.4 | Unified input at bottom sends same message to all cards | FE | New component |
| 4.1.5 | Add/remove cards (max 3) | FE | Hook |

---

### Task 4.2: Dynamic Variables

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 4.2.1 | Add `DynamicVariableForm` component (add/remove key-value pairs) | FE | New component |
| 4.2.2 | Store variables in `prompt_config.variables` | FE/BE | Dialog model |
| 4.2.3 | BE: substitute `{{variable}}` placeholders in system prompt before sending to LLM | BE | `chat-conversation.service.ts` |

---

### Task 4.3: Metadata Filter UI

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 4.3.1 | Create `MetadataFilterBuilder` component (key-value-operator rows) | FE | New component |
| 4.3.2 | Add to Chat Settings and Search Settings | FE | Settings panels |
| 4.3.3 | BE: use `metaFilterPrompt` to generate filter conditions from user query | BE | Service |
| 4.3.4 | Apply filters to OpenSearch query | BE | `rag-search.service.ts` |

---

### Task 4.4: Chat Statistics

| # | Sub-task | Scope | Files |
|---|----------|-------|-------|
| 4.4.1 | Add BE endpoint `GET /api/chat/dialogs/:id/stats` | BE | Routes, controller |
| 4.4.2 | Aggregate: total conversations, messages, avg response time, popular topics | BE | Service |
| 4.4.3 | Add stats view in chat settings or dedicated tab | FE | Component |

---

## Summary

| Tier | Tasks | Sub-tasks | Priority |
|------|-------|-----------|----------|
| **Tier 1** | 5 tasks | 38 sub-tasks | Must have for usable chat |
| **Tier 2** | 6 tasks | 26 sub-tasks | Power user features |
| **Tier 3** | 3 tasks | 12 sub-tasks | Sharing & embedding |
| **Tier 4** | 4 tasks | 13 sub-tasks | Advanced / nice-to-have |
| **Total** | **18 tasks** | **89 sub-tasks** | |
