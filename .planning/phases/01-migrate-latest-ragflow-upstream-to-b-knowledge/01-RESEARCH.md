# Phase 01: Migrate latest RAGFlow upstream to b-knowledge - Research

**Researched:** 2026-03-23
**Domain:** Python RAG pipeline migration, TypeScript feature porting, Knex schema migration
**Confidence:** HIGH

## Summary

This phase merges 49 upstream RAGFlow commits (c732a1c -> df2cc32f5) into b-knowledge's `advance-rag/` service using selective copy. The upstream diff spans 60 files with +2,697/-1,516 lines across the `rag/`, `deepdoc/`, `common/`, `api/db/`, `api/utils/`, and `conf/` directories. The majority of changes (~1,585 lines) are Infinity connector refactors irrelevant to b-knowledge (which uses OpenSearch), so the effective merge complexity is moderate.

The b-knowledge integration layer uses a "from db.services.*" import pattern (vs upstream's "from api.db.services.*"), which is the primary modification in ~10 files that need manual merge. The import shim in `advance-rag/api/db/__init__.py` does NOT need updating (no new enums in upstream). Two new DB columns require Knex migrations, and several upstream improvements need concept-porting to TypeScript backend services.

**Primary recommendation:** Execute the 5-tier plan in order: safe directory overwrite first, then manual merge of modified files (using git diff to review), then integration updates, then TypeScript feature porting, and finally validation with comprehensive patch documentation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use **hybrid approach** for ~10-15 b-knowledge-modified RAGFlow files: commit current state, copy upstream files, use `git diff` to review changes, then manually restore b-knowledge-specific modifications (db.services imports, tenant model resolution, opensearch_conn.py).
- **D-02:** Pure RAGFlow directories (deepdoc/, rag/llm/, rag/nlp/, rag/prompts/, rag/utils/ except opensearch_conn.py, rag/flow/, common/) are safe to overwrite directly.
- **D-03:** Protected files (db/, memory/, config.py, executor_wrapper.py, system_tenant.py, api/, pyproject.toml) must NEVER be overwritten -- they are b-knowledge integration layer.
- **D-04:** Port **ALL** new upstream features including: EPUB parser, Perplexity + MiniMax LLM providers, PDF garbled text OCR fallback, Deadlock retry in task_executor, Aggregated parsing status API, Chunk image support (image_base64 in add_chunk), Docling server support (DOCLING_SERVER_URL env var), Cross-KB collision guard, Similarity threshold bypass for explicit doc_ids.
- **D-05:** No features deferred -- everything gets ported in this phase.
- **D-06:** Create **Knex migrations** for both new upstream columns: `user_canvas_version.release` (BooleanField, default false, indexed), `api_4_conversation.version_title` (CharField, max 255, nullable).
- **D-07:** Knex migrations maintain schema consistency and prevent conflicts with Peewee auto-migration.
- **D-08:** Port **ALL** ragflow improvements to b-knowledge's TypeScript services: Datasets (aggregated parsing status, metadata query optimization, delete-all support), Search (similarity threshold bypass), Chat (empty doc filter fix, delete-all session), Agent (canvas version release flag, version_title in conversations), Memory (record user_id in messages).
- **D-09:** These are concept ports (rewrite in TypeScript), NOT file copies from ragflow.
- **D-10:** Run `npm run build` + `npm test` + pytest to catch regressions.
- **D-11:** Build + test suite pass is the acceptance gate. No manual pipeline testing required.
- **D-12:** MANDATORY: Create patch note at `patches/ragflow-port-v<VERSION>-df2cc32.md`.

### Claude's Discretion
- Exact order of operations within each tier
- How to structure the Knex migration file(s) (single or split)
- Whether to update advance-rag/pyproject.toml deps in one commit or alongside related feature commits

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPSTREAM-DIFF | Upstream diff analysis | 49 commits, 60 files, +2,697/-1,516 lines analyzed; RAG-relevant: 62 files, +2,487/-1,234 |
| SAFE-COPY | Safe copy of pure RAGFlow dirs | 7 directories identified as safe overwrite: deepdoc/, rag/llm/, rag/nlp/, rag/prompts/, rag/utils/ (except opensearch_conn.py), rag/flow/, common/ |
| MANUAL-MERGE | Manual merge of modified files | 10 files identified with b-knowledge modifications (db.services imports, tenant model resolution) |
| DEP-UPDATE | Dependency updates | pypdf >=4.0.0 -> >=6.8.0 (b-knowledge already at >=4.0.0, needs bump), ebooklib new dep for EPUB |
| FEATURE-PORT | Feature porting | 9 features catalogued with implementation patterns |
| DB-MIGRATION | DB migrations if needed | 2 new columns: user_canvas_version.release, api_4_conversation.version_title |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- All DB migrations through Knex -- never Peewee migrators
- Migration naming: `YYYYMMDDhhmmss_<name>.ts`
- Python code: Google-style docstrings mandatory
- TypeScript code: JSDoc mandatory on all exports
- Inline comments mandatory on control flow, business logic, integration points
- NX-style module boundaries: no cross-module imports, barrel exports via index.ts
- Config access only through `config` object, never `process.env`
- Backend services use Singleton Pattern

## Standard Stack

### Core (Existing -- no new libraries needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Knex | existing | DB migrations for new columns | Project convention: all schema changes through Knex |
| Peewee | existing | Python ORM reads new columns | RAGFlow's ORM, already in place |
| Vitest | existing | TypeScript test runner | BE + FE test framework |
| pytest | existing | Python test runner | advance-rag test framework |

### New Dependencies (advance-rag)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ebooklib | >=0.18 | EPUB parsing | Required by new epub_parser.py |
| pypdf | >=6.8.0 | PDF processing | Bump from current >=4.0.0 |

### No New Dependencies Needed
- Perplexity + MiniMax LLM providers use existing `litellm` / `openai` SDKs
- Docling server support uses existing `requests` library
- Image utils use existing `PIL` (Pillow)
- Deadlock retry uses existing `tenacity`

## Architecture Patterns

### Upstream Merge Pattern (Hybrid Approach)
```
For each modified file:
1. git add + commit current state (safety checkpoint)
2. cp ragflow/<path> advance-rag/<path>  (overwrite with upstream)
3. git diff  (review what changed)
4. Manually restore b-knowledge modifications:
   - "from api.db.services.*" -> "from db.services.*"
   - "from api.db.db_models" -> "from db.db_models"
   - "from api.db.joint_services.*" -> "from db.joint_services.*"
   - Any b-knowledge-specific logic (tenant model resolution, etc.)
5. git add + commit merged result
```

### Import Pattern Differences
```python
# Upstream RAGFlow uses:
from api.db.services.llm_service import LLMBundle
from api.db.joint_services.tenant_model_service import get_model_config_by_type_and_name

# b-knowledge uses (via db/ at project root):
from db.services.llm_service import LLMBundle
from db.joint_services.tenant_model_service import get_model_config_by_type_and_name
```

### Protected Files (NEVER Overwrite)
```
advance-rag/
  db/                        # 16+ custom service files
  memory/                    # b-knowledge memory feature
  config.py                  # Environment config
  executor_wrapper.py        # Redis pub/sub progress hook
  system_tenant.py           # System tenant verification
  api/                       # FastAPI endpoints
  pyproject.toml             # Custom dependencies
```

### Safe Overwrite Directories
```
advance-rag/
  deepdoc/                   # Document parsers (safe: no b-knowledge modifications)
  rag/llm/                   # LLM integrations (safe: no modifications)
  rag/nlp/                   # NLP utilities (safe: no modifications)
  rag/prompts/               # Prompt templates (safe: no modifications)
  rag/utils/                 # RAG utilities (EXCEPT opensearch_conn.py)
  rag/flow/                  # Processing pipeline (safe: no modifications)
  common/                    # Shared utilities (safe: no modifications)
```

### Modified Files Requiring Manual Merge

| File | b-knowledge Modifications | Upstream Changes |
|------|--------------------------|------------------|
| `rag/app/naive.py` | `from db.services.*` imports (4 locations), docstrings added | EPUB support (+8 lines), removed get_picture method (-34 lines), Docling callback guard, removed LazyDocxImage import |
| `rag/app/manual.py` | No b-knowledge modifications found | Removed get_picture method (-39 lines), moved concat_img to nlp module, removed PIL import |
| `rag/app/picture.py` | `from db.services.*` imports (2 locations) | Minimal changes expected |
| `rag/app/qa.py` | None identified | Removed 12 lines |
| `rag/svr/task_executor.py` | `from db.services.*` imports (12 locations) | Cross-KB collision guard (+8 lines), tenant_id fix for RAPTOR (+1 line) |
| `rag/graphrag/general/extractor.py` | `from db.services.*` imports (1 location) | Response normalization helper (+15 lines), truncated cache detection (+4 lines) |
| `rag/graphrag/search.py` | `from db.services.*` imports (3 locations) | Minor fix (+2 lines) |
| `rag/utils/opensearch_conn.py` | b-knowledge header comment, logger name | `es_conn.py` has minor changes; opensearch_conn.py itself unchanged upstream |
| `rag/raptor.py` | None identified | Removed 3 lines |
| `rag/svr/discord_svr.py` | None identified | Minor fix (+2 lines) |
| `rag/svr/sync_data_source.py` | None identified | Jira connector changes (+15 lines) |

### db/ Service Files (Protected but Need Upstream Updates)

The `advance-rag/db/` directory is protected (D-03), but upstream changes to `api/db/services/` include important improvements that need manual porting:

| File | Upstream Changes | Action |
|------|-----------------|--------|
| `common_service.py` | New `retry_deadlock_operation` decorator (+32 lines) | Copy new function to b-knowledge's version |
| `document_service.py` | Metadata query optimization (scope to page-level doc IDs), deadlock retry import, aggregated parsing status | Port relevant changes to b-knowledge's version |
| `canvas_service.py` | Release flag support, latest release time query | Port to b-knowledge's version |
| `user_canvas_version.py` | Release flag in versions, protect released versions from overwrite | Port to b-knowledge's version |
| `doc_metadata_service.py` | Simplified metadata queries (-152 lines net refactor) | Review and port if applicable |
| `db_models.py` | 2 new columns + PostgreSQL-specific migration fixes | Columns via Knex migration; Peewee model fields need adding manually |

### TypeScript Feature Porting Pattern
```typescript
// Concept port: rewrite upstream Python logic in TypeScript
// Follow existing service patterns in be/src/modules/

// Example: Aggregated parsing status in rag.service.ts
/**
 * @description Gets aggregated document parsing status counts for a dataset
 * @param {string} datasetId - Dataset ID to aggregate status for
 * @returns {Promise<ParsingStatusCounts>} Count of docs by parsing status
 */
export async function getAggregatedParsingStatus(datasetId: string): Promise<ParsingStatusCounts> {
  // Query document table grouped by run status for the given dataset
  const counts = await knex('document')
    .where('kb_id', datasetId)
    .groupBy('run')
    .select('run')
    .count('* as count')
  return formatStatusCounts(counts)
}
```

### Knex Migration Pattern
```typescript
// Migration naming: YYYYMMDDhhmmss_add_ragflow_upstream_columns.ts
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add release flag to canvas versions for published version tracking
  await knex.schema.alterTable('user_canvas_version', (table) => {
    table.boolean('release').notNullable().defaultTo(false).index()
  })

  // Add version title to conversation sessions
  await knex.schema.alterTable('api_4_conversation', (table) => {
    table.string('version_title', 255).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_canvas_version', (table) => {
    table.dropColumn('release')
  })
  await knex.schema.alterTable('api_4_conversation', (table) => {
    table.dropColumn('version_title')
  })
}
```

### Anti-Patterns to Avoid
- **Overwriting protected files:** NEVER copy upstream `api/db/` over `advance-rag/db/` -- b-knowledge has 16+ custom service files with different patterns
- **Forgetting import translation:** Every `from api.db.*` in upstream must become `from db.*` in b-knowledge
- **Peewee auto-migration:** Never rely on Peewee's `migrate()` for schema changes -- use Knex migrations
- **Copying web/ or agent/ directories:** These are RAGFlow-specific (UmiJS frontend, Flask-based agent). b-knowledge has its own React/Express implementations

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EPUB parsing | Custom EPUB extractor | Upstream's `epub_parser.py` + `ebooklib` | 145-line tested parser already written |
| PDF garbled text detection | Custom garble checker | Upstream's `_is_garbled_char()` + OCR fallback in `pdf_parser.py` | Unicode Private Use Area detection with CID pattern matching |
| Deadlock retry | Custom retry logic | Upstream's `retry_deadlock_operation` decorator in `common_service.py` | Uses `tenacity` with proper exponential backoff |
| LLM provider configs | Manual JSON entries | Upstream's `conf/llm_factories.json` additions | Perplexity + MiniMax model definitions |
| Lazy image merging | Custom image concat | Upstream's `LazyDocxImage.merge()` in `lazy_image.py` | Preserves lazy evaluation, avoids premature PIL loads |

## Common Pitfalls

### Pitfall 1: Overwriting opensearch_conn.py
**What goes wrong:** opensearch_conn.py in `rag/utils/` has a b-knowledge-specific header comment and logger name. Blindly copying rag/utils/ will overwrite it.
**Why it happens:** rag/utils/ is listed as "safe overwrite" but opensearch_conn.py is the exception.
**How to avoid:** Copy rag/utils/ contents EXCEPT opensearch_conn.py. Or copy all then restore opensearch_conn.py from git.
**Warning signs:** Test failures related to OpenSearch connection or missing logger.

### Pitfall 2: Missing db.services Import Translation
**What goes wrong:** Upstream changes add new `from api.db.services.*` imports that need translating to `from db.services.*`.
**Why it happens:** The upstream diff introduces new imports in modified files (e.g., `retry_deadlock_operation` import in document_service.py).
**How to avoid:** After copying upstream files for manual merge, grep for `from api.db` and translate ALL to `from db`.
**Warning signs:** `ModuleNotFoundError: No module named 'api.db'` at runtime.

### Pitfall 3: Peewee Model Out of Sync with Knex Migration
**What goes wrong:** Knex migration adds columns to PostgreSQL, but Peewee model in `db_models.py` doesn't have the field definitions.
**Why it happens:** b-knowledge's db_models.py is in the protected `db/` directory and won't get upstream's new field definitions automatically.
**How to avoid:** After running Knex migration, manually add `release = BooleanField(...)` and `version_title = CharField(...)` to the Peewee model in `advance-rag/db/db_models.py`.
**Warning signs:** Peewee queries that reference new columns throw `AttributeError` or silently ignore them.

### Pitfall 4: pypdf Version Mismatch
**What goes wrong:** Current b-knowledge has `pypdf>=4.0.0` but upstream requires `>=6.8.0`. The epub_parser uses features from pypdf 6.x.
**Why it happens:** b-knowledge's pyproject.toml was pinned at a lower version.
**How to avoid:** Update `advance-rag/pyproject.toml` to `pypdf>=6.8.0` and reinstall venv.
**Warning signs:** Import errors or runtime failures in PDF/EPUB parsing.

### Pitfall 5: Forgetting conf/ Directory Updates
**What goes wrong:** New LLM provider entries (Perplexity, MiniMax model updates) and service_conf.yaml defaults are missed.
**Why it happens:** `conf/` is not listed in the standard copy map but has upstream changes.
**How to avoid:** Copy `ragflow/conf/llm_factories.json` to `advance-rag/conf/llm_factories.json` and update `service_conf.yaml`.
**Warning signs:** New LLM providers not appearing in model selection.

### Pitfall 6: db_models.py PostgreSQL Migration Conflicts
**What goes wrong:** Upstream added PostgreSQL-specific migration code in db_models.py (tenant_llm ID migration). If this auto-runs, it may conflict with Knex-managed schema.
**Why it happens:** Peewee's auto-migration in db_models.py runs on startup.
**How to avoid:** Since db_models.py is in the protected directory, only port the new column DEFINITIONS (model fields), NOT the migration functions. The Knex migration handles the actual DDL.
**Warning signs:** Database errors on startup about duplicate columns or failed ALTER TABLE.

## Code Examples

### EPUB Parser Registration in naive.py
```python
# Source: ragflow/rag/app/naive.py (upstream df2cc32f5)
# After the HTML parsing block, add EPUB support
elif re.search(r"\.epub$", filename, re.IGNORECASE):
    callback(0.1, "Start to parse.")
    chunk_token_num = int(parser_config.get("chunk_token_num", 128))
    sections = EpubParser()(filename, binary, chunk_token_num)
    sections = [(_, "") for _ in sections if _]
    sections = _normalize_section_text_for_rtl_presentation_forms(sections)
    callback(0.8, "Finish parsing.")
```

### Deadlock Retry Decorator
```python
# Source: ragflow/api/db/services/common_service.py (upstream df2cc32f5)
def retry_deadlock_operation(max_retries=3, retry_delay=0.1):
    """Retry a full DB operation when MySQL/OceanBase aborts it due to deadlock."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    if _is_deadlock_error(e) and attempt < max_retries - 1:
                        time.sleep(retry_delay * (2 ** attempt))
                        continue
                    raise
        return wrapper
    return decorator
```

### Similarity Threshold Bypass
```python
# Source: ragflow/rag/nlp/search.py (upstream df2cc32f5)
# When doc_ids is explicitly provided (metadata or document filtering), bypass threshold
# User wants those specific documents regardless of their relevance score
if doc_ids:
    post_threshold = 0.0
```

### Cross-KB Collision Guard in task_executor.py
```python
# Source: ragflow/rag/svr/task_executor.py (upstream df2cc32f5)
# Build doc name lookup to prevent cross-KB name collisions when chunks
# reference documents from different knowledge bases
doc_name_by_id = {}
for doc_id in set(doc_ids):
    ok, source_doc = DocumentService.get_by_id(doc_id)
    if not ok or not source_doc:
        continue
    source_name = getattr(source_doc, "name", "")
    if source_name:
        doc_name_by_id[doc_id] = source_name
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `get_picture()` method on parser classes | `concat_img()` in `rag/nlp/__init__.py` + `LazyDocxImage.merge()` | df2cc32f5 | Image handling centralized, lazy evaluation preserved |
| Per-class image extraction in naive.py/manual.py | Shared `LazyDocxImage` with blob merging | df2cc32f5 | -73 lines of duplicated code removed |
| `from rag.utils.lazy_image import LazyDocxImage` in naive.py | Import moved to `rag/nlp/__init__.py` | df2cc32f5 | naive.py no longer directly imports LazyDocxImage |
| Metadata query scans all docs | Page-level doc ID scoping | df2cc32f5 | Performance improvement for large datasets |
| No EPUB support | `EpubParser` in `deepdoc/parser/epub_parser.py` | df2cc32f5 | New file format supported |
| No garbled PDF detection | `_is_garbled_char()` + OCR fallback | df2cc32f5 | Handles CID-mapped fonts gracefully |
| Docling requires local install | Docling server URL support (`DOCLING_SERVER_URL`) | df2cc32f5 | Remote Docling deployment possible |

## Detailed File Change Map

### Tier 1: Safe Overwrite (7 directories)

```
ragflow/deepdoc/           -> advance-rag/deepdoc/
ragflow/rag/llm/           -> advance-rag/rag/llm/
ragflow/rag/nlp/           -> advance-rag/rag/nlp/
ragflow/rag/prompts/       -> advance-rag/rag/prompts/
ragflow/rag/utils/         -> advance-rag/rag/utils/    (EXCEPT opensearch_conn.py)
ragflow/rag/flow/          -> advance-rag/rag/flow/
ragflow/common/            -> advance-rag/common/
ragflow/conf/              -> advance-rag/conf/
ragflow/api/utils/*.py     -> advance-rag/api/utils/    (new: image_utils.py)
```

**Key new files arriving via safe copy:**
- `deepdoc/parser/epub_parser.py` (145 lines, new EPUB support)
- `deepdoc/parser/mineru_parser.py` (19 new lines added)
- `api/utils/image_utils.py` (40 lines, chunk image base64 utilities)
- `rag/utils/lazy_image.py` (+13 lines, merge method)

### Tier 2: Manual Merge (~10 files)

See "Modified Files Requiring Manual Merge" table above.

### Tier 3: Integration Layer Updates

| Update | File | Change |
|--------|------|--------|
| pypdf version bump | `advance-rag/pyproject.toml` | `>=4.0.0` -> `>=6.8.0` |
| Add ebooklib | `advance-rag/pyproject.toml` | New dep: `ebooklib>=0.18` |
| EPUB parser import | `deepdoc/parser/__init__.py` | Comes with Tier 1 safe copy |
| Peewee model fields | `advance-rag/db/db_models.py` | Add `release` and `version_title` fields |
| Knex migration | `be/src/shared/db/migrations/` | New migration for 2 columns |

### Tier 4: TypeScript Feature Porting

| Feature | Target Service | Upstream Reference | Complexity |
|---------|---------------|-------------------|------------|
| Aggregated parsing status | `rag.service.ts` | `document_service.py` get_parsing_status | LOW: simple GROUP BY query |
| Metadata query optimization | `rag.service.ts` | `document_service.py` page-level doc IDs | LOW: scope query to current page IDs |
| Delete-all documents | `rag-document.service.ts` | `document_service.py` delete_by_kb_id | LOW: bulk delete endpoint |
| Similarity threshold bypass | `rag-search.service.ts` | `rag/nlp/search.py` doc_ids check | LOW: conditional threshold=0 |
| Empty doc filter fix | `chat-conversation.service.ts` | `dialog_service.py` empty filter | LOW: add null check |
| Delete-all sessions | `chat-conversation.service.ts` | `canvas_service.py` delete sessions | LOW: bulk delete |
| Canvas version release flag | `agent.service.ts` | `canvas_service.py` + `user_canvas_version.py` | MEDIUM: release/publish workflow |
| version_title in conversations | `agent.service.ts` | `canvas_service.py` | LOW: add field to create/query |
| user_id in memory messages | `memory.service.ts` | `memory_message_service.py` | LOW: add field |

### Tier 5: Validation

- `npm run build` -- TypeScript compilation check
- `npm test` -- All workspace tests (BE Vitest + FE Vitest)
- `cd advance-rag && python -m pytest tests/ -x` -- Python tests
- Create `patches/ragflow-port-v<VERSION>-df2cc32.md`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (BE) | Vitest (in be/vitest.config.ts) |
| Framework (Python) | pytest (in advance-rag/pyproject.toml) |
| Quick run command (BE) | `npm test --workspace=be` |
| Quick run command (Python) | `cd advance-rag && python -m pytest tests/ -x --tb=short` |
| Full suite command | `npm test && cd advance-rag && python -m pytest tests/ -x` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAFE-COPY | Pure directory overwrite doesn't break imports | smoke | `cd advance-rag && python -c "from rag.llm import chat_model; from deepdoc.parser import EpubParser"` | N/A (inline) |
| MANUAL-MERGE | Modified files have correct imports | smoke | `cd advance-rag && python -c "from rag.app.naive import chunk; from rag.svr.task_executor import main_loop"` | N/A (inline) |
| DEP-UPDATE | Dependencies install correctly | smoke | `cd advance-rag && pip install -e .` | N/A (inline) |
| DB-MIGRATION | New columns exist after migration | unit | `npm run db:migrate` | N/A (migration file) |
| FEATURE-PORT | TypeScript services compile | build | `npm run build --workspace=be` | N/A |
| FEATURE-PORT | Existing tests still pass | unit | `npm test` | Existing test files |

### Sampling Rate
- **Per task commit:** `npm run build --workspace=be && npm test --workspace=be`
- **Per wave merge:** Full suite: `npm test && cd advance-rag && python -m pytest tests/ -x`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- None -- existing test infrastructure covers all phase requirements. No new test files needed for the migration itself (existing tests validate non-regression).

## Open Questions

1. **ebooklib exact version**
   - What we know: Upstream epub_parser.py imports `ebooklib` and `ebooklib.epub`
   - What's unclear: Exact minimum version required (upstream pyproject.toml lists it but we haven't checked the exact constraint)
   - Recommendation: Use `ebooklib>=0.18` which is the latest stable. Verify by checking `ragflow/pyproject.toml` during Tier 3.

2. **db_models.py Peewee auto-migration functions**
   - What we know: Upstream added PostgreSQL-specific migration functions (_update_tenant_llm_to_id_primary_key_postgres). These run on Peewee startup.
   - What's unclear: Whether b-knowledge's db_models.py already has the `tenant_llm` ID migration from a previous port
   - Recommendation: During Tier 2/3, check if these migration functions already exist in b-knowledge's db_models.py. If not, port them carefully to avoid conflicts with Knex-managed schema.

3. **Docling server URL environment variable**
   - What we know: Upstream added `DOCLING_SERVER_URL` support in docling_parser.py (comes with safe copy)
   - What's unclear: Whether advance-rag/.env.example needs updating
   - Recommendation: Add `DOCLING_SERVER_URL` to advance-rag/.env.example as optional variable during Tier 3.

## Environment Availability

> Step 2.6: This phase is primarily code/config changes (file copy, manual merge, TypeScript editing). No new external tools required beyond existing dev environment.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ragflow/ local folder | Source files for copy | Yes | df2cc32f5 | -- |
| PostgreSQL | Knex migrations | Yes (via Docker) | 17 | -- |
| Python venv | pytest, pip install | Yes | 3.11 | -- |
| Node.js | npm test, build | Yes | 22+ | -- |

## Sources

### Primary (HIGH confidence)
- Direct git diff analysis: `git diff c732a1c..df2cc32f5` in local ragflow/ folder
- Existing patch note: `patches/ragflow-port-v0.24.0-c732a1c.md`
- Current codebase grep of advance-rag/ for b-knowledge modifications
- CONTEXT.md decisions from user discussion

### Secondary (MEDIUM confidence)
- `.planning/codebase/STRUCTURE.md` -- directory layout reference
- `.planning/codebase/INTEGRATIONS.md` -- service dependency map

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries beyond ebooklib and pypdf bump
- Architecture: HIGH -- merge pattern well-documented in existing patch note, b-knowledge modifications identified via grep
- Pitfalls: HIGH -- all identified through direct code inspection of upstream diff and current b-knowledge state
- Feature porting: MEDIUM -- TypeScript implementations are concept ports; exact API shapes need verification during implementation

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable -- upstream snapshot is fixed at df2cc32f5)
