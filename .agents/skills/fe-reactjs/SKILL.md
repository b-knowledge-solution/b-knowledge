---
name: fe-reactjs
description: Frontend development skill — enforces B-Knowledge FE architecture for new features, pages, components, and hooks. Use this whenever working in fe/, creating React components, adding pages, writing TanStack Query hooks, or modifying frontend features.
---

# B-Knowledge Frontend Development Skill

Use this skill when creating or modifying features, pages, components, or hooks in the `fe/` workspace.

## Stack

- React 19, TypeScript strict, Vite 7, shadcn/ui (new-york style), Radix UI, Tailwind CSS 3.4
- Path alias: `@/*` → `fe/src/*`
- React Compiler enabled (`babel-plugin-react-compiler`) — do NOT use `React.memo`, `useMemo`, or `useCallback`
- TanStack Query 5 for all server state (useQuery/useMutation)
- i18n: `react-i18next` with locales in `fe/src/i18n/locales/{en,vi,ja}.json`
- Icons: `lucide-react`
- Testing: `vitest` + `@testing-library/react`
- Toast: `sonner`

## Conditional Literal Rule (Mandatory)

- Do **not** use hardcoded static string/number literals directly in conditional comparisons (`if`, `else if`, `switch`, ternary conditions).
- Move comparison values to named constants/enums in `fe/src/constants/` (or feature-local constants when truly feature-specific), then compare against those constants.
- Example: use `Theme.DARK` / `Theme.SYSTEM` instead of checking raw `'dark'` / `'system'` in conditions.

## Feature Module Structure

Every domain feature lives under `fe/src/features/<domain>/`:

```
features/<domain>/
├── api/
│   ├── <domain>Api.ts            # Raw HTTP calls (NO React hooks)
│   └── <domain>Queries.ts        # TanStack Query hooks (useQuery/useMutation)
├── components/
│   └── <ComponentName>.tsx       # Feature-specific UI
├── hooks/
│   └── use<Purpose>.ts           # UI-only hooks (streaming, filters, NOT data-fetching)
├── pages/
│   └── <Domain>Page.tsx          # Route-level pages
├── types/
│   └── <domain>.types.ts         # Feature-specific types (snake_case filename)
└── index.ts                      # Barrel export (PUBLIC API)
```

### Critical: API Layer Split

The `api/` directory MUST have two files with distinct responsibilities. This is the most important pattern in the frontend.

| File | Contains | NEVER contains |
|------|----------|---------------|
| `<domain>Api.ts` | Raw `api.get()`, `api.post()` typed wrappers | React hooks, useQuery, useMutation |
| `<domain>Queries.ts` | `useQuery`/`useMutation` wrapping the Api functions | Direct fetch calls, raw HTTP |

### Critical: hooks/ is for UI-only hooks

The `hooks/` directory is for non-data-fetching hooks only:
- Streaming hooks (`useChatStream.ts`, `useSearchStream.ts`)
- Filter/form state composition (`useAuditFilters.ts`)
- Browser API hooks (`useTts.ts`, `useTokenizer.ts`)
- Socket event subscriptions (`useConverterSocket.ts`)

**NEVER** put `useQuery`/`useMutation` in `hooks/`. They MUST go in `api/<domain>Queries.ts`.

---

## Import Rules

1. **NO cross-feature imports.** `features/A/` must NEVER import from `features/B/`. Use shared code instead.
2. **Barrel files only.** External consumers import from `@/features/<domain>` (the `index.ts`), never deep paths.
3. **Within a feature**, relative imports are fine: `./components/Foo`, `../types`.
4. **Shared code locations:**
   - `@/components/ui/*` — shadcn/ui primitives
   - `@/components/*` — custom shared components (ConfirmDialog, Select, etc.)
   - `@/hooks/*` — global hooks (useDebounce, useUrlState, etc.)
   - `@/lib/api` — fetch wrapper with auth handling
   - `@/lib/socket` — Socket.IO singleton
   - `@/lib/queryKeys` — centralized query key factory
   - `@/lib/utils` — `cn()` class merger
   - `@/utils/*` — pure utility functions

---

## Patterns & Code Examples

### Barrel File (`index.ts`)

```ts
/**
 * Barrel exports for the <domain> feature module.
 * @module features/<domain>
 */
export { domainApi } from './api/domainApi'
export { useDomainList, useDomainDetail, useCreateDomain } from './api/domainQueries'
export { default as DomainPage } from './pages/DomainPage'
export type { DomainItem, CreateDomainDto } from './types/domain.types'
```

### API Service (`api/<domain>Api.ts`)

Use the shared `api` client — never raw `fetch` unless streaming (SSE) or binary (TTS/blobs).

```ts
import { api } from '@/lib/api'
import type { DomainItem, CreateDomainDto } from '../types/domain.types'

/** Base URL for domain endpoints */
const BASE = '/api/domain'

/**
 * API service for domain operations.
 * @description Provides typed methods for domain CRUD endpoints.
 */
export const domainApi = {
  /**
   * List all items.
   * @returns Array of domain items
   */
  list: async (): Promise<DomainItem[]> =>
    api.get<DomainItem[]>(BASE),

  /**
   * Get a single item by ID.
   * @param id - Item UUID
   * @returns Domain item
   */
  getById: async (id: string): Promise<DomainItem> =>
    api.get<DomainItem>(`${BASE}/${id}`),

  /**
   * Create a new item.
   * @param data - Create payload
   * @returns Created item
   */
  create: async (data: CreateDomainDto): Promise<DomainItem> =>
    api.post<DomainItem>(BASE, data),

  /**
   * Update an item.
   * @param id - Item UUID
   * @param data - Partial update payload
   * @returns Updated item
   */
  update: async (id: string, data: Partial<CreateDomainDto>): Promise<DomainItem> =>
    api.put<DomainItem>(`${BASE}/${id}`, data),

  /**
   * Delete an item.
   * @param id - Item UUID
   */
  delete: async (id: string): Promise<void> =>
    api.delete(`${BASE}/${id}`),
}
```

### Query Hooks (`api/<domain>Queries.ts`)

All data-fetching hooks live here. Use centralized query keys from `@/lib/queryKeys`.

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { domainApi } from './domainApi'
import type { CreateDomainDto } from '../types/domain.types'

// ── Queries ──────────────────────────────────

/**
 * Hook to fetch all domain items.
 * @returns TanStack Query result with domain items
 */
export function useDomainList() {
  return useQuery({
    queryKey: queryKeys.domain.list(),
    queryFn: () => domainApi.list(),
  })
}

/**
 * Hook to fetch a single domain item by ID.
 * @param id - Item UUID
 * @returns TanStack Query result with domain item
 */
export function useDomainDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.domain.detail(id),
    queryFn: () => domainApi.getById(id),
    enabled: !!id,
  })
}

// ── Mutations ────────────────────────────────

/**
 * Hook to create a new domain item.
 * @description Invalidates domain list cache on success.
 */
export function useCreateDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateDomainDto) => domainApi.create(data),
    meta: { successMessage: 'domain.createSuccess' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain.all })
    },
  })
}

/**
 * Hook to update a domain item.
 * @description Invalidates domain list cache on success.
 */
export function useUpdateDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateDomainDto> }) =>
      domainApi.update(id, data),
    meta: { successMessage: 'domain.updateSuccess' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain.all })
    },
  })
}

/**
 * Hook to delete a domain item.
 * @description Invalidates domain list cache on success.
 */
export function useDeleteDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => domainApi.delete(id),
    meta: { successMessage: 'domain.deleteSuccess' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain.all })
    },
  })
}
```

### Query Key Registration

Add new query keys to `fe/src/lib/queryKeys.ts`:

```ts
// In the queryKeys factory object:
domain: {
  all: ['domain'] as const,
  list: () => [...queryKeys.domain.all, 'list'] as const,
  detail: (id: string) => [...queryKeys.domain.all, 'detail', id] as const,
},
```

### Types (`types/<domain>.types.ts`)

Use `snake_case` for fields matching the API/DB shape:

```ts
/** Domain item returned from the API */
export interface DomainItem {
  id: string
  name: string
  description?: string
  created_by: string
  created_at: string
  updated_at: string
}

/** Payload for creating a domain item */
export interface CreateDomainDto {
  name: string
  description?: string
}
```

### UI-Only Hook Example (`hooks/useDomainFilters.ts`)

This is the correct use of the `hooks/` directory — UI state, not data-fetching:

```ts
import { useSearchParams } from 'react-router-dom'

/**
 * Hook for managing domain filter state in URL params.
 * @returns Filter state and setters
 */
export function useDomainFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Read filter values from URL
  const search = searchParams.get('search') ?? ''
  const status = searchParams.get('status') ?? 'all'
  const page = parseInt(searchParams.get('page') ?? '1', 10)

  /** Update a single filter param while preserving others */
  const setFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) {
        next.set(key, value)
      } else {
        next.delete(key)
      }
      // Reset page when filter changes
      if (key !== 'page') next.set('page', '1')
      return next
    })
  }

  return { search, status, page, setFilter }
}
```

### Component (`components/<Name>.tsx`)

- Use shadcn/ui from `@/components/ui/`
- Always support dark mode via `dark:` Tailwind variants
- All user-visible strings via `useTranslation()`

```tsx
import { useTranslation } from 'react-i18next'
import { Edit2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DomainItem } from '../types/domain.types'

/** Props for DomainCard */
interface DomainCardProps {
  item: DomainItem
  onEdit: (item: DomainItem) => void
  onDelete: (id: string) => void
}

/**
 * Card displaying a single domain item.
 * @param props - Component props
 */
const DomainCard = ({ item, onEdit, onDelete }: DomainCardProps) => {
  const { t } = useTranslation()

  return (
    <Card className="hover:shadow-md transition-shadow dark:bg-slate-800 dark:border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {item.name}
        </CardTitle>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      {item.description && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{item.description}</p>
        </CardContent>
      )}
    </Card>
  )
}

export default DomainCard
```

### Page (`pages/DomainPage.tsx`)

Route-level component composing query hooks and feature components:

```tsx
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/spinner'
import { useDomainList } from '../api/domainQueries'
import DomainCard from '../components/DomainCard'

/**
 * Main page for domain management.
 * @description Uses TanStack Query for data fetching with automatic caching.
 */
const DomainPage = () => {
  const { t } = useTranslation()
  const { data: items, isLoading } = useDomainList()

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold dark:text-white">{t('domain.title')}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items?.map((item) => (
          <DomainCard key={item.id} item={item} onEdit={() => {}} onDelete={() => {}} />
        ))}
      </div>
    </div>
  )
}

export default DomainPage
```

---

## State Management Quick Reference

| State Type | Solution | Location |
|---|---|---|
| Server data (API) | `useQuery` | `api/<domain>Queries.ts` |
| Server mutations | `useMutation` | `api/<domain>Queries.ts` |
| App-wide client state | React Context | `hooks/use<Context>.tsx` |
| Feature-local UI state | `useState` | Component or page |
| URL-shareable state | `useSearchParams` / `useUrlState` | `hooks/use<Filters>.ts` |
| Real-time updates | Socket.IO + query invalidation | `hooks/use<Socket>.ts` |
| Streaming (SSE) | `useState` + `useRef` | `hooks/use<Stream>.ts` |

**Mutation success messages:** Use `meta: { successMessage: 'i18n.key' }` — the global MutationCache in `main.tsx` auto-shows toast notifications.

**Forms:** Use native `useState` for form data with typed state objects. No form libraries.

---

## New Feature Checklist

1. [ ] Create `fe/src/features/<domain>/` with subdirectories: `api/`, `components/`, `pages/`, `types/`
2. [ ] Create `types/<domain>.types.ts` with interfaces and DTOs
3. [ ] Create `api/<domain>Api.ts` using `@/lib/api` (raw HTTP calls)
4. [ ] Create `api/<domain>Queries.ts` with `useQuery`/`useMutation` hooks
5. [ ] Add query keys to `fe/src/lib/queryKeys.ts`
6. [ ] Create components in `components/` using shadcn/ui + dark mode
7. [ ] Create page(s) in `pages/` using query hooks (NOT useState for server data)
8. [ ] Create `index.ts` barrel file exporting only the public API
9. [ ] Add route metadata to `fe/src/app/routeConfig.ts` (`titleKey`, `guidelineFeatureId`, `fullBleed`, `hideHeader`)
10. [ ] Add lazy route import in `fe/src/app/App.tsx` with `<FeatureErrorBoundary>`
11. [ ] Add sidebar nav item in `fe/src/layouts/Sidebar.tsx` with role checks
12. [ ] Add i18n keys to all three locale files: `en.json`, `vi.json`, `ja.json`
13. [ ] If new context provider needed, add to `fe/src/app/Providers.tsx`
14. [ ] Only create `hooks/` directory if feature has UI-only hooks (streaming, filters, etc.)

## New Shared Component Checklist

1. [ ] Create in `fe/src/components/` (or `fe/src/components/ui/` if shadcn-style)
2. [ ] Support dark mode with `dark:` variants
3. [ ] Use `cn()` from `@/lib/utils` for conditional classes
4. [ ] Props interface defined and exported
5. [ ] JSDoc on component and props

## Key Files Reference

- `fe/src/app/App.tsx` — Route definitions with lazy loading
- `fe/src/app/Providers.tsx` — Root context providers (add new providers here)
- `fe/src/app/routeConfig.ts` — Centralized route metadata
- `fe/src/layouts/Sidebar.tsx` — Navigation items with role checks
- `fe/src/layouts/Header.tsx` — Page header (title from routeConfig)
- `fe/src/lib/api.ts` — Fetch wrapper with 401 handling
- `fe/src/lib/socket.ts` — Socket.IO singleton
- `fe/src/lib/queryKeys.ts` — Centralized query key factory (ALL keys here)
- `fe/src/lib/utils.ts` — `cn()` class merger
- `fe/src/config.ts` — Runtime feature flags (`VITE_ENABLE_*`)
- `fe/src/i18n/locales/` — en.json, vi.json, ja.json
- `fe/src/main.tsx` — QueryClient setup with global MutationCache (auto-toasts)
- `fe/STATE_MANAGEMENT.md` — Full state management conventions
