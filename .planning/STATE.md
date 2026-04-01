---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_plan: 1
status: Phase 05 Complete
stopped_at: Phase 6 UI-SPEC approved
last_updated: "2026-04-01T03:05:08.280Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 23
  completed_plans: 18
  percent: 100
---

# Project State

## Current Phase

Phase 1: Migrate latest RAGFlow upstream to b-knowledge — **Complete**
Current Plan: 1
Progress: [██████████] 100%

### Last Session

- **Stopped at:** Phase 6 UI-SPEC approved
- **Timestamp:** 2026-03-31T10:26:00Z

## Accumulated Context

### Roadmap Evolution

- Phase 1 added: Migrate latest RAGFlow upstream to b-knowledge (Option A selective copy)
- Phase 2 added: Investigate mem0 for memory feature
- Phase 3 added: Refactor project feature - separate project creation, category management (documents/standard/code), and versioned datasets
- Phase 4 added: Enhance code parser with Code-Graph-RAG - Tree-sitter Knowledge Graph and Code RAG API
- Phase 5 added: Assistant response evaluation with thumb up/down on chat and search, admin histories page in agent studio
- Phase 6 added: Add Prompt builder to chat for user to build a prompt base on glossary data as task management and keyword management

### Decisions

- Backup and restore opensearch_conn.py to preserve b-knowledge OpenSearch customizations
- Remove upstream es_conn.py since b-knowledge uses OpenSearch not Elasticsearch
- Removed get_picture override from naive.py Docx — now inherited from parent DocxParser
- Skipped sync_data_source.py — not present in b-knowledge (RAGFlow-only connector)
- Skipped handle_save_to_memory_task import — b-knowledge memory via Node.js backend
- Added API4Conversation and UserCanvasVersion models to db_models.py — missing from b-knowledge
- Skipped doc_metadata_service refactoring — b-knowledge version already more complete than upstream
- Applied retry_deadlock_operation to delete_document_and_update_kb_counts for atomic safety
- Used db() direct queries for user_canvas_version since no BaseModel exists for that Peewee table
- Added user_id as optional field to MemoryMessageDoc for backward compatibility
- Threshold bypass applies to both search dispatch and post-filter for consistency
- Pre-existing TS build error in guideline components fixed as blocking issue (super-admin missing from roleHierarchy)
- Pre-existing test failures (6 BE, FE hanging) documented but not fixed per scope boundary rules
- [Phase 03]: category_type defaults to documents for backward compatibility
- [Phase 03]: category_type is immutable after creation (excluded from updateCategorySchema)
- [Phase 03]: dataset_id FK uses ON DELETE SET NULL to preserve category if dataset removed
- [Phase 03-02]: Dataset name format: ${project.name}_${category.name} for standard/code categories
- [Phase 03-02]: Code categories force parser_id='code'; standard uses project default or 'naive'
- [Phase 03-02]: Dataset auto-creation is non-blocking (try/catch with warn log)
- [Phase 03-03]: Removed ProjectCategory type entirely, projects are type-agnostic containers per D-01
- [Phase 03-03]: CategoryFilterTabs.tsx left as dead code rather than deleted to minimize scope
- [Phase 03-04]: Documents tab reuses existing DocumentsTab with internal sidebar; refactoring deferred
- [Phase 03-04]: Standard/Code tab content is placeholder until Plan 05 implements dedicated views
- [Phase 03-04]: CategoryModal categoryType prop set by parent (active tab), not internally managed
- [Phase 03]: DocumentListPanel reused as-is for standard/code views, passing dataset_id as versionId
- [Phase 03]: Git sync panel deferred as disabled Collapsible placeholder per RESEARCH.md
- [Phase 03]: Japanese/Vietnamese translations use proper Unicode instead of romanized text
- [Phase 02]: mem0ai 1.0.7 installed (Apache 2.0 confirmed); REST API server importable; custom sidecar recommended
- [Phase 02]: Tenant isolation via separate OpenSearch collection_name per tenant (index-level hard isolation)
- [Phase 02]: Apache AGE check graceful -- skips if extension not in PG Docker image
- [Phase 02]: Benchmark tests auto-skip when OPENAI_API_KEY or OpenSearch unavailable
- [Phase 02]: GO decision: Adopt mem0 as memory backend (ADR-001 approved)
- [Phase 05]: FeedbackCommentPopover placed in shared fe/src/components/ to respect NX module boundary rules
- [Phase 05]: Agent feedback uses POST /api/feedback with source=agent (shared endpoint)
- [Phase 05]: Used Knex modify() for optional date filters before groupBy in feedback model
- [Phase 05-04]: Source badge colors: blue=chat, green=search, purple=agent -- consistent across all dashboard components
- [Phase 05-04]: TopFlaggedSessionsCard placed alongside FeedbackTrendChart in 2-column layout
- [Phase 05-04]: Source breakdown displayed as Badge row card, not as a 5th gradient stat card
- [Phase 05]: Agent run queries use db() directly in admin-history service for cross-table aggregation
- [Phase 05]: Read-only feedback display on agent runs per D-08 (no FeedbackCommentPopover)
- [Phase 05-05]: Tenant scoping on history tables via answer_feedback.tenant_id (history tables lack tenant_id)
- [Phase 05-05]: Post-query feedback merge pattern for detail views (separate query + Map lookup)
- [Phase 05-05]: Agent run tenant scoping via agents.tenant_id

### Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01    | 01   | 2min     | 1     | 263   |
| 01    | 02   | 7min     | 2     | 5     |
| 01    | 03   | 5min     | 2     | 8     |
| 01    | 04   | 5min     | 2     | 7     |
| 01    | 05   | 44min    | 2     | 3     |
| Phase 03 P01 | 1min | 2 tasks | 3 files |
| 03    | 02   | 3min     | 1     | 2     |
| 03    | 03   | 3min     | 2     | 5     |
| 03    | 04   | 3min     | 2     | 4     |
| Phase 03 P05 | 8min | 3 tasks | 9 files |
| Phase 02 P01 | 6min | 2 tasks | 5 files |
| Phase 02 P02 | 4min | 2 tasks | 3 files |
| Phase 02 P03 | 3min | 2 tasks | 2 files |
| Phase 05 P02 | 9min | 2 tasks | 10 files |
| Phase 05 P01 | 10min | 2 tasks | 12 files |
| 05    | 04   | 10min    | 2     | 12    |
| Phase 05 P03 | 39min | 3 tasks | 21 files |
| 05    | 05   | 11min    | 2     | 9     |

### Pending Todos

- 1 pending todo(s) in `.planning/todos/pending/`
