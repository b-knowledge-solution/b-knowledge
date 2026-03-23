# B-Knowledge Project Instructions

B-Knowledge is an open-source UI to centralize and manage AI Search, Chat, and Knowledge Base. NX-style modular monorepo using npm workspaces.

## Tech Stack

| Component | Tech | Location |
|-----------|------|----------|
| Backend | Node.js 22+ / Express 4.21 / TypeScript / Knex / PostgreSQL | `be/` |
| Frontend | React 19 / TypeScript / Vite 7.3 / TanStack Query / Tailwind / shadcn/ui | `fe/` |
| RAG Worker | Python 3.11 / FastAPI / Peewee ORM / OpenSearch | `advance-rag/` |
| Converter | Python 3 / LibreOffice / Redis queue | `converter/` |

**Sub-module CLAUDE.md files:** Each workspace has its own `CLAUDE.md` with architecture, conventions, and gotchas. Claude auto-discovers them.

## Monorepo Structure

```
root/
├── be/                       # Backend API (Express)
├── fe/                       # Frontend SPA (React + Vite)
├── advance-rag/              # Python RAG processing worker
├── converter/                # Python Office-to-PDF converter worker
├── docker/                   # Docker Compose, Dockerfiles, nginx, config
│   ├── docker-compose.yml    # App services (backend, task-executor, converter)
│   ├── docker-compose-base.yml # Infra (PostgreSQL, Valkey, OpenSearch, RustFS)
│   └── config/               # JSON configs mounted read-only into backend
├── scripts/                  # Setup, run, and utility scripts
├── design-system/            # AI-native UI design system docs
├── docs/                     # Project documentation
├── patches/                  # npm patch files
└── package.json              # Root workspace config (npm workspaces: be/, fe/)
```

## Setup & Commands

### First-Time Setup

```bash
npm run setup               # Full setup: check prereqs, copy .env files, install deps, setup Python venv, start Docker infra
```

Or manually:
```bash
# 1. Copy env files (.env.example → .env) in: root, docker/, be/, fe/, advance-rag/
# 2. Install dependencies
npm install
# 3. Setup shared Python venv (advance-rag + converter)
npm run setup:python
# 4. Start infrastructure (PostgreSQL, Valkey, OpenSearch, RustFS)
npm run docker:base
```

### Development

```bash
npm run dev                 # All services: BE + FE + Worker + Converter (concurrently)
npm run dev:be              # Backend only (tsx watch, port 3001)
npm run dev:fe              # Frontend only (Vite, port 5173)
npm run dev:worker          # RAG worker (waits for backend health)
npm run dev:converter       # Converter (waits for backend health)
```

### Build & Test

```bash
npm run build               # Build all workspaces
npm run build:prod          # Production build
npm run lint                # Lint all workspaces
npm run test                # Test all workspaces
```

### Database

```bash
npm run db:migrate          # Run pending migrations
npm run db:migrate:make <n> # Create migration: YYYYMMDDhhmmss_<n>.ts
npm run db:migrate:rollback # Rollback last batch
npm run db:seed             # Seed database
```

### Docker

```bash
npm run docker:base         # Start infra only (PostgreSQL, Valkey, OpenSearch, RustFS)
npm run docker:down         # Stop infra
npm run docker:up           # Build + start full stack
```

### HTTPS (Local Dev)

```bash
npm run generate:cert       # Generate self-signed SSL certs in certs/
# Then trust cert in system, add domains to /etc/hosts, set HTTPS_ENABLED=true
```

## Infrastructure Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| PostgreSQL | postgres:17-alpine | 5432 | Primary database |
| Valkey | valkey/valkey:8-alpine | 6379 | Cache, sessions, queues |
| OpenSearch | opensearch:3.5.0 | 9201 | Vector + text search |
| RustFS | rustfs/rustfs:latest | 9000/9001 | S3-compatible file storage |

## Coding Standards

### General

- TypeScript strict mode (both BE and FE)
- Single quotes, no semicolons
- Functional patterns where possible
- JSDoc headers on every function/class (`@param`, `@returns`, `@description`)
- Inline comments above significant logic/control flow
- If changes are extensive, run `npm run build` to verify

### NX-Style Module Boundary Rules

These apply to **both** `be/src/modules/` and `fe/src/features/`:

- **No cross-module imports:** Modules must NOT import from each other directly. Use shared services or event-driven patterns.
- **Barrel exports:** Every module has `index.ts` as its public API. Import only from barrel files.
- **No deep imports:** Never `modules/<domain>/internal-file.ts` — always `modules/<domain>/index.ts`.
- **Shared code:** `shared/` (BE) or `components/`, `hooks/`, `lib/`, `utils/` (FE).

### Backend Conventions (details in `be/CLAUDE.md`)

- Factory Pattern for models in `shared/models/` (singleton ModelFactory)
- Singleton Pattern for all global services
- Sub-directory layout for modules with ≥5 files; flat layout for ≤4 files
- All mutations use Zod validation via `validate()` middleware
- Config access only through `config` object, never `process.env`
- Knex ORM for all models; raw SQL only when Knex cannot support the query
- Migration naming: `YYYYMMDDhhmmss_<name>.ts`

### Frontend Conventions (details in `fe/CLAUDE.md`)

- API layer split: `<domain>Api.ts` (raw HTTP) + `<domain>Queries.ts` (TanStack Query hooks)
- Never use `*Service.ts` naming — always `*Api.ts`
- No manual memoization (`React.memo`, `useMemo`, `useCallback`) — React Compiler handles it
- `hooks/` for UI-only hooks; `useQuery`/`useMutation` go in `api/<domain>Queries.ts`
- i18n: All UI strings in 3 locales (`en`, `vi`, `ja`)
- Dark mode: Class-based, always support both themes
- State management: See `fe/STATE_MANAGEMENT.md`
- URL state for filterable views (bookmarkable filters/pagination)
- Forms: Native `useState`, no form libraries

### Python Conventions (advance-rag, converter)

- Shared `.venv` at project root for development
- Each module has own `pyproject.toml` for independent Docker builds
- Loguru for logging (both modules)
- Redis for inter-service communication (queues, pub/sub, status)

## Environment Files

Each workspace has `.env.example` → copy to `.env`:

| File | Purpose |
|------|---------|
| `docker/.env` | Infrastructure + deployment config |
| `be/.env` | Backend server, DB, Redis, session, CORS |
| `fe/.env` | API URL, feature flags, Azure AD |
| `advance-rag/.env` | DB, Redis, OpenSearch, S3, model defaults |

## Browser E2E Testing (AI Agent Rule)

When using the **browser tool** to verify UI changes, you **MUST** log in with a local account first. The database is seeded with test accounts via `npm run db:seed` (see `be/src/shared/db/seeds/00_sample_users.ts`).

**Prerequisites:** `ENABLE_LOCAL_LOGIN=true` must be set in `be/.env`.

**Login steps:**
1. Navigate to `http://localhost:5173`
2. Click "Local Login" (or go to the login page directly)
3. Enter credentials from the table below
4. Submit the form and wait for redirect to dashboard

**Test accounts (password for all: `password123`):**

| Role   | Email             | Use when verifying…                          |
|--------|-------------------|----------------------------------------------|
| admin  | admin1@baoda.vn   | System settings, admin panels, full CRUD     |
| leader | leader1@baoda.vn  | Team management, knowledge bases, chat       |
| user   | user1@baoda.vn    | Basic view-only / restricted-access pages    |

> Default to **admin1@baoda.vn** unless the change specifically targets leader or user role permissions.

**Production checklist:** Change all default passwords, set `ENABLE_LOCAL_LOGIN=false`, generate strong `SESSION_SECRET`, configure SSL.
