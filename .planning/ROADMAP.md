# Roadmap — feature/rag-core

## Current Milestone: RAG Core Features

> Migrate and stabilize core RAG features from RAGFlow into b-knowledge, including advance-rag pipeline, datasets, chat, and search.

### Phase 1: Migrate latest RAGFlow upstream to b-knowledge

**Goal:** Merge latest RAGFlow upstream (c732a1c → df2cc32f5, 49 commits) into b-knowledge using selective copy (Option A), preserving all b-knowledge integration files.
**Requirements**: Upstream diff analysis, safe copy of pure RAGFlow dirs, manual merge of modified files, dependency updates, feature porting (EPUB, chunk images, deadlock retry), DB migrations if needed.
**Depends on:** None (standalone)
**Plans:** 5 plans

**Upstream:** RAGFlow local folder (nightly-4-gdf2cc32f5), 60 files changed, +2,697/-1,516 lines

Plans:
- [x] **01-01**: Tier 1 — Safe overwrite of pure RAGFlow directories (deepdoc/, rag/llm/, rag/nlp/, rag/prompts/, rag/utils/, rag/flow/, common/)
- [ ] **01-02**: Tier 2 — Manual merge of ~10-15 b-knowledge-modified RAGFlow files (rag/app/*.py, node_executor.py, task_executor.py, graphrag/*.py)
- [ ] **01-03**: Tier 3 — Integration layer updates (pyproject.toml deps, new EPUB parser registration, chunk image support)
- [ ] **01-04**: Tier 4 — Feature porting (aggregated parsing status, deadlock retry, PDF OCR fallback, similarity threshold bypass)
- [ ] **01-05**: Tier 5 — Validation & patch doc (test pipeline, run tests, create patches/ragflow-port-v<NEW>-df2cc32.md)

---

<!-- phases:start -->
<!-- phases:end -->
