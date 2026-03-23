# Technology Stack

**Analysis Date:** 2026-03-23

## Languages

**Primary:**
- TypeScript 5.9 - Backend (`be/`) and Frontend (`fe/`)
- Python 3.11+ (requires >=3.10) - RAG Worker (`advance-rag/`) and Converter (`converter/`)

**Secondary:**
- SQL - Database migrations (`be/src/shared/db/migrations/`)
- YAML - Docker Compose, LiteLLM config (`docker/`)
- CSS - Tailwind utility classes (`fe/src/`)

## Runtime

**Environment:**
- Node.js 22+ (engines constraint: >=18.0.0 in `package.json`)
- Python 3.11 (>=3.10 in `pyproject.toml`)

**Package Managers:**
- npm (workspaces: `be/`, `fe/`) - root `package.json`
- pip with setuptools (advance-rag, converter) - `pyproject.toml` files
- Shared Python `.venv` at project root for development

**Lockfiles:**
- `package-lock.json` for npm
- No Python lockfile (loose version constraints in `pyproject.toml`)

## Frameworks

**Core:**

| Layer | Framework | Version | Config File |
|-------|-----------|---------|-------------|
| Backend API | Express | ^4.21.0 | `be/package.json` |
| Frontend SPA | React | ^19.0.0 | `fe/package.json` |
| Frontend Build | Vite | ^7.3.0 | `fe/vite.config.ts` |
| RAG Worker | (no web framework - task executor loop) | - | `advance-rag/executor_wrapper.py` |
| RAG API | FastAPI (port 9380) | - | `advance-rag/api/` |
| Converter | (no web framework - Redis polling loop) | - | `converter/src/worker.py` |

**Testing:**

| Tool | Version | Workspace | Config |
|------|---------|-----------|--------|
| Vitest | ^2.1.9 | Backend | `be/package.json` |
| Vitest | ^3.0.0 | Frontend | `fe/package.json` |
| Playwright | ^1.57.0 | Frontend E2E | `fe/package.json` |
| Testing Library (React) | ^16.3.0 | Frontend | `fe/package.json` |
| pytest | >=7.0 | Python workers | `advance-rag/pyproject.toml`, `converter/pyproject.toml` |

**Build/Dev:**

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | ^5.9.3 (root), ^5.6.3 (BE), ^5.8.0 (FE) | Type checking |
| tsx | ^4.19.2 | Backend dev server (watch mode) |
| tsc-alias | ^1.8.16 | Backend path alias resolution post-compile |
| Vite | ^7.3.0 | Frontend dev server + bundler |
| babel-plugin-react-compiler | ^1.0.0 | Auto-memoization (React Compiler) |
| concurrently | ^9.1.0 | Parallel dev process runner |
| ESLint | ^9.14.0 | Linting (BE + FE) |
| terser | ^5.44.1 | Production JS minification |

## Key Dependencies

### Backend (`be/package.json`)

**Database & ORM:**
- `knex` ^3.1.0 - SQL query builder / migration runner
- `pg` ^8.16.3 - PostgreSQL driver

**Cache & Sessions:**
- `redis` ^5.10.0 - Redis/Valkey client
- `connect-redis` ^9.0.0 - Express session store
- `express-session` ^1.18.0 - Session management

**Security:**
- `helmet` ^7.1.0 - HTTP security headers
- `hpp` ^0.2.3 - HTTP parameter pollution protection
- `bcryptjs` ^2.4.3 - Password hashing
- `express-rate-limit` ^8.2.1 - API rate limiting
- `cors` ^2.8.5 - Cross-origin configuration

**AI/LLM:**
- `openai` ^6.27.0 - OpenAI-compatible API client (used with LiteLLM)
- `langfuse` ^3.27.0 - LLM observability/tracing

**Search:**
- `@opensearch-project/opensearch` ^3.5.1 - Vector + text search client

**Storage:**
- `minio` ^8.0.6 - S3-compatible object storage client (RustFS)

**Realtime:**
- `socket.io` ^4.8.3 - WebSocket server

**Validation:**
- `zod` ^3.25.76 - Schema validation

**Authorization:**
- `@casl/ability` ^6.8.0 - RBAC/ABAC

**Other:**
- `@modelcontextprotocol/sdk` ^1.27.1 - MCP protocol support
- `dockerode` ^4.0.10 - Docker API client (sandboxed code execution)
- `multer` ^2.0.2 - File upload handling
- `node-cron` ^4.2.1 - Scheduled tasks
- `winston` ^3.18.3 - Structured logging
- `turndown` ^7.2.2 - HTML to Markdown conversion
- `franc` ^6.2.0 - Language detection
- `http-proxy-middleware` ^3.0.2 - Request proxying

### Frontend (`fe/package.json`)

**UI Framework:**
- `react` ^19.0.0 + `react-dom` ^19.0.0
- `react-router-dom` ^7.11.0 - Client-side routing
- `@tanstack/react-query` ^5.90.12 - Server state management

**Component Library (shadcn/ui + Radix):**
- `@radix-ui/react-*` (dialog, dropdown-menu, tabs, select, popover, etc.) - Headless UI primitives
- `@headlessui/react` ^2.2.9 - Additional headless components
- `class-variance-authority` ^0.7.1 - Component variant management
- `clsx` ^2.1.1 + `tailwind-merge` ^3.2.0 - Class composition

**Styling:**
- `tailwindcss` ^3.4.15 - Utility CSS
- `@tailwindcss/typography` ^0.5.19 - Prose styling
- `autoprefixer` ^10.4.20 - CSS post-processing
- `postcss` ^8.4.49

**Icons:**
- `lucide-react` ^0.560.0

**i18n:**
- `i18next` ^25.6.3 + `react-i18next` ^16.3.5 - Internationalization (en, vi, ja)

**State:**
- `zustand` ^5.0.12 - Client-side stores (canvas store)

**Canvas/Flow:**
- `@xyflow/react` ^12.10.1 - Agent canvas (node-based editor)

**Realtime:**
- `socket.io-client` ^4.8.3 - WebSocket client

**Document Preview:**
- `pdfjs-dist` ^5.5.207 - PDF rendering
- `react-pdf-highlighter` ^8.0.0-rc.0 - PDF annotation
- `mammoth` ^1.11.0 - DOCX preview
- `@js-preview/excel` ^1.7.14 - Excel preview
- `pptx-preview` ^1.0.7 - PowerPoint preview

**Markdown:**
- `react-markdown` ^10.1.0 + `remark-gfm` ^4.0.1 + `rehype-highlight` ^7.0.2 + `rehype-raw` ^7.0.0

**Charts:**
- `recharts` ^3.8.0

**Other:**
- `dompurify` ^3.3.3 - HTML sanitization
- `js-tiktoken` ^1.0.21 - Token counting
- `jszip` ^3.10.1 - ZIP file handling
- `papaparse` ^5.5.3 - CSV parsing
- `xlsx` ^0.18.5 - Excel file parsing
- `date-fns` ^4.1.0 - Date utilities
- `sonner` ^2.0.3 - Toast notifications
- `react-joyride` ^2.9.3 - User onboarding tours
- `nprogress` ^0.2.0 - Page load progress bar

### Python RAG Worker (`advance-rag/pyproject.toml`)

**Database:**
- `peewee` >=3.17.0 - ORM (shared PostgreSQL with Node.js backend)
- `psycopg2-binary` >=2.9.9 - PostgreSQL driver

**Infrastructure:**
- `redis` >=5.0.0 - Queue + pub/sub
- `minio` >=7.2.0 - S3 storage client
- `opensearch-py` >=2.0.0 - Vector DB client

**NLP/ML:**
- `transformers` >=4.35.0 - Hugging Face models
- `onnxruntime` >=1.16.0 - Model inference
- `scikit-learn` >=1.3.0 - ML utilities
- `xgboost` >=2.0.0 - Gradient boosting
- `numpy` >=1.24.0, `pandas` >=2.0.0 - Data processing
- `nltk` >=3.8.0 - NLP toolkit
- `tiktoken` >=0.5.0 - OpenAI tokenizer
- `networkx` >=3.0 - Graph operations (GraphRAG)

**LLM:**
- `openai` >=1.0.0 - OpenAI API client
- `litellm` >=1.0.0 - Multi-provider LLM gateway
- `ollama` >=0.3.0 - Local model client
- `langfuse` >=2.0.0 - Observability

**Document Parsing:**
- `pdfplumber` >=0.10.0, `pdfminer.six`, `pypdf` >=4.0.0 - PDF processing
- `python-docx` >=1.0.0 - Word documents
- `openpyxl` >=3.1.0 - Excel files
- `python-pptx` >=0.6.23 - PowerPoint files
- `beautifulsoup4` >=4.12.0 - HTML parsing
- `tika` >=2.6.0 - Apache Tika (requires JRE)
- `trafilatura` >=1.6.0 - Web content extraction
- `tree-sitter` ==0.25.2 - Code parsing (AST-based)
- `prance` >=25.4.8.0 - OpenAPI spec parsing

**OCR/Vision:**
- `opencv-python` >=4.8.0 - Image processing
- `huggingface_hub` >=0.20.0 - Model downloads

**Cloud Storage (multi-provider):**
- `boto3` >=1.28.0 - AWS S3
- `azure-storage-blob` >=12.0.0 - Azure Blob Storage
- `google-cloud-storage` >=2.0.0 - Google Cloud Storage
- `opendal` >=0.45.0 - Unified storage abstraction

**Total: ~108 dependencies**

### Python Converter (`converter/pyproject.toml`)

Minimal (7 deps): `redis`, `requests`, `pypdf`, `pdfminer.six`, `pyyaml`, `python-dotenv`, `loguru`

## Configuration

**TypeScript:**
- Backend: `be/tsconfig.json` - ES2022 target, NodeNext modules, strict mode, `@/*` path alias
- Frontend: `fe/tsconfig.json` - ES2020 target, bundler module resolution, strict mode, `@/*` path alias
- Both enable: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

**Vite:** `fe/vite.config.ts`
- React plugin with React Compiler (babel-plugin-react-compiler)
- WASM + top-level-await plugins (for tiktoken)
- Manual chunks: vendor, i18n, ui, tiktoken
- Proxy `/api` to backend (port 3001)
- Optional HTTPS with self-signed certs

**Environment Files:**
- `be/.env` - Server, DB, Redis, session, auth, S3, Langfuse, Azure AD
- `fe/.env` - API URL, feature flags, Azure AD client config
- `advance-rag/.env` - DB, Redis, OpenSearch, S3, model defaults
- `docker/.env` - Infrastructure + deployment config (all services)

## Database & Storage

**Primary Database:**
- PostgreSQL 17 (Alpine) - port 5432
- Shared between Node.js (Knex ORM) and Python (Peewee ORM)
- Migrations managed exclusively by Knex (`be/src/shared/db/migrations/`)

**Cache/Queue:**
- Valkey 8 (Redis-compatible, BSD-3) - port 6379
- Used for: sessions, task queues, pub/sub progress, converter job queue, caching

**Vector/Text Search:**
- OpenSearch 3.5.0 - port 9201
- kNN vector search + full-text search for RAG chunks
- Security disabled by default in dev

**File Storage:**
- RustFS (S3-compatible, Apache-2.0) - port 9000 (API), 9001 (console)
- Accessed via MinIO SDK (Node.js) and MinIO/boto3 (Python)
- Single bucket: `knowledge`

## Platform Requirements

**Development:**
- Node.js 22+
- Python 3.11+
- Docker + Docker Compose (for infrastructure services)
- System deps for converter: LibreOffice, python3-uno (or use Docker)
- System deps for RAG: poppler-utils, tesseract-ocr, JRE (for Tika)

**Production (Docker):**
- 4 application containers: backend, task-executor, converter, (optional) litellm
- 4 infrastructure containers: PostgreSQL, Valkey, OpenSearch, RustFS
- Shared Docker network: `kb-network`
- Shared volume: `app_logs`

**Optional:**
- LiteLLM proxy (port 4000) - OpenAI-compatible gateway to Ollama/local models
- HTTPS with self-signed certificates (`certs/` directory)

---

*Stack analysis: 2026-03-23*
