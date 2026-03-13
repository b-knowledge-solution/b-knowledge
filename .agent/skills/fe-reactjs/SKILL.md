---
name: b-knowledge-fe
description: Frontend development skill — enforces B-Knowledge FE architecture for new features, pages, components, and hooks
---

# B-Knowledge Frontend Development Skill

Use this skill when creating or modifying features, pages, components, or hooks in the `fe/` workspace.

## Stack

- React 19, TypeScript strict, Vite 7, shadcn/ui, Radix UI, Tailwind CSS
- Path alias: `@/*` → `fe/src/*`
- React Compiler enabled (`babel-plugin-react-compiler`) — do NOT use `React.memo`, `useMemo`, or `useCallback`
- i18n: `react-i18next` with locales in `fe/src/i18n/locales/{en,vi,ja}.json`
- Icons: `lucide-react`
- Testing: `vitest` + `@testing-library/react`

## Feature Module Structure

Every domain feature lives under `fe/src/features/<domain>/`:

```
features/<domain>/
├── api/
│   └── <domain>Api.ts          # API service object
├── components/
│   └── <ComponentName>.tsx     # Feature-specific UI
├── hooks/
│   └── use<Domain>.ts          # Feature-specific hooks
├── pages/
│   └── <Domain>Page.tsx        # Route-level pages
├── types/
│   └── index.ts                # Feature-specific types
└── index.ts                    # Barrel export (PUBLIC API)
```

---

## Import Rules

1. **NO cross-feature imports.** `features/A/` must NEVER import from `features/B/`. Use shared code instead.
2. **Barrel files only.** External consumers import from `@/features/<domain>` (the `index.ts`), never deep paths.
3. **Within a feature**, relative imports are fine: `./components/Foo`, `../types`.
4. **Shared code locations:**
   - `@/components/ui/*` — shadcn/ui primitives
   - `@/components/*` — custom shared components (ConfirmDialog, Select, etc.)
   - `@/hooks/*` — global hooks (useDebounce, etc.)
   - `@/lib/api` — fetch wrapper with auth handling
   - `@/lib/socket` — Socket.IO singleton
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
export { default as DomainPage } from './pages/DomainPage'
export type { DomainItem, CreateDomainDto } from './types'
```

### API Layer (`api/<domain>Api.ts`)

Use the shared `api` client — never raw `fetch` unless streaming (SSE) or binary (TTS/blobs).

```ts
import { api } from '@/lib/api'
import type { DomainItem, CreateDomainDto } from '../types'

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
  list: async (): Promise<DomainItem[]> => {
    return api.get<DomainItem[]>(BASE)
  },

  /**
   * Create a new item.
   * @param data - Create payload
   * @returns Created item
   */
  create: async (data: CreateDomainDto): Promise<DomainItem> => {
    return api.post<DomainItem>(BASE, data)
  },

  /**
   * Update an item.
   * @param id - Item UUID
   * @param data - Partial update payload
   * @returns Updated item
   */
  update: async (id: string, data: Partial<CreateDomainDto>): Promise<DomainItem> => {
    return api.put<DomainItem>(`${BASE}/${id}`, data)
  },

  /**
   * Delete an item.
   * @param id - Item UUID
   */
  delete: async (id: string): Promise<void> => {
    return api.delete(`${BASE}/${id}`)
  },
}
```

### Types (`types/index.ts`)

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

### Custom Hook (`hooks/useDomain.ts`)

Hooks encapsulate state, API calls, loading, and CRUD operations:

```ts
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { domainApi } from '../api/domainApi'
import type { DomainItem, CreateDomainDto } from '../types'

/**
 * Hook return type for domain management.
 */
export interface UseDomainReturn {
  items: DomainItem[]
  loading: boolean
  refresh: () => Promise<void>
  handleCreate: (data: CreateDomainDto) => Promise<void>
  handleDelete: (id: string) => Promise<void>
}

/**
 * Hook for managing domain items.
 * @returns Domain state and CRUD handlers
 */
export function useDomain(): UseDomainReturn {
  const { t } = useTranslation()
  const [items, setItems] = useState<DomainItem[]>([])
  const [loading, setLoading] = useState(false)

  /** Fetch all items from the API */
  const refresh = async () => {
    setLoading(true)
    try {
      const data = await domainApi.list()
      setItems(data)
    } catch (error) {
      console.error('Error fetching domain items:', error)
    } finally {
      setLoading(false)
    }
  }

  /** Create a new item and refresh the list */
  const handleCreate = async (data: CreateDomainDto) => {
    await domainApi.create(data)
    toast.success(t('domain.createSuccess'))
    await refresh()
  }

  /** Delete an item and refresh the list */
  const handleDelete = async (id: string) => {
    await domainApi.delete(id)
    toast.success(t('domain.deleteSuccess'))
    await refresh()
  }

  // Initial fetch on mount
  useEffect(() => {
    refresh()
  }, [])

  return { items, loading, refresh, handleCreate, handleDelete }
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
import type { DomainItem } from '../types'

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
const DomainCard: React.FC<DomainCardProps> = ({ item, onEdit, onDelete }) => {
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

Route-level component that composes hooks and feature components.

```tsx
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/spinner'
import { useDomain } from '../hooks/useDomain'
import DomainCard from '../components/DomainCard'

/**
 * Main page for domain management.
 */
const DomainPage: React.FC = () => {
  const { t } = useTranslation()
  const { items, loading } = useDomain()

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold dark:text-white">{t('domain.title')}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <DomainCard key={item.id} item={item} onEdit={() => {}} onDelete={() => {}} />
        ))}
      </div>
    </div>
  )
}

export default DomainPage
```

---

## New Feature Checklist

1. [ ] Create `fe/src/features/<domain>/` with subdirectories: `api/`, `components/`, `hooks/`, `pages/`, `types/`
2. [ ] Create `types/index.ts` with interfaces and DTOs
3. [ ] Create `api/<domain>Api.ts` using `@/lib/api`
4. [ ] Create hooks in `hooks/`
5. [ ] Create components in `components/` using shadcn/ui
6. [ ] Create page(s) in `pages/`
7. [ ] Create `index.ts` barrel file exporting only the public API
8. [ ] Add route metadata to `fe/src/app/routeConfig.ts` (`titleKey`, `guidelineFeatureId`, `fullBleed`, `hideHeader`)
9. [ ] Add lazy route import in `fe/src/app/App.tsx`
10. [ ] Add sidebar nav item in `fe/src/layouts/Sidebar.tsx` with role checks
11. [ ] Add i18n keys to all three locale files: `en.json`, `vi.json`, `ja.json`
12. [ ] Ensure all components support dark mode (`dark:` Tailwind variants)
13. [ ] If new context provider needed, add to `fe/src/app/Providers.tsx`

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
- `fe/src/lib/utils.ts` — `cn()` class merger
- `fe/src/config.ts` — Runtime feature flags
- `fe/src/i18n/locales/` — en.json, vi.json, ja.json
