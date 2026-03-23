# Codebase Structure

**Analysis Date:** 2026-03-23

## Directory Layout

```
b-knowledge/
+-- package.json              # Root workspace config (workspaces: be/, fe/)
+-- package-lock.json         # npm lock file
+-- CLAUDE.md                 # Root coding standards and project overview
+-- AGENTS.md / GEMINI.md     # AI agent instructions (mirrors CLAUDE.md)
+-- build-deploy.sh           # Deployment script
+-- .gitignore
|
+-- be/                       # Backend API (Express + TypeScript)
+-- fe/                       # Frontend SPA (React + Vite)
+-- advance-rag/              # Python RAG pipeline worker
+-- converter/                # Python document converter worker
|
+-- docker/                   # Docker Compose files + config
+-- scripts/                  # Setup, run, and utility scripts
+-- design-system/            # AI-native UI design system docs
+-- docs/                     # General project documentation
+-- patches/                  # npm patch files
+-- .planning/                # GSD planning documents
+-- .venv/                    # Shared Python virtualenv (advance-rag + converter)
+-- .agents/                  # Agent workflows and skills
+-- .claude/                  # Claude Code settings
+-- .vscode/                  # VS Code workspace config
```

## Backend Structure (be/src/)

```
be/src/
+-- app/
|   +-- index.ts              # Express server init, middleware, startup sequence
|   +-- routes.ts             # Central route registration (all module routes under /api/*)
|
+-- modules/                  # 21 domain modules
|   +-- admin/                # Admin panel operations
|   |   +-- controllers/      +-- routes/      +-- services/
|   +-- agents/               # AI agent workflows (canvas, versions, debug, tools, embed, webhook)
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/    +-- index.ts
|   +-- audit/                # Audit logging
|   |   +-- controllers/      +-- models/      +-- routes/      +-- services/
|   +-- auth/                 # Authentication (Azure AD + local)       [FLAT]
|   |   +-- auth.controller.ts  +-- auth.routes.ts  +-- index.ts
|   +-- broadcast/            # System broadcast announcements
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/
|   +-- chat/                 # AI chat sessions, messages, assistants, embed, files
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/
|   +-- dashboard/            # Analytics dashboard                     [FLAT]
|   +-- external/             # External API keys + endpoints
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/
|   +-- feedback/             # Answer quality feedback
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/
|   +-- glossary/             # Term glossary management
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/
|   +-- llm-provider/         # LLM provider configuration + model listing
|   |   +-- controllers/      +-- data/        +-- models/
|   |   +-- routes/           +-- schemas/     +-- services/
|   +-- memory/               # Persistent memory pools (for agents/chat)
|   |   +-- controllers/      +-- models/      +-- prompts/
|   |   +-- routes/           +-- schemas/     +-- services/
|   +-- preview/              # Document preview                        [FLAT]
|   +-- projects/             # Project management (multi-category docs)
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/
|   +-- rag/                  # RAG pipeline orchestration (datasets, documents, tasks)
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/
|   +-- search/               # AI search apps + embed
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/
|   +-- sync/                 # Data source sync connectors
|   |   +-- adapters/         +-- controllers/  +-- models/
|   |   +-- routes/           +-- schemas/     +-- services/
|   +-- system-tools/         # System utilities                        [FLAT]
|   +-- teams/                # Team management
|   |   +-- controllers/      +-- models/      +-- routes/
|   |   +-- schemas/          +-- services/
|   +-- user-history/         # User activity history                   [FLAT]
|   +-- users/                # User management
|       +-- controllers/      +-- models/      +-- routes/
|       +-- schemas/          +-- services/
|
+-- shared/
|   +-- config/               # Centralized env config (always use `config` object)
|   +-- db/
|   |   +-- knex.ts           # Knex instance
|   |   +-- knexfile.ts       # Knex configuration
|   |   +-- adapters/         # DB adapter utilities
|   |   +-- migrations/       # Timestamped Knex migrations
|   |   +-- seeds/            # Database seed files
|   +-- middleware/
|   |   +-- auth.middleware.ts         # Session auth, role/ability checks
|   |   +-- tenant.middleware.ts       # Multi-org tenant extraction
|   |   +-- validate.middleware.ts     # Zod request validation
|   |   +-- external-auth.middleware.ts # API key authentication
|   +-- models/
|   |   +-- base.model.ts             # BaseModel<T> abstract CRUD class
|   |   +-- factory.ts                # ModelFactory singleton registry
|   |   +-- types.ts                  # Shared entity type definitions
|   |   +-- system-config.model.ts    # System configuration model
|   |   +-- history-chat-session.model.ts
|   |   +-- history-chat-message.model.ts
|   |   +-- history-search-session.model.ts
|   |   +-- history-search-record.model.ts
|   +-- services/              # 17 singleton services
|   |   +-- ability.service.ts         # CASL ABAC authorization engine
|   |   +-- cron.service.ts            # Scheduled job management
|   |   +-- crypto.service.ts          # Encryption utilities
|   |   +-- embed-token.service.ts     # Widget embed token generation
|   |   +-- file-validation.service.ts # Magic byte + extension validation
|   |   +-- langfuse.service.ts        # LLM observability tracing
|   |   +-- llm-client.service.ts      # LLM API abstraction
|   |   +-- logger.service.ts          # Structured logging
|   |   +-- minio.service.ts           # S3-compatible storage (RustFS)
|   |   +-- openai-format.service.ts   # OpenAI-compatible response formatting
|   |   +-- queue.service.ts           # Redis queue management
|   |   +-- rag-query.service.ts       # RAG retrieval query execution
|   |   +-- ragflow-client.service.ts  # Legacy RAGFlow API client
|   |   +-- redis.service.ts           # Redis connection + pub/sub
|   |   +-- socket.service.ts          # Socket.IO WebSocket service
|   |   +-- tts.service.ts             # Text-to-speech
|   |   +-- web-search.service.ts      # Web search integration
|   +-- prompts/               # Shared LLM prompt templates
|   +-- types/                 # Global TypeScript definitions
|   +-- utils/                 # General utility functions
|
+-- scripts/                   # DB migration/utility scripts
```

### Backend Module Layout Rules

**>=5 files -> sub-directory layout:**
```
modules/<domain>/
+-- routes/<domain>.routes.ts
+-- controllers/<domain>.controller.ts
+-- services/<domain>.service.ts
+-- models/<domain>.model.ts
+-- schemas/<domain>.schemas.ts
+-- index.ts                  # Barrel export (public API)
```

**<=4 files -> flat layout:**
```
modules/<domain>/
+-- <domain>.controller.ts
+-- <domain>.routes.ts
+-- <domain>.service.ts
+-- index.ts
```

**Flat modules:** `auth`, `dashboard`, `preview`, `system-tools`, `user-history`

## Frontend Structure (fe/src/)

```
fe/src/
+-- app/
|   +-- App.tsx               # Root router with all route definitions (lazy-loaded)
|   +-- Providers.tsx          # Global provider composition stack
|   +-- routeConfig.ts         # Route metadata (titles, feature IDs, layout flags)
|   +-- contexts/              # React contexts (theme, auth, settings)
|
+-- features/                  # 23 domain feature modules
|   +-- agent-widget/          # Embeddable agent widget
|   +-- agents/                # Agent studio (canvas, debug, tools, forms)
|   |   +-- api/               # agentApi.ts, agentQueries.ts
|   |   +-- components/        # AgentCanvas, AgentCard, AgentToolbar, etc.
|   |   |   +-- canvas/        # CanvasNode, NodeConfigPanel, NodePalette
|   |   |   |   +-- edges/     # SmartEdge
|   |   |   |   +-- forms/     # 25+ node form components (GenerateForm, CodeForm, etc.)
|   |   |   +-- debug/         # DebugPanel
|   |   +-- hooks/             # useAgentCanvas, useAgentDebug, useAgentStream
|   |   +-- pages/             # AgentListPage, AgentCanvasPage
|   |   +-- store/             # canvasStore.ts (Zustand)
|   |   +-- types/             # agent.types.ts
|   +-- ai/                    # AI configuration (tokenizer page)
|   +-- api-keys/              # API key management
|   +-- audit/                 # Audit log viewer
|   +-- auth/                  # Login/logout + route guards (ProtectedRoute, AdminRoute, RoleRoute)
|   +-- broadcast/             # System broadcast announcements
|   +-- chat/                  # AI chat interface + assistant management
|   +-- chat-widget/           # Embeddable chat widget
|   +-- dashboard/             # Admin analytics dashboard
|   +-- datasets/              # Dataset/knowledge base management + document viewer
|   +-- glossary/              # Glossary term management
|   +-- guideline/             # In-app usage guidelines
|   +-- histories/             # User history viewer
|   +-- landing/               # Landing page
|   +-- llm-provider/          # LLM provider configuration
|   +-- memory/                # Memory pool management
|   +-- projects/              # Project management
|   +-- search/                # AI search interface + app management
|   +-- search-widget/         # Embeddable search widget
|   +-- system/                # System settings + monitor
|   +-- teams/                 # Team management
|   +-- users/                 # User management
|
+-- components/                # Shared UI components
|   +-- ui/                    # shadcn/ui primitives (Radix-based, new-york style)
|   +-- DocumentPreviewer/     # Multi-format document viewer
|   |   +-- previews/          # Format-specific preview components
|   +-- FilePreview/           # File preview with preview components
|   +-- model-selector/        # LLM model selection dropdown
|   +-- rerank-selector/       # Reranker model selection
|   +-- llm-setting-fields/    # LLM config form fields
|   +-- metadata-filter/       # Metadata filter builder UI
|   +-- knowledge-base-picker/ # KB selection component
|   +-- multi-lang-input/      # Multi-language input fields
|   +-- cross-language/        # Cross-language components
|
+-- hooks/                     # Global UI-only hooks (NOT data-fetching)
|   +-- useDebounce.ts
|   +-- useSocket.ts           # Socket.IO subscription + query invalidation
|   +-- useUrlState.ts         # URL state management for filters
|
+-- layouts/                   # MainLayout, Sidebar, Header
|
+-- lib/                       # Core utilities
|   +-- api.ts                 # HTTP client (fetch wrapper with auto-401 redirect)
|   +-- socket.ts              # Socket.IO singleton client
|   +-- queryKeys.ts           # Centralized TanStack Query key factory
|   +-- ability.tsx            # CASL AbilityProvider + context
|   +-- utils.ts               # General utilities (cn() for classNames, etc.)
|   +-- widgetAuth.ts          # Widget token authentication
|   +-- llmProviderPublicApi.ts # Public model listing API
|
+-- i18n/
|   +-- locales/
|       +-- en.json            # English translations
|       +-- vi.json            # Vietnamese translations
|       +-- ja.json            # Japanese translations (not shown but referenced)
|
+-- utils/                     # Pure utility functions
+-- assets/                    # Static assets (SVGs, images)
+-- config.ts                  # Feature flags from VITE_ENABLE_* env vars
+-- main.tsx                   # App entry point (QueryClient + BrowserRouter + App)
+-- index.css                  # Global styles + CSS variables (HSL, brand primary #0D26CF)
```

### Frontend Feature Module Convention

```
features/<domain>/
+-- api/
|   +-- <domain>Api.ts         # Raw HTTP calls (NO React hooks)
|   +-- <domain>Queries.ts     # useQuery/useMutation hooks wrapping Api functions
+-- components/                # Feature-specific UI components
+-- hooks/                     # UI-only hooks (streaming, filters -- NOT data-fetching)
+-- pages/                     # Route-level page components
+-- types/
|   +-- <domain>.types.ts      # TypeScript type definitions
+-- index.ts                   # Barrel export (public API)
```

## Python Worker Structure (advance-rag/)

```
advance-rag/
+-- config.py                  # Env-driven config (DB, Redis, S3, models)
+-- executor_wrapper.py        # Entry point: progress hook + task executor startup
+-- system_tenant.py           # System tenant initialization
+-- pyproject.toml             # 108 dependencies
+-- CLAUDE.md                  # Worker-specific coding standards
|
+-- common/                    # Shared utilities (35+ modules)
|   +-- doc_store/             # DB connectors (OpenSearch, Elasticsearch, Infinity)
|   +-- settings.py            # Global settings
|   +-- constants.py           # Enums (LLMType, ParserType, TaskStatus, etc.)
|   +-- misc_utils.py          # Thread pool, timing utilities
|   +-- connection_utils.py    # Connection management
|   +-- metadata_utils.py      # Metadata handling
|   +-- config_utils.py        # Config display
|   +-- log_utils.py           # Logging setup
|
+-- db/                        # Peewee ORM layer (shared PostgreSQL with backend)
|   +-- db_models.py           # Peewee model definitions
|   +-- services/              # Data access services
|   |   +-- knowledgebase_service.py
|   |   +-- document_service.py
|   |   +-- task_service.py
|   |   +-- llm_service.py
|   |   +-- doc_metadata_service.py
|   |   +-- pipeline_operation_log_service.py
|   +-- joint_services/        # Cross-model service operations
|
+-- rag/                       # Core RAG pipeline
|   +-- app/                   # 15+ document parsers (type-specific)
|   |   +-- naive.py           # General-purpose parser
|   |   +-- resume.py          # Resume parser (largest at 115KB)
|   |   +-- qa.py              # Q&A format parser
|   |   +-- table.py           # Table data parser
|   |   +-- book.py, email.py, laws.py, paper.py, ...
|   +-- flow/                  # Processing pipeline stages
|   |   +-- extractor/         # Content extraction
|   |   +-- splitter/          # Text chunking strategies
|   |   +-- parser/            # Document format parsing
|   |   +-- tokenizer/         # Tokenization
|   |   +-- tests/             # Pipeline stage tests
|   +-- graphrag/              # Knowledge graph RAG
|   |   +-- general/           # Full GraphRAG (index construction + querying)
|   |   +-- light/             # Lightweight GraphRAG variant
|   +-- nlp/                   # NLP utilities (query processing, search, tokenizer)
|   +-- llm/                   # LLM integrations + OCR models
|   +-- svr/                   # Server/executor components
|   |   +-- task_executor.py   # Main task execution engine
|   |   +-- cache_file_svr.py  # File caching server
|   |   +-- discord_svr.py     # Discord integration
|   +-- prompts/               # 50+ LLM prompt templates (keyword extraction, Q&A, tagging, etc.)
|   +-- utils/                 # RAG utilities (base64, raptor, etc.)
|   +-- res/                   # Pre-cached models (deepdoc, NLTK, etc.)
|
+-- deepdoc/                   # Document parsing models
|   +-- parser/                # PDF and document parsers
|   |   +-- resume/            # Resume-specific parsing
|   +-- vision/                # OCR + layout analysis
|
+-- memory/                    # Agent memory management
|   +-- services/              # Memory service implementations
|   +-- utils/                 # Memory utilities
|
+-- tests/                     # Test suite
    +-- fixtures/              # Test data fixtures
```

## Converter Structure (converter/)

```
converter/
+-- pyproject.toml             # 7 dependencies
+-- Dockerfile
+-- CLAUDE.md                  # Converter-specific coding standards
+-- start.sh                   # Docker entrypoint
+-- start-converter.cmd        # Windows dev start
|
+-- src/
|   +-- __init__.py
|   +-- worker.py              # Main polling loop (Redis queue -> conversion)
|   +-- config.py              # Configuration dataclasses + Redis config parsing
|   +-- converter.py           # File-type dispatcher (routes by extension)
|   +-- word_converter.py      # Word -> PDF (LibreOffice CLI)
|   +-- powerpoint_converter.py # PowerPoint -> PDF (LibreOffice CLI)
|   +-- excel_converter.py     # Excel -> PDF (Python-UNO bridge)
|   +-- pdf_processor.py       # PDF post-processing (trim, empty page removal)
|   +-- logger.py              # Loguru setup (console + rotating file)
|
+-- tests/                     # Test suite
+-- .data/                     # Runtime data (converted files, logs)
```

## Docker Structure (docker/)

```
docker/
+-- docker-compose-base.yml    # Infrastructure (PostgreSQL 17, Valkey 8, OpenSearch 3.5, RustFS)
+-- docker-compose.yml         # App services (backend, task-executor, converter) -- includes base
+-- docker-compose-dev.yml     # Dev overrides
+-- docker-compose-litellm.yml # LiteLLM proxy service
+-- .env / .env.example        # Docker environment configuration
+-- config/                    # JSON configs mounted read-only into backend
+-- init-db/                   # PostgreSQL initialization scripts
+-- nginx/                     # nginx reverse proxy configuration
+-- rustfs/                    # RustFS (S3) configuration
```

## Key File Locations

**Entry Points:**
- `be/src/app/index.ts`: Backend server bootstrap
- `fe/src/main.tsx`: Frontend React mount point
- `fe/src/app/App.tsx`: Root router with all route definitions
- `advance-rag/executor_wrapper.py`: RAG worker entry point
- `converter/src/worker.py`: Converter worker entry point

**Configuration:**
- `be/src/shared/config/index.ts`: Backend centralized config (never use `process.env`)
- `fe/src/config.ts`: Frontend feature flags from `VITE_ENABLE_*` env vars
- `advance-rag/config.py`: Python worker env-driven config
- `converter/src/config.py`: Converter configuration
- `docker/.env`: Infrastructure + deployment config

**Core Logic:**
- `be/src/app/routes.ts`: Central API route registration
- `be/src/shared/models/factory.ts`: ModelFactory singleton registry (40+ models)
- `be/src/shared/models/base.model.ts`: BaseModel<T> CRUD abstract class
- `be/src/shared/services/ability.service.ts`: CASL ABAC authorization
- `fe/src/lib/api.ts`: HTTP client with auto-401 handling
- `fe/src/lib/queryKeys.ts`: Centralized TanStack Query key factory
- `fe/src/app/Providers.tsx`: Global provider composition
- `advance-rag/rag/svr/task_executor.py`: Main RAG task execution engine

**Database:**
- `be/src/shared/db/knexfile.ts`: Knex database configuration
- `be/src/shared/db/migrations/`: All Knex migration files (timestamped)
- `be/src/shared/db/seeds/`: Database seed files
- `advance-rag/db/db_models.py`: Peewee ORM model definitions (reads same DB)

**Testing:**
- `be/tests/`: Backend Vitest tests (organized by module)
- `fe/tests/`: Frontend Vitest tests (organized by feature)
- `fe/e2e/`: Playwright E2E tests (organized by feature)
- `advance-rag/tests/`: Python pytest tests

## Naming Conventions

**Files:**
- BE route file: `<domain>.routes.ts` (e.g., `agent.routes.ts`)
- BE service: `<domain>.service.ts` (e.g., `agent.service.ts`)
- BE controller: `<domain>.controller.ts` (e.g., `agent.controller.ts`)
- BE model: `<domain>.model.ts` (e.g., `agent.model.ts`)
- BE schema: `<domain>.schemas.ts` (e.g., `agent.schemas.ts`)
- FE API file: `<domain>Api.ts` (e.g., `agentApi.ts`) -- NEVER use `*Service.ts`
- FE query hooks: `<domain>Queries.ts` (e.g., `agentQueries.ts`)
- FE page: `<DomainAction>Page.tsx` (e.g., `AgentListPage.tsx`, `AgentCanvasPage.tsx`)
- FE types: `<domain>.types.ts` (e.g., `agent.types.ts`)
- Migration: `YYYYMMDDhhmmss_<name>.ts` (e.g., `20250615120000_initial_schema.ts`)

**Directories:**
- BE modules: kebab-case (`llm-provider/`, `system-tools/`, `user-history/`)
- FE features: kebab-case (`agent-widget/`, `chat-widget/`, `search-widget/`)
- FE components: PascalCase for component files (`AgentCanvas.tsx`, `DebugPanel.tsx`)

## Where to Add New Code

**New Backend Module:**
1. Create `be/src/modules/<domain>/` with sub-directory layout (if >=5 files) or flat layout
2. Add barrel `index.ts` exporting public API
3. Register routes in `be/src/app/routes.ts` via `apiRouter.use('/<path>', routes)`
4. Add model to `be/src/shared/models/factory.ts` if new DB table
5. Create Zod schemas in `schemas/<domain>.schemas.ts`
6. Add tests in `be/tests/<domain>/`

**New Frontend Feature:**
1. Create `fe/src/features/<domain>/` with api/, components/, pages/, types/, index.ts
2. Add route in `fe/src/app/App.tsx` (lazy-loaded)
3. Add route metadata to `fe/src/app/routeConfig.ts`
4. Add nav item to `fe/src/layouts/Sidebar.tsx` with role checks
5. Add i18n keys to all 3 locale files (`en.json`, `vi.json`, `ja.json`)
6. Wrap route with `<FeatureErrorBoundary>`
7. Add query keys to `fe/src/lib/queryKeys.ts`
8. Add tests in `fe/tests/features/<domain>/`

**New Shared Backend Service:**
- Add to `be/src/shared/services/<name>.service.ts`
- Use Singleton Pattern (exported instance)

**New Shared Frontend Component:**
- Add to `fe/src/components/<ComponentName>.tsx` or `fe/src/components/<name>/`
- For shadcn/ui primitives: `fe/src/components/ui/`

**New Database Migration:**
- Run `npm run db:migrate:make <descriptive-name>` to generate timestamped file
- All schema changes go through Knex migrations -- including tables used by Python workers

**New API Endpoint:**
- Add route in module's `routes/<domain>.routes.ts`
- Add controller method in `controllers/<domain>.controller.ts`
- Add service method in `services/<domain>.service.ts`
- Add Zod schema for validation in `schemas/<domain>.schemas.ts`

## Special Directories

**.planning/:**
- Purpose: GSD planning documents (phases, codebase analysis)
- Generated: By planning tools
- Committed: Yes

**.venv/:**
- Purpose: Shared Python virtual environment for advance-rag + converter
- Generated: By `npm run setup:python`
- Committed: No (in .gitignore)

**docker/config/:**
- Purpose: JSON config files mounted read-only into backend container
- Generated: No (manually maintained)
- Committed: Yes

**advance-rag/rag/res/:**
- Purpose: Pre-cached ML models (deepdoc, NLTK, tiktoken)
- Generated: During Docker build
- Committed: Partially (some cached, some downloaded at build)

**patches/:**
- Purpose: npm patch files for dependency fixes
- Generated: By `npx patch-package`
- Committed: Yes

---

*Structure analysis: 2026-03-23*
