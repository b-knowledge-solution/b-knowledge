# Frontend (React SPA)

React 19 / TypeScript 5.8 / Vite 7.3 / TanStack Query 5 / Tailwind CSS 3.4 / shadcn/ui

## Commands

```bash
npm run dev:fe              # Vite dev server (port 5173)
npm run build -w fe         # TypeScript check + Vite production build
npm run test -w fe          # Run unit + UI frontend tests
npm run test:run -w fe      # Single run for both test suites
npm run test:run:unit -w fe # Business-logic tests in Node
npm run test:run:ui -w fe   # UI/jsdom tests
npm run test:coverage -w fe # Istanbul coverage
npm run lint -w fe          # ESLint with React Compiler rules
```

## Architecture

```
fe/src/
├── app/
│   ├── App.tsx               # Root router + route definitions
│   ├── Providers.tsx         # Global provider stack (Auth → Settings → Guideline → Confirm → ...)
│   ├── routeConfig.ts        # Route metadata (titles, feature IDs, layout flags)
│   └── contexts/             # React contexts (theme, auth)
├── features/                 # Domain modules (17 total, self-contained)
├── components/               # Shared UI (shadcn/ui in components/ui/)
├── hooks/                    # Global UI-only hooks (NOT data-fetching)
├── layouts/                  # MainLayout, Sidebar, Header
├── lib/                      # api.ts, socket.ts, queryKeys.ts, utils.ts
├── i18n/                     # en.json, vi.json, ja.json
├── utils/                    # Pure utility functions
├── config.ts                 # Feature flags (VITE_ENABLE_*)
└── main.tsx                  # Entry: QueryClient + BrowserRouter + App
```

## Feature Module Convention

```
features/<domain>/
├── api/
│   ├── <domain>Api.ts        # Raw HTTP calls (NO hooks)
│   └── <domain>Queries.ts    # useQuery/useMutation hooks
├── components/               # Feature-specific UI
├── hooks/                    # UI-only hooks (streaming, filters, NOT data-fetching)
├── pages/                    # Route-level pages
├── types/
│   └── <domain>.types.ts
└── index.ts                  # Barrel export
```

### API Layer Split (Critical)

| File | Contains | Never contains |
|------|----------|---------------|
| `<domain>Api.ts` | `api.get()`, `api.post()` typed wrappers | React hooks |
| `<domain>Queries.ts` | `useQuery`/`useMutation` wrapping Api functions | Direct fetch calls |

### Naming

| Type | Pattern | Example |
|------|---------|---------|
| API service | `<domain>Api.ts` | `chatApi.ts` |
| Query hooks | `<domain>Queries.ts` | `chatQueries.ts` |
| Types | `<domain>.types.ts` | `chat.types.ts` |
| Pages | `<DomainAction>Page.tsx` | `ChatPage.tsx` |
| UI hooks | `use<Purpose>.ts` | `useChatStream.ts` |

**Never** use `*Service.ts` for API files.

## State Management

| State Type | Solution |
|---|---|
| Server data | TanStack Query `useQuery` |
| Server mutations | TanStack Query `useMutation` |
| App-wide client | React Context |
| Feature-local UI | `useState` |
| URL-shareable | `useSearchParams` / `useUrlState` |
| Real-time | Socket.IO + Query invalidation |
| Streaming (SSE) | `useState` + `useRef` imperative hooks |

Full conventions: `fe/STATE_MANAGEMENT.md`

### Query Keys
- All defined in `lib/queryKeys.ts` (centralized factory)
- Never define local query key constants
- Invalidate: `queryClient.invalidateQueries({ queryKey: queryKeys.<feature>.all })`

## Key Rules

- **No hardcoded string literals:** Never use bare strings in comparisons for statuses, model types, or domain states. Always use constants from `constants/`. See root `CLAUDE.md` "No Hardcoded String Literals" section for full rules.
- **No manual memoization:** `babel-plugin-react-compiler` handles it. No `React.memo`, `useMemo`, `useCallback` (exception: context provider values)
- **No `context/` directories:** Contexts live in `hooks/` (e.g., `hooks/useMyContext.tsx`)
- **No `useQuery` in `hooks/`:** Data-fetching hooks go in `api/<domain>Queries.ts`
- **Forms:** Native `useState` with typed form state, no form libraries
- **i18n:** All UI strings in `en.json`, `vi.json`, `ja.json` — 3 languages required for new pages
- **Dark mode:** Class-based (`dark:` prefix) — always support both themes
- **Error boundaries:** All feature routes wrapped with `<FeatureErrorBoundary>`
- **New page checklist:**
  1. Add route metadata to `app/routeConfig.ts`
  2. Add nav to `layouts/Sidebar.tsx` with role checks
  3. Add i18n keys for all 3 locales
  4. Wrap route with `<FeatureErrorBoundary>`

## Permission Gating: `<Can>` vs `useHasPermission` (Phase 4+)

### Decision tree: <Can> vs useHasPermission

Use `<Can I="action" a="Subject">` when you need CASL conditions — per-tenant, per-owner, or per-instance reasoning. The check operates against a specific subject instance or class with conditions.

Use `useHasPermission(PERMISSION_KEYS.X)` for flat catalog-key feature gates with no per-instance reasoning. Pure boolean: "does this user have permission X?"

```
Need to gate a UI element on permission?
├── Does the check depend on a specific resource instance (this KB, this doc)?
│   ├── YES → <Can I="update" a="KnowledgeBase" this={kb}>...</Can>
│   └── NO  → continue
├── Does the check depend on subject CLASS without an instance (any KB)?
│   ├── YES → <Can I="create" a="KnowledgeBase">...</Can>
│   └── NO  → continue
└── Flat capability check (e.g. "can submit feedback")?
    └── useHasPermission(PERMISSION_KEYS.FEEDBACK_SUBMIT)
```

### Examples

```tsx
// Instance check — CASL conditions evaluated against the specific KB
<Can I="delete" a="KnowledgeBase" this={kb}>
  <Button onClick={() => deleteKb(kb.id)}>Delete</Button>
</Can>

// Class check — "can the user create ANY knowledge base?"
<Can I="create" a="KnowledgeBase">
  <Button onClick={openCreateDialog}>New Knowledge Base</Button>
</Can>

// Flat capability check — no instance reasoning
const canCreateDataset = useHasPermission(PERMISSION_KEYS.DATASETS_CREATE)
if (!canCreateDataset) return null
```

### Hard rules

- **isAdmin prop drilling is banned.** Do not add `isAdmin?: boolean` props to components or thread booleans through the tree. Gate at the leaf with `<Can>` or `useHasPermission(PERMISSION_KEYS.X)` instead.
- **Bare string keys are banned in useHasPermission — always use PERMISSION_KEYS.X.** This honors the project-wide no-hardcoded-strings rule from root `CLAUDE.md`. Typos surface as TS errors at edit time, not at runtime.
- **Role-string comparisons (user.role === '...') are banned outside features/auth/.** The P4.5 ESLint rule enforces this; the only legal home for role string literals is `fe/src/features/auth/` and `fe/src/constants/roles.ts`.
- The `PERMISSION_KEYS` const is auto-generated from `fe/src/generated/permissions-catalog.json`. If you need a key that doesn't exist yet, regenerate the snapshot from the BE: `npm run permissions:export-catalog` from the root, then rebuild the FE so `permission-keys.ts` regenerates.

### Where the pieces live

| File | Provides |
|------|----------|
| `fe/src/lib/ability.tsx` | `<Can>`, `useAppAbility()`, `AbilityContext`, `AbilityProvider`, `Subjects` union |
| `fe/src/lib/permissions.tsx` | `useHasPermission(key)` flat-key hook |
| `fe/src/constants/permission-keys.ts` | `PERMISSION_KEYS` const map (AUTO-GENERATED — do not edit) |
| `fe/src/generated/permissions-catalog.json` | Committed snapshot exported from BE catalog |

## Documentation Comments (Mandatory)

All code MUST follow the root `CLAUDE.md` comment conventions. Summary:

- **JSDoc on every exported function, component, hook, interface, type alias** — `@description`, `@param`, `@returns`
- **Inline comments** above control flow, state logic, side effects, event handlers, guard clauses
- **Components:** Document what the component renders and its key behavioral aspects
- **Hooks:** Document state management intent, dependencies, and cleanup behavior
- **API files:** Document the endpoint called, expected payload shape, and error scenarios
- **Query hooks:** Document cache key strategy, invalidation triggers, and optimistic updates

```typescript
/**
 * @description Sidebar navigation item with role-based visibility and active state highlighting
 * @param {NavItemProps} props - Navigation config including route path, icon, label, and required roles
 * @returns {JSX.Element | null} Rendered nav link or null if user lacks required role
 */
export function NavItem({ path, icon, label, roles }: NavItemProps) {
  // Hide nav items the user doesn't have permission to access
  const { user } = useAuth()
  if (roles && !roles.includes(user.role)) return null

  // Match nested routes for active state (e.g., /datasets/* highlights Datasets nav)
  const isActive = useMatch(`${path}/*`)
  ...
}
```

## HTTP Client (`lib/api.ts`)

- Native fetch wrapper with credentials
- Auto 401 → redirect to `/login?redirect=<currentPath>`
- Methods: `api.get<T>()`, `api.post<T>()`, `api.put<T>()`, `api.delete()`
- Vite proxies `/api` to backend (port 3001)

## Socket.IO (`lib/socket.ts`)

- Singleton pattern via `getSocket()`
- Auto-reconnect (5 attempts, exponential backoff)
- `useSocketEvent(name, callback)` for subscriptions
- `useSocketQueryInvalidation()` in Providers.tsx maps events → query invalidation

## Build & Config

- **Vite code splitting:** vendor (React), i18n, ui (Lucide), tiktoken
- **shadcn/ui:** new-york style, slate base color, CSS variables
- **Path alias:** `@/*` → `src/*`
- **TypeScript:** Strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- **Design tokens:** CSS variables in `index.css` (HSL format), brand primary #0D26CF

## Testing

- **Runner:** Vitest with jsdom
- **Utils:** `renderWithProviders()`, `renderWithRouter()` in `tests/test-utils.tsx`
- **Mocks:** localStorage, matchMedia, ResizeObserver, IntersectionObserver, i18next, React Router
- **Test location:** `fe/tests/**/*.test.{ts,tsx}`

## Environment

Copy `fe/.env.example` → `fe/.env`. Key variables:

| Variable | Default | Notes |
|----------|---------|-------|
| `VITE_API_BASE_URL` | http://localhost:3001 | Backend API |
| `VITE_ENABLE_AI_CHAT` | true | Feature flag |
| `VITE_ENABLE_AI_SEARCH` | true | Feature flag |
| `VITE_ENABLE_HISTORY` | false | Feature flag |
| `HTTPS_ENABLED` | false | Dev HTTPS |

## Built-in Pipeline / Parsing Method Guidelines (AI Agent Rule)

When creating or adding any **new** built-in pipeline or document parser method (such as `Picture`, `Audio`, `Email`, etc.), you **MUST** include a unique sample file/image to be used for instructions in the UI. Do not reuse an existing image sample from another pipeline.
