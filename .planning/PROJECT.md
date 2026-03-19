# B-Knowledge RAG Platform

## What This Is

B-Knowledge is a production-grade RAG (Retrieval-Augmented Generation) platform for knowledge base management, targeting SDLC development teams and healthcare organizations. It provides AI-powered chat and hybrid search over organizational documents, with multi-tenant isolation at org and project levels, ABAC-based access control, document versioning, domain-specific parsers, GraphRAG knowledge graphs, Deep Research with budget controls, and query analytics dashboards.

## Core Value

Users can ask questions in natural language and get accurate, cited answers from their organization's knowledge base — with strict access control ensuring each team only sees what they're authorized to access.

## Requirements

### Validated

<!-- Shipped and confirmed valuable — v1.0 milestone. -->

- ✓ Document upload and storage (S3-compatible via RustFS) — existing
- ✓ Document parsing pipeline (19 parser types: PDF, DOCX, email, code, OpenAPI, ADR, clinical, etc.) — v1.0
- ✓ Text chunking with configurable strategies (recursive, fixed-size, AST-based) — v1.0
- ✓ Embedding generation via configurable LLM providers — existing
- ✓ OpenSearch indexing (vector + full-text) — existing
- ✓ Chat assistants with configurable prompt, retrieval settings, and KB bindings — existing
- ✓ Streaming SSE chat with multi-turn conversation support — existing
- ✓ Hybrid search (BM25 + vector with configurable weighting) — existing
- ✓ Search apps with configurable retrieval and LLM settings — existing
- ✓ Citation insertion (embedding-based sentence-to-chunk matching) — existing
- ✓ Reranking support (Jina, Cohere, generic) — existing
- ✓ Multi-turn query refinement via LLM — existing
- ✓ Cross-language query expansion — existing
- ✓ Keyword extraction for retrieval enhancement — existing
- ✓ Web search integration (Tavily) — existing
- ✓ LLM observability via Langfuse tracing — existing
- ✓ Dataset (knowledge base) CRUD management — existing
- ✓ Real-time task progress via Socket.IO + Redis pub/sub — existing
- ✓ Office-to-PDF conversion worker (LibreOffice) — existing
- ✓ Multi-LLM provider support (OpenAI-compatible) — existing
- ✓ Basic auth (local login, session-based) — existing
- ✓ E2E test infrastructure with Playwright — v1.0
- ✓ RBAC with 4-role hierarchy (super-admin > admin > leader > user) via CASL — v1.0
- ✓ ABAC with per-dataset policy rules and OpenSearch filter enforcement — v1.0
- ✓ Org-level tenant isolation with project-level scoping — v1.0
- ✓ Document version history (version-as-dataset model with page_rank boost) — v1.0
- ✓ Custom metadata tagging with free-form key-value pairs — v1.0
- ✓ Auto-metadata extraction (keywords, questions, schema) during parsing — v1.0
- ✓ Bulk metadata operations across documents — v1.0
- ✓ Cron-based parsing scheduler with FIFO per-dataset sequencing — v1.0
- ✓ Code-aware parser (tree-sitter AST, 20+ languages) — v1.0
- ✓ OpenAPI/Swagger parser (endpoint chunking, $ref resolution) — v1.0
- ✓ ADR parser (MADR, Nygard, Y-statement template detection) — v1.0
- ✓ Clinical document classifier (LLM-based, 4 categories) — v1.0
- ✓ GraphRAG with Light/Full modes and entity/community metrics — v1.0
- ✓ Deep Research with recursive query decomposition and budget controls (50K tokens + 15 calls) — v1.0
- ✓ Cross-dataset search with ABAC enforcement — v1.0
- ✓ User language detection with forced LLM response language — v1.0
- ✓ Project CRUD with many-to-many dataset binding and member management — v1.0
- ✓ Query analytics dashboard (top queries, failed retrievals, response times) — v1.0
- ✓ RAG quality metrics with feedback aggregation and Langfuse deep links — v1.0
- ✓ Chat citation document preview (CitationDocDrawer) — v1.0
- ✓ Search result document preview (SearchResultDocDialog) — v1.0
- ✓ Deep Research progress display with budget warnings — v1.0
- ✓ Audit logging for document access, queries, role changes — v1.0
- ✓ Answer quality feedback (thumbs up/down) — v1.0

### Active

<!-- Next milestone scope. -->

(To be defined in next milestone)

### Out of Scope

- Mobile app — web-first, mobile can come later
- Real-time collaborative editing — not a document editor, it's a knowledge base
- Custom model training/fine-tuning — relies on external LLM providers
- On-device/edge deployment — server-based multi-tenant architecture
- Full PII/PHI redaction engine — integrate with dedicated tools (Presidio, AWS Macie)
- Visual workflow builder (agent canvas) — use well-configured defaults
- Agentic tool integration (MCP, function calling) — expose API for external agents
- Per-query billing/metering — self-hosted, not SaaS
- Custom embedding model hosting — support external APIs

## Context

- **Shipped v1.0** with 7 phases, 33 plans across 10 days
- **Tech stack:** Node.js 22/Express 4.21/TypeScript backend, React 19/Vite 7.3/TanStack Query frontend, Python 3.11/FastAPI RAG worker, PostgreSQL 17, OpenSearch 3.5, Valkey 8, RustFS
- **Codebase:** 1,440 files, 494K lines
- **Architecture:** Modular monorepo with 4 services sharing PostgreSQL, Redis, OpenSearch, RustFS
- **Target domains:** SDLC teams and healthcare organizations with separate tenant isolation
- **Known tech debt:** Embed/OpenAI-compat controllers pass empty tenantId (4 files with TODO)

## Constraints

- **Tech stack**: Must build on existing stack — no stack changes
- **Compatibility**: Must maintain OpenAI-compatible LLM provider interface
- **Multi-tenant**: All features must respect tenant isolation — no data leakage between orgs

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Migrate from RAGFlow to custom TypeScript backend | Full control over RAG pipeline, TypeScript ecosystem consistency | ✓ Good — migration complete |
| ABAC over simple RBAC (CASL) | Healthcare and SDLC domains need fine-grained access rules | ✓ Good — CASL with Valkey cache |
| Document version-as-dataset model | Each version is a full dataset with inherited settings and page_rank boost | ✓ Good — simple, reuses all infrastructure |
| Org + Project tenant hierarchy | Both domains need org isolation with project-level scoping | ✓ Good — many-to-many project-dataset binding |
| Python worker for ingestion, Node.js for query-time | Heavy parsing/ML in Python, streaming/API in Node.js | ✓ Good |
| LazyGraphRAG as default mode | Lower cost, Full GraphRAG opt-in per dataset | ✓ Good — cost-effective default |
| 50K token + 15 call Deep Research budget | Prevents runaway LLM costs with graceful partial answers | ✓ Good |
| tree-sitter for code parsing | Language-agnostic AST parsing across 20+ languages | ✓ Good |
| Recharts for analytics dashboards | React-native, composable, works with shadcn/Tailwind | ✓ Good |
| franc for language detection | Zero native deps, 187 languages, lightweight | ✓ Good |

---
*Last updated: 2026-03-19 after v1.0 milestone completion*
