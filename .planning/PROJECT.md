# B-Knowledge

## What This Is

An open-source UI to centralize and manage AI Search, Chat, and Knowledge Base. NX-style modular monorepo with Node.js/Express backend, React frontend, Python RAG worker, and Python converter worker.

## Core Value

Unified AI knowledge management — one platform for document ingestion, RAG-powered search, and conversational AI with full control over parsing, chunking, and embedding.

## Current State

Shipped v0.1 with document upload-to-parse pipeline, converter job queue, and full dataset-parity version document management.

**Tech stack:** Node.js 22 / Express 4 / React 19 / Vite 7 / Python 3.11 / FastAPI / PostgreSQL / OpenSearch / Redis / RustFS

## Requirements

### Validated

- Document upload with optional parser selection — v0.1
- Office-to-PDF converter job queue via Redis — v0.1
- Auto-parse non-Office files on upload — v0.1
- Manual trigger for converter worker (bypass schedule) — v0.1
- Converter job status monitoring endpoint — v0.1
- Version document UI parity with dataset detail — v0.1
- Process log dialog for version documents — v0.1
- Enable/disable toggle for version documents — v0.1
- Change parser per document in version view — v0.1
- Chunk navigation from version document list — v0.1
- Force Convert Now button in conversion modal — v0.1
- Bulk metadata tag editing for version documents — v0.1

### Active

- Upstream RAGFlow merge (Phase 1 remaining plans)
- mem0 memory integration evaluation (Phase 2)
- Project feature refactor (Phase 3)
- Code-Graph-RAG pipeline (Phase 4)
- Response evaluation system (Phase 5)

### Out of Scope

- Mobile app — web-first approach
- Self-hosted model training — use external providers

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Converter queue via Redis hashes | Match existing Python worker's polling model | Good |
| Call RAG endpoints directly for version docs | Version docs ARE RAG docs, avoid duplicating logic | Good |
| Reuse ProcessLogDialog/ChangeParserDialog from datasets | DRY, consistent UX across dataset and version views | Good |
| Office files skip auto-parse | Need PDF conversion first, can't parse .docx directly | Good |

## Constraints

- Python workers share PostgreSQL with Node.js backend but use Peewee ORM
- OpenSearch index prefix must be `knowledge_` (not `ragflow_`)
- Converter worker has schedule window (10PM-5AM default), manual trigger bypasses it

---
*Last updated: 2026-04-02 after v0.1 milestone*
