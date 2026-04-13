# Phase 5: Admin UI Rewrite — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `5-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-08

## Gray areas presented

1. Matrix layout & save model (P5.1)
2. Override editor surface & UX (P5.2)
3. Grant modal principal picker (P5.3)
4. Session-refresh notice (R-10)

User selected **all four**.

---

## Area 1 — Matrix layout & save model (P5.1)

### Q1: How should the matrix be laid out?
- **(picked)** Roles × permissions grid, grouped by feature *(recommended)*
- One tab per role, flat permission list
- Permission-centric list, roles as inline chips

**User note on pick:** "the row is feature name and the 1st column is user name and teams name"

→ Reframed as a potential users/teams × permissions matrix, conflicting with roadmap P5.1 which is role-scoped via `PUT /api/permissions/roles/:role`. Surfaced the conflict.

### Q1b: How to reconcile users/teams matrix with roadmap?
- **(picked)** Keep role matrix as P5.1, add user/team matrix as separate page → became **P5.6 Effective Access page** (D-11)
- Replace P5.1 — primary matrix is users/teams × permissions
- I meant something else — let me clarify

### Q2: What's the save model for role permission edits?
- **(picked)** Batch with dirty-state + Save button *(recommended)*
- Per-row autosave (debounced)
- Stage all, confirm dialog before save

→ D-01, D-02, D-11 captured.

---

## Area 2 — Override editor surface & UX (P5.2)

### Q1: Where should the per-user override editor live?
- **(picked)** New tab on user detail page *(recommended)*
- Slide-over side panel from user list
- Modal dialog from user list

### Q2: How should allow/deny be expressed?
- **(picked)** Two-list "Allow" / "Deny" with add-from-catalog picker *(recommended)*
- Tri-state checkbox per permission key
- Effective view with override badges

### Q3: Should the editor show effective permissions alongside?
- **(picked)** Yes — collapsed "Effective permissions" panel below the editor *(recommended)*
- No — editor is override-only; effective view lives elsewhere
- Yes, always visible side-by-side

→ D-03, D-04, D-05 captured.

---

## Area 3 — Grant modal principal picker (P5.3)

### Q1: Principal picker UX?
- **(picked)** Single combined search with type filter chips *(recommended)*
- Tabbed picker (User | Team | Role)
- Three separate fields stacked

### Q2: Existing grants inline or separate?
- **(picked)** Inline list inside the modal *(recommended)*
- Modal is add-only; existing grants in separate Sharing page
- Inline list with search/filter for KBs with many grants

### Q3: KB-level vs DocumentCategory-level grants?
- **(picked)** Single modal, scope toggle at top *(recommended)*
- Two separate modals
- Tree view: KB at root, expandable categories

→ D-06, D-07, D-08 captured.

---

## Area 4 — R-10 session-refresh notice

### Q1: Where should the notice appear?
- **(picked)** Post-save toast with explanation *(recommended)*
- Persistent banner at top of every admin permission page
- Inline hint next to the Save button only

### Q2: Force-refresh affected users' sessions?
- **(picked)** No — informational notice only *(recommended)*
- Yes — note as deferred to Phase 7
- Yes — build it in Phase 5

→ D-09, D-10 captured. Force-refresh added to Deferred Ideas (Phase 7 / SH1).

---

## Confirmation

User confirmed "Create context" → wrote `5-CONTEXT.md` and this log.
