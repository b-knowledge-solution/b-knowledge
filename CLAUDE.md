# B-Knowledge Project Instructions

This file provides context, build instructions, and coding standards for the B-Knowledge project (RAGFlow Simple UI).

## 1. Project Overview

B-Knowledge is an open-source UI to centralize and manage AI Search, Chat, and Knowledge Base. The project follows an **NX-style modular monorepo** architecture using npm workspaces.

- **Backend**: Node.js 22+ (ExpressJS)
- **Frontend**: TypeScript, React 19, Vite
- **Monorepo**: npm workspaces with `be/` and `fe/` packages
- **Worker**: Python-based advance-rag executor

## 2. Monorepo Structure

```
root/
├── package.json              # Root workspace config (npm workspaces)
├── be/                       # Backend workspace (Express API)
├── fe/                       # Frontend workspace (React + Vite)
├── advance-rag/              # Python worker for RAG processing
├── docker/                   # Docker configs and compose files
├── docs/                     # Project documentation
├── scripts/                  # Root-level operational scripts
└── patches/                  # npm patch files
```

## 3. Backend Architecture (`be/`)

The backend follows a **domain-driven modular architecture** inspired by NX library boundaries. Each module is self-contained with its own controller, routes, service, and barrel export.

```
be/src/
├── app/                      # Application bootstrap
│   ├── index.ts              # Express app initialization & middleware setup
│   └── routes.ts             # Central route registration (imports all module routes)
│
├── modules/                  # Domain modules (each is a self-contained unit)
│   ├── admin/                # Admin management
│   ├── audit/                # Audit logging
│   ├── auth/                 # Authentication & authorization
│   ├── broadcast/            # Broadcast / notification
│   ├── chat/                 # Chat sessions & messages
│   ├── dashboard/            # Dashboard analytics
│   ├── external/             # External service integrations (RAGFlow, Langfuse, MinIO)
│   ├── glossary/             # Glossary / terminology management
│   ├── knowledge-base/       # Knowledge base CRUD
│   ├── llm-provider/         # LLM / AI model provider config
│   ├── preview/              # Document preview
│   ├── rag/                  # RAG pipeline orchestration
│   ├── system-tools/         # System tooling & utilities
│   ├── teams/                # Team management
│   ├── user-history/         # User history tracking
│   └── users/                # User management
│
├── shared/                   # Cross-cutting concerns (shared libraries)
│   ├── config/               # Environment config & secrets
│   ├── db/                   # Database providers, knex config & migrations
│   ├── middleware/            # Express middleware (auth, validation, logging, error handling)
│   ├── models/               # Shared data models & factory interfaces
│   ├── services/             # Shared services (queue, cache, external clients)
│   ├── types/                # Global TypeScript definitions
│   └── utils/                # General utility functions
│
└── scripts/                  # One-time operational scripts
```

### BE Module Internal Convention

Modules with ≥5 files use **sub-directory** layout:

```
modules/<domain>/
├── routes/                   # Express route definitions
│   └── <domain>.routes.ts
├── controllers/              # Request handlers (call services)
│   └── <domain>.controller.ts
├── services/                 # Business logic
│   └── <domain>.service.ts
├── models/                   # Domain-specific Knex models
│   └── <domain>.model.ts
├── schemas/                  # Zod validation schemas
│   └── <domain>.schemas.ts
└── index.ts                  # Barrel export (public API)
```

Small modules (≤4 files) keep **flat** layout:

```
modules/<domain>/
├── <domain>.controller.ts
├── <domain>.routes.ts
├── <domain>.service.ts
└── index.ts
```

**Flat modules**: `auth`, `dashboard`, `preview`, `system-tools`, `user-history`

## 4. Frontend Architecture (`fe/`)

The frontend follows a **feature-driven modular architecture** with clear separation between shared UI, domain features, and infrastructure.

```
fe/src/
├── app/                      # Application shell
│   ├── App.tsx               # Root component, router (uses Providers wrapper)
│   ├── Providers.tsx         # Composable provider wrapper (all context providers)
│   ├── routeConfig.ts        # Centralized route metadata (titles, feature IDs, layout)
│   └── contexts/             # React contexts (theme, auth, etc.)
│
├── features/                 # Domain feature modules (each is self-contained)
│   ├── ai/                   # AI tokenizer tools
│   ├── audit/                # Audit log viewer
│   ├── auth/                 # Login, register, auth flows
│   ├── broadcast/            # Broadcast management
│   ├── chat/                 # Chat sessions & conversations
│   ├── dashboard/            # Dashboard & analytics
│   ├── datasets/             # Dataset management
│   ├── glossary/             # Glossary management
│   ├── guideline/            # Guidelines & documentation
│   ├── histories/            # Browsing history
│   ├── knowledge-base/       # Knowledge base context
│   ├── landing/              # Landing page (public)
│   ├── llm-provider/         # LLM provider configuration
│   ├── projects/             # Project management
│   ├── search/               # AI search
│   ├── system/               # System settings & monitoring
│   ├── teams/                # Team management
│   └── users/                # User management
│
├── components/               # Shared UI components (design system)
│   ├── Dialog.tsx
│   ├── ConfirmDialog.tsx
│   ├── Select.tsx
│   ├── Checkbox.tsx
│   ├── RadioGroup.tsx
│   ├── MarkdownRenderer.tsx
│   ├── DocumentPreviewer/
│   ├── FilePreview/
│   └── ...
│
├── hooks/                    # Global reusable hooks
├── layouts/                  # Page shell wrappers
│   ├── MainLayout.tsx        # Shell composition (Sidebar + Header + Outlet)
│   ├── Sidebar.tsx           # Sidebar navigation (role-based, collapsible)
│   └── Header.tsx            # Page header (title from routeConfig, actions, source selectors)
├── lib/                      # Third-party library config (API client, socket)
├── i18n/                     # Internationalization (en, vi, ja)
├── utils/                    # Pure utility functions
├── main.tsx                  # Vite entry point
└── config.ts                 # Runtime configuration
```

### FE Feature Internal Convention

Each feature under `features/` MUST follow this standardized structure:

```
features/<domain>/
├── api/                      # Data access layer (separated into two files)
│   ├── <domain>Api.ts        # Raw HTTP calls — typed fetch wrappers (NO hooks here)
│   └── <domain>Queries.ts    # TanStack Query hooks (useQuery/useMutation wrappers)
├── components/               # Feature-specific UI components
├── hooks/                    # UI-only hooks (streaming, filters, form logic — NOT data-fetching)
├── pages/                    # Route-level page components
├── types/                    # Feature-specific TypeScript types
│   └── <domain>.types.ts
└── index.ts                  # Barrel export (public API)
```

#### API Layer Split (Critical Pattern)

The `api/` directory MUST contain two separate files with clear responsibilities:

| File | Responsibility | Contains |
|------|---------------|----------|
| `<domain>Api.ts` | Raw HTTP calls | Typed functions calling `api.get()`, `api.post()`, etc. No React hooks. |
| `<domain>Queries.ts` | TanStack Query hooks | `useQuery`/`useMutation` hooks that wrap the API functions. Cache invalidation logic. |

**`<domain>Api.ts`** template:
```typescript
import { api } from '@/lib/api'
import type { DomainItem } from '../types/domain.types'

/** @description Fetch all domain items */
export const domainApi = {
  list: async (): Promise<DomainItem[]> =>
    api.get<DomainItem[]>('/api/domain'),

  getById: async (id: string): Promise<DomainItem> =>
    api.get<DomainItem>(`/api/domain/${id}`),

  create: async (data: CreatePayload): Promise<DomainItem> =>
    api.post<DomainItem>('/api/domain', data),

  update: async (id: string, data: Partial<DomainItem>): Promise<DomainItem> =>
    api.put<DomainItem>(`/api/domain/${id}`, data),

  delete: async (id: string): Promise<void> =>
    api.delete(`/api/domain/${id}`),
}
```

**`<domain>Queries.ts`** template:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { domainApi } from './domainApi'

// ── Queries ──────────────────────────────────

/** @description Hook to fetch all domain items */
export function useDomainList() {
  return useQuery({
    queryKey: queryKeys.domain.list(),
    queryFn: () => domainApi.list(),
  })
}

/** @description Hook to fetch a single domain item by ID */
export function useDomainDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.domain.detail(id),
    queryFn: () => domainApi.getById(id),
    enabled: !!id,
  })
}

// ── Mutations ────────────────────────────────

/** @description Hook to create a new domain item */
export function useCreateDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: domainApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain.all })
    },
  })
}
```

#### `hooks/` Directory — UI Hooks Only

The `hooks/` directory is reserved for **non-data-fetching** hooks:
- Streaming hooks (`useChatStream.ts`, `useSearchStream.ts`)
- Filter/form state composition (`useAuditFilters.ts`)
- Browser API hooks (`useTts.ts`, `useTokenizer.ts`)
- Socket event subscriptions (`useConverterSocket.ts`)
- Context wrappers moved from `context/` folders

**NEVER** put `useQuery`/`useMutation` hooks in `hooks/`. They MUST go in `api/<domain>Queries.ts`.

#### Naming Conventions

| File Type | Naming Pattern | Example |
|-----------|---------------|---------|
| API service | `<domain>Api.ts` | `chatApi.ts`, `teamApi.ts` |
| Query hooks | `<domain>Queries.ts` | `chatQueries.ts`, `teamQueries.ts` |
| Types | `<domain>.types.ts` | `chat.types.ts`, `team.types.ts` |
| Pages | `<DomainAction>Page.tsx` | `ChatPage.tsx`, `TeamManagementPage.tsx` |
| Components | `<PascalCase>.tsx` | `ChatMessage.tsx`, `TeamCard.tsx` |
| UI hooks | `use<Purpose>.ts` | `useChatStream.ts`, `useAuditFilters.ts` |

**DO NOT** use `*Service.ts` naming for API files — always use `*Api.ts`.

#### Minimal Features (Exceptions)

Features with very few files (e.g., `ai/`, `landing/`, `auth/`) may omit empty directories. Only create subdirectories that contain files. The `api/` split into `*Api.ts` + `*Queries.ts` is still required if the feature fetches server data.

### FE Rules for New Features

- **New page**: Always add route metadata to `app/routeConfig.ts` (title, guideline ID, layout flags)
- **New provider**: Add it to `app/Providers.tsx` — never nest in App.tsx or other components
- **New sidebar nav**: Add it to `layouts/Sidebar.tsx` with proper role checks
- **Layout/header changes**: Modify `layouts/Header.tsx` or `layouts/Sidebar.tsx` — never modify `MainLayout.tsx` directly unless changing the shell composition
- **React Compiler**: The project uses `babel-plugin-react-compiler` — avoid manual `React.memo`, `useMemo`, `useCallback` unless profiling shows a specific need
- **No `context/` directories**: React contexts live in `hooks/` (e.g., `hooks/useMyContext.tsx`), NOT in a separate `context/` or `contexts/` folder
- **API file naming**: Always `<domain>Api.ts`, never `<domain>Service.ts`
- **Query hooks location**: All `useQuery`/`useMutation` hooks MUST be in `api/<domain>Queries.ts`, never in `hooks/`

## 5. Build & Dev Instructions

```bash
# Install all workspace dependencies
npm install

# Run all services (BE + FE + Worker)
npm run dev

# Run individual workspaces
npm run dev:be              # Backend only
npm run dev:fe              # Frontend only

# Build all workspaces
npm run build

# Production build
npm run build:prod

# Lint all workspaces
npm run lint

# Test all workspaces
npm run test
```

## 6. Coding Standards & Guidelines

### 6.1 General

- TypeScript strict mode
- Single quotes, no semicolons
- Use functional patterns where possible
- Add JSDoc headers to every function/class with `@param`, `@returns`, `@description`
- Add inline comments above every significant line of logic or control flow
- If changes are extensive, run `npm run build` to verify

### 6.2 NX-Style Module Boundary Rules

- **No cross-module imports**: Modules under `modules/` (BE) or `features/` (FE) must NOT import from each other directly. Use `shared/` services or event-driven patterns instead.
- **Barrel file exports**: Every module MUST have an `index.ts` that serves as its public API. External consumers import only from the barrel file.
- **No deep imports**: Never reach into `modules/<domain>/internal-file.ts` — always go through `modules/<domain>/index.ts`.
- **Shared libraries**: Cross-cutting code lives in `shared/` (BE) or `components/`, `hooks/`, `lib/`, `utils/` (FE).

### 6.3 Frontend Rules

- When adding a new page, implement locales for all HTML strings in `en`, `vi`, `ja`
- Always check and add theme support (dark and light) for new UI controls or pages
- The "Public API" Rule (Barrel Files): Avoid deep imports into feature internals
- Component Colocation: Keep files as close to their usage as possible
- UI Layer: Uses `ref` as a prop directly
- Feature Layer: Implements `useActionState` and `useFormStatus`
- Service Layer: Optimized for the `use` hook and Server Actions

### 6.4 Frontend State Management Rules

> Full conventions documented in `fe/STATE_MANAGEMENT.md`

#### State Type Decision Tree

| State Type | Solution | Example |
|---|---|---|
| Server data (API) | TanStack Query `useQuery` | User list, datasets, audit logs |
| Server mutations | TanStack Query `useMutation` | Create dataset, update role |
| User-triggered async | TanStack Query `useMutation` | Search submit, file upload |
| App-wide client state | React Context | Auth, theme, KB config |
| Feature-local UI state | `useState` | Modal open, form data, selected tab |
| URL-shareable state | `useSearchParams` / `useUrlState` | Filters, pagination |
| Real-time updates | Socket.IO + Query invalidation | File status, notifications |
| Streaming (SSE) | Imperative hooks (`useState` + `useRef`) | Chat stream, search stream |

#### Query Keys

- All query keys MUST be defined in `fe/src/lib/queryKeys.ts` (centralized factory)
- Never define local query key constants in hook files
- Use `queryClient.invalidateQueries({ queryKey: queryKeys.<feature>.all })` for cache invalidation after mutations

#### No Manual Memoization

- **DO NOT** use `useCallback`, `useMemo`, or `React.memo` — the project uses `babel-plugin-react-compiler` which handles memoization automatically
- **EXCEPTION**: Context provider `value` props may use `useMemo`/`useCallback` to prevent unnecessary subtree re-renders

#### Forms

- Use native `useState` for form data — **DO NOT** use Ant Design `Form.useForm()` or other form libraries
- Create typed form state objects with a `setField` helper pattern

#### Error Boundaries

- All feature routes in `App.tsx` MUST be wrapped with `<FeatureErrorBoundary>` from `@/components/ErrorBoundary`
- Auth/login routes are excluded

#### Socket Integration

- `useSocketQueryInvalidation()` in `Providers.tsx` auto-invalidates query caches on socket events
- New socket event → query key mappings go in `fe/src/hooks/useSocket.ts`
- Feature hooks should use `useSocketEvent()` for custom socket subscriptions

#### URL State for Filterable Views

- Pages with filters/pagination MUST store filter state in URL search params (not Context or useState)
- Use `useSearchParams` from react-router-dom or `useUrlState` from `@/hooks/useUrlState`
- This makes views bookmarkable and shareable

### 6.5 Backend Rules

- Node.js 22+ (ExpressJS)
- Implement **Factory Pattern** for all data schemas and interfaces in `shared/models/`
- Implement **Singleton Pattern** for all global services and utils
- New modules with ≥5 files must use the **sub-directory** layout (`routes/`, `controllers/`, `services/`, `models/`, `schemas/`, `index.ts`)
- Small modules (≤4 files) may use the **flat** layout (`<domain>.controller.ts`, `<domain>.routes.ts`, `<domain>.service.ts`, `index.ts`)
- All mutation routes (`POST`/`PUT`/`DELETE`) must use **Zod validation** via `validate()` middleware from `shared/middleware/validate.middleware.ts`
- **Cross-module imports** must go through barrel files (`@/modules/<domain>/index.js`), never deep imports
- **Same-module imports** may use direct paths within sub-directories (`./services/`, `./models/`, etc.)
- If changes impact the database, create a migration file in `be/src/shared/db/migrations/` named `yyyymmddhhmmss_<name>.ts` (e.g. `20260311130900_create_items.ts`). Use `npm run db:migrate:make <name>` to auto-generate the timestamp prefix.
- Always use Knex ORM for model files in `be/src/shared/models/`; raw SQL only when Knex ORM cannot support the query
