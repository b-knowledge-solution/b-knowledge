# B-Knowledge RAG Platform

## What This Is

B-Knowledge is a production-grade RAG (Retrieval-Augmented Generation) platform for knowledge base management, targeting SDLC development teams and healthcare organizations. It provides AI-powered chat and hybrid search over organizational documents, with multi-tenant isolation at org and project levels. The system is being migrated from RAGFlow's core RAG workflow and evolved with new capabilities including RBAC, document versioning, and domain-specific features.

## Core Value

Users can ask questions in natural language and get accurate, cited answers from their organization's knowledge base — with strict access control ensuring each team only sees what they're authorized to access.

## Requirements

### Validated

<!-- Shipped and confirmed valuable — existing capabilities from RAGFlow migration. -->

- ✓ Document upload and storage (S3-compatible via RustFS) — existing
- ✓ Document parsing pipeline (15 parser types: PDF, DOCX, email, etc.) — existing
- ✓ Text chunking with configurable strategies (recursive, fixed-size) — existing
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

### Active

<!-- Current scope. Building toward these. -->

- [ ] Stabilize migration: fix known and undiscovered bugs in dataset creation, parsing, and chunking
- [ ] Complete RAGFlow feature migration: GraphRAG, Deep Research, remaining parsers
- [ ] RBAC with attribute-based access control (ABAC) — rules like "doctors see clinical docs, devs see specs"
- [ ] Org-level tenant isolation with project-level scoping within orgs
- [ ] Document version history — keep all versions, search across current or historical
- [ ] Chat experience improvements and stabilization
- [ ] Search experience improvements and stabilization
- [ ] Project-based document management for SDLC workflows
- [ ] Healthcare domain document handling (regulatory, clinical docs)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Mobile app — web-first, mobile can come later
- Real-time collaborative editing — not a document editor, it's a knowledge base
- Custom model training/fine-tuning — relies on external LLM providers
- On-device/edge deployment — server-based multi-tenant architecture

## Context

- **Migration origin:** RAGFlow is the reference implementation. Core RAG pipeline (parsing → chunking → embedding → indexing → retrieval → generation) has been migrated to TypeScript (backend) and Python (worker). Migration code is complete but under business logic testing.
- **Current testing focus:** Dataset creation and parse/chunk pipeline — mix of known bugs and bugs still to discover through systematic testing.
- **Unmigrated RAGFlow features:** GraphRAG (knowledge graph construction/retrieval), Deep Research (multi-hop recursive retrieval), and specific document type parsers.
- **Existing architecture:** Modular monorepo with 4 services — Express backend, React SPA, Python RAG worker, Python converter. All share PostgreSQL, Valkey/Redis, OpenSearch, and RustFS.
- **Target domains:** SDLC teams (project specs, code docs, design docs) and healthcare orgs (regulatory docs, clinical protocols, research papers). These are separate tenants with different access patterns.

## Constraints

- **Tech stack**: Must build on existing stack — Node.js/Express backend, React frontend, Python RAG worker, PostgreSQL, OpenSearch, Redis. No stack changes.
- **Compatibility**: Must maintain OpenAI-compatible LLM provider interface for flexibility across providers.
- **Multi-tenant**: All features must respect tenant isolation — no data leakage between orgs.
- **Migration-first**: Bug fixes and migration completion take priority over new features.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Migrate from RAGFlow to custom TypeScript backend | Full control over RAG pipeline, TypeScript ecosystem consistency, easier to extend | — Pending (migration in testing) |
| ABAC over simple RBAC | Healthcare and SDLC domains need fine-grained, attribute-based access rules | — Pending |
| Document version history (not git-like) | Users need to search across versions without git complexity | — Pending |
| Org + Project tenant hierarchy | Both domains need org isolation with finer project-level scoping within | — Pending |
| Python worker for ingestion, Node.js for query-time | Heavy parsing/ML in Python, streaming/API in Node.js — play to each runtime's strengths | ✓ Good |

---
*Last updated: 2026-03-18 after initialization*
