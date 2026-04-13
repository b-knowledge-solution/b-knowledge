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

## Behavioral Guidelines

These guidelines reduce common LLM coding mistakes. They are mandatory for all code generation in this project.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

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

## Code Intelligence (Mandatory)

**PRIORITY RULE: Always use `code-review-graph` MCP tools FIRST for codebase understanding and search before falling back to basic Grep/Glob/Read.**

The project has a code knowledge graph (15K+ nodes, 130K+ edges, semantic embeddings enabled) that provides far superior code understanding compared to basic text search.

### When to use which tool

| Task | Use First (code-review-graph) | Fallback |
|------|-------------------------------|----------|
| **Understand architecture** | `get_architecture_overview`, `list_communities`, `get_community` | Read CLAUDE.md files |
| **Find related code** | `semantic_search_nodes`, `query_graph` | Grep/Glob |
| **Impact analysis** | `get_impact_radius`, `get_affected_flows` | Manual trace |
| **Trace data flows** | `list_flows`, `get_flow` | Read code manually |
| **Before code changes** | `get_review_context`, `detect_changes` | git diff |
| **Find large/complex functions** | `find_large_functions` | Manual search |
| **Cross-repo search** | `cross_repo_search` | N/A |

### Graph maintenance

- Run `build_or_update_graph` after significant code changes
- Run `embed_graph` after graph rebuild to update semantic search
- Graph data stored in `.code-review-graph/` (gitignored)

## Coding Standards

### General

- TypeScript strict mode (both BE and FE)
- Single quotes, no semicolons
- Functional patterns where possible
- If changes are extensive, run `npm run build` to verify

### No Hardcoded String Literals in Comparisons (Mandatory)

**NEVER use bare string literals in comparisons, conditionals, switch cases, or return values for domain states, status values, factory names, Redis/Valkey keys, sentinel values, or any string that represents a fixed set of options.**

Always use **constants** or **enums** defined in a shared constants file. This applies across all languages (TypeScript, Python).

```typescript
// ❌ WRONG — hardcoded string literals
if (provider.factory_name === 'SentenceTransformers') { ... }
if (data.status === 'ready') return 'ready'
await redis.get('embed:worker:status')

// ✅ CORRECT — import from shared constants
import { SENTENCE_TRANSFORMERS_FACTORY, EmbeddingWorkerStatus, EMBED_WORKER_STATUS_KEY } from '@/shared/constants/embedding.js'
if (provider.factory_name === SENTENCE_TRANSFORMERS_FACTORY) { ... }
if (data.status === EmbeddingWorkerStatus.READY) return EmbeddingWorkerStatus.READY
await redis.get(EMBED_WORKER_STATUS_KEY)
```

```python
# ❌ WRONG
if factory == "SentenceTransformers": ...
r.set("embed:worker:status", json.dumps({"status": "ready"}))

# ✅ CORRECT
from embed_constants import SENTENCE_TRANSFORMERS_FACTORY, HEALTH_KEY, WorkerStatus
if factory == SENTENCE_TRANSFORMERS_FACTORY: ...
r.set(HEALTH_KEY, json.dumps({"status": WorkerStatus.READY}))
```

**Where to define constants:**
| Scope | TypeScript (BE) | TypeScript (FE) | Python |
|-------|-----------------|-----------------|--------|
| Domain statuses | `be/src/shared/constants/statuses.ts` | `fe/src/constants/statuses.ts` | Module-level constants or class |
| Model types | `be/src/shared/constants/model-types.ts` | `fe/src/constants/model-types.ts` | Enum in relevant module |
| Redis/Valkey keys | `be/src/shared/constants/embedding.ts` | N/A | `advance-rag/embed_constants.py` |
| Factory names | `be/src/shared/constants/embedding.ts` | N/A | `advance-rag/embed_constants.py` |
| Sentinel values | `be/src/shared/constants/embedding.ts` | N/A | `advance-rag/embed_constants.py` |

**Cross-language strings** (values shared between Python and TypeScript) MUST have a comment in both constant files pointing to the other: `// Must match advance-rag/embed_constants.py` / `# Must match be/src/shared/constants/embedding.ts`

### Documentation Comments (Mandatory)

All generated code MUST include documentation comments. Each workspace `CLAUDE.md` has the full rules and examples:

- **TypeScript (BE + FE):** JSDoc with `@description`, `@param`, `@returns`, `@throws` — see `be/CLAUDE.md` and `fe/CLAUDE.md`
- **Python (advance-rag + converter):** Google-style docstrings — see `advance-rag/CLAUDE.md` and `converter/CLAUDE.md`
- **Inline comments** are mandatory above control flow, business logic, integration points, non-obvious code, and guard clauses
- **Do NOT comment** obvious code, restate code in English, or leave commented-out code (git has history)

### NX-Style Module Boundary Rules

These apply to **both** `be/src/modules/` and `fe/src/features/`:

- **No cross-module imports:** Modules must NOT import from each other directly. Use shared services or event-driven patterns.
- **Barrel exports:** Every module has `index.ts` as its public API. Import only from barrel files.
- **No deep imports:** Never `modules/<domain>/internal-file.ts` — always `modules/<domain>/index.ts`.
- **Shared code:** `shared/` (BE) or `components/`, `hooks/`, `lib/`, `utils/` (FE).

## Environment Files

Each workspace has `.env.example` → copy to `.env`:

| File | Purpose |
|------|---------|
| `docker/.env` | Infrastructure + deployment config |
| `be/.env` | Backend server, DB, Redis, session, CORS |
| `fe/.env` | API URL, feature flags, Azure AD |
| `advance-rag/.env` | DB, Redis, OpenSearch, S3, model defaults |

**Production checklist:** Change all default passwords, set `ENABLE_LOCAL_LOGIN=false`, generate strong `SESSION_SECRET`, configure SSL.

## Upstream Code Merge Guidelines (AI Agent Rule)

When merging new code from the upstream RAGFlow project into the `advance-rag` or `converter` Python workers, you **MUST** ensure that all OpenSearch/Elasticsearch index name prefixes are renamed from `ragflow_` to `knowledge_`. 

For example, in `advance-rag/rag/nlp/search.py`, `def index_name(uid): return f"ragflow_{uid}"` must be changed to `def index_name(uid): return f"knowledge_{uid}"`. 

This renaming is critical to maintain consistency with the Node.js backend which expects the `knowledge_` prefix. Failure to do this will result in "0 chunks found" errors on the frontend.
