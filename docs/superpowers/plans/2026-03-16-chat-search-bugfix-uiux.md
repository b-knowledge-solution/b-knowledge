# Chat & Search Bugfix + UI/UX Improvements Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 18 identified bugs and UI/UX issues across the chat and search features — covering broken abort, unused components, missing feedback persistence, hardcoded IDs, mobile responsiveness, and type safety.

**Architecture:** All changes are scoped to `fe/src/features/chat/`, `fe/src/features/search/`, and their corresponding API files. Backend is already correct — the issues are frontend-only except for one duplicated logic issue in search service. Each task is independent and can be parallelized.

**Tech Stack:** React 19 / TypeScript / TanStack Query / Tailwind CSS / shadcn/ui

---

## File Map

| # | File | Action | Responsibility |
|---|------|--------|----------------|
| 1 | `fe/src/features/chat/api/chatApi.ts` | Modify | Add `signal` param to `sendMessage` |
| 2 | `fe/src/features/search/api/searchApi.ts` | Modify | Add `signal` param to `askSearch` |
| 3 | `fe/src/features/chat/hooks/useChatStream.ts` | Modify | Pass abort signal, fix stale reference closure |
| 4 | `fe/src/features/search/hooks/useSearchStream.ts` | Modify | Pass abort signal, fix `any` types |
| 5 | `fe/src/features/chat/components/ChatMessageList.tsx` | Rewrite | Use `ChatMessage` component, pass all callbacks |
| 6 | `fe/src/features/chat/components/ChatMessage.tsx` | Modify | Wire feedback to backend API |
| 7 | `fe/src/features/chat/api/chatApi.ts` | Modify | Add `sendFeedback` method |
| 8 | `fe/src/features/chat/components/ChatSidebar.tsx` | Modify | Implement inline rename |
| 9 | `fe/src/features/search/pages/SearchPage.tsx` | Modify | Replace hardcoded ID with search app selector |
| 10 | `fe/src/features/search/api/searchQueries.ts` | Modify | Add `useAccessibleSearchApps` hook |
| 11 | `fe/src/features/chat/pages/ChatPage.tsx` | Modify | Fix multi-KB preview, add mobile drawer |
| 12 | `fe/src/features/chat/components/ChatMessageList.tsx` | Modify | Add auto-scroll |
| 13 | `fe/src/features/search/pages/SearchPage.tsx` | Modify | Use non-streaming search for pagination |
| 14 | `fe/src/features/chat/api/chatApi.ts` | Modify | Fix inconsistent delete endpoint |

---

## Chunk 1: Critical Streaming Fixes (Abort + Stale Closure)

### Task 1: Fix AbortController not passed to fetch in chat streaming

**Files:**
- Modify: `fe/src/features/chat/api/chatApi.ts:173-220`
- Modify: `fe/src/features/chat/hooks/useChatStream.ts:105-144`

**Why:** The `AbortController` is created in `useChatStream` but never passed as `signal` to the fetch call. Pressing "Stop" does nothing to cancel the network request.

- [ ] **Step 1: Add `signal` parameter to `chatApi.sendMessage`**

In `fe/src/features/chat/api/chatApi.ts`, modify the `sendMessage` function signature and fetch call:

```typescript
// Change signature to accept signal
sendMessage: async (
  conversationId: string,
  content: string,
  assistantId: string,
  options?: SendMessageOptions,
  signal?: AbortSignal,
): Promise<Response> => {
  // ... existing body building code stays the same ...

  // Use raw fetch for streaming support — now with signal
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  })

  return response
},
```

- [ ] **Step 2: Pass `abortRef.current.signal` in `useChatStream`**

In `fe/src/features/chat/hooks/useChatStream.ts`, modify line 134:

```typescript
// Before:
const response = await chatApi.sendMessage(conversationId, content, dialogId, options)

// After:
const response = await chatApi.sendMessage(conversationId, content, dialogId, options, abortRef.current.signal)
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add fe/src/features/chat/api/chatApi.ts fe/src/features/chat/hooks/useChatStream.ts
git commit -m "fix(chat): pass AbortController signal to streaming fetch for proper cancellation"
```

---

### Task 2: Fix AbortController not passed to fetch in search streaming

**Files:**
- Modify: `fe/src/features/search/api/searchApi.ts:70-88`
- Modify: `fe/src/features/search/hooks/useSearchStream.ts:81-101`

**Why:** Same issue as chat — abort signal not forwarded to fetch.

- [ ] **Step 1: Add `signal` parameter to `searchApi.askSearch`**

In `fe/src/features/search/api/searchApi.ts`, modify the `askSearch` function:

```typescript
askSearch: async (
  searchAppId: string,
  query: string,
  filters?: SearchFilters,
  signal?: AbortSignal,
): Promise<Response> => {
  const apiBase = import.meta.env.VITE_API_BASE_URL || ''
  const url = `${apiBase}/api/search/apps/${searchAppId}/ask`

  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ query, ...filters }),
    signal,
  })
},
```

- [ ] **Step 2: Pass `abortRef.current.signal` in `useSearchStream`**

In `fe/src/features/search/hooks/useSearchStream.ts`, modify line 101:

```typescript
// Before:
const response = await searchApi.askSearch(searchAppId, query, filters)

// After:
const response = await searchApi.askSearch(searchAppId, query, filters, abortRef.current.signal)
```

- [ ] **Step 3: Fix `any` types in `useSearchStream`**

In `fe/src/features/search/hooks/useSearchStream.ts`:

Line 184 — change `catch (parseErr: any)` to:
```typescript
} catch (parseErr: unknown) {
  // Re-throw actual errors (not JSON parse errors)
  const errMsg = parseErr instanceof Error ? parseErr.message : ''
  if (errMsg && !errMsg.includes('JSON')) {
    throw parseErr
  }
  // Skip malformed JSON lines
}
```

Line 200 — change `catch (err: any)` to:
```typescript
} catch (err: unknown) {
  // Handle abort (user cancelled)
  if (err instanceof Error && err.name === 'AbortError') return

  // Set error state
  const errorMsg = err instanceof Error ? err.message : 'An error occurred while searching'
  setError(errorMsg)
}
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add fe/src/features/search/api/searchApi.ts fe/src/features/search/hooks/useSearchStream.ts
git commit -m "fix(search): pass AbortController signal to streaming fetch, fix any types"
```

---

### Task 3: Fix stale `references` closure in useChatStream

**Files:**
- Modify: `fe/src/features/chat/hooks/useChatStream.ts:220-234`

**Why:** At line 231, the `references` value captured in the closure is stale because `setReferences()` updates are async. The final assistant message may have `undefined` reference even though references were received.

- [ ] **Step 1: Add a `referencesRef` to track latest value**

In `fe/src/features/chat/hooks/useChatStream.ts`, add after line 97 (`const answerRef = useRef('')`):

```typescript
// Track latest references across renders for the finalization step
const referencesRef = useRef<ChatReference | null>(null)
```

- [ ] **Step 2: Update referencesRef when setting references**

At line 189 (the `if (data.reference && !data.answer)` block):
```typescript
if (data.reference && !data.answer) {
  referencesRef.current = data.reference
  setReferences(data.reference)
}
```

At line 196 (inside the `if (data.answer)` block):
```typescript
if (data.reference) {
  referencesRef.current = data.reference
  setReferences(data.reference)
}
```

- [ ] **Step 3: Use `referencesRef.current` when building final message**

At line 231, change:
```typescript
// Before:
reference: references ?? undefined,

// After:
reference: referencesRef.current ?? undefined,
```

- [ ] **Step 4: Reset `referencesRef` in `clearMessages`**

In the `clearMessages` function, add:
```typescript
referencesRef.current = null
```

- [ ] **Step 5: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```bash
git add fe/src/features/chat/hooks/useChatStream.ts
git commit -m "fix(chat): use ref for references to avoid stale closure in final message"
```

---

## Chunk 2: ChatMessageList Rewrite (Use ChatMessage Component)

### Task 4: Rewrite ChatMessageList to use ChatMessage component

**Files:**
- Modify: `fe/src/features/chat/components/ChatMessageList.tsx`

**Why:** The current `ChatMessageList` renders raw text bubbles and ignores the `ChatMessage` component which has markdown rendering, citations, copy, TTS, feedback, and regenerate buttons. All callback props are received but unused (prefixed with `_`).

- [ ] **Step 1: Rewrite ChatMessageList**

Replace the entire content of `fe/src/features/chat/components/ChatMessageList.tsx`:

```typescript
/**
 * @fileoverview Chat message list component rendering all messages in a conversation.
 * @module features/chat/components/ChatMessageList
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import ChatMessage from './ChatMessage'
import type { ChatMessage as ChatMessageType, ChatReference, ChatChunk } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatMessageListProps {
  /** Array of messages to display */
  messages: ChatMessageType[]
  /** Whether streaming is in progress */
  isStreaming: boolean
  /** Partial answer being streamed */
  currentAnswer: string
  /** Callback when a citation is clicked */
  onCitationClick: (reference: ChatReference) => void
  /** Callback when a chunk citation is clicked */
  onChunkCitationClick: (chunk: ChatChunk) => void
  /** Callback when a suggested prompt is clicked */
  onSuggestedPrompt: (content: string) => void
  /** Callback for regenerating the last message */
  onRegenerate: () => void
  /** CSS class name */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders the message list for a chat conversation.
 * Uses ChatMessage component for each message with full feature support.
 *
 * @param {ChatMessageListProps} props - Component properties
 * @returns {JSX.Element} The rendered message list
 */
function ChatMessageList({
  messages,
  isStreaming,
  currentAnswer,
  onCitationClick,
  onChunkCitationClick,
  onSuggestedPrompt: _onSuggestedPrompt,
  onRegenerate,
  className = '',
}: ChatMessageListProps) {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, currentAnswer])

  // Find the last assistant message index for regenerate button
  let lastAssistantIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'assistant') {
      lastAssistantIdx = i
      break
    }
  }

  return (
    <div className={`overflow-y-auto px-4 py-6 space-y-1 ${className}`}>
      {messages.length === 0 && !isStreaming && (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">{t('chat.startConversation')}</p>
        </div>
      )}

      {messages.map((msg, idx) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          onCitationClick={onCitationClick}
          onChunkCitationClick={onChunkCitationClick}
          isLast={idx === messages.length - 1}
          onRegenerate={
            !isStreaming && idx === lastAssistantIdx && msg.role === 'assistant'
              ? onRegenerate
              : undefined
          }
        />
      ))}

      {/* Streaming indicator — shows partial answer as it arrives */}
      {isStreaming && currentAnswer && (
        <ChatMessage
          message={{
            id: 'streaming',
            role: 'assistant',
            content: currentAnswer,
            timestamp: new Date().toISOString(),
          }}
          isLast
        />
      )}

      {/* Typing indicator when streaming has started but no content yet */}
      {isStreaming && !currentAnswer && (
        <div className="flex gap-3 px-4 py-3">
          <div className="h-8 w-8" />
          <div className="flex items-center gap-1 px-4 py-2.5 rounded-2xl bg-muted/60 dark:bg-muted/40">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  )
}

export default ChatMessageList
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/chat/components/ChatMessageList.tsx
git commit -m "fix(chat): rewrite ChatMessageList to use ChatMessage component with all features"
```

---

## Chunk 3: Feedback Persistence + Sidebar Rename

### Task 5: Wire feedback buttons to backend API

**Files:**
- Modify: `fe/src/features/chat/api/chatApi.ts`
- Modify: `fe/src/features/chat/components/ChatMessage.tsx:69-81`

**Why:** The feedback buttons (thumbs up/down) only update local state but never call the backend. The backend has `POST /api/chat/conversations/:id/feedback` ready.

- [ ] **Step 1: Add `sendFeedback` to `chatApi`**

In `fe/src/features/chat/api/chatApi.ts`, add after the `deleteMessage` method (after line 158):

```typescript
  /**
   * Send feedback (thumbs up/down) on an assistant message.
   * @param conversationId - Conversation identifier
   * @param messageId - Message identifier
   * @param thumbup - True for positive, false for negative
   * @param feedback - Optional text feedback
   */
  sendFeedback: async (
    conversationId: string,
    messageId: string,
    thumbup: boolean,
    feedback?: string,
  ): Promise<void> => {
    await api.post(`${BASE_URL}/conversations/${conversationId}/feedback`, {
      message_id: messageId,
      thumbup,
      feedback,
    })
  },
```

- [ ] **Step 2: Add `conversationId` prop to ChatMessage**

In `fe/src/features/chat/components/ChatMessage.tsx`, add to the interface:

```typescript
interface ChatMessageProps {
  message: ChatMessageType
  onCitationClick?: ((reference: ChatReference) => void) | undefined
  onChunkCitationClick?: ((chunk: ChatChunk) => void) | undefined
  isLast?: boolean | undefined
  onRegenerate?: (() => void) | undefined
  /** Conversation ID for persisting feedback */
  conversationId?: string | undefined
}
```

- [ ] **Step 3: Wire `handleFeedback` to the API**

In `ChatMessage.tsx`, update `handleFeedback`:

```typescript
const handleFeedback = async (type: 'up' | 'down') => {
  const newValue = feedback === type ? null : type
  setFeedback(newValue)

  // Persist to backend if we have a conversation ID and a real message ID
  if (conversationId && message.id && !message.id.startsWith('assistant-') && !message.id.startsWith('error-')) {
    try {
      if (newValue) {
        await chatApi.sendFeedback(conversationId, message.id, newValue === 'up')
      }
    } catch {
      // Best-effort — don't block UI on feedback failure
    }
  }
}
```

Add import at the top:
```typescript
import { chatApi } from '../api/chatApi'
```

- [ ] **Step 4: Pass `conversationId` from ChatMessageList**

In `fe/src/features/chat/components/ChatMessageList.tsx`, add `conversationId` prop to the interface and pass it to `<ChatMessage>`:

```typescript
interface ChatMessageListProps {
  // ... existing props ...
  /** Conversation ID for feedback persistence */
  conversationId?: string | undefined
}
```

And in the render:
```typescript
<ChatMessage
  key={msg.id}
  message={msg}
  conversationId={conversationId}
  // ... other props ...
/>
```

- [ ] **Step 5: Pass `conversationId` from ChatPage**

In `fe/src/features/chat/pages/ChatPage.tsx`, add to the `<ChatMessageList>` usage:

```typescript
<ChatMessageList
  // ... existing props ...
  conversationId={conversations.activeConversation?.id}
/>
```

- [ ] **Step 6: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add fe/src/features/chat/api/chatApi.ts fe/src/features/chat/components/ChatMessage.tsx fe/src/features/chat/components/ChatMessageList.tsx fe/src/features/chat/pages/ChatPage.tsx
git commit -m "fix(chat): persist feedback to backend via POST /api/chat/conversations/:id/feedback"
```

---

### Task 6: Implement inline rename in ChatSidebar

**Files:**
- Modify: `fe/src/features/chat/components/ChatSidebar.tsx`

**Why:** `onRename` prop is received but aliased to `_onRename` and never used. Users cannot rename conversations.

- [ ] **Step 1: Implement inline rename with double-click**

Replace the entire content of `fe/src/features/chat/components/ChatSidebar.tsx`:

```typescript
/**
 * @fileoverview Chat sidebar component for listing and managing conversations.
 * @module features/chat/components/ChatSidebar
 */

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import type { Conversation } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatSidebarProps {
  className?: string
  conversations: Conversation[]
  loading: boolean
  activeConversationId?: string | undefined
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  search: string
  onSearchChange: (search: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Sidebar listing conversations with search, create, rename, and delete.
 */
function ChatSidebar({
  className = '',
  conversations,
  loading,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  search,
  onSearchChange,
}: ChatSidebarProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }
  }, [editingId])

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id)
    setEditValue(conv.name)
  }

  const confirmRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  const cancelRename = () => {
    setEditingId(null)
  }

  // Filter conversations by search
  const filtered = search
    ? conversations.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : conversations

  return (
    <div className={`flex flex-col border-r border-border bg-muted/30 ${className}`}>
      {/* Header */}
      <div className="p-3 space-y-2">
        <button
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-background hover:bg-muted transition-colors"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          {t('chat.newConversation')}
        </button>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('common.searchPlaceholder')}
          className="w-full h-8 px-2.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{t('common.noData')}</p>
        ) : (
          filtered.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-1 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                conv.id === activeConversationId
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted text-foreground'
              }`}
              onClick={() => {
                if (editingId !== conv.id) onSelect(conv.id)
              }}
            >
              {editingId === conv.id ? (
                /* Inline rename input */
                <div className="flex-1 flex items-center gap-1">
                  <input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                    className="flex-1 h-6 px-1.5 text-xs rounded border border-primary bg-background text-foreground focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
                    onClick={(e) => { e.stopPropagation(); confirmRename() }}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
                    onClick={(e) => { e.stopPropagation(); cancelRename() }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                /* Normal display */
                <>
                  <span className="flex-1 truncate">{conv.name}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="h-6 w-6 flex items-center justify-center rounded shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                      onClick={(e) => { e.stopPropagation(); startRename(conv) }}
                      title={t('common.rename')}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      className="h-6 w-6 flex items-center justify-center rounded shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                      title={t('common.delete')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ChatSidebar
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/chat/components/ChatSidebar.tsx
git commit -m "feat(chat): implement inline conversation rename with edit/confirm/cancel"
```

---

## Chunk 3: Search App Selector + Pagination Fix

### Task 7: Replace hardcoded search app ID with selector

**Files:**
- Modify: `fe/src/features/search/api/searchQueries.ts`
- Modify: `fe/src/features/search/pages/SearchPage.tsx`

**Why:** `SearchPage.tsx:45` hardcodes `searchAppId = 'default'` which is not a valid UUID. The page needs to fetch accessible search apps and let the user pick one (or auto-select the first).

- [ ] **Step 1: Add `useAccessibleSearchApps` hook**

In `fe/src/features/search/api/searchQueries.ts`, add:

```typescript
/**
 * @description Hook to fetch search apps accessible to the current user.
 * Auto-selects the first app if none is selected.
 * @returns Search apps list, active app, and selection setter
 */
export function useAccessibleSearchApps() {
  const [activeAppId, setActiveAppId] = useState<string | null>(null)

  const query = useQuery({
    queryKey: queryKeys.search.apps({ accessible: true }),
    queryFn: () => searchApi.listSearchApps(),
  })

  const apps = query.data?.data ?? []
  const activeApp = apps.find((a) => a.id === activeAppId) ?? apps[0] ?? null

  return {
    apps,
    activeApp,
    activeAppId: activeApp?.id ?? null,
    setActiveAppId,
    loading: query.isLoading,
  }
}
```

- [ ] **Step 2: Update SearchPage to use the hook and show a selector**

In `fe/src/features/search/pages/SearchPage.tsx`:

Replace the hardcoded `searchAppId` state (line 45):
```typescript
// Before:
const [searchAppId] = useState('default')

// After — remove this line entirely, use the hook instead
```

Add import and hook:
```typescript
import { useAccessibleSearchApps } from '../api/searchQueries'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Inside the component, after useSearchStream():
const { apps: searchApps, activeApp, activeAppId: searchAppId, setActiveAppId, loading: appsLoading } = useAccessibleSearchApps()
```

Replace `searchAppId` references — `handleSearch`, `handleFiltersChange`, `handleRelatedQuestionClick`, `handlePageChange` all use `searchAppId` which now comes from the hook.

Add a search app selector on the landing page (inside the `{!hasSearched && (` block, before the Dataset badges section around line 297):

```typescript
{/* Search app selector */}
{searchApps.length > 1 && (
  <div className="mt-4">
    <Select value={searchAppId ?? ''} onValueChange={setActiveAppId}>
      <SelectTrigger className="w-64 mx-auto">
        <SelectValue placeholder={t('search.selectApp')} />
      </SelectTrigger>
      <SelectContent>
        {searchApps.map((app) => (
          <SelectItem key={app.id} value={app.id}>
            {app.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

Guard the search submission:
```typescript
const handleSearch = (query: string) => {
  if (!searchAppId) return
  // ... rest stays the same
```

- [ ] **Step 3: Add i18n keys**

In `fe/src/i18n/locales/en.json`, add under `"search"`:
```json
"selectApp": "Select search app"
```

In `fe/src/i18n/locales/vi.json`:
```json
"selectApp": "Chọn ứng dụng tìm kiếm"
```

In `fe/src/i18n/locales/ja.json`:
```json
"selectApp": "検索アプリを選択"
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add fe/src/features/search/api/searchQueries.ts fe/src/features/search/pages/SearchPage.tsx fe/src/i18n/locales/en.json fe/src/i18n/locales/vi.json fe/src/i18n/locales/ja.json
git commit -m "fix(search): replace hardcoded search app ID with dynamic selector from accessible apps"
```

---

### Task 8: Fix pagination re-triggering SSE stream

**Files:**
- Modify: `fe/src/features/search/pages/SearchPage.tsx`

**Why:** `handlePageChange` calls `searchStream.askSearch()` which is the SSE streaming endpoint. Changing pages shouldn't regenerate the AI summary — it should fetch the next page of chunk results via the non-streaming endpoint.

- [ ] **Step 1: Add non-streaming search state and handler**

In `SearchPage.tsx`, import the non-streaming search hook:

```typescript
import { useSearch } from '../api/searchQueries'
```

Add a non-streaming search mutation for pagination:

```typescript
const paginatedSearch = useSearch()
```

Update `handlePageChange` to use non-streaming search:

```typescript
const handlePageChange = (newPage: number) => {
  setPage(newPage)
  if (searchStream.lastQuery && searchAppId) {
    // Use non-streaming search for pagination — don't regenerate AI summary
    paginatedSearch.search(searchStream.lastQuery, {
      ...filters,
      page: newPage,
      page_size: pageSize,
    })
  }
}
```

Use `paginatedSearch.results` for the result list when page > 1:

```typescript
// Determine which results to show: page 1 uses stream results, other pages use paginated
const displayResults = page === 1 ? searchStream.chunks : paginatedSearch.results
const displayTotal = page === 1 ? searchStream.chunks.length : paginatedSearch.totalResults
```

Pass `displayResults` and `displayTotal` to `<SearchResults>`.

- [ ] **Step 2: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/search/pages/SearchPage.tsx
git commit -m "fix(search): use non-streaming search for pagination to avoid regenerating AI summary"
```

---

## Chunk 4: Mobile Responsiveness + Multi-KB Preview

### Task 9: Add mobile drawer for chat sidebar and reference panel

**Files:**
- Modify: `fe/src/features/chat/pages/ChatPage.tsx`

**Why:** ChatSidebar (`hidden md:flex`) and ChatReferencePanel (`hidden lg:flex`) are completely hidden on smaller screens with no alternative access.

- [ ] **Step 1: Add Sheet-based mobile sidebar and reference panel**

In `ChatPage.tsx`, add imports:

```typescript
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
```

Add mobile sidebar state:
```typescript
const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
```

In the chat header (around line 242), add a hamburger menu button for mobile before the conversation title:

```typescript
{/* Mobile sidebar trigger */}
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
```

For the reference panel, wrap it in a Sheet on mobile. Replace the current reference panel block (line 333-340):

```typescript
{/* Right panel: document references — desktop */}
{showReferences && (
  <ChatReferencePanel
    className="w-80 shrink-0 hidden lg:flex"
    reference={activeReference || stream.references}
    onClose={() => setShowReferences(false)}
    onDocumentClick={handleDocumentClick}
  />
)}

{/* Right panel: document references — mobile */}
{showReferences && (
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
)}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/chat/pages/ChatPage.tsx
git commit -m "feat(chat): add mobile drawer for sidebar and reference panel"
```

---

### Task 10: Fix document preview for multi-KB assistants

**Files:**
- Modify: `fe/src/features/chat/pages/ChatPage.tsx:348`

**Why:** Document preview only passes `kb_ids[0]` as the dataset ID. If a chunk comes from a different KB, the preview won't load.

- [ ] **Step 1: Track the chunk's dataset in `previewChunk` state**

In `ChatPage.tsx`, change the `previewChunk` state to also track dataset ID:

```typescript
const [previewChunk, setPreviewChunk] = useState<(ChatChunk & { dataset_id?: string }) | null>(null)
```

Update `handleChunkCitationClick` to try to find the dataset ID from references:

```typescript
const handleChunkCitationClick = (chunk: ChatChunk) => {
  // Try to find which dataset this chunk belongs to by matching doc_id to references
  const ref = stream.references
  const matchedChunk = ref?.chunks.find((c) => c.doc_id === chunk.doc_id)
  setPreviewChunk({
    ...chunk,
    dataset_id: (matchedChunk as any)?.dataset_id,
  })
  setShowDocPreview(true)
}
```

Update the `ChatDocumentPreviewDrawer` prop:

```typescript
<ChatDocumentPreviewDrawer
  open={showDocPreview}
  onClose={() => setShowDocPreview(false)}
  chunk={previewChunk}
  datasetId={previewChunk?.dataset_id || assistants.activeAssistant?.kb_ids[0]}
/>
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/chat/pages/ChatPage.tsx
git commit -m "fix(chat): resolve dataset ID from chunk references for multi-KB preview"
```

---

## Chunk 5: Cleanup (Inconsistent API + Backend DRY)

### Task 11: Fix inconsistent `deleteConversations` endpoint

**Files:**
- Modify: `fe/src/features/chat/api/chatApi.ts:139-144`

**Why:** `deleteConversations` calls `/api/chat/sessions` while all other endpoints use `/api/chat/conversations/`. Check which backend route actually exists.

- [ ] **Step 1: Verify backend route**

Run: `grep -n 'sessions\|conversations.*delete' be/src/modules/chat/routes/chat-conversation.routes.ts`

Based on result, update the frontend to match the actual backend route. The backend likely uses `/conversations` with body `{ ids }`:

```typescript
deleteConversations: async (ids: string[]): Promise<void> => {
  return api.delete<void>(`${BASE_URL}/conversations`, {
    body: JSON.stringify({ ids }),
    headers: { 'Content-Type': 'application/json' },
  })
},
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build -w fe 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add fe/src/features/chat/api/chatApi.ts
git commit -m "fix(chat): align deleteConversations endpoint with backend route"
```

---

### Task 12: Add i18n keys for new UI elements

**Files:**
- Modify: `fe/src/i18n/locales/en.json`
- Modify: `fe/src/i18n/locales/vi.json`
- Modify: `fe/src/i18n/locales/ja.json`

**Why:** New UI elements from tasks 6 and 9 need translations. Add `common.rename`, `common.delete` if not already present.

- [ ] **Step 1: Check which keys exist and add missing ones**

Run: `grep -c '"rename"' fe/src/i18n/locales/en.json`

Add any missing keys to all 3 locale files.

- [ ] **Step 2: Commit**

```bash
git add fe/src/i18n/locales/
git commit -m "chore(i18n): add missing translation keys for rename, delete, and search app selector"
```

---

## Task Dependency Graph

```
Task 1 (chat abort)     ──┐
Task 2 (search abort)   ──┤── Independent, can run in parallel
Task 3 (stale closure)  ──┤
Task 5 (feedback)       ──┤
Task 6 (sidebar rename) ──┤
Task 7 (search app ID)  ──┤
Task 11 (delete endpoint)─┘

Task 4 (MessageList) ─── depends on Task 3 (referencesRef) and Task 5 (conversationId prop)
Task 8 (pagination)  ─── depends on Task 7 (searchAppId from hook)
Task 9 (mobile)      ─── depends on Task 4 (ChatMessageList uses ChatMessage)
Task 10 (multi-KB)   ─── no hard deps, but logically after Task 4

Task 12 (i18n)       ─── depends on Task 6, 7, 9 (all add new UI text)
```

**Recommended execution order:**
1. Tasks 1, 2, 3, 5, 6, 7, 11 (parallel — all independent)
2. Tasks 4, 8 (depend on earlier tasks)
3. Tasks 9, 10 (depend on Task 4)
4. Task 12 (final — collects all i18n needs)
