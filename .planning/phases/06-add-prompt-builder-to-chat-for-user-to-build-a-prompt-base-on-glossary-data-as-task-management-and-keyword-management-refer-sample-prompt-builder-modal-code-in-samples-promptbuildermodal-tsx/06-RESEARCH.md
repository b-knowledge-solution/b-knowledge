# Phase 6: Add Prompt Builder to Chat - Research

**Researched:** 2026-04-01
**Domain:** React frontend integration (component relocation + chat wiring)
**Confidence:** HIGH

## Summary

This phase integrates an existing, fully-functional `PromptBuilderModal` into the chat interface. The modal already uses shadcn/ui, has complete i18n keys (en/vi/ja), and implements a 3-step prompt builder (language, task, keyword). The primary work is: (1) moving the component from the glossary feature to shared components, (2) adding a trigger button to ChatPage's `leftSlot`, and (3) wiring the `onApply` callback to set the ChatInput textarea value.

The critical technical challenge is that **ChatInput uses an uncontrolled textarea** (ref-based, no `value` prop). There is no mechanism to set the textarea content from outside the component. The integration requires adding either a callback prop or an imperative handle to ChatInput so ChatPage can inject the generated prompt text.

**Primary recommendation:** Add a `setInputValue` callback pattern to ChatInput (new prop `onInputValueSet` or expose via `useImperativeHandle` + `forwardRef`), move PromptBuilderModal to `fe/src/components/`, and wire the Sparkles trigger button in ChatPage's leftSlot.

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

## Architecture Patterns

### Critical Issue: ChatInput Uncontrolled Textarea

ChatInput currently uses `useRef<HTMLTextAreaElement>` and reads `textarea.value` directly in `handleSubmit`. There is no controlled `value` prop. The modal's `onApply` callback receives a prompt string, but there is no way to inject it into the textarea from ChatPage.

**Recommended approach: Callback prop pattern**

Add an optional `initialValue` or use a more idiomatic approach -- expose a ref with `useImperativeHandle` + `forwardRef`:

```typescript
// Option A: Simple callback prop (RECOMMENDED - least invasive)
// ChatInput adds a new prop:
interface ChatInputProps {
  // ... existing props ...
  /** Ref exposed to parent for imperative textarea control */
  inputRef?: React.Ref<ChatInputHandle>
}

export interface ChatInputHandle {
  /** Set the textarea value and trigger auto-resize */
  setValue: (text: string) => void
}

// ChatInput implementation adds:
useImperativeHandle(inputRef, () => ({
  setValue: (text: string) => {
    if (textareaRef.current) {
      textareaRef.current.value = text
      autoResize()
    }
  }
}))

// ChatPage usage:
const chatInputRef = useRef<ChatInputHandle>(null)
const handlePromptApply = (prompt: string) => {
  chatInputRef.current?.setValue(prompt)
}
```

This preserves the existing uncontrolled textarea pattern while allowing the parent to inject values when needed.

### Component Move Pattern

Following the FeedbackCommentPopover precedent from Phase 5:

```
BEFORE:
fe/src/features/glossary/components/PromptBuilderModal.tsx
fe/src/features/glossary/index.ts (exports PromptBuilderModal)

AFTER:
fe/src/components/PromptBuilderModal.tsx  (moved here)
fe/src/features/glossary/index.ts (remove PromptBuilderModal export, or re-export from shared)
```

**Import path in the moved component changes:**
- `'../api/glossaryApi'` becomes `'@/features/glossary/api/glossaryApi'` (imports from glossary barrel or direct API file)

Per D-04, glossary API calls stay in the glossary feature -- the shared component imports cross-feature, which is allowed for shared components (same pattern as FeedbackCommentPopover importing from feature APIs).

### ChatPage Integration Point

```
fe/src/features/chat/pages/ChatPage.tsx
  └── ChatInput (line 402-422)
        └── leftSlot contains: AssistantSelectorPopover
        └── ADD: Sparkles button + PromptBuilderModal
```

The Sparkles trigger button goes in the `leftSlot` alongside `AssistantSelectorPopover`. ChatPage manages the modal open/close state and the `onApply` handler.

### Recommended Project Structure Changes

```
fe/src/
├── components/
│   ├── PromptBuilderModal.tsx    # MOVED from features/glossary/components/
│   └── FeedbackCommentPopover.tsx # Existing shared component (precedent)
├── features/
│   ├── glossary/
│   │   ├── api/glossaryApi.ts    # UNCHANGED - API stays here
│   │   ├── components/           # PromptBuilderModal.tsx REMOVED from here
│   │   └── index.ts              # UPDATE - remove PromptBuilderModal export
│   └── chat/
│       ├── components/
│       │   └── ChatInput.tsx     # UPDATE - add forwardRef + useImperativeHandle
│       └── pages/
│           └── ChatPage.tsx      # UPDATE - add Sparkles button + modal + ref
```

### Anti-Patterns to Avoid
- **Do not make ChatInput fully controlled:** Converting the textarea to a controlled component (`value` + `onChange`) would be a large refactor and could introduce performance issues with auto-resize. Keep it uncontrolled, use imperative handle.
- **Do not duplicate glossary API calls:** The shared modal imports from `@/features/glossary` barrel -- do NOT copy API functions elsewhere.
- **Do not add feature flags:** D-09 says no feature flag needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prompt builder UI | New modal from scratch | Existing `PromptBuilderModal` | Already complete with steps, search, i18n |
| Icon for trigger | Custom SVG | `Sparkles` from lucide-react | Already imported by PromptBuilderModal, consistent with codebase |
| Debounced keyword search | Custom debounce | Existing implementation in PromptBuilderModal | Already handles debounce, stale requests, pagination |
| Tenant scoping | Custom auth checks | Existing glossaryApi tenant filter | Backend already scopes by session tenant_id |

## Common Pitfalls

### Pitfall 1: Textarea Value Not Updating Visually
**What goes wrong:** Setting `textareaRef.current.value` programmatically does not trigger React's synthetic events or auto-resize.
**Why it happens:** The textarea is uncontrolled -- React does not track its value.
**How to avoid:** After setting `textareaRef.current.value`, manually call `autoResize()` to adjust height. The `useImperativeHandle` approach bundles this.
**Warning signs:** Prompt appears in textarea but height stays at 1 row, or textarea appears empty despite value being set.

### Pitfall 2: Glossary Barrel Export Becomes Circular
**What goes wrong:** If the shared `PromptBuilderModal` imports from `@/features/glossary` barrel, and the barrel re-exports `PromptBuilderModal` from shared, circular imports occur.
**Why it happens:** Barrel files that both export and import the same module.
**How to avoid:** After moving PromptBuilderModal to shared, remove its export from `fe/src/features/glossary/index.ts`. The shared component should import `glossaryApi` directly from `@/features/glossary/api/glossaryApi` (not from barrel) to avoid any risk.
**Warning signs:** Vite build warnings about circular dependencies.

### Pitfall 3: Modal Closes on Backdrop Click While Editing
**What goes wrong:** User is in the middle of building a prompt and accidentally clicks outside the dialog, losing all state.
**Why it happens:** Default Dialog behavior closes on backdrop click.
**How to avoid:** The existing PromptBuilderModal already handles this via `onOpenChange={(v) => !v && onClose()}`. Verify this still works after the move.
**Warning signs:** State reset on accidental backdrop click.

### Pitfall 4: i18n Key Path Changes
**What goes wrong:** Moving the component breaks i18n key resolution if someone changes the key namespace.
**Why it happens:** Assuming keys need to move with the component.
**How to avoid:** Keep all i18n keys under `glossary.promptBuilder.*` -- i18n keys are independent of file location. Do NOT rename or move keys.
**Warning signs:** Missing translations after component move.

## Code Examples

### Trigger Button Pattern (matches existing toggle buttons)

```typescript
// Source: ChatInput.tsx existing toggle pattern (lines 167-196)
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
// Source: React docs forwardRef pattern
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

export interface ChatInputHandle {
  setValue: (text: string) => void
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(props, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    setValue: (text: string) => {
      if (textareaRef.current) {
        textareaRef.current.value = text
        // Trigger auto-resize after value change
        textareaRef.current.style.height = 'auto'
        const newHeight = Math.min(textareaRef.current.scrollHeight, 200)
        textareaRef.current.style.height = `${newHeight}px`
      }
    }
  }))

  // ... rest of component unchanged
})

export default ChatInput
```

### ChatPage Integration

```typescript
// Source: ChatPage.tsx existing leftSlot pattern (lines 412-420)
const chatInputRef = useRef<ChatInputHandle>(null)
const [promptBuilderOpen, setPromptBuilderOpen] = useState(false)

// In leftSlot:
leftSlot={
  <>
    <AssistantSelectorPopover ... />
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

// PromptBuilderModal rendered at page level:
<PromptBuilderModal
  open={promptBuilderOpen}
  onClose={() => setPromptBuilderOpen(false)}
  onApply={(prompt) => {
    chatInputRef.current?.setValue(prompt)
  }}
/>
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + jsdom |
| Config file | `fe/vitest.config.ts` |
| Quick run command | `npm run test:run:unit -w fe` |
| Full suite command | `npm run test:run -w fe` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-03 | PromptBuilderModal renders in shared location | unit | `npx vitest run tests/components/PromptBuilderModal.test.tsx -w fe` | Wave 0 |
| D-05 | onApply callback sets textarea value | unit | `npx vitest run tests/features/chat/ChatInput.test.tsx -w fe` | Wave 0 |
| D-02 | Sparkles button renders in leftSlot | unit | `npx vitest run tests/features/chat/ChatPage.test.tsx -w fe` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:run:unit -w fe`
- **Per wave merge:** `npm run test:run -w fe`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- Build verification (`npm run build -w fe`) to confirm no import errors after move -- most critical validation for this phase

## i18n Status

All required i18n keys already exist under `glossary.promptBuilder.*` in all 3 locales (en, vi, ja). The `appliedToChat` key message says "Prompt copied! Paste it into the chat input." -- this should be updated to reflect the new behavior where the prompt is directly inserted (not clipboard-copied). Suggested update: "Prompt applied to chat input."

**Keys to update in all 3 locales:**
- `glossary.promptBuilder.appliedToChat` -- change wording from "copied/paste" to "applied/inserted"

## Open Questions

1. **Should the Sparkles button have an active/highlighted state?**
   - The reasoning and internet toggle buttons have active states (blue background when enabled). The Sparkles button is a one-shot action (open modal), not a toggle. No active state needed.
   - Recommendation: No active state -- standard hover style only.

2. **What happens when tenant has zero glossary tasks?**
   - The modal already handles this with `<EmptyState title={t('common.noData')} />`.
   - Recommendation: Keep existing empty state behavior. The Sparkles button is always visible regardless of task count.

## Sources

### Primary (HIGH confidence)
- `fe/src/features/glossary/components/PromptBuilderModal.tsx` -- full source read, 644 lines
- `fe/src/features/chat/components/ChatInput.tsx` -- full source read, 246 lines, confirmed uncontrolled textarea
- `fe/src/features/chat/pages/ChatPage.tsx` -- full source read, 503 lines, confirmed leftSlot pattern
- `fe/src/features/glossary/api/glossaryApi.ts` -- full source read, types and API methods confirmed
- `fe/src/features/glossary/index.ts` -- barrel exports confirmed, includes PromptBuilderModal
- `fe/src/components/FeedbackCommentPopover.tsx` -- shared component pattern confirmed
- `fe/src/i18n/locales/en.json` -- i18n keys under `glossary.promptBuilder.*` confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components and patterns already exist in codebase
- Architecture: HIGH -- direct code reading confirms integration points and constraints
- Pitfalls: HIGH -- identified from actual code patterns (uncontrolled textarea, barrel exports)

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable -- no external dependencies, all internal code)
