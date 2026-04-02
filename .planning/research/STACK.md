# Stack Research

**Domain:** Knowledge Base management platform -- incremental feature additions (rename refactor, chunk quality, RBAC)
**Researched:** 2026-04-02
**Confidence:** HIGH

## Scope

This research covers ONLY new stack additions/changes needed for v0.2 milestone features. The existing validated stack (Node.js 22 / Express 4 / React 19 / Vite 7 / Python 3.11 / FastAPI / PostgreSQL / OpenSearch / Redis / RustFS / Memgraph) is NOT re-evaluated.

## Recommended Stack Additions

### 1. Chunk Quality Scoring & Filtering (Python -- advance-rag)

No new libraries needed. The existing stack already contains everything required.

| Technology | Version | Purpose | Why No Addition Needed |
|------------|---------|---------|------------------------|
| scikit-learn | >=1.3.0 (installed) | Cosine similarity, statistical scoring | Already in pyproject.toml; provides `sklearn.metrics.pairwise.cosine_similarity` for chunk coherence scoring |
| numpy | >=1.24.0 (installed) | Numeric operations for quality metrics | Already in pyproject.toml; used for threshold calculations, percentile analysis |
| tiktoken | >=0.5.0 (installed) | Token counting for chunk size validation | Already in pyproject.toml; counts tokens per chunk for size-based quality gates |
| sentence-transformers | N/A | Embedding-based quality scoring | NOT needed -- the system already generates embeddings via its own model pipeline (`rag/llm/`); reuse those embeddings for quality scoring rather than adding a separate library |

**Quality scoring implementation approach:** Build custom scoring functions using existing libraries:
- **Coherence score:** Cosine similarity between chunk embedding and a centroid of its source document embeddings (scikit-learn)
- **Completeness score:** Ratio of sentences that end with proper punctuation vs. mid-sentence truncation (regex, already available)
- **Token density score:** Actual tokens / max_tokens ratio to flag too-short or too-long chunks (tiktoken)
- **Duplicate detection:** Cosine similarity between chunk pairs within the same document (scikit-learn + numpy)

These are lightweight scoring functions (50-200 lines each), not library-level concerns.

### 2. Advanced Chunking Strategies (Python -- advance-rag)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| (none -- custom implementation) | N/A | Semantic chunking | Build on top of existing embedding pipeline and `rag/flow/splitter/splitter.py`; external semantic-chunking libraries (semchunk, semantic-chunking) are too opinionated and duplicate the existing embedding infrastructure |

**Why NOT add a semantic chunking library:**
- The advance-rag worker already has a complete embedding pipeline (transformers, onnxruntime, sentence tokenization in `rag/nlp/__init__.py`)
- External libraries like `semchunk` or `semantic-chunking` would introduce a parallel embedding path, wasting GPU/CPU resources
- The existing `Splitter` class in `rag/flow/splitter/splitter.py` provides the extension point -- add a `SemanticSplitter` sibling class
- RAGFlow-derived architecture expects splitters to follow `ProcessBase` pattern; external libraries don't conform

**Semantic chunking implementation approach:**
1. Sentence-split the document (existing `split_sentences()` in `rag/nlp/__init__.py`)
2. Embed each sentence using the existing embedding model pipeline
3. Compute cosine similarity between consecutive sentence embeddings
4. Split at points where similarity drops below a dynamic threshold (95th percentile of distances)
5. Merge small resulting chunks using existing `naive_merge()` function

**Adaptive chunking approach:**
- Use document structure signals (headings, paragraph breaks, list boundaries) already extracted by the parser pipeline
- Combine structure-based and similarity-based boundaries
- No new libraries needed -- extend the existing `SplitterParam` with an `adaptive` mode

### 3. RBAC Permission System (TypeScript -- backend)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @casl/ability | ^6.8.0 (installed) | Attribute-based access control | Already installed and integrated with role hierarchy, tenant scoping, Redis caching, and OpenSearch filter translation |

**No new libraries needed.** The existing CASL setup is already architected for the 3-tier permission model:

- **Current state:** `ability.service.ts` already implements role-based CASL abilities with tenant scoping, ABAC policy overlays, Redis caching, and OpenSearch filter translation
- **Current DB schema:** `project_permissions` (tab-level: documents/chat/settings with none/view/manage) and `project_entity_permissions` (entity-level: category/chat/search with none/view/create/edit/delete) tables already exist
- **What needs to change (code, not libraries):**
  - Rename `Project` to `KnowledgeBase` in CASL subjects (add `'KnowledgeBase'` to the `Subjects` type)
  - Add KB-level permission tiers (Read/Write/Admin) to `buildAbilityFor()` conditions
  - Extend `project_permissions` -> `kb_permissions` with the 3-tier model
  - Wire resource-level grants through existing ABAC policy mechanism

**The 3-tier model maps to existing CASL patterns:**
| Tier | CASL Actions | Scope |
|------|-------------|-------|
| Read | `read` | View KB content, search, use in chat |
| Write | `read`, `create`, `update` | Upload docs, edit chunks, manage categories |
| Admin | `manage` | Delete KB, change permissions, configure settings |

### 4. Rename Refactoring (Project -> Knowledge Base)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Knex migrations | ^3.1.0 (installed) | DB table/column renames | Already the migration tool; use `knex.raw('ALTER TABLE ... RENAME ...')` for safe PostgreSQL renames that preserve constraints |

**No new libraries needed.** This is a codebase refactoring task, not a technology decision.

**Safe rename strategy:**
1. **Database migration (Knex):** Use `knex.raw()` for PostgreSQL `ALTER TABLE RENAME` and `ALTER TABLE RENAME COLUMN` -- safer than Knex's `.renameColumn()` which can drop defaults/constraints
2. **Backend module:** Rename `be/src/modules/projects/` -> `be/src/modules/knowledge-base/`, update barrel exports
3. **API routes:** `/api/projects/*` -> `/api/knowledge-base/*` with temporary redirect middleware for backward compatibility
4. **Frontend:** Rename `fe/src/features/projects/` -> `fe/src/features/knowledge-base/`, update imports
5. **i18n keys:** Update all 3 locales (en, vi, ja) -- search/replace "project" -> "knowledge base" in translation files
6. **Python workers:** Update Peewee model table references (they share the same PostgreSQL tables)

## Supporting Libraries

No new supporting libraries are required. All four features build on the existing stack.

## Installation

```bash
# No new packages to install for backend
# No new packages to install for frontend
# No new Python packages to install for advance-rag
```

## Alternatives Considered

| Category | Decision | Alternative | Why Not |
|----------|----------|-------------|---------|
| Semantic chunking | Custom implementation | `semchunk` (PyPI) | Duplicates existing embedding pipeline; forces its own tokenizer instead of using the project's model infrastructure |
| Semantic chunking | Custom implementation | `semantic-chunking` (PyPI) | Requires sentence-transformers as dependency (already handled by existing onnxruntime pipeline); doesn't follow RAGFlow ProcessBase pattern |
| Semantic chunking | Custom implementation | LangChain `SemanticChunker` | Massive dependency for one feature; LangChain's chunking is thin wrapper around cosine-similarity splitting which is trivial to implement |
| Chunk quality scoring | Custom scoring functions | `ragas` evaluation framework | Designed for end-to-end RAG evaluation, not per-chunk scoring; overkill for inline quality gates during indexing |
| Chunk quality scoring | Custom scoring functions | `deepeval` | Same as ragas -- evaluates entire RAG pipeline, not individual chunk quality |
| RBAC permissions | Extend existing CASL | `casbin` | CASL already installed and deeply integrated; migrating to casbin would require rewriting ability service, cache layer, and OpenSearch filter translation |
| RBAC permissions | Extend existing CASL | `oso` (Oso Cloud) | Adds external service dependency; CASL already handles the exact permission model needed |
| RBAC permissions | Extend existing CASL | Custom permission middleware | CASL already provides the condition-based evaluation engine; rebuilding it would be worse |
| DB rename | Knex raw SQL | Knex `.renameTable()` / `.renameColumn()` | Known issue: `.renameColumn()` can drop DEFAULT constraints on PostgreSQL; raw `ALTER TABLE` is safer |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `semchunk` / `semantic-chunking` (Python) | Duplicate embedding pipelines, don't follow project's ProcessBase architecture | Custom `SemanticSplitter` class extending existing splitter pattern |
| `langchain` for chunking only | 100+ MB dependency for a feature that's 50 lines of cosine similarity math | Direct use of existing scikit-learn + numpy |
| `ragas` / `deepeval` for chunk scoring | Pipeline-level evaluation tools, not chunk-level quality gates; heavy dependencies | Custom scoring functions using scikit-learn cosine similarity |
| Knex `.renameColumn()` | Drops DEFAULT constraints on PostgreSQL (known issue #933) | `knex.raw('ALTER TABLE ... RENAME COLUMN ...')` |
| Prisma or TypeORM for migration | Project uses Knex exclusively; adding another ORM creates confusion | Knex migration with raw SQL where needed |
| Form libraries (react-hook-form, formik) for permission UI | Project convention: native `useState` for forms, no form libraries | Native React state per `fe/CLAUDE.md` conventions |

## Stack Patterns by Feature

**Chunk quality scoring:**
- Implement as a post-processing step in the existing `rag/flow/` pipeline
- Quality scores stored as new fields in OpenSearch chunk documents (not PostgreSQL)
- Filterable at query time via OpenSearch score range filters
- No new infrastructure services needed

**Semantic/adaptive chunking:**
- New splitter classes in `advance-rag/rag/flow/splitter/`
- Follow existing `ProcessBase` + `ProcessParamBase` pattern from `splitter.py`
- Configurable via `parser_config` JSON in the `knowledgebase` table (existing field)
- No new infrastructure services needed

**RBAC 3-tier permissions:**
- Extend existing `ability.service.ts` CASL integration
- Rename permission tables in a Knex migration (`project_permissions` -> `kb_permissions`, `project_entity_permissions` -> `kb_entity_permissions`)
- Permission checks happen in middleware (existing pattern); no new middleware libraries needed
- Cache invalidation already handled by existing `invalidateAbility()` / `invalidateAllAbilities()`

**Rename refactoring:**
- Single Knex migration for all DB renames (tables, columns, foreign keys, indexes)
- Backend/frontend file renames are IDE/editor operations, not library concerns
- API backward compatibility via Express redirect middleware (built-in `res.redirect`)

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @casl/ability@^6.8.0 | Express 4.21, Redis 5.x | Already verified working in current codebase |
| scikit-learn>=1.3.0 | Python 3.11, numpy>=1.24 | Already verified working in current codebase |
| knex@^3.1.0 | PostgreSQL 17, pg@^8.16 | `knex.raw()` for ALTER TABLE fully supported |

## Sources

- [CASL v6 Official Docs](https://casl.js.org/v6/en/api/casl-ability/) -- CASL ability API reference, conditions-based permissions (HIGH confidence)
- [CASL Roles with Persisted Permissions](https://casl.js.org/v6/en/cookbook/roles-with-persisted-permissions/) -- Pattern for DB-stored permission rules (HIGH confidence)
- [Knex Schema Builder](https://knexjs.org/guide/schema-builder.html) -- `.renameColumn()` limitations documented (HIGH confidence)
- [Knex Issue #933](https://github.com/knex/knex/issues/933) -- `.renameColumn()` drops defaults on PostgreSQL (HIGH confidence)
- [Semantic Chunking Approaches (VectorHub)](https://superlinked.com/vectorhub/articles/semantic-chunking) -- Cosine-similarity-based chunking methodology (MEDIUM confidence)
- [Advanced Chunking for RAG (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12649634/) -- Comparative evaluation showing adaptive chunking at 87% accuracy vs 50% baseline (MEDIUM confidence)
- [RAG Evaluation Metrics (Confident AI)](https://www.confident-ai.com/blog/rag-evaluation-metrics-answer-relevancy-faithfulness-and-more) -- Context precision/recall metrics for chunk quality (MEDIUM confidence)
- Codebase analysis of `be/src/shared/services/ability.service.ts`, `be/src/shared/config/rbac.ts`, `advance-rag/rag/flow/splitter/splitter.py`, `advance-rag/pyproject.toml` (HIGH confidence -- direct source)

---
*Stack research for: B-Knowledge v0.2 -- Knowledge Base Refactor & Quality*
*Researched: 2026-04-02*
