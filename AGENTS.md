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
- **No direct DB in services:** Services must never import `db` directly — all DB access goes through `ModelFactory.<model>.<method>()`
- Migration naming: `YYYYMMDDhhmmss_<name>.ts`
- **RESTful API routes:** All routes must follow standard REST conventions (`GET` list/detail, `POST` create, `PUT` full update, `PATCH` partial update, `DELETE` remove). Listing/filtering uses query params (`?key=value`), not path nesting. Frontend `*Api.ts` files must mirror backend route patterns exactly — mismatches cause 404s. See `be/CLAUDE.md` for the full reference table.

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

## Upstream Code Merge Guidelines (AI Agent Rule)

When merging new code from the upstream RAGFlow project into the `advance-rag` or `converter` Python workers, you **MUST** ensure that all OpenSearch/Elasticsearch index name prefixes are renamed from `ragflow_` to `knowledge_`. 

For example, in `advance-rag/rag/nlp/search.py`, `def index_name(uid): return f"ragflow_{uid}"` must be changed to `def index_name(uid): return f"knowledge_{uid}"`. 

This renaming is critical to maintain consistency with the Node.js backend which expects the `knowledge_` prefix. Failure to do this will result in "0 chunks found" errors on the frontend.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **b-knowledge** (15440 symbols, 41514 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/b-knowledge/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/b-knowledge/context` | Codebase overview, check index freshness |
| `gitnexus://repo/b-knowledge/clusters` | All functional areas |
| `gitnexus://repo/b-knowledge/processes` | All execution flows |
| `gitnexus://repo/b-knowledge/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
