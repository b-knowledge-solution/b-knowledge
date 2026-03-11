# CLAUDE.md - AI Assistant Guide for B-Knowledge

## Project Overview

B-Knowledge is an open-source enterprise UI to centralize and manage AI Search, Chat, and Knowledge Base. Built as an **NX-style modular monorepo** using npm workspaces with four services: a Node.js backend, React frontend, Python RAG task executor, and Python document converter.

- **Backend**: Node.js 22+ / Express.js / TypeScript (strict)
- **Frontend**: React 19 / Vite / TypeScript
- **RAG Worker**: Python 3.11 (advance-rag) — document parsing, chunking, vector indexing
- **Converter**: Python (converter) — Office-to-PDF conversion via LibreOffice

## Architecture

```
root/
├── be/                # Backend: Express + TypeScript (Port 3001)
├── fe/                # Frontend: React 19 + Vite + Tailwind (Port 5173)
├── advance-rag/       # Python RAG task executor (document parsing & indexing)
├── converter/         # Python document converter (Office → PDF)
├── docker/            # Docker Compose (PostgreSQL, Valkey, OpenSearch, RustFS, App services)
├── docs/              # Technical documentation
├── scripts/           # Root-level setup & utility scripts
├── samples/           # Sample data files
└── package.json       # Root workspace config (npm workspaces: be, fe)
```

**Tech Stack:**
- **Backend**: Express.js, TypeScript (strict), Knex.js ORM, Zod validation, PostgreSQL, Valkey/Redis, Winston logging, Socket.IO, OpenAI SDK, OpenSearch
- **Frontend**: React 19, Vite, Radix UI + Tailwind CSS, React Query (TanStack), React Table, React Router v7, React Hook Form, i18next, Recharts, babel-plugin-react-compiler
- **Storage**: RustFS / MinIO / S3-compatible object storage
- **Vector DB**: OpenSearch 3.x (for RAG chunks)
- **Auth**: Azure Entra ID (OAuth2/OpenID Connect)
- **Observability**: Langfuse integration

## Quick Reference Commands

```bash
npm install              # Install all workspace dependencies
npm run dev              # Run BE + FE + Worker + Converter concurrently
npm run dev:be           # Backend only (tsx watch, port 3001)
npm run dev:fe           # Frontend only (vite, port 5173)
npm run dev:worker       # RAG task executor (waits for backend)
npm run dev:converter    # Document converter (waits for backend)
npm run build            # Production build (both workspaces)
npm run build:prod       # Optimized build without source maps
npm run lint             # ESLint across all workspaces
npm run test             # Vitest across all workspaces
```

**Setup scripts:**
```bash
npm run setup            # Full project setup (Node + Python environments)
npm run setup:python     # Setup Python virtual environment
npm run setup:worker     # Setup advance-rag worker
npm run setup:converter  # Setup converter worker
```

**Docker:**
```bash
npm run docker:base      # Start infrastructure only (PostgreSQL, Valkey, OpenSearch, RustFS)
npm run docker:down      # Stop infrastructure
npm run docker:up        # Start all services (infra + app) with build
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

### Domain-Driven Modular Architecture

```
be/src/
├── app/                    # Express app entry point & route registration
│   ├── index.ts            # Server bootstrap with middleware setup
│   └── routes.ts           # Centralized route mounting under /api
├── modules/                # Feature modules (each self-contained)
│   ├── admin/              # Admin dashboard & history management
│   ├── audit/              # Audit logging for compliance
│   ├── auth/               # Azure Entra ID authentication
│   ├── broadcast/          # System-wide announcements
│   ├── chat/               # Chat sessions, messages, dialogs & conversations
│   ├── dashboard/          # Admin analytics dashboard
│   ├── external/           # External API integrations (RAGFlow, Langfuse)
│   ├── glossary/           # Glossary/keyword management
│   ├── knowledge-base/     # Knowledge base source management
│   ├── llm-provider/       # LLM/AI model provider configuration
│   ├── preview/            # Document preview generation
│   ├── rag/                # RAG pipeline orchestration (datasets, documents, versions, search, upload)
│   ├── search/             # Search app management & access control
│   ├── sync/               # Data sync connectors (Notion, S3, Web Crawl)
│   ├── system-tools/       # System diagnostics & health
│   ├── teams/              # Multi-tenant team management
│   ├── user-history/       # User activity history
│   └── users/              # User CRUD & role management
├── shared/                 # Cross-cutting concerns
│   ├── config/             # App config, RBAC definitions, file upload config
│   ├── db/                 # Knex instance, migrations, seeds, adapters
│   ├── middleware/          # Auth, validation (Zod), logging, error handling
│   ├── models/             # BaseModel (CRUD), ModelFactory (singletons)
│   ├── services/           # Logger, Redis, Langfuse, Socket.IO, Cron, Queue
│   ├── types/              # Global TS type declarations
│   └── utils/              # Helper utilities
└── scripts/                # One-time scripts (migrations, seeds, debug)
```

### Module Convention

**Modules with 5+ files** use sub-directory layout:
```
modules/<domain>/
├── routes/               # Express route definitions
│   └── <domain>.routes.ts
├── controllers/          # Request handlers (call services)
│   └── <domain>.controller.ts
├── services/             # Business logic
│   └── <domain>.service.ts
├── models/               # Domain-specific Knex models
│   └── <domain>.model.ts
├── schemas/              # Zod validation schemas
│   └── <domain>.schemas.ts
└── index.ts              # Barrel export (public API)
```

**Small modules (4 or fewer files)** use flat layout:
```
modules/<domain>/
├── <domain>.controller.ts
├── <domain>.routes.ts
├── <domain>.service.ts
└── index.ts
```

Flat modules: `auth`, `dashboard`, `preview`, `system-tools`, `user-history`

### API Routes

All routes mounted under `/api` prefix. Health check at `/health` (outside `/api`).

```
/api/auth                 # Authentication (Azure AD, root login)
/api/knowledge-base       # KB source management
/api/admin                # Admin operations
/api/admin/history        # Admin audit history
/api/admin/dashboard      # Dashboard metrics
/api/users                # User management
/api/user/history         # User search/chat history
/api/teams                # Team management
/api/system-tools         # System health & diagnostics
/api/audit                # Audit logs
/api/external             # External integrations
/api/broadcast-messages   # Announcements
/api/chat                 # Chat history, conversations, dialogs
/api/search               # Search app management
/api/glossary             # Glossary management
/api/rag                  # RAG pipeline (datasets, documents, uploads, versions)
/api/llm-provider         # LLM provider configuration
/api/sync                 # Data sync connectors
```

### Key Backend Patterns

**Model Factory (Singleton):** Access models via `ModelFactory`:
```typescript
import { ModelFactory } from '@/shared/models/factory.js'
const user = await ModelFactory.user.findById(id)
```

**BaseModel:** All models extend `BaseModel<T>` providing `create()`, `findById()`, `findAll()`, `update()`, `delete()`, and `getKnex()`. Use Knex ORM — avoid raw SQL unless Knex cannot express the query.

**Zod Validation:** All mutation routes (`POST`/`PUT`/`DELETE`) must use Zod schemas via `validate()` middleware from `shared/middleware/validate.middleware.ts`.

**Config Access:** Use the centralized `config` object from `@/shared/config/index.ts` — never access `process.env` directly.

**Path Aliases:** `@/*` maps to `./src/*` (via tsconfig paths + tsc-alias).

**RBAC:** Three roles — `admin`, `leader`, `user`. Permissions checked via `hasPermission(role, permission)` from `@/shared/config/rbac.ts`.

**NX-Style Module Boundaries:**
- No cross-module imports — modules must NOT import from each other directly
- Cross-module imports must go through barrel files (`@/modules/<domain>/index.js`)
- Same-module imports may use direct paths (`./services/`, `./models/`)
- Use `shared/` services or event-driven patterns for cross-cutting concerns

### Database Migrations

- Located in `be/src/shared/db/migrations/`
- Created with `npm run db:migrate:make -w be`
- Naming: `YYYYMMDD_description.ts`
- Always create migration files for schema changes
- Key migrations: initial schema, glossary, RAG tables, search/chat tables, sync tables, document versions

## Frontend Structure (`fe/src/`)

```
fe/src/
├── app/                    # Application shell
│   ├── App.tsx             # Root component with route definitions
│   ├── Providers.tsx       # Composable provider wrapper (all context providers)
│   ├── routeConfig.ts      # Centralized route metadata (titles, guideline IDs, layout)
│   └── contexts/           # React Context providers (Settings, Auth, etc.)
├── assets/                 # Static files (images, fonts)
├── components/             # Shared UI components (Radix-based: Dialog, Select, etc.)
│   ├── DocumentPreviewer/  # Document preview components
│   ├── FilePreview/        # File preview components
│   └── ...                 # ConfirmDialog, MarkdownRenderer, ErrorPage, etc.
├── config.ts               # Frontend feature flags and runtime configuration
├── features/               # Domain-driven feature modules
│   ├── ai/                 # AI Chat, Search, Tokenizer, Chat Dialog & Search App management
│   ├── audit/              # Audit log viewer
│   ├── auth/               # Login/Logout, AuthProvider, ProtectedRoute, AdminRoute, RoleRoute
│   ├── broadcast/          # Broadcast message management
│   ├── dashboard/          # Admin analytics dashboard (Recharts)
│   ├── datasets/           # Dataset management (cards, documents, versions, file uploads)
│   ├── glossary/           # Glossary management
│   ├── guideline/          # User guidelines / onboarding (React Joyride)
│   ├── histories/          # Admin history viewer
│   ├── history/            # User chat/search history
│   ├── knowledge-base/     # KB configuration
│   ├── system/             # System tools & monitor
│   ├── teams/              # Team management
│   └── users/              # User management
├── hooks/                  # Global hooks (useDebounce)
├── i18n/                   # i18next config + locale files (en.json, vi.json, ja.json)
├── layouts/                # Page shell wrappers
│   ├── MainLayout.tsx      # Shell composition (Sidebar + Header + Outlet)
│   ├── Sidebar.tsx         # Sidebar navigation (role-based, collapsible)
│   └── Header.tsx          # Page header (title from routeConfig, actions)
├── lib/                    # API client (axios), Socket.IO client
└── utils/                  # Pure utility helpers
```

### FE Feature Convention

Each feature under `features/` MUST follow this pattern:
```
features/<domain>/
├── api/                  # API calls (TanStack Query hooks or raw api calls)
├── components/           # Feature-specific UI components
├── hooks/                # Feature-specific hooks
├── pages/                # Route-level page components
├── types/                # Feature-specific TypeScript types
└── index.ts              # Barrel export (public API)
```

### FE Rules for New Features

- **New page**: Always add route metadata to `app/routeConfig.ts` (title, guideline ID, layout flags)
- **New provider**: Add it to `app/Providers.tsx` — never nest in App.tsx or other components
- **New sidebar nav**: Add it to `layouts/Sidebar.tsx` with proper role checks
- **Layout/header changes**: Modify `layouts/Header.tsx` or `layouts/Sidebar.tsx` — never modify `MainLayout.tsx` directly unless changing the shell composition
- **React Compiler**: The project uses `babel-plugin-react-compiler` — avoid manual `React.memo`, `useMemo`, `useCallback` unless profiling shows a specific need

### Key Frontend Patterns

**Data Fetching:** React Query (TanStack) with typed fetchers:
```typescript
const { data, isLoading } = useQuery({ queryKey: ['key'], queryFn: fetchFn })
```

**Routing:** React Router v7 with lazy-loaded pages (code splitting). Protected routes via `<ProtectedRoute>`, admin routes via `<AdminRoute>`, role-based via `<RoleRoute allowedRoles={[...]}>`.

**Styling:** Tailwind CSS utility classes + Radix UI primitives (Dialog, Select, Tabs, Popover, Tooltip, etc.) + class-variance-authority + tailwind-merge. Support both light and dark themes.

**Forms:** React Hook Form + @hookform/resolvers for form management.

**Tables:** TanStack React Table for data tables.

**i18n:** All user-facing strings must be localized in all three locales (`en.json`, `vi.json`, `ja.json`). Use `useTranslation()` hook.

**Barrel Files:** Each feature exports through `index.ts`. Avoid deep imports into another feature's internals.

**Path Aliases:** `@/*` maps to `src/*`.

## advance-rag (Python RAG Worker)

Python 3.11 service for document processing and RAG pipeline execution.

```
advance-rag/
├── common/               # Shared utilities (config, crypto, file handling, logging)
│   └── doc_store/        # Document store adapters (OpenSearch, Infinity, OceanBase)
├── conf/                 # Configuration files
├── db/                   # Database models & services (Peewee ORM for Python side)
│   └── services/         # Domain services (knowledgebase, document, task, etc.)
├── deepdoc/              # Document parsing engine
│   └── parser/           # Parsers: PDF, DOCX, Excel, PPT, HTML, Markdown, JSON, images
├── memory/               # Memory/context management
├── rag/                  # RAG pipeline
│   ├── advanced_rag/     # Advanced retrieval strategies (tree-structured query decomposition)
│   ├── app/              # Document type processors (book, paper, QA, resume, table, etc.)
│   └── flow/             # RAG flow orchestration
├── executor_wrapper.py   # Worker entry point (background task execution)
├── Dockerfile            # Python 3.11-slim + system deps (poppler, tesseract)
└── pyproject.toml        # Python dependencies
```

**Key capabilities:** Document chunking, vector indexing into OpenSearch, multi-format parsing (PDF, DOCX, Excel, PPT, images via OCR), embedding generation, reranking, GraphRAG.

**Environment:** Shares PostgreSQL, Valkey, OpenSearch, and RustFS with the Node.js backend. Configured via `advance-rag/.env.example`.

## converter (Python Document Converter)

Lightweight Python worker for Office-to-PDF conversion.

```
converter/
├── src/
│   ├── worker.py             # Redis queue worker (polls for jobs)
│   ├── converter.py          # Main conversion orchestrator
│   ├── word_converter.py     # DOCX → PDF
│   ├── excel_converter.py    # XLSX → PDF
│   ├── powerpoint_converter.py  # PPTX → PDF
│   ├── pdf_processor.py      # PDF processing
│   ├── config.py             # Configuration
│   └── logger.py             # Logging (Loguru)
├── requirements.txt          # redis, pypdf, pdfminer, pyyaml, loguru
├── Dockerfile                # Python + LibreOffice
└── .env.example              # Redis connection, poll interval
```

**How it works:** Polls a Redis queue for conversion jobs, converts Office documents to PDF using LibreOffice, stores results in S3-compatible storage.

## Coding Standards

### General
- TypeScript **strict mode** enabled in both workspaces
- `noUncheckedIndexedAccess` — always handle `undefined` for indexed access
- `exactOptionalPropertyTypes` — be precise with optional vs undefined
- Single quotes, no semicolons
- Functional patterns preferred
- ESM modules (`"type": "module"` in both packages)

### Documentation
- Add JSDoc headers (`@param`, `@returns`, `@description`) to every function/class
- Add inline comments above every significant line of logic or control flow

### NX-Style Module Boundary Rules
- **No cross-module imports**: Modules under `modules/` (BE) or `features/` (FE) must NOT import from each other directly
- **Barrel file exports**: Every module MUST have an `index.ts` as its public API
- **No deep imports**: Never reach into `modules/<domain>/internal-file.ts` — always go through barrel
- **Shared libraries**: Cross-cutting code lives in `shared/` (BE) or `components/`, `hooks/`, `lib/`, `utils/` (FE)

### Backend-Specific
- Use **Factory Pattern** for models (via `ModelFactory`)
- Use **Singleton Pattern** for global services and utils
- Always use Knex ORM for database queries; raw SQL only when Knex cannot express the query
- Create migration files for any database schema changes
- Import paths must include `.js` extension (ESM requirement)
- All mutation routes must use **Zod validation** via `validate()` middleware
- New modules with 5+ files use sub-directory layout; small modules use flat layout

### Frontend-Specific
- New pages must include i18n translations for en, vi, ja
- New UI components must support dark and light themes
- Use barrel files — avoid deep imports across features
- Keep component files colocated with their feature
- Lazy-load page components for code splitting
- Avoid manual `React.memo`/`useMemo`/`useCallback` — React Compiler handles optimization
- New pages must add route metadata to `app/routeConfig.ts`
- New providers go in `app/Providers.tsx`

## Testing

- **Framework:** Vitest (both BE and FE)
- **FE extras:** @testing-library/react, jsdom, Playwright (e2e)
- Run all tests: `npm run test`
- Run with coverage: `npm run test:coverage -w be` or `npm run test:coverage -w fe`
- Tests live alongside source files or in `__tests__` directories

## Environment Configuration

- **Backend**: Copy `be/.env.example` to `be/.env` — includes DB, Redis, Azure AD, MinIO/S3, Langfuse, session, and external trace config
- **Frontend**: Copy `fe/.env.example` to `fe/.env` — includes API URL, Azure AD, RAGFlow paths, feature flags
- **advance-rag**: Copy `advance-rag/.env.example` to `advance-rag/.env` — includes DB, Redis, OpenSearch, S3, model defaults
- **converter**: Copy `converter/.env.example` to `converter/.env` — includes Redis connection and poll interval
- `.env` files are gitignored — never commit secrets
- Backend config JSON files (`be/src/config/*.json`) are also gitignored

## Docker Deployment

Docker Compose uses a two-file strategy:

**Infrastructure** (`docker/docker-compose-base.yml`):
- **PostgreSQL 17** (Alpine) — primary database
- **Valkey 8** (Alpine) — Redis-compatible session store (BSD-3 licensed)
- **OpenSearch 3.x** — vector + text search for RAG chunks
- **RustFS** — S3-compatible object storage (Apache-2.0 licensed)

**Application** (`docker/docker-compose.yml`, includes base):
- **Backend** — Express app container (Port 3001)
- **Task Executor** — Python RAG worker (advance-rag)
- **Converter** — Python document converter

```bash
npm run docker:base    # Start infrastructure only
npm run docker:up      # Start everything (infra + app services)
npm run docker:down    # Stop infrastructure
```

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
- If changes are extensive, run `npm run build` to verify
