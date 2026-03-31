---
phase: 5
slug: assistant-response-evaluation
status: draft
shadcn_initialized: true
preset: new-york
created: 2026-03-31
revised: 2026-03-31
---

# Phase 5 — UI Design Contract

> Visual and interaction contract for assistant response evaluation (thumb up/down feedback with optional comment), admin Histories enhancements, and Dashboard "Response Quality" section.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui |
| Preset | new-york, slate base, CSS variables |
| Component library | Radix UI (via shadcn) |
| Icon library | lucide-react |
| Font | Fira Sans (body), Fira Code (headings/mono) |

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, inline padding |
| sm | 8px | Compact element spacing, button icon gaps |
| md | 16px | Default element spacing, card padding |
| lg | 24px | Section padding, popover internal padding |
| xl | 32px | Layout gaps between card groups |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

Exceptions: Thumb buttons use 24px (h-6 w-6) touch targets with 12px (h-3 w-3) icons -- matching existing ChatMessage.tsx and SearchResultCard.tsx pattern exactly.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 (regular) | 1.5 |
| Label | 12px | 400 (regular) | 1.4 |
| Heading | 20px | 600 (semibold) | 1.2 |
| Display | 28px | 600 (semibold) | 1.2 |

Phase-specific notes:
- Feedback comment textarea: 14px body at weight 400
- Feedback "thank you" inline text reuses existing SearchResultCard `text-[10px]` pattern -- this is NOT a new type scale entry; it already exists in the codebase and is not governed by this contract
- Dashboard stat card values: 28px display weight 600
- Dashboard stat card labels: 12px label weight 400
- Session sidebar feedback counts: 12px label weight 400
- CSV export button label: 14px body weight 400

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `hsl(var(--background))` | Page background, detail view background |
| Secondary (30%) | `hsl(var(--card))` | Session cards, stat cards, popover surfaces |
| Accent (10%) | `#0D26CF` (primary) | Active tab indicators, export button |
| Destructive | `hsl(var(--destructive))` | N/A for this phase (no destructive actions) |

Feedback-specific semantic colors (established pattern, do NOT change):

| Color | Value | Usage |
|-------|-------|-------|
| Positive feedback | `text-green-500` | Active thumbs-up icon, satisfaction percentage |
| Negative feedback | `text-red-500` | Active thumbs-down icon, negative feedback indicators |
| Neutral/inactive | `text-muted-foreground` | Inactive thumb icons, unrated state |

Accent reserved for: active tab indicator on Histories tabs, "Export feedback" button, feedback filter dropdown active state.

---

## Component Inventory

### 1. FeedbackCommentPopover (NEW)

**Location:** `fe/src/features/chat/components/FeedbackCommentPopover.tsx` (shared via import)

**Trigger:** Clicking the thumbs-down button on any assistant response (chat, search, agent run).

**Behavior:**
- Popover opens below the thumbs-down button (side="bottom", align="end")
- Contains: textarea (3 rows, placeholder from i18n), "Send feedback" button (primary, 14px), "Skip for now" link (ghost, 12px)
- "Send feedback" sends comment + thumbdown=true to feedback API, closes popover
- "Skip for now" sends thumbdown=true with no comment, closes popover
- Clicking outside closes without submitting (no feedback recorded, thumb reverts)
- Thumbs-up remains one-click with no popover (unchanged)

**Dimensions:**
- Popover width: 280px fixed
- Textarea: full width, 3 rows, max 500 characters
- Internal padding: 16px (md)
- Button row: 8px gap, right-aligned

**States:**
- Default: textarea empty, "Send feedback" disabled, "Skip for now" enabled
- Has text: "Send feedback" enabled (primary variant), "Skip for now" still enabled
- Submitting: "Send feedback" shows spinner, both buttons disabled

### 2. Histories Page Feedback Indicators (ENHANCE existing)

**Location:** `fe/src/features/histories/components/AdminSessionListSidebar.tsx`

**Primary visual anchor:** The session sidebar is the focal point of the Histories page enhancement. Feedback summary badges on session cards provide at-a-glance quality signals, guiding admins to sessions that need attention (high negative count).

**Session card enhancement:**
- Add feedback summary badge to each session card: `[ThumbsUp icon] 3 [ThumbsDown icon] 1` in 12px label text
- Badge positioned: right side of the card, below message_count
- Colors: green-500 for up count, red-500 for down count, muted-foreground when 0

### 3. Histories Detail View Feedback Badges (ENHANCE existing)

**Location:** `fe/src/features/histories/components/AdminChatDetailView.tsx` and `AdminSearchDetailView.tsx`

**Per-message enhancement:**
- Show small ThumbsUp/ThumbsDown icon (h-3 w-3) next to each message that has feedback
- If comment exists: show collapsible note below the message, trigger text "View feedback comment"
- Collapsible uses shadcn Collapsible component, default collapsed
- Comment text: 14px body, muted-foreground, with left border-l-2 border-primary (quote style)
- Messages without feedback: no indicator shown

### 4. Feedback Filter Dropdown (ENHANCE existing AdminFilterDialog)

**Location:** `fe/src/features/histories/components/AdminFilterDialog.tsx`

**New filter field:**
- Label: "Feedback" (i18n key: `histories.filters.feedback`)
- Type: Select dropdown
- Options: All (default), Positive only, Negative only, Any feedback, No feedback
- Position: after existing filters in the dialog

### 5. Agent Runs Tab on Histories (NEW tab)

**Location:** `fe/src/features/histories/pages/HistoriesPage.tsx`

**Tab addition:**
- Add "Agent Runs" tab after Chat and Search tabs
- Tab label: i18n key `histories.tabs.agentRuns`
- Icon: `Bot` from lucide-react (matching agent feature iconography)
- Tab content: new `AdminAgentRunsDetailView.tsx` component
- Session sidebar shows agent run summaries (agent name, run status, timestamp)
- Detail view shows run result with feedback buttons (same FeedbackCommentPopover)

### 6. Agent Run Feedback Buttons (ENHANCE RunHistorySheet)

**Location:** `fe/src/features/agents/components/RunHistorySheet.tsx`

**Per-run enhancement:**
- Add ThumbsUp/ThumbsDown buttons to each run item (same sizing: h-6 w-6 buttons, h-3 w-3 icons)
- Only show on completed runs (status === 'completed')
- Thumbs-down triggers FeedbackCommentPopover
- Feedback state: same `useState<'up' | 'down' | null>` pattern
- Positioned: right side of run item, after duration badge

### 7. Dashboard Response Quality Section (ALREADY EXISTS -- verify/enhance)

**Location:** `fe/src/features/dashboard/components/FeedbackSummaryCards.tsx`, `FeedbackTrendChart.tsx`, `NegativeFeedbackTable.tsx`

**Status:** These components already exist on the "RAG Quality" tab of AdminDashboardPage. The CONTEXT.md D-03 request is already implemented. Verify that the existing components include agent source data after the source constraint migration.

**Enhancement needed:**
- Ensure FeedbackSummaryCards shows agent feedback in totals
- Ensure FeedbackTrendChart includes agent source in breakdown
- Ensure NegativeFeedbackTable shows source column with chat/search/agent values

### 8. Export Feedback Button (NEW)

**Location:** `fe/src/features/histories/pages/HistoriesPage.tsx`

**Behavior:**
- Button label: "Export feedback" (i18n key: `histories.exportFeedback`)
- Icon: `Download` from lucide-react, positioned left of label
- Variant: outline
- Position: top-right of Histories page header, next to existing filter/refresh buttons
- Click triggers CSV download of feedback records matching current filters
- Loading state: spinner replaces icon, button disabled

**CSV columns:** query, answer, thumbup (true/false), comment, user_email, source (chat/search/agent), created_at

---

## Copywriting Contract

| Element | Copy (en) | i18n Key |
|---------|-----------|----------|
| Thumb-down popover heading | What was wrong? | `feedback.whatWasWrong` |
| Thumb-down popover placeholder | Tell us what could be better... | `feedback.commentPlaceholder` |
| Thumb-down submit button | Send feedback | `feedback.sendFeedback` |
| Thumb-down skip link | Skip for now | `feedback.skipForNow` |
| Feedback thank-you text | Thanks for your feedback | `feedback.thankYou` |
| Histories feedback filter label | Feedback | `histories.filters.feedback` |
| Histories feedback filter: All | All | `histories.filters.feedbackAll` |
| Histories feedback filter: Positive | Positive only | `histories.filters.feedbackPositive` |
| Histories feedback filter: Negative | Negative only | `histories.filters.feedbackNegative` |
| Histories feedback filter: Any | Any feedback | `histories.filters.feedbackAny` |
| Histories feedback filter: None | No feedback | `histories.filters.feedbackNone` |
| Histories Agent Runs tab | Agent Runs | `histories.tabs.agentRuns` |
| Export feedback button | Export feedback | `histories.exportFeedback` |
| Export feedback loading | Exporting... | `histories.exportingFeedback` |
| Agent run feedback empty | No feedback yet | `agents.runs.noFeedback` |
| Feedback comment toggle | View feedback comment | `histories.viewFeedbackComment` |
| Session feedback count | {up} positive, {down} negative | `histories.feedbackCount` |
| Empty state: Agent Runs tab heading | No agent runs found | `histories.agentRuns.emptyTitle` |
| Empty state: Agent Runs tab body | Agent runs will appear here once agents have been executed. | `histories.agentRuns.emptyDescription` |
| Error state: feedback export | Failed to export feedback. Check your filters and try again. | `histories.exportFeedbackError` |

All copy MUST be translated to 3 locales: en, vi, ja.

---

## Interaction States

### Thumb Up Button (all surfaces: chat, search, agent)

| State | Visual |
|-------|--------|
| Inactive | `text-muted-foreground`, ghost variant |
| Hover | Default ghost hover (subtle bg) |
| Active (selected) | `text-green-500` |
| Disabled (while streaming) | `opacity-50 cursor-not-allowed` |

### Thumb Down Button (all surfaces: chat, search, agent)

| State | Visual |
|-------|--------|
| Inactive | `text-muted-foreground`, ghost variant |
| Hover | Default ghost hover (subtle bg) |
| Active (selected) | `text-red-500` |
| Popover open | `text-red-500` + popover visible below |
| Disabled (while streaming) | `opacity-50 cursor-not-allowed` |

### FeedbackCommentPopover

| State | Visual |
|-------|--------|
| Empty textarea | "Send feedback" button disabled (secondary variant), "Skip for now" enabled |
| Has text | "Send feedback" button enabled (primary variant), "Skip for now" enabled |
| Submitting | Spinner in "Send feedback", both buttons disabled |
| Success | Popover closes, thumb stays red-500, thank-you text appears inline |

### Export Feedback Button

| State | Visual |
|-------|--------|
| Default | Outline variant, Download icon + "Export feedback" |
| Loading | Spinner replaces icon, "Exporting..." label, disabled |
| Error | Sonner toast with error message |
| Success | Browser downloads CSV file, button returns to default |

### Feedback Filter Dropdown

| State | Visual |
|-------|--------|
| Default (All) | No visual indicator of active filter |
| Filter active | Badge dot or count indicator on filter button |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Popover, Collapsible, Select, Card, Tabs, Badge, Button, Sheet, ScrollArea, Skeleton, Separator | not required |

No third-party registries needed for this phase.

---

## Dark Mode Contract

All new components MUST support dark mode via Tailwind `dark:` prefix. Specific requirements:

| Element | Light | Dark |
|---------|-------|------|
| Popover surface | `bg-popover` (white) | `bg-popover` (dark surface) |
| Comment textarea | `bg-background border-input` | Same CSS vars auto-switch |
| Feedback count text | `text-muted-foreground` | Same CSS var auto-switch |
| Quote border (comment) | `border-primary` | Same CSS var auto-switch |
| Export button | `variant="outline"` handles both | Auto via shadcn |
| Green/Red feedback colors | `text-green-500` / `text-red-500` | Same values work in both modes |

---

## Accessibility Contract

| Requirement | Implementation |
|-------------|----------------|
| Thumb buttons | `title` attribute with i18n label (existing pattern) |
| Popover | `aria-label` on popover trigger, focus trap inside popover |
| Textarea | Associated label via `aria-label` (no visible label, space-constrained) |
| Keyboard | Tab through thumb buttons, Enter to submit, Escape to close popover |
| Screen reader | Feedback state announced via `aria-pressed` on thumb buttons |
| Color contrast | Green-500 on white/dark backgrounds meets WCAG AA |
| Export button | `aria-busy="true"` during export |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
