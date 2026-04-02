# B-Knowledge

## What This Is

An open-source UI to centralize and manage AI Search, Chat, and Knowledge Base. NX-style modular monorepo with Node.js/Express backend, React frontend, Python RAG worker, and Python converter worker.

## Core Value

Unified AI knowledge management — one platform for document ingestion, RAG-powered search, and conversational AI with full control over parsing, chunking, and embedding.

## Current State

Shipped v0.1 with document upload-to-parse pipeline, converter job queue, and full dataset-parity version document management. Completed v1.0 with RAGFlow upstream merge, mem0 evaluation, project refactor (3-category tabs), Code-Graph-RAG (12-language parser + Memgraph), response evaluation, and prompt builder. Phase 7 complete — DB schema, BE module, and Python worker prefixes renamed from "Project" to "Knowledge Base". Phase 8 complete — entire FE renamed (feature dir, 47 files, routes, nav, i18n across 3 locales, test files).

**Tech stack:** Node.js 22 / Express 4 / React 19 / Vite 7 / Python 3.11 / FastAPI / PostgreSQL / OpenSearch / Redis / RustFS / Memgraph

## Current Milestone: v0.2 Knowledge Base Refactor & Quality

**Goal:** Rename "Project" to "Knowledge Base" across the entire app, enhance chunk data quality, add a 3-tier permission system, and prepare extensibility for future KB features.

**Target features:**
- Rename Project → Knowledge Base (DB, BE, FE, API routes, URLs, file names, i18n)
- Chunk quality enhancement (strategies, scoring, filtering, metadata)
- Permission system — 3-tier (Read/Write/Admin) with KB-level and resource-level grants
- New KB features (to be defined in later plans)

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
- RAGFlow upstream merge (selective copy of 49 commits) — v1.0
- mem0 memory integration evaluation (ADR approved) — v1.0
- Project feature refactor (3-category tabs: Documents/Standard/Code) — v1.0
- Code-Graph-RAG pipeline (12-language Tree-sitter + Memgraph) — v1.0
- Response evaluation system (thumb up/down + admin histories) — v1.0
- Prompt builder (glossary-based chat integration) — v1.0

### Active

- Rename Project → Knowledge Base across entire app
- Chunk quality enhancement (strategies, scoring, filtering, metadata)
- Permission system with KB-level and resource-level grants (Read/Write/Admin)
- New Knowledge Base features (TBD)

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

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-02 after Phase 8 (Frontend Rename) complete*
