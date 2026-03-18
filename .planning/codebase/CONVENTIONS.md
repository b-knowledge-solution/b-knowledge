# Coding Conventions

## General Rules (All Workspaces)

- **TypeScript strict mode** — Both BE and FE
- **Single quotes, no semicolons** — Consistent formatting
- **ES Modules** — `"type": "module"` in all package.json
- **Functional patterns** — Prefer over OOP where practical
- **JSDoc/docstrings mandatory** — Every exported function/class/method

---

## Module Boundary Rules (NX-Style)

Applies to both `be/src/modules/` and `fe/src/features/`:

1. **No cross-module imports** — Modules must NOT import from each other. Use shared services or events.
2. **Barrel exports** — Every module has `index.ts` as its public API.
3. **No deep imports** — Never `modules/<domain>/internal-file.ts`, always `modules/<domain>/index.ts`.
4. **Shared code** — `shared/` (BE) or `components/`, `hooks/`, `lib/`, `utils/` (FE).

---

## Backend Conventions

### Path Aliases
- `@/*` → `./src/*` (resolved by `tsc-alias` in builds, `tsx` in dev)

### Config Access
- **Always** use `config` object from `@/shared/config/`
- **Never** use `process.env` directly

### Validation
- All POST/PUT/DELETE use Zod via `validate()` middleware
- `validate(schema)` — validates `req.body`
- `validate({ body, params, query })` — multiple targets
- Mutates `req.body` with parsed/coerced values

### Models
- All extend `BaseModel<T>` with CRUD methods
- Access via singleton `ModelFactory` (e.g., `ModelFactory.users`)
- Knex ORM only — raw SQL only when Knex can't express the query
- Transaction support via optional `trx` parameter

### Singleton Services
- All 16 shared services use singleton pattern
- Located in `be/src/shared/services/`
- Named `<purpose>.service.ts`

### Module Layout
- **≥5 files:** Sub-directories (`routes/`, `controllers/`, `services/`, `models/`, `schemas/`)
- **≤4 files:** Flat layout
- **Flat modules:** `auth`, `dashboard`, `preview`, `system-tools`, `user-history`

### Route Registration
- All routes registered in `be/src/app/routes.ts`
- Rate limiting: 1000/15min (general), 20/15min (auth)
- Health check at `GET /health` (outside `/api`)
- All API routes under `/api/*`

### Error Handling
- Express error middleware catches thrown errors
- Standard HTTP error classes (ConflictError, etc.)
- Graceful shutdown: SIGTERM/SIGINT close server, Redis, DB, Langfuse, SocketIO

### Documentation (BE)
```typescript
/**
 * @description Creates a new knowledge base and initializes its OpenSearch index
 * @param {CreateKnowledgeBaseDto} data - Config including name, model, chunk settings
 * @param {string} userId - Creating user's ID
 * @returns {Promise<KnowledgeBase>} Created knowledge base
 * @throws {ConflictError} If name already exists
 */
```
- JSDoc on every exported function, class, method, interface, type alias
- `@description`, `@param`, `@returns`, `@throws`
- Inline comments above control flow, business logic, DB queries, Redis ops

---

## Frontend Conventions

### API Layer Split (Critical)
| File | Contains | Never Contains |
|------|----------|----------------|
| `<domain>Api.ts` | `api.get()`, `api.post()` wrappers | React hooks |
| `<domain>Queries.ts` | `useQuery`/`useMutation` | Direct fetch calls |

**Never** use `*Service.ts` naming for API files.

### React Rules
- **No manual memoization** — `babel-plugin-react-compiler` handles it
- No `React.memo`, `useMemo`, `useCallback` (exception: context provider values)
- **Forms:** Native `useState`, no form libraries
- **Error boundaries:** All feature routes wrapped with `<FeatureErrorBoundary>`

### State Management
| State Type | Solution |
|---|---|
| Server data | TanStack Query `useQuery` |
| Server mutations | TanStack Query `useMutation` |
| App-wide client | React Context |
| Feature-local UI | `useState` |
| URL-shareable | `useSearchParams` / `useUrlState` |
| Real-time | Socket.IO + Query invalidation |
| Streaming (SSE) | `useState` + `useRef` |

### Query Keys
- All defined in `lib/queryKeys.ts` (centralized factory)
- Never define local query key constants

### Hooks
- `hooks/` — UI-only hooks (debounce, socket, URL state)
- `useQuery`/`useMutation` go in `api/<domain>Queries.ts`, NOT in `hooks/`
- No `context/` directories — contexts live in `hooks/` or `app/contexts/`

### i18n
- All UI strings in 3 locales: `en.json`, `vi.json`, `ja.json`
- New pages require translations in all 3 files

### Theming
- Dark mode: Class-based (`dark:` prefix in Tailwind)
- Always support both light and dark themes
- Brand primary: `#0D26CF`
- CSS variables in HSL format in `index.css`

### New Page Checklist
1. Add route metadata to `app/routeConfig.ts`
2. Add nav to `layouts/Sidebar.tsx` with role checks
3. Add i18n keys for all 3 locales
4. Wrap route with `<FeatureErrorBoundary>`

### Documentation (FE)
```typescript
/**
 * @description Sidebar nav item with role-based visibility and active state
 * @param {NavItemProps} props - Route path, icon, label, required roles
 * @returns {JSX.Element | null} Rendered nav link or null if unauthorized
 */
```

---

## Python Conventions (advance-rag, converter)

### General
- Shared `.venv` at project root for development
- Each module has own `pyproject.toml` for independent Docker builds
- **Loguru** for all logging (both modules)
- **Redis** for inter-service communication (queues, pub/sub, status)

### Documentation
- Google-style docstrings on every function, class, method
- `Args`, `Returns`, `Raises` sections
- Inline comments above control flow, ML logic, pipeline stages

```python
def search_vectors(self, query: list[float], index: str, top_k: int = 10) -> list[SearchHit]:
    """Search OpenSearch for nearest neighbors.

    Args:
        query: Dense vector from embedding model.
        index: OpenSearch index name.
        top_k: Max results.

    Returns:
        List of SearchHit with doc ID, score, content.

    Raises:
        OpenSearchError: If index missing or query fails.
    """
```

### advance-rag
- Derived from RAGFlow — follows RAGFlow conventions, not Node.js backend
- Peewee ORM (separate from Knex)
- Single tenant mode (fixed `SYSTEM_TENANT_ID`)
- 108 dependencies

### converter
- 7 dependencies (lightweight)
- LibreOffice required (system dependency)
- 2-second delay between files to avoid resource exhaustion
