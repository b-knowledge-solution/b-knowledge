# Codebase Structure

**Analysis Date:** 2026-04-07

## Directory Layout

```
b-knowledge/
├── be/                       # Backend API (Express + TypeScript + Knex)
│   └── src/
│       ├── app/              # App bootstrap, route mount
│       ├── modules/          # NX-style domain modules (controllers/services/models/routes/schemas)
│       ├── shared/           # Cross-module: config, db, models, services, middleware, constants
│       └── scripts/          # One-off backend scripts
├── fe/                       # Frontend SPA (React 19 + Vite)
│   └── src/
│       ├── app/              # App shell, providers, route config
│       ├── features/         # Feature modules (api/, components/, hooks/, pages/, index.ts)
│       ├── components/       # Shared UI components (shadcn/ui + project)
│       ├── hooks/            # Shared UI hooks
│       ├── lib/              # Shared libs (http client, utils)
│       ├── utils/            # Pure utility functions
│       ├── layouts/          # Layout components
│       ├── i18n/             # en, vi, ja translations
│       ├── constants/        # FE constants/enums
│       ├── assets/           # Static assets
│       └── main.tsx          # Vite entry
├── advance-rag/              # Python RAG worker (FastAPI + Peewee + OpenSearch)
│   ├── api/                  # FastAPI routes + Peewee models
│   ├── rag/                  # RAG pipeline: nlp, llm, flow, agent, app, svr, prompts
│   ├── deepdoc/              # Document parsers (PDF, OCR, layout)
│   ├── common/               # Shared helpers
│   ├── conf/                 # Worker config files
│   ├── db/                   # DB connection helpers
│   ├── tests/                # Pytest suite
│   ├── embedding_worker.py   # Embedding pubsub worker entry
│   ├── executor_wrapper.py   # Task executor entry
│   ├── connector_sync_worker.py
│   ├── web_crawl_worker.py
│   ├── embed_constants.py    # Shared constants (mirrors be/src/shared/constants/embedding.ts)
│   └── pyproject.toml
├── converter/                # Office -> PDF worker (LibreOffice + Redis)
│   ├── src/
│   │   ├── worker.py         # Redis queue consumer entry
│   │   ├── converter.py      # Dispatch to format-specific converters
│   │   ├── word_converter.py
│   │   ├── excel_converter.py
│   │   ├── powerpoint_converter.py
│   │   ├── pdf_processor.py
│   │   ├── config.py
│   │   └── logger.py
│   ├── tests/
│   └── pyproject.toml
├── docker/                   # Compose stacks, Dockerfiles, nginx, infra config
│   ├── docker-compose.yml          # App services (backend, executor, converter)
│   ├── docker-compose-base.yml     # Infra (Postgres, Valkey, OpenSearch, RustFS)
│   ├── docker-compose-dev.yml      # Dev overrides
│   ├── docker-compose-demo.yml     # All-in-one demo
│   ├── docker-compose-litellm.yml  # Optional LiteLLM gateway
│   ├── Dockerfile.demo / .offline  # Demo images
│   ├── demo-entrypoint.sh
│   ├── config/                     # JSON configs mounted into backend (read-only)
│   ├── nginx/                      # Reverse proxy configs
│   ├── init-db/                    # Postgres init SQL
│   ├── models/                     # Local model cache mount
│   └── rustfs/                     # RustFS data dir
├── scripts/                  # Setup, run, build helper scripts (Node + shell)
├── design-system/            # AI-native UI design system docs
├── docs/                     # Project documentation
├── evaluations/              # RAG evaluation harness (separate Python project)
├── benchmarks/               # Performance benchmark scripts
├── samples/                  # Sample documents/data
├── test-data/                # Test fixtures
├── patches/                  # npm patch-package patches
├── certs/                    # Local SSL certs (gitignored)
├── logs/                     # Runtime logs (gitignored)
├── tasks/                    # Task tracking artifacts
├── todo/                     # TODO notes
├── reports/                  # Generated reports
├── release-notes/            # Release notes
├── ragflow/                  # Upstream RAGFlow reference snapshot
├── CLAUDE.md                 # Root project instructions
├── ARCHITECTURE.md           # Top-level architecture doc
├── README.md
└── package.json              # npm workspaces root (be/, fe/)
```

## Directory Purposes

### Backend (`be/src/`)

**`app/`** — Application bootstrap.
- `index.ts`: Express server entry, middleware wiring, server start.
- `routes.ts`: Mounts all module routers under their base paths.

**`modules/`** — NX-style domain modules. Each module owns `controllers/`, `services/`, `models/`, `routes/`, `schemas/`, and a barrel `index.ts`.
- `agents/` — AI agent definitions, templates, execution.
- `audit/` — Audit log read endpoints.
- `auth/` — Login, session, password reset, SSO.
- `broadcast/` — Broadcast notifications.
- `chat/` — Chat conversations, messages, streaming.
- `code-graph/` — Code knowledge graph integration.
- `dashboard/` — Aggregated metrics for admin dashboard.
- `external/` — External integrations / webhooks.
- `feedback/` — User feedback capture.
- `glossary/` — Glossary terms management.
- `knowledge-base/` — Datasets, documents, chunks, ingestion control.
- `llm-provider/` — LLM provider config + tenant model bindings.
- `memory/` — Long-term memory store.
- `preview/` — Document preview rendering.
- `rag/` — RAG retrieval orchestration endpoints.
- `search/` — Search endpoints (vector + keyword).
- `sync/` — Connector sync orchestration.
- `system/` — System config, health, history.
- `system-tools/` — Admin tools.
- `teams/` — Tenants/teams/permissions.
- `user-history/` — Per-user history.
- `users/` — User CRUD.

**`shared/`** — Cross-cutting backend code.
- `config/` — Typed env config singleton.
- `constants/` — Domain enums, Redis keys, factory names.
- `db/` — Knex instance, `migrations/`, `seeds/`.
- `middleware/` — Auth, Zod `validate()`, error handler.
- `models/` — `ModelFactory` singleton + base model class.
- `services/` — Cross-module services (embedding stream, queue dispatch, S3, etc.).
- `prompts/` — Prompt templates.
- `types/` — Shared TS types.
- `utils/` — Helpers (logging, hashing, formatting).

### Frontend (`fe/src/`)

**`app/`** — Shell.
- `App.tsx`, `Providers.tsx` (QueryClient, Router, i18n, theme), `routeConfig.ts`, `contexts/`.

**`features/`** — Feature modules. Each holds `api/<domain>Api.ts` + `api/<domain>Queries.ts`, plus `components/`, `hooks/`, `pages/`, `index.ts`.
- `agents`, `agent-widget`, `ai`, `api-keys`, `audit`, `auth`, `broadcast`, `chat`, `chat-widget`, `code-graph`, `dashboard`, `datasets`, `glossary`, `guideline`, `histories`, `knowledge-base`, `landing`, `llm-provider`, `memory`, `search`, `search-widget`, `system`, `teams`, `users`.

**Shared FE folders:**
- `components/` — shadcn/ui primitives + project-wide components.
- `hooks/` — UI-only shared hooks.
- `lib/` — HTTP client, query client, third-party wrappers.
- `utils/` — Pure helpers.
- `layouts/` — Page layouts.
- `i18n/` — `en`, `vi`, `ja` locale files.
- `constants/` — Shared FE constants.
- `assets/` — Images, icons, fonts.

### RAG Worker (`advance-rag/`)

- `api/db/`, `api/utils/` — Peewee models + helpers.
- `rag/nlp/` — Tokenization, chunking, search query building (`search.py` defines `index_name` -> `knowledge_<uid>`).
- `rag/llm/` — LLM client adapters.
- `rag/flow/`, `rag/agent/`, `rag/app/`, `rag/svr/` — Pipeline orchestration, agent runtime, server glue.
- `rag/prompts/` — Prompt templates.
- `rag/graphrag/` — Graph RAG implementation.
- `deepdoc/` — Document parsers (PDF layout, OCR, table extraction).
- `common/` — Shared helpers.
- `conf/` — YAML/JSON worker configs.
- `tests/` — Pytest suite.
- `embed_constants.py` — Cross-language constants (must mirror backend).
- Worker entrypoints: `executor_wrapper.py`, `embedding_worker.py`, `connector_sync_worker.py`, `web_crawl_worker.py`.

### Converter (`converter/src/`)

- `worker.py` — Redis queue consumer entrypoint.
- `converter.py` — Format dispatcher.
- `word_converter.py`, `excel_converter.py`, `powerpoint_converter.py`, `pdf_processor.py` — Format-specific LibreOffice handlers.
- `config.py`, `logger.py` — Config + Loguru setup.

### Docker (`docker/`)

- `docker-compose-base.yml` — Infra: Postgres, Valkey, OpenSearch, RustFS.
- `docker-compose.yml` — App services: backend, task-executor, converter.
- `docker-compose-dev.yml` — Dev overlays.
- `docker-compose-demo.yml`, `Dockerfile.demo*`, `demo-entrypoint.sh` — All-in-one demo image.
- `docker-compose-litellm.yml` — Optional LiteLLM gateway.
- `config/` — JSON configs mounted read-only into backend.
- `nginx/` — Reverse proxy/site configs.
- `init-db/` — Postgres bootstrap SQL.
- `models/`, `rustfs/` — Local volume mounts.

### Scripts (`scripts/`)

- `setup.js`, `setup-python.js`, `setup-worker.js`, `setup-converter.js`, `setup-infra.js` — First-time setup.
- `run-worker.js`, `run-converter.js`, `run-sync-worker.js`, `wait-for-backend.js` — Dev runners.
- `build-images.sh`, `build-be-offline.sh`, `build-fe-offline.sh`, `build-worker-offline.sh`, `build-converter-offline.sh`, `build-demo.sh`, `build-demo-offline.sh`, `build-images-offline.sh` — Image builds.
- `export-demo-image.sh`, `import-demo-image.sh` — Offline demo distribution.
- `generate-cert.js` — Local SSL cert generation.
- `count-loc.js`, `check-chat-db.ts`, `generate_glossary_sample.cjs` — Utilities.

## Naming Conventions

**Backend files:**
- Controllers: `<domain>.controller.ts` (sub-resources: `<domain>-<sub>.controller.ts`).
- Services: `<domain>.service.ts`.
- Models: `<domain>.model.ts`.
- Routes: `<domain>.routes.ts`.
- Schemas: `<domain>.schema.ts` (Zod).
- Migrations: `YYYYMMDDhhmmss_<snake_name>.ts`.

**Frontend files:**
- API: `<domain>Api.ts` (raw HTTP), `<domain>Queries.ts` (TanStack hooks). NEVER `<domain>Service.ts`.
- Components: `PascalCase.tsx`.
- Hooks: `useThing.ts`.

**Python:** `snake_case.py` modules; classes `PascalCase`; functions/vars `snake_case`.

## Where to Add New Code

**New backend domain feature:**
- Create `be/src/modules/<domain>/` with `controllers/`, `services/`, `models/`, `routes/`, `schemas/`, `index.ts`.
- Register router in `be/src/app/routes.ts`.
- Register model in `ModelFactory` under `be/src/shared/models/`.
- Add Zod schemas under `schemas/`; wire `validate()` in `routes/`.
- Add migration via `npm run db:migrate:make <name>`.

**New frontend feature:**
- Create `fe/src/features/<domain>/` with `api/<domain>Api.ts`, `api/<domain>Queries.ts`, `components/`, `pages/`, `index.ts`.
- Register routes in `fe/src/app/routeConfig.ts`.
- Add i18n keys to all three locales under `fe/src/i18n/`.

**Shared backend service / constant:**
- Service: `be/src/shared/services/<name>.service.ts`.
- Constant: appropriate file under `be/src/shared/constants/`. If cross-language, mirror in `advance-rag/embed_constants.py` and add comments pointing both ways.

**RAG pipeline change:**
- Parser: `advance-rag/deepdoc/`.
- Chunking/search: `advance-rag/rag/nlp/`.
- New worker: add entry script at `advance-rag/` root and wire into `docker/docker-compose.yml`.

**Converter format support:**
- Add `<format>_converter.py` under `converter/src/` and dispatch from `converter.py`.

**Database migration (any service):**
- Always Knex: `be/src/shared/db/migrations/YYYYMMDDhhmmss_<name>.ts` — even for Peewee-managed tables.

## Special Directories

**`.code-review-graph/`** — Code knowledge graph data. Generated, gitignored.
**`logs/`** — Runtime logs. Generated, gitignored.
**`certs/`** — Local SSL certs. Generated, gitignored.
**`node_modules/`** — npm workspaces install. Generated, gitignored.
**`ragflow/`** — Upstream reference snapshot for merges; not built/run.
**`patches/`** — `patch-package` overrides applied on `npm install`.
**`design-system/`, `docs/`, `release-notes/`** — Documentation, committed, not built.

---

*Structure analysis: 2026-04-07*
