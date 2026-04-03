# Coding Conventions

**Analysis Date:** 2026-03-23

## General Standards

**TypeScript Strict Mode (both BE and FE):**
- `strict: true` in all `tsconfig.json` files
- `noImplicitReturns: true` (BE only)
- `noFallthroughCasesInSwitch: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `noUnusedLocals: true` and `noUnusedParameters: true` (FE only)

**Module System:**
- All packages use `"type": "module"` (ESM throughout)
- Backend: `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- Frontend: `module: "ESNext"`, `moduleResolution: "bundler"`

**Quote Style:** Single quotes, no semicolons (enforced by convention, no Prettier config present)

**No Prettier:** No `.prettierrc` file exists in the project. Formatting is convention-based.

**No Husky / lint-staged:** No git hooks configured. No `.husky/` directory or lint-staged config.

**No .editorconfig:** Not present at project root.

## Linting

**Backend ESLint** (`be/eslint.config.js`):
- Flat config format (ESLint 9+)
- `@typescript-eslint/no-explicit-any`: off
- `@typescript-eslint/no-unused-vars`: off
- `no-unused-vars`: off
- `no-undef`: off

**Frontend ESLint** (`fe/eslint.config.js`):
- Flat config format
- React Compiler plugin: `react-compiler/react-compiler: "warn"`
- React Hooks rules: recommended
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: warn (ignores `_` prefixed)
- `react/react-in-jsx-scope`: off

**Run linting:**
```bash
npm run lint -w be    # Backend
npm run lint -w fe    # Frontend
npm run lint          # All workspaces
```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| **TS files (BE)** | kebab-case with domain suffix | `agent.service.ts`, `agent.controller.ts`, `agent.model.ts` |
| **TS files (FE pages)** | PascalCase | `AgentCanvasPage.tsx`, `MemoryListPage.tsx` |
| **TS files (FE components)** | PascalCase | `AgentCard.tsx`, `NodeConfigPanel.tsx` |
| **TS files (FE API)** | camelCase with domain prefix | `agentApi.ts`, `agentQueries.ts` |
| **TS files (FE types)** | kebab-case with `.types` suffix | `agent.types.ts`, `memory.types.ts` |
| **TS files (FE hooks)** | camelCase with `use` prefix | `useAgentCanvas.ts`, `useAgentDebug.ts` |
| **TS files (FE store)** | camelCase with `Store` suffix | `canvasStore.ts` |
| **Python files** | snake_case | `task_executor.py`, `base_tool.py` |
| **Test files (BE)** | kebab-case with `.test.ts` | `agent.service.test.ts` |
| **Test files (FE unit)** | PascalCase/camelCase with `.test.tsx` | `AgentCard.test.tsx`, `agentApi.test.ts` |
| **Test files (FE E2E)** | kebab-case with `.spec.ts` | `agent-crud.spec.ts` |
| **Test files (Python)** | `test_` prefix, snake_case | `test_agent_tools.py` |
| **Functions/methods** | camelCase | `listAgents`, `createKnowledgeBase` |
| **React components** | PascalCase | `AgentCard`, `DebugPanel` |
| **Types/Interfaces** | PascalCase | `Agent`, `CreateAgentDto`, `AgentDSL` |
| **Zod schemas** | camelCase with `Schema` suffix | `createAgentSchema`, `agentIdParamSchema` |
| **Database tables** | snake_case | `agent`, `agent_run`, `chat_session` |
| **Routes** | kebab-case, plural nouns | `/api/agents`, `/api/agents/:id/versions` |
| **Barrel exports** | `index.ts` | Every module/feature has one |
| **Python classes** | PascalCase | `BaseTool`, `TavilyTool` |
| **Python functions** | snake_case | `chunk_document`, `search_vectors` |
| **Env vars** | UPPER_SNAKE_CASE | `DB_HOST`, `REDIS_PORT` |

## Path Aliases

**Backend:** `@/*` maps to `./src/*` (configured in `be/tsconfig.json`, resolved at build by `tsc-alias`)

**Frontend:** `@/*` maps to `./src/*` (configured in `fe/tsconfig.json`, resolved by Vite alias in `fe/vite.config.ts`)

## Import Organization

**Backend pattern:**
1. Node.js built-ins / external packages (Express, Knex, Zod)
2. Shared imports (`@/shared/...`)
3. Same-module relative imports (`./services/...`, `./models/...`)

**Frontend pattern:**
1. React and external packages
2. Shared imports (`@/lib/...`, `@/components/...`, `@/hooks/...`)
3. Feature-internal imports (`../types/...`, `./agentApi`)

**Critical import rules:**
- Cross-module imports MUST go through barrel `index.ts` files
- Never deep-import from another module's internal files
- Backend barrel imports use `.js` extension (NodeNext resolution): `from './services/agent.service.js'`
- Frontend imports omit extensions (bundler resolution)

## Documentation Comments (Mandatory)

**TypeScript (BE + FE): JSDoc on every exported symbol.**

Required tags:
| Tag | When |
|-----|------|
| `@description` | Always |
| `@param` | Every parameter |
| `@returns` | Every non-void function |
| `@throws` | If function throws |
| `@example` | Complex utilities |

Also required: `@fileoverview` at the top of every file.

Example pattern from `be/src/modules/agents/controllers/agent.controller.ts`:
```typescript
/**
 * @description GET /agents — List agents with optional filters and pagination.
 *   Requires authentication and tenant context.
 * @param {Request} req - Express request with query params
 * @param {Response} res - Express response
 * @returns {Promise<void>}
 */
async listAgents(req: Request, res: Response): Promise<void> { ... }
```

**Python: Google-style docstrings on every function/class.**

Required sections: summary line, `Args`, `Returns`, `Raises`.

**Inline comments are mandatory** above:
- Control flow (`if`/`else`, `switch`, loops)
- Business logic and domain rules
- Database queries, Redis operations, API calls
- Guard clauses and early returns
- Non-obvious code, workarounds, regex

## Backend Conventions

### Module Layout

**>=5 files -> sub-directory layout:**
```
modules/<domain>/
  routes/<domain>.routes.ts
  controllers/<domain>.controller.ts
  services/<domain>.service.ts
  models/<domain>.model.ts
  schemas/<domain>.schemas.ts
  index.ts
```

**<=4 files -> flat layout:**
```
modules/<domain>/
  <domain>.controller.ts
  <domain>.routes.ts
  <domain>.service.ts
  index.ts
```

Flat modules: `auth`, `dashboard`, `preview`, `system-tools`, `user-history`

### Model Pattern (Factory + BaseModel)

All models extend `BaseModel<T>` providing standard CRUD: `create`, `findById`, `findAll`, `update`, `delete`. Transaction support via optional `trx` parameter.

Access models via the singleton `ModelFactory` in `be/src/shared/models/factory.ts`:
```typescript
import { ModelFactory } from '@/shared/models/factory.js'
const agent = await ModelFactory.agent.findById(id)
```

Base class in `be/src/shared/models/base.model.ts`.

### Service Pattern (Singleton)

Services are instantiated once and exported as named singletons:
```typescript
class AgentService { /* ... */ }
export const agentService = new AgentService()
```

### Controller Pattern (Class with methods)

Controllers are classes with async methods matching routes. Each method:
- Extracts tenant/user from middleware-injected request properties
- Delegates to service layer
- Handles errors with try/catch and status codes
```typescript
class AgentController {
  async listAgents(req: Request, res: Response): Promise<void> { /* ... */ }
}
export const agentController = new AgentController()
```

### Validation

All mutation routes (POST/PUT/DELETE) use Zod via `validate()` middleware from `be/src/shared/middleware/validate.middleware.ts`:
```typescript
router.post('/', requireAuth, validate(createAgentSchema), controller.create.bind(controller))
// Multi-target validation:
router.put('/:id', requireAuth, validate({ params: idSchema, body: updateSchema }), controller.update.bind(controller))
```

Schemas live in `be/src/modules/<domain>/schemas/<domain>.schemas.ts`.

### Error Handling

Controllers use try/catch with service-level `statusCode` on errors:
```typescript
catch (error: any) {
  const status = error.statusCode || 500
  res.status(status).json({ error: error.message || 'Failed to ...' })
}
```

### Config

Access environment config ONLY through the `config` object from `@/shared/config/`, never `process.env` directly.

### Database

- Knex ORM for all operations; raw SQL only when Knex cannot express the query
- Migrations via `npm run db:migrate:make <name>` (generates `YYYYMMDDhhmmss_<name>.ts`)
- All DB schema changes go through Knex migrations, even for tables used by Python Peewee ORM
- Migration files in `be/src/shared/db/migrations/`

## Frontend Conventions

### API Layer Split (Critical)

Two files per feature domain:

| File | Contains | Never contains |
|------|----------|---------------|
| `<domain>Api.ts` | Raw `api.get()`, `api.post()` typed wrappers | React hooks |
| `<domain>Queries.ts` | `useQuery`/`useMutation` wrapping Api functions | Direct fetch calls |

Example: `fe/src/features/agents/api/agentApi.ts` + `fe/src/features/agents/api/agentQueries.ts`

Never name API files `*Service.ts`.

### HTTP Client

`fe/src/lib/api.ts` provides a fetch wrapper with:
- Automatic credentials (cookies)
- 401 -> redirect to `/login?redirect=<path>`
- Typed methods: `api.get<T>()`, `api.post<T>()`, `api.put<T>()`, `api.delete()`
- Custom `AuthenticationError` class for auth failures

### Query Keys

All defined centrally in `fe/src/lib/queryKeys.ts` as a typed factory object with `as const`. Never define local query key constants.
```typescript
import { queryKeys } from '@/lib/queryKeys'
queryKey: queryKeys.agents.list(filters)
queryKey: queryKeys.agents.detail(id)
```

Invalidation pattern:
```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
```

### State Management

| State Type | Solution |
|------------|----------|
| Server data | TanStack Query `useQuery` |
| Mutations | TanStack Query `useMutation` |
| App-wide client | React Context |
| Feature-local UI | `useState` |
| URL-shareable | `useSearchParams` / `useUrlState` |
| Real-time | Socket.IO + Query invalidation |
| Streaming (SSE) | `useState` + `useRef` imperative hooks |

### No Manual Memoization

React Compiler (`babel-plugin-react-compiler` in `fe/vite.config.ts`) handles memoization. Do NOT use `React.memo`, `useMemo`, or `useCallback` (exception: context provider values).

### Forms

Use native `useState` with typed form state. No form libraries (no Formik, no React Hook Form).

### i18n

All UI strings in 3 locale files:
- `fe/src/i18n/locales/en.json`
- `fe/src/i18n/locales/vi.json`
- `fe/src/i18n/locales/ja.json`

New pages MUST add keys for all 3 locales.

### Dark Mode

Class-based (`dark:` prefix in Tailwind). Always support both themes.

### Component Library

shadcn/ui components in `fe/src/components/ui/`. New-york style, slate base color, CSS variables (HSL).

### Feature Module Structure

```
features/<domain>/
  api/<domain>Api.ts
  api/<domain>Queries.ts
  components/
  hooks/            # UI-only hooks (NOT data-fetching)
  pages/
  types/<domain>.types.ts
  store/            # Zustand stores if needed
  index.ts          # Barrel export
```

### Hooks Directory Rules

- `hooks/` directory: UI-only hooks (streaming, filters, local state)
- `api/<domain>Queries.ts`: data-fetching hooks (useQuery/useMutation)
- Never put `useQuery` in `hooks/`

### Routing

- Routes defined in `fe/src/app/App.tsx`
- Route metadata in `fe/src/app/routeConfig.ts`
- Navigation in `fe/src/layouts/Sidebar.tsx` with role checks
- All feature routes wrapped with `<FeatureErrorBoundary>`

## Python Conventions

### Code Style

- Google-style docstrings (mandatory)
- Loguru for logging (`from loguru import logger`)
- Type hints on all function signatures
- Peewee ORM for database models (separate from BE Knex models, same DB)

### Dependencies

- Shared `.venv` at project root for development
- Each module (`advance-rag/`, `converter/`) has own `pyproject.toml` for Docker builds
- Heavy dependency tree (108+ packages for advance-rag)

### Error Handling

- `try/except` with specific exception types
- Retry patterns via `tenacity` library
- Redis pub/sub for progress reporting back to Node.js backend

## Git Conventions

**Branch naming:** Feature branches like `feature/rag-core`, `feature/<description>`

**Commit message format:** Conventional commits style:
```
feat: <description>
fix(<scope>): <description>
docs(<scope>): <description>
```

**No automated enforcement:** No commitlint, no husky hooks.

---

*Convention analysis: 2026-03-23*
