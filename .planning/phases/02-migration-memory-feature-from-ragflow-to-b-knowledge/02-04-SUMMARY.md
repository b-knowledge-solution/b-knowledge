---
phase: 02-migration-memory-feature-from-ragflow-to-b-knowledge
plan: 04
subsystem: memory, chat
tags: [llm, opensearch, extraction, embedding, memory, bitmask, sse]

requires:
  - phase: 02-migration-memory-feature-from-ragflow-to-b-knowledge
    provides: Memory model, message service, extraction prompts (Plan 02-02)
provides:
  - LLM-powered memory extraction pipeline (Semantic/Episodic/Procedural/Raw)
  - Chat-memory integration (auto-inject + fire-and-forget extraction)
  - memory_id FK on chat_assistants table
  - Chat history import for retroactive memory building (D-11)
affects: [memory-ui, memory-api, chat-settings]

tech-stack:
  added: []
  patterns: [fire-and-forget void promise, bitmask-driven type dispatch, JSON parse with regex fallback]

key-files:
  created:
    - be/src/modules/memory/services/memory-extraction.service.ts
    - be/src/shared/db/migrations/20260323100001_add_memory_id_to_chat_assistants.ts
  modified:
    - be/src/modules/memory/index.ts
    - be/src/modules/chat/services/chat-conversation.service.ts
    - be/src/shared/models/types.ts

key-decisions:
  - "Fire-and-forget extraction uses void promise + catch pattern (Pitfall 5 non-blocking)"
  - "Memory context injected before KG context merge in system prompt assembly"
  - "RAW type without custom prompts stores conversation directly (no LLM call)"
  - "JSON parsing uses 3-tier fallback: direct parse, regex extraction, raw response (Pitfall 3)"
  - "Reuses queryVector from retrieval step for memory search when available"

patterns-established:
  - "void promise + catch for non-blocking post-response work in SSE pipelines"
  - "Bitmask-driven type dispatch with per-type try/catch isolation"

requirements-completed: [MEM-EXTRACTION, MEM-CHAT-INTEGRATION]

duration: 3min
completed: 2026-03-23
---

# Phase 02 Plan 04: Memory Extraction + Chat Integration Summary

**LLM-powered memory extraction pipeline with bitmask type dispatch, JSON parse fallback, and fire-and-forget chat integration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T04:09:50Z
- **Completed:** 2026-03-23T04:13:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Memory extraction service processes conversations through LLM for 4 memory types (RAW/SEMANTIC/EPISODIC/PROCEDURAL) with bitmask-driven selection
- Chat assistants auto-inject relevant memories into LLM context and fire-and-forget extract new memories after response
- JSON parsing has 3-tier fallback: direct parse, regex array extraction, raw response (Pitfall 3)
- Chat history import function enables retroactive memory building from existing sessions (D-11)

## Task Commits

Each task was committed atomically:

1. **Task 1: Memory extraction service** - `4f845a2` (feat)
2. **Task 2: Chat integration + memory_id migration** - `f7af489` (feat)

## Files Created/Modified
- `be/src/modules/memory/services/memory-extraction.service.ts` - LLM extraction pipeline with bitmask dispatch
- `be/src/modules/memory/index.ts` - Barrel export for memoryExtractionService
- `be/src/shared/db/migrations/20260323100001_add_memory_id_to_chat_assistants.ts` - memory_id FK column
- `be/src/modules/chat/services/chat-conversation.service.ts` - Memory injection + fire-and-forget extraction
- `be/src/shared/models/types.ts` - memory_id field on ChatAssistant interface

## Decisions Made
- Fire-and-forget extraction uses `void promise.catch()` pattern ensuring non-blocking behavior (Pitfall 5)
- Memory context injected into system prompt before KG context merge, after language instruction
- RAW type without custom prompts stores conversation directly without LLM call (optimization)
- JSON parsing uses 3-tier fallback for robust LLM response handling (Pitfall 3)
- Reuses queryVector from retrieval step for memory search to avoid duplicate embedding calls

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Memory extraction pipeline ready for UI wiring (memory pool settings, chat assistant memory_id selector)
- Batch extraction mode available for session-end triggers
- Import function ready for D-11 chat history import UI

---
*Phase: 02-migration-memory-feature-from-ragflow-to-b-knowledge*
*Completed: 2026-03-23*
