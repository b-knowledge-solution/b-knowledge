---
phase: 01-migrate-latest-ragflow-upstream-to-b-knowledge
plan: 01
subsystem: rag
tags: [ragflow, upstream, deepdoc, llm, nlp, opensearch, epub, perplexity, minimax]

# Dependency graph
requires: []
provides:
  - "Updated RAGFlow upstream code (df2cc32f5) in 9 pure directories"
  - "EPUB document parser (epub_parser.py)"
  - "Chunk image base64 utilities (image_utils.py)"
  - "Perplexity and MiniMax LLM provider configs"
  - "PDF garbled text OCR fallback support"
  - "Docling server support in deepdoc"
affects: [01-02, 01-03, 01-04]

# Tech tracking
tech-stack:
  added: [epub-parser, perplexity-llm, minimax-llm, docling-server]
  patterns: [safe-overwrite-with-backup, opensearch-conn-preservation]

key-files:
  created:
    - advance-rag/deepdoc/parser/epub_parser.py
    - advance-rag/api/utils/image_utils.py
  modified:
    - advance-rag/deepdoc/ (full directory)
    - advance-rag/rag/llm/ (full directory)
    - advance-rag/rag/nlp/ (full directory)
    - advance-rag/rag/prompts/ (full directory)
    - advance-rag/rag/utils/ (full directory)
    - advance-rag/rag/flow/ (full directory)
    - advance-rag/common/ (full directory)
    - advance-rag/conf/ (full directory)
    - advance-rag/api/utils/ (full directory)

key-decisions:
  - "Backup and restore opensearch_conn.py to preserve b-knowledge OpenSearch customizations"
  - "Remove upstream es_conn.py since b-knowledge uses OpenSearch not Elasticsearch"

patterns-established:
  - "Safe upstream copy: backup customized files, rm -rf + cp -r, restore backups"

requirements-completed: [UPSTREAM-DIFF, SAFE-COPY]

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 01 Plan 01: Safe Overwrite of Pure RAGFlow Directories Summary

**Updated 9 pure RAGFlow directories from upstream df2cc32f5 with new EPUB parser, Perplexity/MiniMax LLM providers, and PDF OCR fallback**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-23T11:25:37Z
- **Completed:** 2026-03-23T11:27:15Z
- **Tasks:** 1
- **Files modified:** 263

## Accomplishments
- Copied all 9 unmodified RAGFlow directories from upstream commit df2cc32f5
- Preserved opensearch_conn.py with b-knowledge-specific OpenSearch connector
- New upstream files present: epub_parser.py (EPUB document parser), image_utils.py (chunk image base64 utilities)
- Updated LLM factory configs with Perplexity and MiniMax providers
- Protected files confirmed untouched: db/, memory/, config.py, executor_wrapper.py, system_tenant.py, pyproject.toml

## Task Commits

Each task was committed atomically:

1. **Task 1: Copy pure RAGFlow directories from upstream** - `7038384` (feat)

## Files Created/Modified
- `advance-rag/deepdoc/` - Document parsers including new epub_parser.py
- `advance-rag/rag/llm/` - LLM integrations with new Perplexity/MiniMax providers
- `advance-rag/rag/nlp/` - NLP utilities with updated concat_img
- `advance-rag/rag/prompts/` - Updated prompt templates
- `advance-rag/rag/utils/` - RAG utilities (opensearch_conn.py preserved)
- `advance-rag/rag/flow/` - Processing pipeline stages
- `advance-rag/common/` - Shared utilities
- `advance-rag/conf/` - Config files with updated llm_factories.json
- `advance-rag/api/utils/` - API utilities with new image_utils.py

## Decisions Made
- Backed up and restored opensearch_conn.py to preserve b-knowledge OpenSearch customizations (per Pitfall 1 in plan)
- Removed upstream es_conn.py since b-knowledge uses OpenSearch exclusively

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `cp -r ragflow/api/utils/ advance-rag/api/utils/` failed because parent directory did not exist. Created with `mkdir -p` first. Minor filesystem issue, resolved immediately.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All pure RAGFlow directories updated and ready for Plan 02 (import path fixes)
- opensearch_conn.py preserved for continued OpenSearch integration
- New upstream features (EPUB parser, Perplexity/MiniMax) available for integration

---
*Phase: 01-migrate-latest-ragflow-upstream-to-b-knowledge*
*Completed: 2026-03-23*
