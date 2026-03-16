# LLM Provider Admin Page -- UI/UX Design Specification

## 1. Overview

Admin-only page at `/data-studio/llm-providers` for managing system-wide LLM model providers. Accessible from the **Administrators** sidebar group. Supports full CRUD, default-provider toggling, and filtering by factory/model type.

---

## 2. Page Wireframe

```
+------------------------------------------------------------------+
| Header: "LLM Providers"                    [+ Add Provider]      |
+------------------------------------------------------------------+
| Filter Bar                                                       |
| [Factory ▼ All]  [Type ▼ All]  [Search by model name...]        |
+------------------------------------------------------------------+
| Table                                                            |
| ┌────────────┬──────────┬──────────────┬─────────┬───────┬─────┐ |
| │ Provider   │ Type     │ Model        │ Default │Status │  ⋯  │ |
| ├────────────┼──────────┼──────────────┼─────────┼───────┼─────┤ |
| │ OpenAI     │ ●Chat    │ gpt-4o       │  ★      │Active │ ⋯  │ |
| │ OpenAI     │ ●Embed   │ text-emb-3-s │         │Active │ ⋯  │ |
| │ Anthropic  │ ●Chat    │ claude-sonnet│         │Active │ ⋯  │ |
| └────────────┴──────────┴──────────────┴─────────┴───────┴─────┘ |
| Pagination: < 1 2 3 ... >                    Showing 1-10 of 24 |
+------------------------------------------------------------------+
```

### Empty State

When no providers exist, the table area is replaced by a centered card:

```
+------------------------------------------+
|         (ServerCog icon, muted)          |
|                                          |
|    No LLM providers configured yet       |
|    Add your first provider to get started |
|                                          |
|          [+ Add Provider]                |
+------------------------------------------+
```

---

## 3. Component Hierarchy

```
LlmProviderPage
├── HeaderActions                    # Top-right "Add Provider" button
├── FilterBar
│   ├── Select (factory_name)        # "All", "OpenAI", "Azure-OpenAI", ...
│   ├── Select (model_type)          # "All", "Chat", "Embedding"
│   └── Input (search)               # Debounced model_name search
├── ProviderTable
│   ├── TableHeader
│   ├── TableBody
│   │   └── ProviderRow (per item)
│   │       ├── Badge (model_type)
│   │       ├── Badge (status)
│   │       ├── StarIcon (is_default)
│   │       └── RowActions (dropdown)
│   │           ├── Edit
│   │           ├── Set as Default / Unset Default
│   │           └── Delete
│   └── EmptyState (conditional)
├── Pagination
└── ProviderFormDialog               # Shared for create + edit
    ├── DialogHeader
    ├── Form fields
    └── DialogFooter
```

---

## 4. ProviderFormDialog -- Create / Edit

Opened as a modal `Dialog`. Title changes based on mode: "Add Provider" or "Edit Provider".

### Form Layout

```
+--------------------------------------------------+
| Dialog Title: "Add Provider"              [X]     |
+--------------------------------------------------+
| Factory *          [Select ▼ OpenAI          ]    |
| Model Type *       [Select ▼ Chat            ]    |
| Model Name *       [gpt-4o                   ]    |
| API Key *          [••••••••••••       👁    ]    |
| API Base URL       [https://...              ]    |
| Max Tokens         [4096                     ]    |
| ☐ Set as default                                  |
+--------------------------------------------------+
|                       [Cancel]  [Save Provider]   |
+--------------------------------------------------+
```

### Field Details

| Field | Component | Validation | Notes |
|---|---|---|---|
| factory_name | Select | Required | Options: OpenAI, Azure-OpenAI, Anthropic, Google, Ollama |
| model_type | Select | Required | Options: chat, embedding |
| model_name | Input | Required, non-empty | Free text |
| api_key | Input type=password | Required on create; optional on edit (leave blank to keep) | Toggle visibility icon (Eye/EyeOff) |
| api_base | Input | Optional; must be valid URL if provided | Placeholder shows factory default URL |
| max_tokens | Input type=number | Optional; min 1 | Only shown when model_type = "chat" |
| is_default | Checkbox | -- | Tooltip: "Only one default per model_type" |

### Behavior

- On **create**: all fields empty, api_key required.
- On **edit**: fields pre-filled, api_key shows placeholder "Leave blank to keep current". If the user types a new value it replaces the key.
- **Save** triggers `POST` (create) or `PUT` (edit), shows `toast.success()`, closes dialog, refetches table.
- **Validation errors** appear inline below each field in `text-destructive` color.

---

## 5. Visual Indicators

### model_type Badge

| Value | Badge variant | Colors (light / dark) |
|---|---|---|
| chat | `default` | `bg-blue-100 text-blue-700` / `bg-blue-900/30 text-blue-300` |
| embedding | `default` | `bg-emerald-100 text-emerald-700` / `bg-emerald-900/30 text-emerald-300` |

### status Badge

| Value | Badge variant | Colors |
|---|---|---|
| active | `outline` | `border-green-500 text-green-600` / `border-green-400 text-green-400` |
| deleted | `outline` | `border-muted text-muted-foreground` with strikethrough row |

### Default Indicator

- `is_default = true`: `Star` icon (Lucide) filled in `text-amber-500`.
- `is_default = false`: no icon, or faint `Star` outline on hover of "Set as Default" action.

### Factory Name Icons (optional enhancement)

Display a small logo or colored dot next to the factory name for quick visual scanning. Fallback to first letter avatar if no icon available.

---

## 6. Interaction Flows

### 6.1 Create Provider

1. User clicks **"+ Add Provider"** button (HeaderActions or EmptyState CTA).
2. `ProviderFormDialog` opens in create mode.
3. User fills fields, clicks **Save Provider**.
4. `POST /api/llm-provider` fires.
5. On success: `toast.success(t('llmProvider.toast.created'))`, dialog closes, table refetches.
6. On error: `toast.error(message)`, dialog stays open.

### 6.2 Edit Provider

1. User clicks **Edit** from row actions dropdown.
2. `ProviderFormDialog` opens in edit mode, pre-filled via existing row data.
3. User modifies fields, clicks **Save Provider**.
4. `PUT /api/llm-provider/:id` fires.
5. On success: toast, close, refetch.

### 6.3 Delete Provider

1. User clicks **Delete** from row actions dropdown.
2. `useConfirm()` dialog appears: "Are you sure you want to delete {model_name}? This action cannot be undone."
3. On confirm: `DELETE /api/llm-provider/:id` fires.
4. On success: `toast.success(t('llmProvider.toast.deleted'))`, row removed, table refetches.

### 6.4 Set as Default

1. User clicks **"Set as Default"** from row actions.
2. `PUT /api/llm-provider/:id` with `{ is_default: true }`.
3. Previous default for that `model_type` is automatically unset by the backend.
4. Toast success, table refetches showing updated star icon.

---

## 7. Loading & Error States

| State | Behavior |
|---|---|
| Initial load | `SpinnerOverlay` covering table area |
| Saving form | **Save** button shows `Spinner` + disabled, dialog non-dismissable |
| Delete in progress | Confirm button shows `Spinner` + disabled |
| API error on list | Card with error message + "Retry" button replacing table |
| Stale refetch | No spinner; optimistic UI via TanStack Query background refetch indicator (subtle top bar) |

---

## 8. i18n Key Inventory

All user-facing strings use `t()` from react-i18next. Namespace: `llmProvider`.

```
llmProvider.pageTitle                = "LLM Providers"
llmProvider.addProvider              = "Add Provider"
llmProvider.editProvider             = "Edit Provider"
llmProvider.deleteProvider           = "Delete Provider"

llmProvider.table.provider           = "Provider"
llmProvider.table.type               = "Type"
llmProvider.table.model              = "Model"
llmProvider.table.default            = "Default"
llmProvider.table.status             = "Status"
llmProvider.table.actions            = "Actions"
llmProvider.table.apiBase            = "API Base"
llmProvider.table.maxTokens          = "Max Tokens"

llmProvider.filter.allFactories      = "All Providers"
llmProvider.filter.allTypes          = "All Types"
llmProvider.filter.searchPlaceholder = "Search by model name..."

llmProvider.form.factoryName         = "Provider"
llmProvider.form.modelType           = "Model Type"
llmProvider.form.modelName           = "Model Name"
llmProvider.form.apiKey              = "API Key"
llmProvider.form.apiKeyHint          = "Leave blank to keep current key"
llmProvider.form.apiBase             = "API Base URL"
llmProvider.form.maxTokens           = "Max Tokens"
llmProvider.form.isDefault           = "Set as default"
llmProvider.form.isDefaultTooltip    = "Only one default allowed per model type"
llmProvider.form.save                = "Save Provider"
llmProvider.form.cancel              = "Cancel"

llmProvider.type.chat                = "Chat"
llmProvider.type.embedding           = "Embedding"

llmProvider.status.active            = "Active"
llmProvider.status.deleted           = "Deleted"

llmProvider.empty.title              = "No LLM providers configured yet"
llmProvider.empty.description        = "Add your first provider to get started"

llmProvider.confirm.deleteTitle      = "Delete Provider"
llmProvider.confirm.deleteMessage    = "Are you sure you want to delete {{modelName}}? This action cannot be undone."

llmProvider.toast.created            = "Provider created successfully"
llmProvider.toast.updated            = "Provider updated successfully"
llmProvider.toast.deleted            = "Provider deleted successfully"
llmProvider.toast.defaultSet         = "Default provider updated"

llmProvider.action.edit              = "Edit"
llmProvider.action.delete            = "Delete"
llmProvider.action.setDefault        = "Set as Default"
llmProvider.action.unsetDefault      = "Unset Default"
```

---

## 9. Recommended File Structure

```
fe/src/features/llm-provider/
├── api/
│   ├── llmProviderApi.ts            # API functions (getProviders, createProvider, etc.)
│   └── llmProviderQueries.ts        # TanStack Query hooks (useProviders, usePresets, etc.)
├── components/
│   ├── ProviderTable.tsx             # Table with sorting, row actions
│   ├── ProviderFormDialog.tsx        # Create/Edit modal form
│   ├── FilterBar.tsx                 # Factory + type selects + search
│   ├── EmptyState.tsx                # No-data placeholder
│   └── ModelTypeBadge.tsx            # Badge with color mapping
├── hooks/
│   └── useProviderFilters.ts         # Filter/search state management
├── pages/
│   └── LlmProviderPage.tsx           # Route-level page component
├── types/
│   └── llmProvider.types.ts          # ModelProvider interface, form types
└── index.ts                          # Barrel export
```

---

## 10. Route & Sidebar Registration

### routeConfig.ts entry

```ts
{
  path: '/data-studio/llm-providers',
  titleKey: 'llmProvider.pageTitle',
  featureId: 'llm-provider',
  layout: { sidebar: true, header: true },
  roles: ['admin'],
}
```

### Sidebar placement

Under the **Administrators** group, after existing admin links. Icon: `BrainCircuit` (Lucide).

---

## 11. Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| >= 1024px (lg) | Full table with all columns visible |
| 768-1023px (md) | Hide `api_base` and `max_tokens` columns |
| < 768px (sm) | Card-based list view instead of table; each card shows provider, model, type badge, default star, and action menu |

### Dialog Responsiveness

- Desktop: `max-w-lg` centered dialog.
- Mobile (< 640px): Full-width bottom sheet style via `DialogContent className="sm:max-w-lg"`.

---

## 12. Accessibility

- All form fields have associated `<label>` elements.
- Action dropdown is keyboard-navigable (Enter/Space to open, arrow keys to navigate).
- Delete confirmation is focus-trapped.
- Badge colors have sufficient contrast (WCAG AA).
- Star icon has `aria-label="Default provider"` when active.
- Table uses proper `<thead>`, `<tbody>`, `<th scope="col">` semantics.
