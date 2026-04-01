---
phase: 6
reviewers: [codex]
reviewed_at: 2026-04-01T00:00:00Z
plans_reviewed: [06-01-PLAN.md, 06-02-PLAN.md]
---

# Cross-AI Plan Review — Phase 6

## Codex Review (GPT-5.4)

### Plan 06-01 Review

#### 1. Summary
Plan 06-01 is directionally sound and covers the two core refactors needed before chat wiring: making `PromptBuilderModal` shared and exposing an imperative `ChatInput` API. The sequencing is mostly correct, but the plan is a bit too optimistic about the move itself. It assumes the modal can become shared with only an import rewrite, while the stated decision says shared code should import glossary API via direct file path and the repo has strict module-boundary conventions. It also under-specifies behavior preservation in `ChatInput`, especially around controlled state, resize timing, and compatibility with existing attachment/toggle flows.

#### 2. Strengths
- Separates foundational refactor work from UI integration, which reduces merge and testing risk.
- Correctly introduces an imperative handle instead of pushing prompt-builder concerns directly into `ChatInput` props.
- Includes explicit acceptance criteria for the new shared location, barrel export, and `ChatInputHandle`.
- Keeps scope aligned with Phase 6 and avoids prematurely wiring ChatPage concerns into Wave 1.

#### 3. Concerns
- **HIGH:** "Copy, delete original, update barrel" may break existing glossary feature imports if any code still references the old path. The plan does not include a repo-wide import audit.
- **HIGH:** The decision says the shared modal should import glossary API via direct file path, but the plan proposes `@/features/glossary/api/glossaryApi`. That may violate the intended dependency shape or existing barrel/module-boundary expectations.
- **HIGH:** `setValue()` is underspecified if `ChatInput` is controlled by parent state. If the textarea value comes from props/state higher up, imperative DOM updates alone will be lost on next render.
- **MEDIUM:** Auto-resize behavior may depend on current internal effects/event handlers. The plan does not specify whether resize is triggered by shared utility, synthetic input event, or internal function reuse.
- **MEDIUM:** Focus-on-apply is assumed, but not explicitly tied to user decision D-05/D-07. Focus could unintentionally disrupt attachment or toggle workflows if the component has complex interaction state.
- **MEDIUM:** No mention of preserving existing JSDoc and inline comment requirements.
- **LOW:** "Delete original" is correct eventually, but risky before downstream integration is complete unless all references are updated in the same change.

#### 4. Suggestions
- Add a repo-wide import update/check step before deleting the original modal.
- Clarify whether `ChatInput` is controlled, uncontrolled, or hybrid, and define `setValue()` accordingly.
- Specify that `setValue()` must update React state first, then trigger resize logic from the same internal path used by normal typing.
- Confirm the allowed import path for glossary API from shared code and call out the intentional module-boundary exception if needed.
- Add acceptance criteria that existing glossary usage still builds and behaves unchanged after the move.
- Include explicit JSDoc for `ChatInputHandle` and the imperative method.

#### 5. Risk Assessment
**Overall risk: MEDIUM**

The refactor is conceptually simple, but there are two meaningful failure modes: breaking existing glossary imports during the move, and implementing `setValue()` in a way that fights React state. Those are manageable, but the current plan should be tightened before execution.

---

### Plan 06-02 Review

#### 1. Summary
Plan 06-02 covers the visible integration points and generally matches the product decisions: Sparkles button placement, modal wiring, direct insertion into chat input, and i18n updates. The main weakness is that it treats the integration as mostly mechanical. It does not fully account for UX edge cases, state interaction with existing `ChatPage` behavior, or how the modal/open state should behave across navigation, disabled states, or unavailable glossary data. It should still achieve the phase goal, but only if the underlying components already behave cleanly.

#### 2. Strengths
- Correctly depends on 06-01 and keeps integration work separate from refactor work.
- Maps directly to the decisions in `CONTEXT.md`, especially Sparkles placement and "apply to textarea, review before sending".
- Includes human verification, which is appropriate for a visual and interaction-heavy change.
- Keeps existing chat state intact by using `setValue(prompt)` rather than replacing broader page state.
- Covers i18n updates in all three locales, which matches project requirements.

#### 3. Concerns
- **HIGH:** `onApply -> setValue(prompt)` may overwrite unsent user text without warning. That matches D-05, but the plan should explicitly acknowledge replacement semantics to avoid accidental regression or surprise.
- **HIGH:** No disabled/loading/error-state behavior is defined for the Sparkles button or modal. If glossary fetch fails or returns empty, the modal UX may be broken or confusing.
- **MEDIUM:** Wrapping `leftSlot` in a Fragment is implementation-specific and may not be sufficient if `ChatInput` expects layout/styling constraints on a single slot element.
- **MEDIUM:** The plan assumes `ChatPage` is the right owner of modal state, but does not mention cleanup on page change, chat switch, or unmount.
- **MEDIUM:** No accessibility checks are called out for the new icon button: tooltip/label, keyboard access, focus order, dialog focus trap, and screen-reader text.
- **MEDIUM:** Dark mode is only in human verification, not in implementation acceptance criteria. Styling regressions are likely with icon buttons in input toolbars.
- **MEDIUM:** New i18n keys for empty/error states suggest additional modal UI states, but the plan does not say where or how those states are rendered. That creates a partial-spec risk.
- **LOW:** No explicit mention of preserving attachments/toggles beyond the prompt text replacement behavior.
- **LOW:** No mention of toast deduping or repeated apply behavior.

#### 4. Suggestions
- Make replacement behavior explicit in the plan and acceptance criteria: applying a prompt replaces current draft text only, while attachments and toggles remain unchanged.
- Add explicit empty/loading/error handling requirements for the modal, since new locale keys imply these states exist.
- Define button accessibility requirements: `aria-label`, keyboard activation, visible focus state, and tooltip text via i18n if the app uses tooltips.
- Confirm whether `leftSlot` accepts multiple children cleanly; if not, add a small wrapper component/container rather than a bare Fragment.
- Add acceptance criteria for "existing attachments, model selection, assistant selection, and toggles remain unchanged after applying a prompt."
- Clarify modal behavior after apply: close modal, show toast, focus textarea, preserve cursor state if relevant.
- Add a lightweight test expectation, even if only component-level or smoke coverage, so the phase is not relying solely on manual verification.

#### 5. Risk Assessment
**Overall risk: MEDIUM**

The integration path is reasonable and likely sufficient for the intended feature, but several UX and interaction details are implicit rather than specified. The biggest risk is not architectural failure; it is shipping a feature that technically works but has rough edges around replacement semantics, empty/error states, accessibility, and slot layout.

---

## Consensus Summary

### Agreed Strengths
- Dependency ordering is correct: refactor (Wave 1) before integration (Wave 2)
- Scope is well-contained to chat only, aligned with all 9 user decisions
- Imperative handle is the right pattern for this use case
- Human verification checkpoint is appropriate

### Agreed Concerns
- **HIGH:** Module boundary exception (shared component depending on feature API) should be explicitly documented
- **HIGH:** `setValue()` behavior with React state needs clarification (controlled vs uncontrolled)
- **HIGH:** Empty/error/loading states for the modal need explicit specification
- **MEDIUM:** Accessibility requirements for the Sparkles icon button are not specified
- **MEDIUM:** No automated test coverage for core input behavior

### Divergent Views
(Single reviewer — no divergent views to report)
