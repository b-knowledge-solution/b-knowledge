# Phase 6: Add Prompt Builder to Chat - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 06-add-prompt-builder-to-chat
**Areas discussed:** Integration scope, Module boundary, Apply behavior, Data scope

---

## Integration Scope

### Where should the Prompt Builder be accessible from?

| Option | Description | Selected |
|--------|-------------|----------|
| Chat only | Add Sparkles button in ChatInput leftSlot. Chat is the primary prompt consumer. | ✓ |
| Chat + Search | Add to both ChatInput and SearchBar. Search would need a trigger button added. | |
| Chat + Search + Embed | All user-facing input surfaces including embedded widgets. | |

**User's choice:** Chat only
**Notes:** Keeps it focused — chat is the primary prompt consumer.

### How should users trigger the Prompt Builder?

| Option | Description | Selected |
|--------|-------------|----------|
| Icon button in input area | Sparkles icon button alongside existing toggles in ChatInput's toggle row. | ✓ |
| Toolbar button above chat | Separate toolbar/action bar above the chat area. | |
| Keyboard shortcut | Ctrl+P or similar hotkey to open the modal. | |

**User's choice:** Icon button in input area
**Notes:** Consistent with existing ChatInput patterns.

---

## Module Boundary

### How to handle NX module boundary?

| Option | Description | Selected |
|--------|-------------|----------|
| Move to shared components | Move PromptBuilderModal to fe/src/components/. Same pattern as FeedbackCommentPopover. | ✓ |
| Keep in glossary, lazy import | Use React.lazy() dynamic import from chat. Blurs module boundaries. | |
| Duplicate in chat feature | Copy modal into chat feature. Avoids cross-module but duplicates code. | |

**User's choice:** Move to shared components
**Notes:** Follows Phase 5 precedent with FeedbackCommentPopover.

---

## Apply Behavior

### What happens when user clicks 'Apply to Chat'?

| Option | Description | Selected |
|--------|-------------|----------|
| Insert into textarea | Replace existing text, user can review/edit before sending. Preserves toggles/attachments. | ✓ |
| Auto-send immediately | Insert and send automatically. No review step. | |
| Append to existing text | Append after existing text. Allows combining inputs. | |

**User's choice:** Insert into textarea (replace)
**Notes:** User can review/edit before sending.

### Should the generated prompt be editable before applying?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, editable in modal | Current modal already has editable textarea. Keep this behavior. | ✓ |
| Preview only, edit after | Read-only preview in modal. Edit in chat textarea after applying. | |

**User's choice:** Yes, editable in modal
**Notes:** Preserves current modal behavior.

---

## Data Scope

### Tenant filtering for tasks/keywords?

| Option | Description | Selected |
|--------|-------------|----------|
| Tenant-scoped | Show only current tenant's tasks/keywords. Already how glossary API works. | ✓ |
| Global (all tenants) | Show all across tenants. Only for super-admin. | |
| Project-scoped | Filter by current project context. | |

**User's choice:** Tenant-scoped
**Notes:** Glossary API already scopes by tenant_id from session.

### Access control for Prompt Builder?

| Option | Description | Selected |
|--------|-------------|----------|
| All users | Any user who can chat can use it. Productivity tool, not admin feature. | ✓ |
| Role-restricted | Only admin/editor roles. Adds complexity. | |
| Feature-flagged | Behind VITE_ENABLE_PROMPT_BUILDER flag. Gradual rollout. | |

**User's choice:** All users
**Notes:** No role restrictions, no feature flag.

---

## Claude's Discretion

- Exact button placement/ordering in ChatInput toggle row
- Tooltip text on trigger button
- Loading/empty state when no glossary tasks exist for tenant
