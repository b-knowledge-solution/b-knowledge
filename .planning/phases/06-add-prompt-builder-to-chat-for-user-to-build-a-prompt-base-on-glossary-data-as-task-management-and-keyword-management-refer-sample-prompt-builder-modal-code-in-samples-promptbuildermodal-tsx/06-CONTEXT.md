# Phase 6: Add Prompt Builder to Chat - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate the existing glossary-based Prompt Builder modal into the chat interface, allowing users to construct structured prompts from glossary tasks and keywords. The PromptBuilderModal already exists — this phase moves it to shared components and wires it into ChatInput.

</domain>

<decisions>
## Implementation Decisions

### Integration Scope
- **D-01:** Prompt Builder accessible from **Chat only** — not Search or embedded widgets
- **D-02:** Trigger is a **Sparkles icon button** in ChatInput's toggle row (leftSlot area), alongside existing toggles (reasoning, internet, file upload) and assistant selector

### Module Boundary
- **D-03:** Move `PromptBuilderModal` from `fe/src/features/glossary/components/` to `fe/src/components/` (shared). Follows the same pattern as `FeedbackCommentPopover` (Phase 5 precedent)
- **D-04:** Glossary API calls (`glossaryApi.listTasks()`, `glossaryApi.searchKeywords()`) stay in `fe/src/features/glossary/api/glossaryApi.ts` — the shared modal imports from the glossary API barrel export

### Apply Behavior
- **D-05:** "Apply to Chat" **inserts the generated prompt into the chat textarea**, replacing any existing text. User can review/edit before sending
- **D-06:** Generated prompt remains **editable in the modal** before applying (current behavior preserved)
- **D-07:** Existing chat state (file attachments, reasoning toggle, internet toggle) is **preserved** when a prompt is applied — only the textarea content changes

### Data Scope
- **D-08:** Tasks and keywords are **tenant-scoped** — the glossary API already filters by `tenant_id` from the session, no changes needed
- **D-09:** **All users** who can access chat can use the Prompt Builder — no role restrictions, no feature flag

### Claude's Discretion
- Exact placement/ordering of the Sparkles button relative to other toggle buttons
- Whether to show a tooltip on the trigger button
- Loading/empty state handling when no glossary tasks exist for the tenant

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prompt Builder (existing implementation)
- `fe/src/features/glossary/components/PromptBuilderModal.tsx` — Current shadcn/ui implementation to be moved to shared
- `samples/PromptBuilderModal.tsx` — Original Ant Design sample (reference only, do NOT use)

### Glossary API
- `fe/src/features/glossary/api/glossaryApi.ts` — API calls for `listTasks()`, `searchKeywords()`, types `GlossaryTask`, `GlossaryKeyword`
- `fe/src/features/glossary/index.ts` — Barrel export (currently exports PromptBuilderModal)

### Chat Integration Points
- `fe/src/features/chat/components/ChatInput.tsx` — Has `leftSlot` prop for additional controls in the toggle row
- `fe/src/features/chat/pages/ChatPage.tsx` — Uses `leftSlot` for `AssistantSelectorPopover`, need to add Prompt Builder trigger here

### Shared Component Pattern (Phase 5 precedent)
- `fe/src/components/FeedbackCommentPopover.tsx` — Example of shared component pattern used for cross-feature UI

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PromptBuilderModal` (glossary): Full 3-step prompt builder with language selection, task picker, keyword combobox with lazy-loaded server-side search, prompt generation, and editable output
- `glossaryApi`: Complete API layer with `listTasks()`, `searchKeywords({ q, page, pageSize })`, and all TypeScript types
- `ChatInput.leftSlot`: Existing render prop slot for controls in the toggle row — ready for additional buttons
- shadcn/ui `Dialog`, `Select`, `Input`, `Button` — all used by the existing modal

### Established Patterns
- **Shared components**: Cross-feature UI goes in `fe/src/components/` (e.g., `FeedbackCommentPopover`)
- **API layer split**: Raw HTTP in `*Api.ts`, React Query hooks in `*Queries.ts`
- **ChatInput toggle row**: Left-side slot for feature controls, right-side send/stop buttons
- **i18n**: All strings in 3 locales (en, vi, ja) — existing `glossary.promptBuilder.*` keys already defined

### Integration Points
- `ChatPage.tsx` renders `ChatInput` with `leftSlot` containing `AssistantSelectorPopover` — Prompt Builder button goes alongside it
- `ChatInput.onSend` callback receives message content — the prompt text needs to be set on the textarea's controlled state
- The modal's `onApply` callback receives the generated prompt string — ChatPage needs to expose a way to set the textarea value

</code_context>

<specifics>
## Specific Ideas

- The sample in `samples/PromptBuilderModal.tsx` uses Ant Design (Modal, Select, Steps) — the existing codebase version at `fe/src/features/glossary/components/PromptBuilderModal.tsx` has already been converted to shadcn/ui. Use the codebase version, not the sample.
- The `onApply` callback pattern is already implemented — it receives the prompt text string

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-add-prompt-builder-to-chat*
*Context gathered: 2026-04-01*
