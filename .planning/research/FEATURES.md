# Feature Landscape

**Domain:** Knowledge Management / RAG Platform -- v0.2 Milestone Features
**Researched:** 2026-04-02
**Overall confidence:** HIGH

This document focuses exclusively on the four v0.2 milestone features: (1) Rename Project to Knowledge Base, (2) Chunk quality enhancement, (3) 3-tier permission system, (4) New KB features. It does not re-cover v0.1/v1.0 validated features.

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multiple chunking strategies (naive + semantic + table-aware) | Every RAG platform (Dify, RAGFlow, LlamaIndex) ships at least 3 chunking methods. Users expect to choose based on document type. | Medium | Semantic chunking already designed in `todo/03-semantic-chunking.md`. Table-aware designed in `todo/02-table-aware-chunking.md`. |
| Chunk size + overlap config per KB | Standard in all RAG platforms. Without this, users cannot tune retrieval quality for their domain. | Low | Already partially exists via `parser_config.chunk_token_num` and `overlapped_percent`. Needs UI exposure per KB. |
| Basic chunk quality indicators | Users need to see which chunks parsed well vs. poorly. Minimum: token count, truncation flag, empty-content detection. | Low | Simple heuristic metrics computed at ingestion time. No LLM needed. Zero cost. |
| KB-level permission grants (Read/Write/Admin) | Dify has "Only me / All team / Partial team." RAGFlow has owner-based access. Any multi-user KB platform needs this. | Medium | `project_permissions` table already exists with tab-level columns. Needs evolution to simpler 3-tier model. |
| Permission-aware retrieval | If KB has permissions, search results must respect them. Returning unauthorized chunks is a security failure, not a UX issue. | Medium | Inject access filter into OpenSearch queries at retrieval time. Standard pattern: metadata filter on `kb_id` + user access list. |
| Entity rename with zero data loss | A rename from "Project" to "Knowledge Base" that breaks URLs, APIs, or loses data is unacceptable. Must be seamless. | High | Requires coordinated migration across DB + BE + FE + i18n + tests. |
| Table-aware chunking | Tables are ubiquitous in business docs. RAGFlow, Unstructured, and LlamaParse all handle tables specially. Naive chunking destroys table structure. | Medium | Already designed in `todo/02-table-aware-chunking.md`. Adaptive row batching based on column width. |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| LLM-based chunk quality scoring | Score each chunk on coherence/completeness/density using LLM judge. Galileo and Braintrust offer this as a service; rare in open-source. | High | Cost: ~$0.005-0.01 per chunk. For 1000-chunk KB = $5-10. Must be opt-in per KB. Store scores as OpenSearch metadata for query-time filtering. |
| Parent-child (small-to-big) chunking | Index small chunks (100-200 tokens) for precise retrieval, return parent chunk (500-1000 tokens) for LLM context. LlamaIndex `HierarchicalNodeParser` + `AutoMergingRetriever` pattern. | High | Requires `parent_id` field on chunks, hierarchy storage, retrieval logic to merge children to parents. Significant architecture change. |
| Adaptive chunking (content-density aware) | Dynamically adjust chunk size by information density. Clinical study showed 87% accuracy vs 13% for fixed-size. | High | Requires content analysis pass before chunking. Sentence-level embedding variance as density proxy. Not in any major open-source RAG UI. |
| Document-level permission grants | Per-document access within a KB. Critical for enterprise: legal, HR, financial docs coexist but have different audiences. | High | Requires `document_permissions` table + per-doc metadata in OpenSearch + filter injection at query time. |
| Chunk quality dashboard with filtering | Admin UI to browse all chunks, filter by quality score, flag low-quality chunks for re-chunking, drill down to source. | Medium | Mostly FE work. Needs chunk listing endpoint with quality filters. Powerful for admin iteration. |
| Corrective RAG with quality gating | Use chunk quality scores at retrieval time to filter low-quality chunks before LLM. Integrates with corrective RAG layer (designed in `todo/01-corrective-rag.md`). | Medium | Depends on chunk scoring. Adds quality threshold gate to retrieval pipeline. |
| Recursive chunking strategy | Split by hierarchy of separators (`\n\n` -> `\n` -> `.` -> space). Simple to implement, good general-purpose improvement over naive. | Low | Standard in LangChain/LlamaIndex. Easy to add alongside semantic. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real-time chunk quality scoring at query time | Too slow. LLM call per chunk per query = 500ms+ latency per retrieval. | Score at ingestion. Store scores as metadata. Filter by threshold at query time via OpenSearch numeric filter. |
| Automatic re-chunking without user approval | Silently re-chunking changes the search index and can break existing chat references/citations. | Provide "re-chunk" button per document or bulk action. Show what will change before executing. |
| Fine-grained field-level permissions | Over-engineering. "Can see title but not content" adds massive complexity with near-zero value for KB platform. | KB-level and document-level granularity only. If user can access a doc, they see all of it. |
| Custom permission DSL or policy engine | Building Oso/Cerbos/Cedar-like policy languages is multi-year effort. Overkill for 3-tier RBAC. | Simple role-permission mapping (already exists in `rbac.ts`). Extend with resource-level grants via join table. |
| API versioning for the rename | Adding `/api/v2/` for Project-to-KB rename is unnecessary. No external API consumers depend on "project" routes. | Clean rename in one migration. No parallel old/new routes. |
| Per-chunk embedding model selection | Different embedding models per chunk within same KB makes vector search incoherent. | Embedding model set at KB level (already the case). Different models = different KBs. |
| Expand-migrate-contract for rename | Running both "project" and "knowledge-base" names in parallel doubles code for weeks with no benefit for an internal app. | Clean big-bang rename: one migration + one commit. No external consumers to protect. |

## Feature Dependencies

```
Rename Project -> Knowledge Base
  -> DB migration (rename tables + columns, instant in PostgreSQL)
    -> BE module rename (projects/ -> knowledge-base/)
      -> API route rename (/api/projects -> /api/knowledge-bases)
        -> FE feature rename (features/projects/ -> features/knowledge-bases/)
          -> i18n string updates (3 locales)
          -> URL route updates (/projects/:id -> /knowledge-bases/:id)
          -> Test file updates

Chunk Quality Enhancement
  -> Table-aware chunking (independent, no deps on other new features)
  -> Semantic chunking (needs embedding model at chunk time -- already available)
    -> Parent-child chunking (depends on semantic + chunk hierarchy storage) [DEFER]
  -> Chunk quality scoring (depends on improved chunking to have meaningful scores)
    -> Chunk quality dashboard (depends on scoring)
    -> Corrective RAG quality gate (depends on scoring)

Permission System (3-tier)
  -> Rename must complete first (project_permissions -> kb_permissions)
    -> KB-level Read/Write/Admin grants (evolve existing table)
      -> Permission-aware retrieval (inject access filter into OpenSearch)
        -> Document-level grants (optional extension) [DEFER]
```

## MVP Recommendation

### Phase 1: Rename + Foundation (do first, unblocks everything)

Prioritize:
1. **Rename Project to Knowledge Base** -- Touches every layer. Do before adding new features to avoid building on "project" then renaming. PostgreSQL `ALTER TABLE RENAME` is instant (metadata-only, no data copy). One Knex migration + coordinated file renames.
2. **KB-level 3-tier permissions (Read/Write/Admin)** -- `project_permissions` already exists with tab-level columns. Simplify to single `permission_level` column. Mostly schema migration + middleware update.
3. **Permission-aware retrieval** -- Inject KB access filters into OpenSearch. Without this, permissions are cosmetic.

### Phase 2: Chunk Quality (build on renamed foundation)

Prioritize:
4. **Table-aware chunking** -- Highest impact per effort. Fixes worst quality problem (giant table chunks). Already fully designed.
5. **Semantic chunking** -- Already designed with full implementation plan in `todo/03-semantic-chunking.md`. Second-highest impact.
6. **Basic chunk quality indicators** -- Heuristic metrics (token count, coherence proxy, emptiness) computed at ingestion. Zero LLM cost.
7. **Recursive chunking** -- Simple addition, good general improvement.

### Defer to v0.3+

- **Parent-child chunking**: Requires significant architecture change to chunk storage. High complexity, moderate incremental benefit over semantic alone.
- **LLM-based chunk quality scoring**: Expensive per-chunk LLM calls. Nice-to-have once basic metrics prove the UI workflow value.
- **Document-level permissions**: Only needed for enterprise multi-tenant. KB-level sufficient for v0.2.
- **Adaptive chunking**: Research shows fixed-size with good overlap often matches or beats adaptive (Vectara NAACL 2025). Semantic covers most of the win.

## Detailed Feature Analysis

### 1. Chunk Quality Scoring and Filtering

**What the ecosystem does:**

Chunk quality is measured at two levels: individual chunk quality (ingestion-time) and retrieval quality (query-time). For v0.2, focus on ingestion-time scoring.

**Ingestion-time heuristic metrics (table stakes, zero cost):**

| Metric | How to Compute | Flag Threshold | Cost |
|--------|---------------|----------------|------|
| Token count | Tokenizer count | < 50 or > 1024 tokens | Zero |
| Empty/near-empty | Stripped character length | < 20 characters | Zero |
| Information density | Type-token ratio (unique tokens / total tokens) | < 0.3 (highly repetitive) | Zero |
| Duplicate detection | MinHash or exact content hash | > 0.9 similarity to another chunk in same KB | Low |
| Language coherence | Dictionary word ratio | < 0.5 (garbled text) | Low |
| Truncation detection | Ends mid-sentence without terminal punctuation | Boolean flag | Zero |

**Ingestion-time LLM metrics (differentiator, opt-in):**

| Metric | How to Compute | Flag Threshold | Cost |
|--------|---------------|----------------|------|
| Coherence score (1-5) | LLM judge: "Rate how coherent this text is" | < 3 | ~$0.005/chunk |
| Completeness score (1-5) | LLM judge: "Does this contain a complete thought?" | < 3 | ~$0.005/chunk |
| Relevance potential | Embedding cosine similarity to KB description | < 0.3 | One embedding call |

**Aggregation at KB level:**
- Average quality score across all chunks
- Percentage of chunks flagged (any metric below threshold)
- Quality distribution histogram in admin dashboard

**Query-time filtering:** Store all scores as numeric fields on the chunk document in OpenSearch. At retrieval, add `range` filter: `quality_score >= threshold`. Threshold configurable per KB in settings.

**Recommendation:** Ship heuristic metrics in v0.2 (zero cost, computed during ingestion). Defer LLM scoring to v0.3 as opt-in.

**Confidence:** HIGH for heuristics (standard practice). MEDIUM for LLM scoring thresholds (domain-dependent, need per-domain tuning).

### 2. Advanced Chunking Strategies

**What the ecosystem offers:**

| Strategy | How It Works | Best For | Complexity | B-Knowledge Status |
|----------|-------------|----------|------------|-------------------|
| Fixed-size (naive) | Split at token count + overlap | General baseline | Low | **Implemented** |
| Recursive | Hierarchy of separators: `\n\n` -> `\n` -> `. ` -> ` ` | Structured docs with clear formatting | Low | Not implemented (easy add) |
| Semantic | Embed sentences, split where similarity drops below percentile threshold | Narrative/unstructured docs | Medium | **Designed** (`todo/03`) |
| Table-aware | Adaptive row batching by column width and token budget | Spreadsheets, tabular data | Medium | **Designed** (`todo/02`) |
| Hierarchical (heading-based) | Split by heading levels, preserve document structure | Documentation, specs, manuals | Low | **Exists** (hierarchical_merger, underused) |
| Parent-child (small-to-big) | Index 100-200 token leaf chunks, retrieve 500-1000 token parent for context | Long docs needing precision + context | High | Not implemented |
| Adaptive (density-aware) | Vary chunk size by content complexity/information density | Mixed-complexity documents | High | Not implemented |

**Key research finding (Vectara NAACL 2025, peer-reviewed):** On realistic document sets, fixed-size chunking with proper overlap (10-20%) consistently matched or outperformed semantic chunking for retrieval. The 2026 benchmark showed fixed-size at 69% accuracy on real documents. Semantic chunking's advantage is primarily on narrative/unstructured content where topic boundaries are clear.

**Practical implication:** Do not oversell semantic chunking. The biggest quality wins come from (a) fixing table chunking and (b) using 10-20% overlap on fixed-size. Semantic chunking is a meaningful addition for narrative docs but not a silver bullet.

**Recommended implementation order (impact/effort ratio):**
1. **Table-aware** -- Fixes the worst quality problem. Already designed with adaptive batching.
2. **Semantic** -- Already designed. Meaningful for healthcare narratives, SDLC specs.
3. **Recursive** -- Simple. Better than naive for structured docs. Can implement in a day.
4. **Activate hierarchical merger in naive parser path** -- Already exists, just underused.
5. Defer parent-child and adaptive to v0.3+.

**Confidence:** HIGH (Vectara NAACL 2025 peer-reviewed study, Weaviate/LlamaIndex production data, NVIDIA benchmark guide).

### 3. RBAC with Resource-Level Permissions

**What competitors do:**

| Platform | KB-Level Access | Document-Level Access | Permission Tiers |
|----------|----------------|----------------------|-----------------|
| Dify | Only me / All team / Partial team | No | 3-tier dropdown per KB |
| RAGFlow | Owner-based | No (requested in GitHub issue #7687) | 2-tier (owner/viewer) |
| Pinecone | Namespace-level | Metadata filter at query time | API key scoped |
| Elasticsearch | Index-level RBAC | Document-level security (DLS) | Full RBAC + field-level |
| Supabase | Row-level security (RLS) | Yes via RLS policies | PostgreSQL native |

**B-Knowledge current state:**
- Global RBAC: `super-admin > admin > leader > user` (in `rbac.ts`, hierarchy 100/75/50/25)
- Permissions: `view_chat`, `view_search`, `manage_knowledge_base`, `manage_datasets`, etc.
- `project_permissions` table exists with: `project_id`, `grantee_type` (user/team), `grantee_id`, tab columns (`tab_documents`, `tab_chat`, `tab_settings` with values 'none'/'view'/'manage')
- Missing: permission enforcement at retrieval time (OpenSearch query filtering)

**Recommended 3-tier model for v0.2:**

| Tier | Capabilities | Maps To (simplified from current) |
|------|-------------|-----------------------------------|
| **Read** | View KB metadata, search/chat against KB, view documents and chunks | `tab_documents: 'view'` + `tab_chat: 'view'` |
| **Write** | All Read + upload/delete documents, edit metadata, manage categories, re-chunk | `tab_documents: 'manage'` |
| **Admin** | All Write + change KB settings, manage permissions for this KB, delete KB | `tab_settings: 'manage'` |

**Schema evolution:** Replace 3 separate tab columns (`tab_documents`, `tab_chat`, `tab_settings`) with single `permission_level` enum (`read`/`write`/`admin`). Simpler to reason about, fewer edge cases (e.g., what does `tab_chat: 'manage'` + `tab_documents: 'none'` mean?).

**Middleware approach:** Add `requireKBPermission(level: 'read' | 'write' | 'admin')` middleware. For each request to a KB resource:
1. Extract `kb_id` from route params
2. Check if user is KB creator (implicit admin)
3. Check `kb_permissions` table for explicit grant
4. Fall back to global role check (super-admin/admin bypass)

**Retrieval filter approach:**
1. Before OpenSearch query, fetch user's accessible KB IDs: `SELECT kb_id FROM kb_permissions WHERE grantee_id = :userId AND permission_level >= 'read'`
2. Add `terms` filter on `kb_id` field in OpenSearch query
3. KB creators and global admins get unfiltered access

**Confidence:** HIGH for KB-level (standard pattern per Pinecone, Dify, Elasticsearch docs). MEDIUM for document-level (complex, defer).

### 4. Large-Scale Entity Rename (Project to Knowledge Base)

**What the ecosystem recommends:**

The standard enterprise pattern is **Expand-Migrate-Contract** (Parallel Change per Martin Fowler):
1. Expand: Add new names alongside old, both work
2. Migrate: Move code to use new names
3. Contract: Remove old names

**For B-Knowledge, this is overkill.** Reasons:
- No external API consumers (internal app)
- No published SDK or client libraries
- All code is in the same monorepo
- Team controls all deployment

**Recommended approach: Clean big-bang rename.**

| Layer | Scope | Approach | Risk |
|-------|-------|----------|------|
| **Database** | `projects` -> `knowledge_bases`, `project_permissions` -> `kb_permissions`, all `project_id` -> `kb_id` columns | Single Knex migration using `ALTER TABLE RENAME` (instant, metadata-only in PostgreSQL, no data copy) | Low -- single atomic migration |
| **BE module** | `be/src/modules/projects/` -> `be/src/modules/knowledge-base/` | File system rename + update imports in `routes.ts` | Low -- IDE refactoring |
| **BE models** | Class names, factory references (`ModelFactory.projects` -> `ModelFactory.knowledgeBases`) | Find-and-replace within module | Low |
| **API routes** | `/api/projects/*` -> `/api/knowledge-bases/*` | Update route registration | Low |
| **FE feature** | `fe/src/features/projects/` -> `fe/src/features/knowledge-bases/` | Rename files + update router, imports, barrel exports | Medium -- many files |
| **FE API** | `projectApi.ts` -> `knowledgeBaseApi.ts`, queries file similarly | Rename + update function names and endpoints | Medium |
| **FE routes** | `/projects/:id` -> `/knowledge-bases/:id` | Update router config | Low |
| **i18n** | 3 locales (en, vi, ja): replace "Project" with "Knowledge Base" | Bulk string replacement in JSON files | Low |
| **Tests** | All test files referencing "project" | Rename + update assertions | Medium |
| **Python workers** | Check advance-rag/converter for "project" references | Grep and update (likely minimal, workers use IDs) | Low |

**Risk mitigation:**
1. Run full test suite after rename
2. Grep entire repo for straggler "project" references (case-insensitive)
3. Check all 3 i18n locale files for completeness
4. Verify OpenSearch index names are unaffected (they use `knowledge_` prefix already)

**Confidence:** HIGH (standard refactoring pattern, well-documented).

## Sources

### Chunk Quality and Scoring
- [Vectara NAACL 2025 Chunking Benchmark](https://blog.premai.io/rag-chunking-strategies-the-2026-benchmark-guide/) -- HIGH confidence (peer-reviewed)
- [Clinical Decision Support Chunking Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC12649634/) -- HIGH confidence (PMC published)
- [NVIDIA Chunking Strategy Guide](https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/) -- HIGH confidence
- [Galileo Chunk Relevance Metrics](https://docs.galileo.ai/galileo/gen-ai-studio-products/galileo-guardrail-metrics/chunk-relevance) -- MEDIUM confidence
- [Evidently AI RAG Evaluation Guide](https://www.evidentlyai.com/llm-guide/rag-evaluation) -- MEDIUM confidence
- [Braintrust RAG Evaluation Metrics](https://www.braintrust.dev/articles/rag-evaluation-metrics) -- MEDIUM confidence

### Chunking Strategies
- [Weaviate Chunking Strategies](https://weaviate.io/blog/chunking-strategies-for-rag) -- HIGH confidence
- [Firecrawl Best Chunking Strategies 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag) -- MEDIUM confidence
- [Databricks Chunking Guide](https://community.databricks.com/t5/technical-blog/the-ultimate-guide-to-chunking-strategies-for-rag-applications/ba-p/113089) -- MEDIUM confidence
- [LlamaIndex Small-to-Big Retrieval](https://medium.com/data-science/advanced-rag-01-small-to-big-retrieval-172181b396d4) -- MEDIUM confidence
- [DataCamp Chunking Strategies](https://www.datacamp.com/blog/chunking-strategies) -- MEDIUM confidence

### Permissions and Access Control
- [Pinecone RAG with Access Control](https://www.pinecone.io/learn/rag-access-control/) -- HIGH confidence
- [Elasticsearch RAG + RBAC Integration](https://www.elastic.co/search-labs/blog/rag-and-rbac-integration) -- HIGH confidence
- [Oso Authorization in RAG](https://www.osohq.com/post/right-approach-to-authorization-in-rag) -- MEDIUM confidence
- [Cerbos Authorization for RAG](https://www.cerbos.dev/blog/authorization-for-rag-applications-langchain-chromadb-cerbos) -- MEDIUM confidence
- [RAGFlow Permission Issue #7687](https://github.com/infiniflow/ragflow/issues/7687) -- HIGH confidence (primary source)
- [Dify v1.1.0 Metadata Filtering](https://dify.ai/blog/dify-v1-1-0-filtering-knowledge-retrieval-with-customized-metadata) -- MEDIUM confidence

### Rename/Refactoring Patterns
- [Martin Fowler Parallel Change](https://martinfowler.com/bliki/ParallelChange.html) -- HIGH confidence
- [Martin Fowler Codemods](https://martinfowler.com/articles/codemods-api-refactoring.html) -- HIGH confidence
