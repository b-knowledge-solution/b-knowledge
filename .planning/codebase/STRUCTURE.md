# Directory Structure

## Root Layout

```
b-knowledge/
├── package.json              # Root workspace config (workspaces: be/, fe/)
├── package-lock.json         # npm lock file
├── CLAUDE.md                 # Root coding standards & project overview
├── AGENTS.md / GEMINI.md     # AI agent instructions (mirrors CLAUDE.md)
├── .gitignore
├── build-deploy.sh           # Deployment script
│
├── be/                       # Backend API (Express + TypeScript)
├── fe/                       # Frontend SPA (React + Vite)
├── advance-rag/              # Python RAG pipeline worker
├── converter/                # Python document converter worker
│
├── docker/                   # Docker Compose files + config
├── scripts/                  # Setup, run, and utility scripts
├── design-system/            # AI-native UI design system docs
├── docs/                     # General project documentation
├── patches/                  # npm patch files
├── .venv/                    # Shared Python virtualenv
├── .agents/                  # Agent workflows and skills
├── .claude/                  # Claude Code settings
└── .vscode/                  # VS Code workspace config
```

---

## Backend (be/src/)

```
be/src/
├── app/
│   ├── index.ts              # Express server init + startup sequence
│   └── routes.ts             # Central route registration (all modules)
│
├── modules/                  # 17 domain modules
│   ├── admin/                # Admin panel (users, settings)
│   ├── audit/                # Audit logging
│   ├── auth/                 # Authentication (Azure AD + local)      [flat]
│   ├── broadcast/            # System announcements
│   ├── chat/                 # AI chat sessions + messages
│   ├── dashboard/            # Analytics dashboard                    [flat]
│   ├── glossary/             # Term glossary management
│   ├── llm-provider/         # LLM provider configuration
│   ├── preview/              # Document preview                      [flat]
│   ├── projects/             # Project management
│   ├── rag/                  # RAG pipeline orchestration
│   ├── search/               # AI search
│   ├── sync/                 # Data sync
│   ├── system-tools/         # System utilities                      [flat]
│   ├── teams/                # Team management
│   ├── user-history/         # User activity history                 [flat]
│   └── users/                # User management
│
├── shared/
│   ├── config/               # Centralized env config (`config` object)
│   ├── db/                   # Knex config, adapter, migrations/
│   ├── middleware/            # Auth, validation, logging, error handling
│   ├── models/               # BaseModel + ModelFactory (8 files)
│   ├── services/             # 16 singleton services
│   │   ├── cron.service.ts
│   │   ├── crypto.service.ts
│   │   ├── embed-token.service.ts
│   │   ├── file-validation.service.ts
│   │   ├── langfuse.service.ts
│   │   ├── llm-client.service.ts
│   │   ├── logger.service.ts
│   │   ├── minio.service.ts
│   │   ├── openai-format.service.ts
│   │   ├── queue.service.ts
│   │   ├── rag-query.service.ts
│   │   ├── ragflow-client.service.ts
│   │   ├── redis.service.ts
│   │   ├── socket.service.ts
│   │   ├── tts.service.ts
│   │   └── web-search.service.ts
│   ├── types/                # Global TypeScript definitions
│   ├── prompts/              # LLM prompt templates
│   └── utils/                # General utilities
│
└── scripts/                  # DB migration scripts
```

### Module Layout Convention

**≥5 files → sub-directory layout:**
```
modules/<domain>/
├── routes/<domain>.routes.ts
├── controllers/<domain>.controller.ts
├── services/<domain>.service.ts
├── models/<domain>.model.ts
├── schemas/<domain>.schemas.ts
└── index.ts                  # Barrel export
```

**≤4 files → flat layout:** `auth`, `dashboard`, `preview`, `system-tools`, `user-history`

---

## Frontend (fe/src/)

```
fe/src/
├── app/
│   ├── App.tsx               # Root router + route definitions
│   ├── Providers.tsx          # Global provider stack
│   ├── routeConfig.ts         # Route metadata (titles, flags)
│   └── contexts/              # React contexts (theme, auth)
│
├── features/                  # 19 domain feature modules
│   ├── ai/                    # AI configuration
│   ├── audit/                 # Audit log viewer
│   ├── auth/                  # Login/logout
│   ├── broadcast/             # System announcements
│   ├── chat/                  # AI chat interface
│   ├── chat-widget/           # Embeddable chat widget
│   ├── dashboard/             # Analytics dashboard
│   ├── datasets/              # Dataset/knowledge base management
│   ├── glossary/              # Glossary management
│   ├── guideline/             # Usage guidelines
│   ├── histories/             # User history viewer
│   ├── landing/               # Landing page
│   ├── llm-provider/          # LLM provider config
│   ├── projects/              # Project management
│   ├── search/                # AI search interface
│   ├── search-widget/         # Embeddable search widget
│   ├── system/                # System settings
│   ├── teams/                 # Team management
│   └── users/                 # User management
│
├── components/                # Shared UI components
│   ├── ui/                    # shadcn/ui primitives (Radix-based)
│   ├── DocumentPreviewer/     # Multi-format document viewer
│   ├── FilePreview/           # File preview components
│   ├── model-selector/        # LLM model selection
│   ├── rerank-selector/       # Reranker selection
│   ├── llm-setting-fields/    # LLM config form fields
│   ├── metadata-filter/       # Metadata filter builder
│   └── cross-language/        # Cross-language components
│
├── hooks/                     # Global UI-only hooks (3 files)
│   ├── useDebounce.ts
│   ├── useSocket.ts
│   └── useUrlState.ts
│
├── layouts/                   # MainLayout, Sidebar, Header
├── lib/                       # Core utilities
│   ├── api.ts                 # HTTP client (fetch wrapper)
│   ├── socket.ts              # Socket.IO singleton
│   ├── queryKeys.ts           # Centralized TanStack Query keys
│   ├── utils.ts               # General utilities
│   ├── widgetAuth.ts          # Widget authentication
│   └── llmProviderPublicApi.ts
│
├── i18n/                      # Translations (en.json, vi.json, ja.json)
├── utils/                     # Pure utility functions
├── assets/                    # Static assets
├── config.ts                  # Feature flags (VITE_ENABLE_*)
├── main.tsx                   # App entry point
└── index.css                  # Global styles + CSS variables
```

### Feature Module Convention
```
features/<domain>/
├── api/
│   ├── <domain>Api.ts         # Raw HTTP calls (NO hooks)
│   └── <domain>Queries.ts     # useQuery/useMutation hooks
├── components/                # Feature-specific UI
├── hooks/                     # UI-only hooks
├── pages/                     # Route-level pages
├── types/
│   └── <domain>.types.ts
└── index.ts                   # Barrel export
```

---

## RAG Worker (advance-rag/)

```
advance-rag/
├── config.py                  # Environment config
├── executor_wrapper.py        # Entry point (progress hook + executor)
├── system_tenant.py           # Tenant initialization
├── pyproject.toml             # 108 dependencies
│
├── common/                    # Shared utilities (35+ modules)
│   ├── doc_store/             # DB connectors (OpenSearch, Elasticsearch)
│   └── settings.py            # Global settings
│
├── db/                        # Peewee ORM
│   ├── db_models.py           # Model definitions
│   └── services/              # Data access services
│
├── rag/                       # Core RAG pipeline
│   ├── app/                   # 15 document parsers
│   │   ├── naive.py           # General-purpose parser (47KB)
│   │   ├── resume.py          # Resume parser (115KB)
│   │   ├── qa.py, table.py    # Specialized parsers
│   │   └── ...
│   ├── flow/                  # Pipeline stages
│   │   ├── extractor/         # Content extraction
│   │   ├── splitter/          # Text chunking
│   │   ├── parser/            # Document parsing
│   │   └── tokenizer/         # Tokenization
│   ├── graphrag/              # Knowledge graph RAG
│   ├── nlp/                   # NLP utilities + search
│   ├── llm/                   # LLM + OCR integrations
│   ├── svr/                   # Task executor engine
│   ├── prompts/               # 50+ LLM prompt templates
│   └── utils/                 # RAG utilities
│
├── deepdoc/                   # Document parsing models
│   ├── parser/                # PDF/document parsers
│   └── vision/                # OCR + layout analysis
│
└── memory/                    # Cache management
```

---

## Converter (converter/)

```
converter/
├── pyproject.toml             # 7 dependencies
├── Dockerfile
├── start.sh / start-converter.cmd
│
└── src/
    ├── worker.py              # Main polling loop (23KB)
    ├── config.py              # Configuration (7KB)
    ├── converter.py           # File-type dispatcher
    ├── word_converter.py      # Word → PDF
    ├── powerpoint_converter.py # PowerPoint → PDF
    ├── excel_converter.py     # Excel → PDF (17KB)
    ├── pdf_processor.py       # PDF post-processing (13KB)
    └── logger.py              # Loguru setup
```

---

## Docker (docker/)

```
docker/
├── docker-compose-base.yml    # Infrastructure (PostgreSQL, Valkey, OpenSearch, RustFS)
├── docker-compose.yml         # App services (backend, task-executor, converter)
├── docker-compose-dev.yml     # Dev overrides
├── docker-compose-litellm.yml # LiteLLM proxy
├── .env / .env.example        # Docker environment
├── config/                    # JSON configs mounted into backend
├── init-db/                   # PostgreSQL init scripts
├── nginx/                     # nginx reverse proxy config
└── rustfs/                    # RustFS config
```

---

## Naming Conventions

| Entity | Pattern | Example |
|--------|---------|---------|
| BE module dir | kebab-case | `llm-provider/` |
| BE route file | `<domain>.routes.ts` | `chat.routes.ts` |
| BE service | `<domain>.service.ts` | `chat.service.ts` |
| BE model | `<domain>.model.ts` | `chat.model.ts` |
| FE feature dir | kebab-case | `chat-widget/` |
| FE API file | `<domain>Api.ts` | `chatApi.ts` |
| FE query hooks | `<domain>Queries.ts` | `chatQueries.ts` |
| FE page | `<DomainAction>Page.tsx` | `ChatPage.tsx` |
| FE types | `<domain>.types.ts` | `chat.types.ts` |
| Migration | `YYYYMMDDhhmmss_<name>.ts` | `20250615120000_initial_schema.ts` |
