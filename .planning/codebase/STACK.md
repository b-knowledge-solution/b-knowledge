# Technology Stack

**Analysis Date:** 2026-04-07

B-Knowledge is an NX-style monorepo (npm workspaces for JS/TS, shared `.venv` for Python) hosting four workspaces: `be/` (Express API), `fe/` (React SPA), `advance-rag/` (Python RAG worker derived from RAGFlow), and `converter/` (LibreOffice document converter).

## Languages

**Primary:**
- TypeScript 5.6 (backend) / 5.8 (frontend) — strict mode in both workspaces
- Python >=3.10 (advance-rag, converter) — runtime targets Python 3.11

**Secondary:**
- Bash — `scripts/` setup, build, and Docker helper scripts
- SQL — Knex migrations under `be/src/shared/db/migrations/`

## Runtime

**Node.js:**
- Backend: Node.js >=22 (root `package.json` engines: `>=18.0.0`, but BE CLAUDE.md mandates 22+)
- Module type: ESM (`"type": "module"` in root, `be/`, `fe/`)

**Python:**
- Python 3.11 inside Docker images (Ubuntu 24.04 base for converter)
- Shared dev `.venv` at repo root provisioned by `npm run setup:python`

**Browser target (FE):**
- ES2022, React 19 with React Compiler

## Package Managers

| Workspace | Manager | Lockfile |
|-----------|---------|----------|
| Root / `be/` / `fe/` | npm workspaces | `package-lock.json` (root) |
| `advance-rag/` | pip + setuptools (`pyproject.toml`) | none committed (Docker pinned) |
| `converter/` | pip + setuptools (`pyproject.toml`) | none committed |

Workspaces declared in root `package.json`: `be`, `fe`. Python workers are independent build units (each with its own `pyproject.toml` and `Dockerfile`).

## Frameworks

### Backend (`be/`)

**Core:**
- Express 4.21 — HTTP server
- Knex 3.1 — query builder + migrations against PostgreSQL
- Zod 3.25 — request validation via shared `validate()` middleware
- Socket.IO 4.8 — real-time push to FE
- `pg` 8.16 — PostgreSQL driver
- `redis` 5.10 + `connect-redis` 9 — cache, sessions, queues
- `@opensearch-project/opensearch` 3.5 — vector + text search client
- `minio` 8.0 — S3-compatible object storage client (RustFS / MinIO)
- `neo4j-driver` 6.0 — Bolt client for Memgraph (code knowledge graph)
- `dockerode` 4.0 — Docker engine API (system tools / health checks)
- `@modelcontextprotocol/sdk` 1.27 — MCP integration
- `openai` 6.27 — LLM client
- `langfuse` 3.27 — LLM observability
- `winston` + `winston-daily-rotate-file` — logging
- `helmet`, `cors`, `hpp`, `express-rate-limit`, `compression` — security/middleware
- `express-session` 1.18 + Redis store — sessions
- `bcryptjs`, `cookie-parser`, `multer` 2.0 — auth + file uploads
- `node-cron` 4.2 — scheduled jobs
- `http-proxy-middleware` 3.0, `https-proxy-agent` 7.0 — outbound proxying
- `franc` 6.2 — language detection
- `turndown` 7.2, `adm-zip` 0.5 — content utilities
- `@casl/ability` 6.8 — RBAC

**Build / Dev:**
- `tsx` 4.19 — dev hot reload (`tsx watch`)
- `tsc-alias` 1.8 — path alias resolution after `tsc` build
- ESLint 9 + `@typescript-eslint` 8.14
- Vitest 2.1 + `@vitest/coverage-v8` + `@vitest/ui`

### Frontend (`fe/`)

**Core:**
- React 19 + React DOM 19
- React Compiler (`babel-plugin-react-compiler` 1.0, `eslint-plugin-react-compiler` 19.1) — auto-memoization (manual `useMemo`/`useCallback`/`React.memo` forbidden)
- Vite 7.3 — dev server + bundler (with `vite-plugin-wasm`, `vite-plugin-top-level-await`)
- TypeScript 5.8 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- TanStack Query 5.90 — server state
- Zustand 5.0 — minimal client state
- React Router DOM 7.11
- Tailwind CSS 3.4 + `@tailwindcss/typography` + `tailwind-merge` + `class-variance-authority`
- shadcn/ui (new-york style) on top of Radix UI primitives (`@radix-ui/react-*`: dialog, dropdown, select, popover, tooltip, tabs, etc.)
- `@headlessui/react` 2.2, `lucide-react` 0.560 — additional UI
- `i18next` 25.6 + `react-i18next` 16.3 + `i18next-browser-languagedetector` 8.2 — i18n (en/vi/ja required)
- `socket.io-client` 4.8 — real-time
- `@casl/ability` + `@casl/react` — RBAC
- `@xyflow/react` 12.10 — flow / graph visualization
- `recharts` 3.8 — charts
- `mermaid` 11.13 — diagram rendering
- `react-markdown` 10 + `remark-gfm`, `remark-math`, `rehype-highlight`, `rehype-katex`, `rehype-raw` — markdown rendering
- `highlight.js` 11.11, `lowlight` 3.3 — syntax highlighting
- `pdfjs-dist` 5.5, `react-pdf-highlighter` 8 — PDF preview
- `mammoth` 1.11, `xlsx` 0.18, `papaparse` 5.5, `pptx-preview` 1.0, `@js-preview/excel` 1.7, `jszip` 3.10 — Office/file previews
- `dompurify` 3.3 — HTML sanitization
- `js-tiktoken` 1.0 — token counting in browser
- `react-day-picker` 9.6, `date-fns` 4.1
- `react-joyride` 2.9 — onboarding tours
- `sonner` 2.0 — toasts
- `nprogress` 0.2

**Test / Dev:**
- Vitest 3.0 (split unit + UI configs: `vitest.unit.config.ts`, `vitest.ui.config.ts`)
- `@testing-library/react` 16.3 + `@testing-library/jest-dom` + `@testing-library/user-event`
- `jsdom` 27.2
- Playwright 1.57 — E2E (`@playwright/test`)
- ESLint 9 + React + React Hooks + React Compiler plugins
- PostCSS 8 + Autoprefixer 10
- Terser 5.44

### Advance-RAG Worker (`advance-rag/`)

**Core (108 dependencies):**
- FastAPI + Uvicorn (port 9380) — internal API
- Peewee >=3.17 + `psycopg2-binary` — PostgreSQL ORM (shared DB with backend)
- `redis` >=5.0, `valkey` >=6.0 — queue + pub/sub + cache
- `opensearch-py` >=2.0 — vector store
- `minio` >=7.2 — S3-compatible object storage
- `neo4j` >=5.0 — Bolt client for Memgraph (graph RAG)
- `pyobvector` >=0.2, `infinity-sdk` >=0.6 — alternate vector backends
- `pymysql` >=1.1 — optional MySQL support

**ML / NLP:**
- `transformers` >=4.35, `tokenizers` >=0.15, `sentence-transformers` >=3.4 (CPU-only local embeddings)
- `onnxruntime` >=1.16, `numpy`, `scikit-learn`, `xgboost` (>=2.0,<3.1)
- `graspologic` >=3.4, `networkx` >=3.0 — graph analytics for GraphRAG
- `nltk` >=3.8, `tiktoken` >=0.5
- `tree-sitter` 0.25.2 + `tree-sitter-language-pack` 0.13.0 — AST parsing
- `huggingface_hub` >=0.20

**LLM clients:**
- `openai` >=1.0, `litellm` >=1.0, `ollama` >=0.3
- `langfuse` >=2.0 — observability

**Document parsing:**
- `pdfplumber`, `pdfminer.six`, `pypdf`, `python-docx`, `openpyxl`, `python-pptx`, `mammoth`, `tika`, `beautifulsoup4`, `markdown`, `markdownify`, `trafilatura`, `msglite`, `olefile`, `ebooklib`, `markdown-to-json`

**OCR / Vision:**
- `opencv-python`, `shapely`, `pyclipper`, `editdistance`

**Cloud SDKs (optional storage backends):**
- `azure-storage-blob`, `azure-storage-file-datalake`, `azure-identity`
- `google-cloud-storage`
- `boto3`
- `opendal`

**OpenAPI:**
- `prance` >=25.4, `openapi-spec-validator` >=0.8

**Utilities:**
- `loguru`, `pydantic` >=2.0, `tenacity`, `httpx`, `requests`, `jinja2`, `cryptography`, `argon2-cffi`, `json_repair`, `ormsgpack`, `xxhash`, `filelock`, `itsdangerous`, `pillow`, `tqdm`

**System dependencies (Docker image):**
- `poppler-utils` (PDF), `tesseract-ocr` (OCR), JRE (Tika for `.doc`)
- Pre-cached: deepdoc models, NLTK data, Tika jars, tiktoken encodings

**Test:**
- pytest >=7, pytest-cov >=4, pytest-mock >=3 (under `[project.optional-dependencies] dev`)

### Converter Worker (`converter/`)

**Core (7 dependencies — minimal by design):**
- `redis` >=5.0 — job queue + pub/sub
- `requests` >=2.31
- `pypdf` >=4.0 + `pdfminer.six` >=20231228 — PDF post-processing
- `pyyaml` >=6.0
- `python-dotenv` >=1.0
- `loguru` >=0.7

**System dependencies:**
- LibreOffice (`libreoffice-writer`, `libreoffice-calc`, `libreoffice-impress`) — invoked via `soffice --headless --convert-to pdf`
- `python3-uno` — LibreOffice Python bridge for Excel conversion (must use system Python linked to LibreOffice)
- Ubuntu 24.04 base image

## Build Tools

| Workspace | Build | Output |
|-----------|-------|--------|
| `be/` | `tsc` → `tsc-alias` → `node scripts/copy-static-assets.mjs` | `be/dist/` |
| `fe/` | `tsc -b` → `vite build` (Terser, vendor/i18n/ui/tiktoken splits) | `fe/dist/` |
| `advance-rag/` | Docker multi-stage (also `Dockerfile.offline` for air-gapped) | container |
| `converter/` | Docker multi-stage (also `Dockerfile.offline`) | container |
| `docs/` | VitePress 1.6 (`docs:build`) | `docs/.vitepress/dist/` |

## Linting & Formatting

- **TS (be + fe):** ESLint 9 + `@typescript-eslint` 8.14; FE adds React, React Hooks, React Compiler plugins
- **Style:** single quotes, no semicolons (root `CLAUDE.md`)
- **Python:** No formatter pinned in `pyproject.toml`; convention is Google-style docstrings + Loguru logging

## Testing Frameworks

| Workspace | Runner | Notes |
|-----------|--------|-------|
| `be/` | Vitest 2.1 | `npm run test -w be` |
| `fe/` | Vitest 3.0 (unit + UI configs) + Playwright 1.57 | jsdom; `tests/test-utils.tsx` provides `renderWithProviders` |
| `advance-rag/` | pytest 7+ | `tests/test_*.py` |
| `converter/` | pytest 7+ | `tests/test_*.py` |

## Path Aliases

- BE: `@/*` → `be/src/*` (resolved at build time via `tsc-alias`)
- FE: `@/*` → `fe/src/*` (Vite + tsconfig)

## Configuration Files

- TypeScript: `be/tsconfig.json`, `fe/tsconfig.json` (+ `tsconfig.app.json`, `tsconfig.node.json`)
- Vite: `fe/vite.config.ts`, `fe/vitest.unit.config.ts`, `fe/vitest.ui.config.ts`, `fe/playwright.config.ts`
- Tailwind / PostCSS: `fe/tailwind.config.*`, `fe/postcss.config.*`
- Knex: configured under `be/src/shared/db/`
- Python: `advance-rag/pyproject.toml`, `converter/pyproject.toml`
- Docker: `docker/docker-compose.yml`, `docker/docker-compose-base.yml`, `docker/docker-compose-demo.yml`, `docker/docker-compose-litellm.yml`, per-workspace `Dockerfile` + `Dockerfile.offline`
- Backend JSON configs mounted read-only from `docker/config/` (e.g. `ragflow.config.json`, `system-tools.config.json`)
- `.env` files exist per workspace; values in `.env.example` only — secrets are not committed

## Platform Requirements

**Development:**
- Node.js >=22, npm with workspaces
- Python 3.10+ (3.11 recommended) for shared `.venv`
- Docker + Docker Compose for infrastructure (`npm run docker:base`)
- LibreOffice required for `converter` if running it outside Docker (effectively Linux/Docker only)

**Production:**
- Docker Compose deployment (`docker/docker-compose.yml` extends `docker-compose-base.yml`)
- Required production env: `DB_PASSWORD`, `KB_ROOT_PASSWORD`, `SESSION_SECRET` (BE throws on startup if missing)
- Optional offline / air-gapped mode via `Dockerfile.offline` variants and demo bundle (`docker/Dockerfile.demo.offline`)

---

*Stack analysis: 2026-04-07*
