# Phase 1: Migrate latest RAGFlow upstream to b-knowledge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 01-migrate-latest-ragflow-upstream-to-b-knowledge
**Areas discussed:** Merge strategy, Feature porting scope, DB migration approach, Validation criteria, Feature improvements (TS porting)

---

## Merge Strategy for Modified Files

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid (Recommended) | Copy upstream, git diff to review changes, manually restore b-knowledge patches. Fast with safety net. | ✓ |
| Manual line-by-line | Open each file side-by-side, manually port relevant upstream changes. Most precise but slow. | |
| You decide | Claude picks the best approach per file based on complexity of changes. | |

**User's choice:** Hybrid (Recommended)
**Notes:** ~10-15 files with b-knowledge modifications need careful handling. Key files: rag/app/naive.py, rag/agent/node_executor.py, rag/svr/task_executor.py, rag/graphrag/*.py, rag/utils/opensearch_conn.py.

---

## Feature Porting Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All high+medium value (Recommended) | Port EPUB, LLM providers, PDF OCR, deadlock retry, aggregated parsing status, collision guard, search fix. Defer chunk images, Docling. | |
| Essentials only | Port only what comes free with Tier 1 copy + EPUB + deadlock retry. Defer everything else. | |
| Everything | Port all features including chunk images and Docling server support. | ✓ |

**User's choice:** Everything
**Notes:** No features deferred. All new upstream capabilities will be ported in this phase.

---

## DB Migration Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Create Knex migrations (Recommended) | Add both columns via Knex to maintain schema consistency. Prevents Peewee auto-migration conflicts. | ✓ |
| Let Peewee handle it | Skip Knex migrations — Peewee's startup migration will add the columns. | |
| You decide per column | Claude evaluates each column's relevance and decides. | |

**User's choice:** Create Knex migrations (Recommended)
**Notes:** Both columns (user_canvas_version.release, api_4_conversation.version_title) will get Knex migrations.

---

## Validation Criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Build + test suites (Recommended) | Run npm run build, npm test, and pytest to catch regressions. | ✓ |
| Build + tests + manual pipeline | Also test document upload → parse → search end-to-end. | |
| Build only | Just verify compilation. Fastest but lowest confidence. | |

**User's choice:** Build + test suites (Recommended)
**Notes:** No manual pipeline testing required. Build + automated tests is the acceptance gate.

---

## Feature Improvements (TS Porting)

| Option | Description | Selected |
|--------|-------------|----------|
| Port concepts to b-knowledge TS (Recommended) | Review ragflow improvements, implement relevant ones in TypeScript. Not a copy — a rewrite. | ✓ |
| Include in this phase | Port all as part of merge phase. | |
| Separate phase | Create new phase for TS porting. | |

**User's choice:** Port concepts to b-knowledge TS (Recommended)

**Scope sub-question:**

| Option | Description | Selected |
|--------|-------------|----------|
| High-value only | Parsing status, agent release, similarity bypass. | |
| All improvements | Everything: parsing status, agent release, similarity bypass, empty doc filter, metadata optimization, user_id in memory, delete-all. | ✓ |
| You decide | Claude evaluates each. | |

**User's choice:** All improvements
**Notes:** Every ragflow improvement gets ported to b-knowledge's TypeScript code.

---

## Additional Requirements (User-Initiated)

**Patch Note Requirement:** User explicitly requested that a new patch note must be created at `patches/ragflow-port-v<VERSION>-df2cc32.md` following the format of the existing patch note. This is a mandatory deliverable.

## Claude's Discretion

- Exact order of operations within each tier
- How to structure Knex migration file(s)
- Whether to update pyproject.toml deps in one commit or alongside feature commits

## Deferred Ideas

None — discussion stayed within phase scope.
