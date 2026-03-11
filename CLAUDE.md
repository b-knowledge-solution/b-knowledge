# CLAUDE.md - AI Assistant Guide for Knowledge Base

## Project Overview

RAGFlow Simple UI is an enterprise management portal for RAGFlow AI engine. It provides AI Chat, AI Search, knowledge base management, team/user administration, and observability — with Azure Entra ID SSO, RBAC, i18n (en/vi/ja), and dark/light theming.

## Architecture

**Monorepo** using npm workspaces with two packages:

```
├── be/          # Backend: Express.js + TypeScript (Port 3001)
├── fe/          # Frontend: React 19 + Vite + Tailwind (Port 5173)
├── docker/      # Docker Compose (PostgreSQL, Redis, Backend, Nginx)
├── docs/        # Technical documentation
├── scripts/     # Dev utilities (cert generation, glossary samples)
└── package.json # Root workspace config
```

**Tech Stack:**
- **Backend**: Express.js, TypeScript (strict), Knex.js ORM, PostgreSQL, Redis, Winston logging, Socket.IO, MinIO/S3
- **Frontend**: React 19, Vite, Ant Design, Tailwind CSS, React Query (TanStack), React Router, i18next
- **Auth**: Azure Entra ID (OAuth2/OpenID Connect)
- **Observability**: Langfuse integration
- **Node.js**: 22+ required

## Quick Reference Commands

```bash
npm install              # Install all workspace dependencies
npm run dev              # Run BE + FE concurrently
npm run dev:be           # Backend only (tsx watch, port 3001)
npm run dev:fe           # Frontend only (vite, port 5173)
npm run build            # Production build (both workspaces)
npm run build:prod       # Optimized build without source maps
npm run lint             # ESLint across all workspaces
npm run test             # Vitest across all workspaces
```

**Backend-specific:**
```bash
npm run test -w be             # Run BE tests (vitest run)
npm run test:watch -w be       # Watch mode
npm run test:coverage -w be    # Coverage report
npm run lint -w be             # Lint BE
npm run db:migrate -w be       # Run DB migrations
npm run db:migrate:make -w be  # Create new migration
npm run db:migrate:rollback -w be  # Rollback last migration
npm run db:seed -w be          # Run database seeds
```

**Frontend-specific:**
```bash
npm run test -w fe         # Run FE tests (vitest)
npm run test:run -w fe     # Single run
npm run lint -w fe         # Lint FE
npm run build -w fe        # Build FE only
```

## Backend Structure (`be/src/`)

### Modular Architecture
```
be/src/
├── app/                    # Express app entry point & route registration
│   ├── index.ts            # Server bootstrap
│   └── routes.ts           # Centralized route mounting under /api
├── modules/                # Feature modules (domain-driven)
│   ├── admin/              # Admin dashboard & history management
│   ├── audit/              # Audit logging for compliance
│   ├── auth/               # Azure Entra ID authentication
│   ├── broadcast/          # System-wide announcements
│   ├── chat/               # AI Chat sessions & message history
│   ├── dashboard/          # Admin analytics dashboard
│   ├── external/           # External API integrations
│   ├── glossary/           # Glossary/keyword management
│   ├── knowledge-base/     # Knowledge base source management
│   ├── preview/            # Document preview
│   ├── system-tools/       # System diagnostics & health
│   ├── teams/              # Multi-tenant team management
│   ├── user-history/       # User activity history
│   └── users/              # User CRUD & role management
├── shared/                 # Cross-cutting concerns
│   ├── config/             # App config, RBAC definitions, file upload config
│   ├── db/                 # Knex instance, migrations, seeds, adapters
│   ├── middleware/          # Auth middleware (requireAuth)
│   ├── models/             # BaseModel (CRUD), ModelFactory (singletons)
│   ├── services/           # Logger, Redis, Langfuse, Socket.IO, Cron, Queue
│   ├── types/              # Global TS type declarations
│   └── utils/              # Helper utilities
└── scripts/                # One-time scripts (migrations, seeds, debug)
```

### Module Convention
Each module follows the pattern:
```
modules/<name>/
├── index.ts                # Barrel export
├── <name>.routes.ts        # Express Router with route definitions
├── <name>.controller.ts    # Request handlers (req/res logic)
├── <name>.service.ts       # Business logic (stateless functions)
└── <name>.model.ts         # Knex-based data model extending BaseModel
```

### Key Backend Patterns

**Model Factory (Singleton):** Access models via `ModelFactory`:
```typescript
import { ModelFactory } from '@/shared/models/factory.js'
const user = await ModelFactory.user.findById(id)
```

**BaseModel:** All models extend `BaseModel<T>` which provides `create()`, `findById()`, `findAll()`, `update()`, `delete()`, and `getKnex()`. Use Knex ORM — avoid raw SQL unless Knex cannot express the query.

**Config Access:** Use the centralized `config` object from `@/shared/config/index.ts` — never access `process.env` directly.

**Path Aliases:** `@/*` maps to `./src/*` (via tsconfig paths + tsc-alias).

**RBAC:** Three roles — `admin`, `leader`, `user`. Permissions checked via `hasPermission(role, permission)` from `@/shared/config/rbac.ts`.

**API Routes:** All routes mounted under `/api` prefix. Health check at `/health`.

### Database Migrations
- Located in `be/src/shared/db/migrations/`
- Created with `npm run db:migrate:make -w be`
- Naming: `YYYYMMDD_description.ts`
- Always create migration files for schema changes

## Frontend Structure (`fe/src/`)

```
fe/src/
├── app/                    # App entry, contexts (SettingsContext)
│   ├── App.tsx             # Root component with route definitions
│   └── contexts/           # React Context providers
├── assets/                 # Static files (images, fonts)
├── components/             # Shared UI components (Dialog, Select, Markdown, etc.)
├── config.ts               # Frontend feature flags and configuration
├── features/               # Domain-driven feature modules
│   ├── ai/                 # AI Chat & Search pages, Tokenizer
│   ├── audit/              # Audit log viewer
│   ├── auth/               # Login/Logout, AuthProvider, ProtectedRoute
│   ├── broadcast/          # Broadcast message management
│   ├── dashboard/          # Admin analytics dashboard
│   ├── glossary/           # Glossary management
│   ├── guideline/          # User guidelines
│   ├── histories/          # Admin history viewer
│   ├── history/            # User chat/search history
│   ├── knowledge-base/     # KB configuration
│   ├── system/             # System tools & monitor
│   ├── teams/              # Team management
│   └── users/              # User management
├── hooks/                  # Global hooks (useDebounce)
├── i18n/                   # i18next config + locale files (en.json, vi.json, ja.json)
├── layouts/                # MainLayout shell wrapper
├── lib/                    # API client (axios), Socket.IO client
└── utils/                  # Pure utility helpers
```

### Key Frontend Patterns

**Data Fetching:** React Query (TanStack) with typed fetchers:
```typescript
const { data, isLoading } = useQuery({ queryKey: ['key'], queryFn: fetchFn })
```

**Routing:** React Router v7 with lazy-loaded pages (code splitting). Protected routes via `<ProtectedRoute>`, admin routes via `<AdminRoute>`, role-based via `<RoleRoute allowedRoles={[...]}>`.

**Styling:** Tailwind CSS utility classes + Ant Design components. Support both light and dark themes.

**i18n:** All user-facing strings must be localized in all three locales (`en.json`, `vi.json`, `ja.json`). Use `useTranslation()` hook.

**Barrel Files:** Each feature exports through `index.ts`. Avoid deep imports into another feature's internals.

**Path Aliases:** `@/*` maps to `src/*`.

## Coding Standards

### General
- TypeScript **strict mode** enabled in both workspaces
- `noUncheckedIndexedAccess` — always handle `undefined` for indexed access
- `exactOptionalPropertyTypes` — be precise with optional vs undefined
- Single quotes, no semicolons (configured in ESLint)
- Functional patterns preferred
- ESM modules (`"type": "module"` in both packages)

### Documentation
- Add JSDoc headers (`@param`, `@returns`, `@description`) to every function/class
- Add inline comments above significant logic or control flow

### Backend-Specific
- Use **Factory Pattern** for models (via `ModelFactory`)
- Use **Singleton Pattern** for global services and utils
- Always use Knex ORM for database queries
- Create migration files for any database schema changes
- Import paths must include `.js` extension (ESM requirement)

### Frontend-Specific
- New pages must include i18n translations for en, vi, ja
- New UI components must support dark and light themes
- Use barrel files — avoid deep imports across features
- Keep component files colocated with their feature
- Lazy-load page components for code splitting

## Testing

- **Framework:** Vitest (both BE and FE)
- **FE extras:** @testing-library/react, jsdom, Playwright (e2e)
- Run all tests: `npm run test`
- Run with coverage: `npm run test:coverage -w be` or `npm run test:coverage -w fe`
- Tests live alongside source files or in `__tests__` directories

## Environment Configuration

- Copy `be/.env.example` to `be/.env` and fill in credentials
- `.env` files are gitignored — never commit secrets
- Backend config JSON files (`be/src/config/*.json`) are also gitignored

## Docker Deployment

Docker Compose in `docker/` provides:
- **PostgreSQL 17** (Alpine) — primary database
- **Redis 7** (Alpine) — session store & rate limiting
- **Backend** — Express app container
- **Nginx** — reverse proxy (config in `docker/nginx/`)

Start with: `docker compose -f docker/docker-compose.yml up`

## CI/CD

GitHub Actions workflow (`.github/workflows/buid-ci.yml`):
- Triggers on push/PR to `main`
- Node.js 22.x
- Runs `npm ci` and `npm run build`
- Tests are currently commented out in CI

## Important Rules

- Do **not** auto-generate documentation files after completing tasks
- Follow existing code patterns strictly — match the style of surrounding code
- Request user confirmation before creating new files
- Never commit `.env` files or credentials
- Always verify builds pass after significant changes: `npm run build`
