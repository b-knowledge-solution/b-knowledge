# Phase 6: Add Prompt Builder to Chat - Research

**Researched:** 2026-04-01
**Domain:** React frontend integration (component relocation + chat wiring)
**Confidence:** HIGH

## Summary

This phase integrates an existing, fully-functional `PromptBuilderModal` into the chat interface. The modal already uses shadcn/ui, has complete i18n keys (en/vi/ja), and implements a 3-step prompt builder (language, task, keyword) with lazy-loaded server-side keyword search. The primary work is: (1) moving the component from the glossary feature to shared components, (2) adding a Sparkles trigger button to ChatPage's `leftSlot`, and (3) wiring the `onApply` callback to set the ChatInput textarea value.

The critical technical challenge is that **ChatInput uses an uncontrolled textarea** (ref-based, `textareaRef.current.value`). There is no mechanism to set the textarea content from outside the component. Two viable approaches exist: (A) a `pendingMessage` prop with `useEffect` that imperatively sets the value, or (B) `forwardRef` + `useImperativeHandle` exposing a `setValue` method. Approach B is cleaner and avoids state-clearing ceremony.

**Primary recommendation:** Add `forwardRef` + `useImperativeHandle` to ChatInput exposing `setValue()`, move PromptBuilderModal to `fe/src/components/`, and wire the Sparkles trigger button in ChatPage's leftSlot.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Prompt Builder accessible from Chat only -- not Search or embedded widgets
- **D-02:** Trigger is a Sparkles icon button in ChatInput's toggle row (leftSlot area), alongside existing toggles (reasoning, internet, file upload) and assistant selector
- **D-03:** Move `PromptBuilderModal` from `fe/src/features/glossary/components/` to `fe/src/components/` (shared). Follows the same pattern as `FeedbackCommentPopover` (Phase 5 precedent)
- **D-04:** Glossary API calls (`glossaryApi.listTasks()`, `glossaryApi.searchKeywords()`) stay in `fe/src/features/glossary/api/glossaryApi.ts` -- the shared modal imports from the glossary API barrel export
- **D-05:** "Apply to Chat" inserts the generated prompt into the chat textarea, replacing any existing text. User can review/edit before sending
- **D-06:** Generated prompt remains editable in the modal before applying (current behavior preserved)
- **D-07:** Existing chat state (file attachments, reasoning toggle, internet toggle) is preserved when a prompt is applied -- only the textarea content changes
- **D-08:** Tasks and keywords are tenant-scoped -- the glossary API already filters by tenant_id from the session, no changes needed
- **D-09:** All users who can access chat can use the Prompt Builder -- no role restrictions, no feature flag

### Claude's Discretion
- Exact placement/ordering of the Sparkles button relative to other toggle buttons
- Whether to show a tooltip on the trigger button
- Loading/empty state handling when no glossary tasks exist for the tenant

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (already in project -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19 | Component framework | Project standard |
| shadcn/ui Dialog | n/a | Modal component | Already used by PromptBuilderModal |
| lucide-react Sparkles | n/a | Trigger button icon | Already imported in PromptBuilderModal |
| react-i18next | n/a | i18n strings | Project standard, keys already exist |

### Supporting
No new packages needed. This phase uses only existing dependencies.

## Architecture Patterns

### Critical Issue: ChatInput Uncontrolled Textarea

ChatInput uses `useRef<HTMLTextAreaElement>` and reads `textarea.value` directly in `handleSubmit` (line 91). There is no controlled `value` prop. The modal's `onApply` callback receives a prompt string, but there is no way to inject it into the textarea from ChatPage.

**Recommended approach: forwardRef + useImperativeHandle**

```typescript
// ChatInput exposes an imperative handle:
export interface ChatInputHandle {
  /** Set the textarea value and trigger auto-resize */
  setValue: (text: string) => void
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(props, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useImperativeHandle(ref, () => ({
      setValue: (text: string) => {
        if (textareaRef.current) {
          textareaRef.current.value = text
          // Manually trigger auto-resize since uncontrolled textarea
          // does not fire onInput on programmatic value changes
          textareaRef.current.style.height = 'auto'
          const newHeight = Math.min(textareaRef.current.scrollHeight, 200)
          textareaRef.current.style.height = `${newHeight}px`
          textareaRef.current.focus()
        }
      }
    }))

    // ... rest unchanged
  }
)
```

**Why forwardRef over pendingMessage prop:**
- No state-clearing ceremony (`setPendingMessage(undefined)` after consume)
- No `useEffect` dependency tracking
- Explicit imperative call -- intent is clear
- ChatInput stays uncontrolled

### Component Move Pattern

Following the FeedbackCommentPopover precedent from Phase 5:

```
BEFORE:
fe/src/features/glossary/components/PromptBuilderModal.tsx
fe/src/features/glossary/index.ts (exports PromptBuilderModal)

AFTER:
fe/src/components/PromptBuilderModal.tsx  (moved here)
fe/src/features/glossary/index.ts (re-export from new location for backward compat)
```

**Import path change inside the moved component:**
- `'../api/glossaryApi'` becomes `'@/features/glossary/api/glossaryApi'`

Per D-04, glossary API calls stay in the glossary feature. The shared component imports cross-feature, which is the established pattern for shared components.

### ChatPage Integration Point

```
ChatPage.tsx (line 402-422)
  └── ChatInput
        └── leftSlot: [AssistantSelectorPopover, NEW: SparklesButton]
        └── NEW prop: ref={chatInputRef}
  └── NEW: <PromptBuilderModal open={...} onClose={...} onApply={...} />
```

ChatPage manages: (1) modal open/close state, (2) ref to ChatInput, (3) `onApply` handler that calls `chatInputRef.current?.setValue(prompt)`.

### Recommended File Changes

```
fe/src/
├── components/
│   ├── PromptBuilderModal.tsx    # MOVED from features/glossary/components/
│   └── FeedbackCommentPopover.tsx # Existing (precedent)
├── features/
│   ├── glossary/
│   │   ├── api/glossaryApi.ts    # UNCHANGED
│   │   ├── components/           # PromptBuilderModal.tsx REMOVED
│   │   └── index.ts              # UPDATE - re-export from @/components/
│   └── chat/
│       ├── components/
│       │   └── ChatInput.tsx     # UPDATE - add forwardRef + useImperativeHandle
│       └── pages/
│           └── ChatPage.tsx      # UPDATE - add Sparkles button + modal + ref
```

### Anti-Patterns to Avoid
- **Do not make ChatInput fully controlled:** Converting the textarea to `value` + `onChange` would be a large refactor and risks performance issues with auto-resize. Keep it uncontrolled, use imperative handle.
- **Do not duplicate glossary API calls:** The shared modal imports from glossary barrel -- do NOT copy API functions.
- **Do not add feature flags:** D-09 says no feature flag needed.
- **Do not import from `@/features/glossary/components/`:** After the move, all consumers must import from `@/components/` or the glossary barrel re-export.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prompt builder UI | New modal | Existing `PromptBuilderModal` | Complete with 3-step flow, i18n, lazy search |
| Trigger icon | Custom SVG | `Sparkles` from lucide-react | Already used by PromptBuilderModal |
| Keyword search | Custom debounce + search | Existing implementation | Already handles debounce, stale requests, pagination |
| Tenant scoping | Auth checks | Existing glossaryApi filter | Backend scopes by session tenant_id |

## Common Pitfalls

### Pitfall 1: Textarea Value Not Updating Visually
**What goes wrong:** Setting `textareaRef.current.value` programmatically does not trigger auto-resize.
**Why it happens:** The textarea is uncontrolled -- `onInput` does not fire on programmatic `.value` assignment.
**How to avoid:** After setting `.value`, manually run the auto-resize logic (set `height = 'auto'`, then `height = scrollHeight`). The `useImperativeHandle.setValue()` bundles this.
**Warning signs:** Prompt appears in textarea but height stays at 1 row.

### Pitfall 2: Circular Import via Glossary Barrel
**What goes wrong:** Shared `PromptBuilderModal` imports from `@/features/glossary` barrel, and the barrel re-exports `PromptBuilderModal` from shared -- circular dependency.
**Why it happens:** Barrel files that both export and import the same module.
**How to avoid:** The moved component should import `glossaryApi` directly from `@/features/glossary/api/glossaryApi` (direct file path), NOT from the barrel `@/features/glossary`. The barrel re-export of PromptBuilderModal is safe because it only re-exports -- it does not import from glossaryApi.
**Warning signs:** Vite build warnings about circular dependencies.

### Pitfall 3: i18n "appliedToChat" Message is Misleading
**What goes wrong:** The toast message says "Prompt copied! Paste it into the chat input." but the prompt is now directly inserted.
**Why it happens:** Original message was designed for clipboard-only mode.
**How to avoid:** Update `glossary.promptBuilder.appliedToChat` in all 3 locale files (en, vi, ja) to reflect direct insertion behavior.
**Warning signs:** Confusing toast message after applying prompt.

### Pitfall 4: leftSlot Fragment Requirement
**What goes wrong:** `leftSlot` currently receives a single `AssistantSelectorPopover`. Adding a second element requires wrapping in a Fragment.
**Why it happens:** React requires a single root element or Fragment for JSX expressions.
**How to avoid:** Wrap both elements in `<>...</>` Fragment.
**Warning signs:** TypeScript error about multiple children in JSX expression.

## Code Examples

### Trigger Button (matches existing toggle button styling)

```typescript
// Source: ChatInput.tsx toggle button pattern (lines 167-196)
<button
  type="button"
  className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
  onClick={() => setPromptBuilderOpen(true)}
  title={t('glossary.promptBuilder.title')}
>
  <Sparkles className="h-4 w-4" />
</button>
```

### ChatInput forwardRef + useImperativeHandle

```typescript
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

export interface ChatInputHandle {
  /** Set the textarea value and trigger auto-resize */
  setValue: (text: string) => void
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({
    onSend, onStop, isStreaming, disabled,
    showReasoningToggle, showInternetToggle,
    onFilesSelected, showFileUpload, fileIds,
    leftSlot, className = '',
  }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useImperativeHandle(ref, () => ({
      setValue: (text: string) => {
        if (textareaRef.current) {
          textareaRef.current.value = text
          // Trigger auto-resize for the new content
          textareaRef.current.style.height = 'auto'
          const newHeight = Math.min(textareaRef.current.scrollHeight, 200)
          textareaRef.current.style.height = `${newHeight}px`
          textareaRef.current.focus()
        }
      }
    }))

    // ... rest of component body unchanged
  }
)

export default ChatInput
```

### ChatPage Integration

```typescript
import { PromptBuilderModal } from '@/components/PromptBuilderModal'
import type { ChatInputHandle } from '../components/ChatInput'
import { Sparkles } from 'lucide-react'

// Inside DatasetChatPage:
const chatInputRef = useRef<ChatInputHandle>(null)
const [promptBuilderOpen, setPromptBuilderOpen] = useState(false)

// leftSlot with both AssistantSelector and Sparkles button:
leftSlot={
  <>
    <AssistantSelectorPopover
      assistants={assistants.assistants}
      activeAssistantId={assistants.activeAssistant?.id ?? null}
      onSelect={(id) => {
        assistants.setActiveAssistantId(id)
        conversations.setActiveConversationId(null)
      }}
    />
    <button
      type="button"
      className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
      onClick={() => setPromptBuilderOpen(true)}
      title={t('glossary.promptBuilder.title')}
    >
      <Sparkles className="h-4 w-4" />
    </button>
  </>
}

// ChatInput with ref:
<ChatInput ref={chatInputRef} ... />

// Modal at page level:
<PromptBuilderModal
  open={promptBuilderOpen}
  onClose={() => setPromptBuilderOpen(false)}
  onApply={(prompt) => {
    chatInputRef.current?.setValue(prompt)
  }}
/>
```

### Import Path Fix in Moved Component

```typescript
// fe/src/components/PromptBuilderModal.tsx -- after move
// BEFORE (relative to glossary):
// import { glossaryApi, type GlossaryTask, type GlossaryKeyword } from '../api/glossaryApi'

// AFTER (absolute path to avoid circular via barrel):
import {
    glossaryApi,
    type GlossaryTask,
    type GlossaryKeyword,
} from '@/features/glossary/api/glossaryApi'
```

## i18n Status

All required keys exist under `glossary.promptBuilder.*` in all 3 locales.

**Keys to update (wording change, all 3 locales):**
- `glossary.promptBuilder.appliedToChat` -- change from "Prompt copied! Paste it into the chat input." to "Prompt applied to chat input."

**No new keys needed** -- the Sparkles button uses `glossary.promptBuilder.title` ("Prompt Builder") for its tooltip.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + jsdom |
| Config file | `fe/vitest.config.ts` |
| Quick run command | `npm run test:run:ui -w fe` |
| Full suite command | `npm run test:run -w fe` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-03 | PromptBuilderModal renders from shared location | smoke | `npm run build -w fe` | N/A (build) |
| D-05 | onApply sets textarea value via imperative handle | unit | `npx vitest run tests/features/chat/ChatInput.test.tsx -w fe` | No -- Wave 0 |
| D-02 | Sparkles button visible in leftSlot | unit | `npx vitest run tests/features/chat/ChatPage.test.tsx -w fe` | No -- Wave 0 |
| D-07 | Chat state preserved after prompt apply | unit | `npx vitest run tests/features/chat/ChatInput.test.tsx -w fe` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run build -w fe` (TypeScript + import verification)
- **Per wave merge:** `npm run test:run -w fe`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- Build verification (`npm run build -w fe`) is the most critical validation -- confirms no import errors after file move
- Existing tests in `fe/tests/features/chat/` cover `ChatVariableForm` and `useChatStream` but not ChatInput or ChatPage

## Open Questions

1. **Sparkles button placement within leftSlot**
   - What we know: leftSlot currently contains only AssistantSelectorPopover. The Sparkles button goes alongside it.
   - Recommendation: Place Sparkles button after AssistantSelectorPopover (left-to-right: assistant selector, then prompt builder). This groups "configuration" controls (which assistant) before "action" controls (build a prompt).

2. **Empty state when tenant has no glossary tasks**
   - What we know: The modal already shows `<EmptyState title={t('common.noData')} />` when tasks array is empty.
   - Recommendation: Keep existing behavior. The Sparkles button is always visible regardless of task count -- checking task existence before showing the button would require an extra API call on every ChatPage render.

## Sources

### Primary (HIGH confidence)
- `fe/src/features/glossary/components/PromptBuilderModal.tsx` -- full source read, 644 lines
- `fe/src/features/chat/components/ChatInput.tsx` -- full source read, 246 lines, confirmed uncontrolled textarea
- `fe/src/features/chat/pages/ChatPage.tsx` -- full source read, 502 lines, confirmed leftSlot pattern
- `fe/src/features/glossary/api/glossaryApi.ts` -- full source read, API methods and types confirmed
- `fe/src/features/glossary/index.ts` -- barrel exports confirmed, includes PromptBuilderModal
- `fe/src/components/FeedbackCommentPopover.tsx` -- shared component pattern confirmed (file exists)
- `fe/src/i18n/locales/en.json` -- i18n keys `glossary.promptBuilder.*` confirmed (lines 1277-1297)
- `fe/CLAUDE.md` -- architecture conventions, naming rules, module boundaries confirmed

## Project Constraints (from CLAUDE.md)

- **NX module boundary:** No cross-module imports between features. Shared components in `fe/src/components/`. API stays in feature module.
- **No manual memoization:** React Compiler handles it. No `React.memo`, `useMemo`, `useCallback`.
- **i18n:** All UI strings in 3 locales (en, vi, ja).
- **Dark mode:** Class-based `dark:` prefix. Must support both themes.
- **JSDoc mandatory:** All exported functions, components, interfaces, type aliases must have JSDoc.
- **Inline comments mandatory:** Above control flow, business logic, integration points.
- **API layer split:** Raw HTTP in `*Api.ts`, hooks in `*Queries.ts`. No `*Service.ts`.
- **GitNexus:** Must run impact analysis before editing symbols, detect changes before commit.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components and patterns already exist in codebase
- Architecture: HIGH -- direct code reading confirms integration points and constraints
- Pitfalls: HIGH -- identified from actual code patterns (uncontrolled textarea, barrel circular risk, i18n wording)

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable -- no external dependencies, all internal code)
