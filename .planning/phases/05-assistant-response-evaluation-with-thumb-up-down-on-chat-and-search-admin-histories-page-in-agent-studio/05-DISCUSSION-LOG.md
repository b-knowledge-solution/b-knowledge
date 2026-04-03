# Phase 5: Assistant Response Evaluation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 05-assistant-response-evaluation
**Areas discussed:** Admin feedback view location, Feedback data display, User-side feedback UX, Agent run feedback

---

## Admin Feedback View Location

| Option | Description | Selected |
|--------|-------------|----------|
| Enhance existing Histories page | Add feedback indicators/filters to existing admin Histories page | |
| New dedicated Feedback page | Standalone feedback page in admin sidebar with table/list view | |
| Both — enhanced histories + summary dashboard | Enhance Histories with inline feedback AND add feedback summary widget to Dashboard | ✓ |

**User's choice:** Both — enhanced histories + summary dashboard
**Notes:** User wants comprehensive visibility in both the detail-oriented Histories page and the overview-oriented Dashboard page.

### Follow-up: Dashboard Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated section with cards | "Response Quality" section with 3-4 stat cards matching existing dashboard card styling | ✓ |
| Collapsible panel | Collapsible accordion, collapsed shows satisfaction %, expanded shows full stats | |
| Separate dashboard tab | New "Quality" tab on Dashboard with full-page charts and analytics | |

**User's choice:** Dedicated section with stat cards
**Notes:** User revisited this area specifically to confirm they want a dedicated summary section on the admin Dashboard.

---

## Feedback Data Display

### Histories Page Enhancements

| Option | Description | Selected |
|--------|-------------|----------|
| Thumb indicators on messages | Show 👍/👎 icons on messages in detail view, aggregated counts on session cards | ✓ |
| Feedback filter | Filter dropdown: All/Positive/Negative/Any feedback | ✓ |
| User comment display | Show text comments as collapsible notes below messages | ✓ |
| Feedback export | Export feedback records as CSV | ✓ |

**User's choice:** All options selected
**Notes:** None

### Dashboard Feedback Widget

| Option | Description | Selected |
|--------|-------------|----------|
| Satisfaction ratio | Overall 👍/👎 percentage with trend (7/30 days) | ✓ |
| Recent negative feedback list | 5 most recent 👎 entries with query preview and user email | ✓ |
| Feedback by source breakdown | Distribution across chat, search, agent | ✓ |
| Top flagged sessions | Sessions with most negative feedback, ranked | ✓ |

**User's choice:** All options selected
**Notes:** None

---

## User-Side Feedback UX

| Option | Description | Selected |
|--------|-------------|----------|
| Thumbs + optional comment | 👍 = one click. 👎 = shows optional comment popover with Submit/Skip | ✓ |
| Thumbs + category tags | 👎 shows quick-select tags (Wrong/Incomplete/Outdated/Irrelevant/Hallucination) + comment | |
| Simple thumbs only | Keep current one-click thumbs, no comment input | |

**User's choice:** Thumbs + optional comment
**Notes:** Thumb up stays one-click. Thumb down shows a small popover for optional text feedback.

---

## Agent Run Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, on agent run results | Add thumb up/down to agent run output view, stored with source='agent' | ✓ |
| Yes, plus Agent Runs tab to Histories | Feedback on runs + new Agent Runs tab in admin Histories | |
| No, chat and search only | Keep agent runs separate from feedback system | |

**User's choice:** Yes, on agent run results
**Notes:** Agent run feedback also visible in admin Histories. Stored in answer_feedback with source='agent'.

---

## Claude's Discretion

- Dashboard stat card component design and chart library choice
- CSV export format and column selection
- Feedback aggregation query optimization
- Agent run result view component integration approach
- Comment popover implementation details

## Deferred Ideas

None — discussion stayed within phase scope
