# Chat Dialog Admin Management - Design Specification

## Overview

Admin-only page at `/admin/chat-dialogs` for managing chat dialog configurations and RBAC access. Follows patterns established by `TeamManagementPage` (search/filter bar, card/table layout, modal dialogs) and extends the existing `ChatDialogConfig` component with tabbed configuration and access management.

---

## 1. Page: ChatDialogManagementPage

**Route**: `/admin/chat-dialogs`
**Access**: Admin and Leader roles only
**Feature ID**: `admin-chat-dialogs` (for guideline/first-visit)

### Layout

```
+------------------------------------------------------------------+
| [Search input w/ icon]          [Status filter ▼]  [+ Create Dialog] |
+------------------------------------------------------------------+
| Table                                                            |
| Name | Description | KBs | LLM | Visibility | Created By | Date | Actions |
| ...                                                              |
+------------------------------------------------------------------+
| Pagination (right-aligned)                                       |
+------------------------------------------------------------------+
```

### Component Hierarchy

```
ChatDialogManagementPage
├── HeaderActions
│   └── Button (Create Dialog)
├── SearchFilterBar
│   ├── Input (search, with Search icon prefix)
│   └── Select (filter: All / Public / Private)
├── ChatDialogTable
│   └── Table (shadcn)
│       ├── TableHeader
│       └── TableBody
│           └── ChatDialogTableRow (per row)
│               ├── Badge (Public/Private)
│               └── DropdownMenu (Actions: Edit, Manage Access, Delete)
├── Pagination
├── ChatDialogFormDialog (create/edit modal)
├── ChatDialogAccessDialog (access management modal)
├── ConfirmDialog (delete confirmation)
└── GuidelineDialog
```

### Page Props Interface

```ts
// No props - page component uses hooks internally
```

### Hooks

```ts
interface UseChatDialogAdmin {
  dialogs: AdminChatDialog[]
  loading: boolean
  searchTerm: string
  handleSearch: (term: string) => void
  visibilityFilter: 'ALL' | 'PUBLIC' | 'PRIVATE'
  handleVisibilityFilter: (value: string) => void
  paginatedDialogs: AdminChatDialog[]
  filteredCount: number
  currentPage: number
  pageSize: number
  handlePaginationChange: (page: number, size: number) => void
  createDialog: (data: AdminCreateDialogPayload) => Promise<boolean>
  updateDialog: (id: string, data: AdminCreateDialogPayload) => Promise<boolean>
  deleteDialog: (id: string) => Promise<boolean>
  refresh: () => void
}
```

### Table Columns

| Column | Width | Content |
|--------|-------|---------|
| Name | 200px | Dialog name, truncated with tooltip |
| Description | flex | Description text, truncated |
| KBs | 80px | Numeric count badge |
| LLM | 140px | Model ID, truncated |
| Visibility | 100px | `Badge` - green "Public" or gray "Private" |
| Created By | 140px | User display name |
| Created At | 130px | Formatted date (locale-aware) |
| Actions | 80px | `DropdownMenu` with Edit, Manage Access, Delete |

### State Management

```
selectedDialog: AdminChatDialog | null
isFormOpen: boolean
isCreateMode: boolean
isAccessOpen: boolean
isDeleteConfirmOpen: boolean
```

---

## 2. Dialog: ChatDialogFormDialog (Create/Edit)

**Component**: `ChatDialogFormDialog`
**Base**: shadcn `Dialog` with `Tabs`
**Max width**: `max-w-2xl`
**Max height**: `max-h-[85vh]` with internal scroll

### Tabbed Layout

```
+------------------------------------------------------------+
| [x]  Create Chat Dialog  /  Edit Chat Dialog               |
+------------------------------------------------------------+
| [Basic] [Knowledge] [LLM] [Prompt] [Advanced]              |
+------------------------------------------------------------+
| <Tab content area - scrollable>                             |
|                                                             |
+------------------------------------------------------------+
| [Cancel]                                          [Save]    |
+------------------------------------------------------------+
```

### Props Interface

```ts
interface ChatDialogFormDialogProps {
  open: boolean
  onClose: () => void
  onSave: (data: AdminCreateDialogPayload) => Promise<boolean>
  dialog: AdminChatDialog | null  // null = create mode
  datasets: { id: string; name: string }[]
  llmModels: { id: string; name: string; provider: string }[]
  rerankModels: { id: string; name: string }[]
}
```

### Tab: Basic

| Field | Component | Required | Notes |
|-------|-----------|----------|-------|
| Name | `Input` | Yes | Max 100 chars |
| Description | `Textarea` | No | Max 500 chars |
| Icon | `Input` | No | Emoji or icon key picker |
| Public | `Switch` | No | Default off. Label: "Make publicly accessible" |

### Tab: Knowledge

| Field | Component | Notes |
|-------|-----------|-------|
| Knowledge Bases | `Command` (searchable multi-select) | Shows dataset name + doc count. Selected items displayed as removable badges above the list. |

Layout:
```
Selected: [KB1 x] [KB2 x] [KB3 x]
+----------------------------------+
| [Search KBs...]                  |
| [ ] Knowledge Base Alpha (24)   |
| [x] Knowledge Base Beta (12)    |
| [ ] Knowledge Base Gamma (8)    |
+----------------------------------+
```

### Tab: LLM

| Field | Component | Range | Default |
|-------|-----------|-------|---------|
| Model | `Select` | From llmModels list | First available |
| Temperature | `Slider` + numeric display | 0 - 2, step 0.1 | 0.7 |
| Top P | `Slider` + numeric display | 0 - 1, step 0.05 | 1.0 |
| Top K | `Slider` + numeric display | 1 - 100, step 1 | 5 |
| Frequency Penalty | `Slider` + numeric display | 0 - 2, step 0.1 | 0 |
| Presence Penalty | `Slider` + numeric display | 0 - 2, step 0.1 | 0 |
| Max Tokens | `Input` (number) | 1 - 32768 | 4096 |

Each slider row layout:
```
Label                          Value
[==========o==================] 0.7
```

### Tab: Prompt

| Field | Component | Notes |
|-------|-----------|-------|
| System Prompt | `Textarea` | Resizable, min 4 rows. Placeholder with example. |
| Prologue | `Textarea` | Welcome message. Min 2 rows. |
| Empty Response | `Input` | Message when no relevant docs found. |

### Tab: Advanced

| Field | Component | Default | Notes |
|-------|-----------|---------|-------|
| Quote Attribution | `Switch` | off | Show source quotes in responses |
| Keyword Highlight | `Switch` | off | Highlight matched keywords |
| TOC Enhance | `Switch` | off | Use table-of-contents for structure |
| Refine Multi-turn | `Switch` | off | Refine queries across conversation turns |
| Use Knowledge Graph | `Switch` | off | Enable GraphRAG retrieval |
| Reasoning | `Switch` | off | Enable chain-of-thought reasoning |
| Similarity Threshold | `Slider` | 0.2 | Range 0-1, step 0.05 |
| Rerank Model | `Select` | none | Optional. From rerankModels list. |

Switch fields layout (two-column grid on desktop, single column on mobile):
```
+---------------------------+---------------------------+
| [x] Quote Attribution     | [x] Keyword Highlight     |
| [x] TOC Enhance           | [ ] Refine Multi-turn     |
| [ ] Use Knowledge Graph   | [ ] Reasoning             |
+---------------------------+---------------------------+
Similarity Threshold                              0.20
[====o======================================]
Rerank Model
[Select rerank model...               ▼]
```

### Form Data Interface

```ts
interface AdminCreateDialogPayload {
  name: string
  description?: string
  icon?: string
  is_public: boolean
  kb_ids: string[]
  llm_id?: string
  prompt_config: {
    system?: string
    prologue?: string
    empty_response?: string
    temperature: number
    top_p: number
    top_k: number
    frequency_penalty: number
    presence_penalty: number
    max_tokens: number
  }
  advanced_config: {
    quote: boolean
    keyword: boolean
    toc_enhance: boolean
    refine_multiturn: boolean
    use_kg: boolean
    reasoning: boolean
    similarity_threshold: number
    rerank_id?: string
  }
}
```

---

## 3. Dialog: ChatDialogAccessDialog (Manage Access)

**Component**: `ChatDialogAccessDialog`
**Trigger**: "Manage Access" action in table row dropdown
**Max width**: `max-w-lg`
**Max height**: `max-h-[80vh]`

### Layout

```
+------------------------------------------------------------+
| [x]  Manage Access - "Dialog Name"                         |
+------------------------------------------------------------+
| [Users] [Teams]                                            |
+------------------------------------------------------------+
| Currently Assigned:                                        |
| [User A                                    [Remove]]       |
| [User B                                    [Remove]]       |
+------------------------------------------------------------+
| Add Users:                                                 |
| [Search users...]                                          |
| [ ] User C                                                 |
| [ ] User D                                                 |
| [x] User E                                                 |
+------------------------------------------------------------+
| [Cancel]                                     [Save]        |
+------------------------------------------------------------+
```

### Props Interface

```ts
interface ChatDialogAccessDialogProps {
  open: boolean
  onClose: () => void
  dialog: AdminChatDialog | null
  // User tab
  assignedUsers: { id: string; name: string; email: string }[]
  availableUsers: { id: string; name: string; email: string }[]
  // Team tab
  assignedTeams: { id: string; name: string }[]
  availableTeams: { id: string; name: string }[]
  // Callbacks
  onSaveUsers: (dialogId: string, userIds: string[]) => Promise<boolean>
  onSaveTeams: (dialogId: string, teamIds: string[]) => Promise<boolean>
  onRemoveUser: (dialogId: string, userId: string) => Promise<boolean>
  onRemoveTeam: (dialogId: string, teamId: string) => Promise<boolean>
}
```

### Tab: Users

- **Assigned list**: Displays currently assigned users with avatar placeholder, name, email, and a Remove (`X`) button per row.
- **Add section**: `Command` component (shadcn) with search input. Checkbox list of available (unassigned) users. Multi-select.
- **Save**: Batch-adds all checked users.

### Tab: Teams

- Identical layout to Users tab but with team entities.
- Shows team name and member count in the available list.

### Internal State

```ts
selectedUserIds: string[]    // users checked for addition
selectedTeamIds: string[]    // teams checked for addition
activeTab: 'users' | 'teams'
```

---

## 4. Data Model: AdminChatDialog

Extends the existing `ChatDialog` type with admin-specific fields:

```ts
interface AdminChatDialog extends ChatDialog {
  /** Whether the dialog is publicly accessible */
  is_public: boolean
  /** Icon identifier or emoji */
  icon?: string
  /** Creator user ID */
  created_by: string
  /** Creator display name (joined from users table) */
  created_by_name: string
  /** Advanced configuration */
  advanced_config: {
    quote: boolean
    keyword: boolean
    toc_enhance: boolean
    refine_multiturn: boolean
    use_kg: boolean
    reasoning: boolean
    similarity_threshold: number
    rerank_id?: string
  }
  /** Access control summary */
  access: {
    user_count: number
    team_count: number
  }
}
```

---

## 5. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/chat-dialogs` | List all dialogs (paginated, filterable) |
| POST | `/api/admin/chat-dialogs` | Create dialog |
| PUT | `/api/admin/chat-dialogs/:id` | Update dialog |
| DELETE | `/api/admin/chat-dialogs/:id` | Delete dialog |
| GET | `/api/admin/chat-dialogs/:id/access` | Get assigned users and teams |
| PUT | `/api/admin/chat-dialogs/:id/access/users` | Set user access list |
| PUT | `/api/admin/chat-dialogs/:id/access/teams` | Set team access list |
| DELETE | `/api/admin/chat-dialogs/:id/access/users/:userId` | Remove user access |
| DELETE | `/api/admin/chat-dialogs/:id/access/teams/:teamId` | Remove team access |

### Query Parameters (GET list)

```
?search=<string>&visibility=public|private&page=1&page_size=20&sort_by=created_at&sort_order=desc
```

---

## 6. Localization Keys

Add to `en.json`, `vi.json`, `ja.json` under `adminChatDialogs` namespace:

```
adminChatDialogs.title
adminChatDialogs.createDialog
adminChatDialogs.editDialog
adminChatDialogs.deleteDialog
adminChatDialogs.deleteConfirm
adminChatDialogs.manageAccess
adminChatDialogs.search
adminChatDialogs.filterAll
adminChatDialogs.filterPublic
adminChatDialogs.filterPrivate
adminChatDialogs.columns.name
adminChatDialogs.columns.description
adminChatDialogs.columns.kbs
adminChatDialogs.columns.llm
adminChatDialogs.columns.visibility
adminChatDialogs.columns.createdBy
adminChatDialogs.columns.createdAt
adminChatDialogs.columns.actions
adminChatDialogs.tabs.basic
adminChatDialogs.tabs.knowledge
adminChatDialogs.tabs.llm
adminChatDialogs.tabs.prompt
adminChatDialogs.tabs.advanced
adminChatDialogs.fields.name
adminChatDialogs.fields.description
adminChatDialogs.fields.icon
adminChatDialogs.fields.isPublic
adminChatDialogs.fields.systemPrompt
adminChatDialogs.fields.prologue
adminChatDialogs.fields.emptyResponse
adminChatDialogs.fields.temperature
adminChatDialogs.fields.topP
adminChatDialogs.fields.topK
adminChatDialogs.fields.frequencyPenalty
adminChatDialogs.fields.presencePenalty
adminChatDialogs.fields.maxTokens
adminChatDialogs.fields.quote
adminChatDialogs.fields.keyword
adminChatDialogs.fields.tocEnhance
adminChatDialogs.fields.refineMultiturn
adminChatDialogs.fields.useKg
adminChatDialogs.fields.reasoning
adminChatDialogs.fields.similarityThreshold
adminChatDialogs.fields.rerankModel
adminChatDialogs.access.title
adminChatDialogs.access.users
adminChatDialogs.access.teams
adminChatDialogs.access.assigned
adminChatDialogs.access.add
adminChatDialogs.access.remove
adminChatDialogs.access.searchUsers
adminChatDialogs.access.searchTeams
adminChatDialogs.access.noUsers
adminChatDialogs.access.noTeams
```

---

## 7. Route Configuration

Add to `app/routeConfig.ts`:

```ts
{
  path: '/admin/chat-dialogs',
  title: 'adminChatDialogs.title',
  featureId: 'admin-chat-dialogs',
  layout: { sidebar: true, header: true },
  roles: ['admin', 'leader'],
}
```

Add sidebar entry in `layouts/Sidebar.tsx` under the Admin section.

---

## 8. Theme Support

All components use shadcn design tokens which support dark/light natively. Specific considerations:

- **Table row hover**: `hover:bg-muted` (works in both themes)
- **Badge variants**: `default` for Public (uses primary color), `secondary` for Private
- **Switch**: Uses shadcn `Switch` which inherits theme colors
- **Slider**: Uses shadcn `Slider` which inherits theme colors
- **Textarea**: Uses `bg-background`, `border-input`, `text-foreground` tokens
- **Assigned user rows** in access dialog: `bg-muted/50` background with `border-b border-border`

---

## 9. Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| `< sm` (mobile) | Search and filter stack vertically. Table switches to card view. Dialog full-screen. |
| `sm - md` | Side-by-side search/filter. Table visible. Dialog `max-w-2xl`. |
| `lg+` | Full table with all columns. Advanced tab switches grid two-column. |

Table column visibility on small screens:
- Always visible: Name, Visibility, Actions
- Hidden below `md`: Description, Created By
- Hidden below `lg`: KBs, LLM, Created At

---

## 10. File Structure

```
fe/src/features/ai/
├── pages/
│   └── ChatDialogManagementPage.tsx       # New page component
├── components/
│   ├── ChatDialogFormDialog.tsx            # New create/edit tabbed dialog
│   ├── ChatDialogAccessDialog.tsx          # New access management dialog
│   ├── ChatDialogTable.tsx                 # New table component
│   └── ChatDialogConfig.tsx               # Existing (remains for end-user config)
├── hooks/
│   └── useChatDialogAdmin.ts              # New admin hook
├── api/
│   └── chatApi.ts                         # Extend with admin endpoints
└── types/
    └── chat.types.ts                      # Extend with AdminChatDialog types
```
