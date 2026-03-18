# Technology Stack

## Runtime & Languages

| Layer | Language | Runtime | Version |
|-------|----------|---------|---------|
| Backend | TypeScript 5.6+ | Node.js 22+ | ES Modules (`"type": "module"`) |
| Frontend | TypeScript 5.8+ | Browser (Vite 7.3 dev) | ES Modules |
| RAG Worker | Python 3.11 | CPython | setuptools build |
| Converter | Python 3.10+ | CPython + LibreOffice | setuptools build |

## Package Management

- **Root:** npm workspaces (`"workspaces": ["be", "fe"]`)
- **Python:** Shared `.venv` at project root for `advance-rag` and `converter`
- **Monorepo tooling:** `concurrently` for parallel dev servers
- **Lock files:** `package-lock.json` (npm), no Python lock file (uses pyproject.toml)

---

## Backend (be/)

### Core Framework
- **Express 4.21** — HTTP server with middleware stack
- **tsx** — Dev server with hot reload (`tsx watch`)
- **tsc + tsc-alias** — Production builds with path alias resolution

### Database & ORM
- **PostgreSQL 17** — Primary database
- **Knex 3.1** — Query builder / ORM with migrations
- **pg 8.16** — PostgreSQL driver

### Caching & Sessions
- **Redis 5.10** (client) → **Valkey 8** (server) — Cache, sessions, job queues
- **connect-redis** — Express session store (production)
- **express-session** — Session management (7-day TTL)

### Search & Storage
- **@opensearch-project/opensearch 3.5** — Vector + text search client
- **minio 8.0** — S3-compatible file storage client (→ RustFS)

### AI & Observability
- **openai 6.27** — LLM client (OpenAI-compatible)
- **langfuse 3.27** — LLM observability and tracing

### Security
- **helmet** — CSP, security headers
- **cors** — Cross-origin config
- **hpp** — HTTP parameter pollution protection
- **express-rate-limit** — Rate limiting (1000/15min general, 20/15min auth)
- **bcryptjs** — Password hashing
- **zod 3.25** — Request validation

### Real-time
- **socket.io 4.8** — WebSocket for live updates

### Infrastructure
- **winston** + **winston-daily-rotate-file** — Structured logging with rotation
- **node-cron** — Scheduled jobs
- **multer 2.0** — File upload handling
- **compression** — Response compression

### Testing
- **vitest 2.1** — Test runner
- **@vitest/coverage-v8** — Code coverage
- **eslint 9** — Linting

---

## Frontend (fe/)

### Core Framework
- **React 19** — UI library
- **React Router 7.11** — Client-side routing
- **Vite 7.3** — Dev server and bundler
- **babel-plugin-react-compiler** — Automatic memoization (no manual React.memo)

### State & Data
- **TanStack Query 5.90** — Server state management
- **socket.io-client 4.8** — Real-time data via WebSocket
- **i18next 25.6** + **react-i18next** — Internationalization (en, vi, ja)

### UI Components
- **Tailwind CSS 3.4** — Utility-first CSS
- **shadcn/ui** (Radix primitives) — Component library (new-york style, slate base)
- **lucide-react 0.560** — Icons
- **sonner** — Toast notifications
- **recharts 3.8** — Charts/graphs
- **react-joyride** — Guided tours

### Document Handling
- **pdfjs-dist** — PDF rendering
- **react-pdf-highlighter** — PDF annotation
- **mammoth** — Word document preview
- **@js-preview/excel** — Excel preview
- **pptx-preview** — PowerPoint preview
- **papaparse** — CSV parsing
- **jszip** — ZIP file handling
- **xlsx** — Excel file parsing

### Markdown
- **react-markdown** — Markdown rendering
- **remark-gfm** — GitHub Flavored Markdown
- **rehype-highlight** — Code syntax highlighting
- **rehype-raw** — Raw HTML in markdown
- **dompurify** — HTML sanitization

### Build & Testing
- **vitest 3.0** + **jsdom** — Unit testing
- **@testing-library/react** — Component testing
- **@playwright/test** — E2E testing
- **eslint 9** + **eslint-plugin-react-compiler** — Linting
- **terser** — Minification

---

## RAG Worker (advance-rag/)

### Core
- **FastAPI** + **Uvicorn** — HTTP API (port 9380)
- **Peewee** — ORM (shared PostgreSQL with backend)
- **redis** — Task queue + pub/sub progress
- **opensearch-py** — Vector search client
- **minio** — S3 file storage client

### NLP / ML
- **transformers** + **tokenizers** — Hugging Face models
- **onnxruntime** — Model inference
- **scikit-learn** + **xgboost** — Classical ML
- **tiktoken** — Token counting
- **nltk** — NLP utilities
- **networkx** + **graspologic** — Graph RAG

### Document Parsing
- **pdfplumber** + **pdfminer.six** + **pypdf** — PDF parsing
- **python-docx** — Word documents
- **openpyxl** — Excel
- **python-pptx** — PowerPoint
- **beautifulsoup4** + **mammoth** + **tika** — HTML/Web content
- **trafilatura** — Web scraping
- **opencv-python** — OCR image processing

### LLM Providers
- **openai** — OpenAI-compatible API
- **litellm** — Multi-provider LLM routing
- **ollama** — Local LLM support
- **langfuse** — Observability

### Cloud Storage
- **azure-storage-blob** + **azure-identity** — Azure Blob
- **google-cloud-storage** — GCS
- **boto3** — AWS S3

### Logging
- **loguru** — Structured logging

---

## Converter (converter/)

### Core (7 packages)
- **redis** — Job queue polling
- **requests** — HTTP client (backend API)
- **pypdf** — PDF manipulation
- **pdfminer.six** — PDF content analysis
- **pyyaml** — Configuration
- **python-dotenv** — Environment variables
- **loguru** — Logging

### System Dependencies
- **LibreOffice** — Word/PowerPoint/Excel → PDF conversion
- **python3-uno** — LibreOffice Python API (Excel rendering)

---

## Infrastructure (docker/)

| Service | Image | Port | License |
|---------|-------|------|---------|
| PostgreSQL | postgres:17-alpine | 5432 | PostgreSQL License |
| Valkey | valkey/valkey:8-alpine | 6379 | BSD-3-Clause |
| OpenSearch | opensearchproject/opensearch:3.5.0 | 9201 | Apache-2.0 |
| RustFS | rustfs/rustfs:latest | 9000/9001 | Apache-2.0 |

### Optional
- **LiteLLM** — LLM proxy (separate docker-compose)
- **nginx** — Reverse proxy (production)

---

## Configuration

### TypeScript
- `tsconfig.json` — Strict mode, path alias `@/*` → `src/*`
- `eslint.config.js` — ESLint 9 flat config

### Build Tools
- **BE:** `tsc` + `tsc-alias` → `dist/`
- **FE:** `vite build` with code splitting (vendor, i18n, ui, tiktoken chunks)
- **FE widgets:** Separate Vite configs for `chat-widget` and `search-widget` builds
