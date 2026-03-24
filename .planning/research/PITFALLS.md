# Pitfalls Research

**Domain:** Enterprise RAG platform — ABAC, document versioning, GraphRAG, Deep Research, multi-tenant isolation
**Project:** B-Knowledge
**Researched:** 2026-03-18
**Confidence:** HIGH (grounded in direct codebase analysis + verified external sources)

---

## Critical Pitfalls

### Pitfall 1: SYSTEM_TENANT_ID Hardcoded in Five Separate Places — Multi-Tenancy Will Require a Rewrite of Each

**What goes wrong:**
`SYSTEM_TENANT_ID` is read directly from `process.env` in five separate TypeScript files:
`rag-graphrag.service.ts`, `rag-search.service.ts`, `knowledgebase.model.ts`, `rag-document.model.ts`, `rag-file.model.ts`. Additionally, `rag-graphrag.service.ts` and `rag-search.service.ts` also read `ES_HOST` and `ES_PASSWORD` directly from `process.env` instead of the `config` object (violating the convention in `be/CLAUDE.md`). When multi-tenancy is added, every call site that constructs an OpenSearch index name via `getIndexName()` will need to accept a `tenantId` argument. Because these are scattered module-level constants rather than passed parameters, the refactor will touch the entire search and GraphRAG retrieval stack.

**Why it happens:**
The current single-tenant design has no need to pass tenant context through the call stack. The code was written to work now, not to be extended. When multi-tenant isolation is added, developers will discover the constant needs to become a parameter at every layer simultaneously.

**How to avoid:**
Before the multi-tenant isolation phase, consolidate all OpenSearch client construction and index name logic into a single service (e.g., `shared/services/opensearch.service.ts`) that always receives `tenantId` as a parameter. Replace all `process.env['SYSTEM_TENANT_ID']` direct reads with the `config` object. This is a low-risk refactor done once before the multi-tenant phase, not a piecemeal fix during it.

**Warning signs:**
- Any new file that imports `process.env['SYSTEM_TENANT_ID']` directly
- Any new call to `getIndexName()` that does not take a `tenantId` argument
- A search for `SYSTEM_TENANT_ID` returns more than one file

**Phase to address:**
Multi-tenant isolation phase — first task, before any feature work. Also cross-check that `rag-graphrag.service.ts` and `rag-search.service.ts` are migrated to use the `config` object for ES connection details.

---

### Pitfall 2: ABAC Enforcement at the Wrong Layer

**What goes wrong:**
ABAC rules implemented only in Express middleware do not protect the retrieval pipeline. In `rag-search.service.ts`, `fullTextSearch`, `vectorSearch`, and `hybridSearch` filter by `kb_id` — but the `kb_ids` array passed to these functions comes from the chat assistant's configuration, set by an admin with potentially broader access than the querying user. A user with access to an assistant bound to five datasets could receive chunks from datasets they are not individually authorized to access, because no per-user ABAC filter is applied at the OpenSearch query level.

**Why it happens:**
ABAC is naturally designed as a middleware concern. But RAG retrieval aggregates data from multiple sources (multiple kb_ids, GraphRAG entities, web results, Deep Research sub-queries). Each retrieval call needs access control applied at the data layer, not just the HTTP request layer.

**How to avoid:**
Enforce at two layers simultaneously:
1. API middleware validates the user can access the requested assistant or dataset.
2. Every OpenSearch query includes an `access_filter` clause derived from the user's resolved ABAC policy — a set of allowed `kb_ids` and optionally allowed `doc_ids`. The search service must accept this filter as a required parameter, not an optional extra.

At index time, attach `security_labels` as a field on every chunk. At query time, intersect the user's allowed labels with the chunk's labels in the OpenSearch `filter` clause. This filter must be injected into `fullTextSearch`, `vectorSearch`, `hybridSearch`, and `KGSearch` uniformly.

**Warning signs:**
- Any search method that accepts `kbIds` as input without also accepting a user-derived access filter
- Integration tests that verify the same assistant returns different chunk sets for users with different permissions (if these tests don't exist, the enforcement is unverified)
- A chat assistant configured with multiple datasets where a restricted user can retrieve chunks from all of them

**Phase to address:**
ABAC phase. Must be validated before GraphRAG and Deep Research phases, which introduce additional retrieval paths that also need this filter applied.

---

### Pitfall 3: OpenSearch Index-per-Tenant Becomes a Scaling Bomb

**What goes wrong:**
The current architecture uses `knowledge_{SYSTEM_TENANT_ID}` as the index name. When multi-tenant isolation is added, creating a separate index per tenant works at 5 tenants but degrades at 50+. OpenSearch has hard limits on index count (default 1000); each index consumes cluster state memory; shard management becomes a bottleneck during tenant onboarding. The current `index_name(tenant_id)` abstraction in the Python worker (`rag/nlp/search.py:51`) and the TypeScript `getIndexName()` function both assume one index per tenant.

**Why it happens:**
The RAGFlow-inherited pattern was designed for small deployments. The pattern is also the simplest path to tenant data isolation — separate indexes mean no cross-tenant query leakage by construction. Teams copy it without projecting tenant growth.

**How to avoid:**
Decide the model upfront before multi-tenant work begins:
- **Pool model (recommended for most tenants):** Single shared index with `tenant_id` and `org_id` as indexed filter fields. Every query mandatorily includes a `tenant_id` filter. Lower operational cost, requires application-layer enforcement discipline.
- **Silo model (healthcare tenants with strict compliance):** Per-tenant index, capped at a known maximum (document this boundary). Higher cost, stronger isolation guarantee, required for HIPAA audit trails in some configurations.
- **Hybrid:** Pool by default, silo for premium or regulated tenants.

Keep `getIndexName()` as the single abstraction point for this decision. Make it a function call, not a module-level constant.

**Warning signs:**
- OpenSearch cluster state update times exceeding 5 seconds
- Shard count approaching 1000 per node
- Tenant onboarding failing due to index creation errors
- Any query against OpenSearch that does not include `tenant_id` in the filter clause

**Phase to address:**
Multi-tenant isolation phase — architectural decision must be made and implemented before any feature work adds more data to the indexes. Revisit in the ABAC phase (access filters layer on top of tenant filters).

---

### Pitfall 4: Document Versioning Corrupts Search During Re-indexing

**What goes wrong:**
The current pipeline in `task_executor.py` treats document processing as atomic: parse → chunk → embed → index. Versioning breaks this assumption. The naive approach (delete old chunks, index new chunks) creates a window where the document is invisible to search. If old and new chunks coexist without version discriminators, search returns duplicates and contradictions.

The existing `document_versions` table in the schema stores version metadata, but OpenSearch chunks have no `version_id` or `is_current` field. There is currently no mechanism to atomically switch from one version's chunks to another without a search gap.

**Why it happens:**
Developers model versioning at the database layer (version records in PostgreSQL) but forget the search index is a separate system that also holds per-chunk state. The two systems drift apart silently.

**How to avoid:**
Add `version_id` and `is_current` fields to the OpenSearch chunk mapping. New version chunks are indexed with `is_current: false`. Once all chunks for the new version are indexed, execute a single `update_by_query` to flip old version chunks to `is_current: false` and new chunks to `is_current: true`. This is atomic at the query level.

Default search queries must filter `is_current: true`. Provide explicit "search all versions" mode for audit use cases.

Old version chunks must never be deleted immediately. Mark them non-current and garbage-collect on a schedule — or retain indefinitely for regulated environments.

Test version transition behavior under concurrent load: what happens when a user queries during the `update_by_query` execution?

**Warning signs:**
- Search returning zero results for a document that exists in PostgreSQL with `status: ready`
- Chunk count per document growing unboundedly without corresponding document additions
- Users reporting contradictory information in answers (both old and new version chunks returned)

**Phase to address:**
Document versioning phase. Must be designed before ABAC (access rules may differ per version) and before Deep Research (which may need to reason across versions explicitly).

---

### Pitfall 5: GraphRAG Entity Resolution Fails Silently at Enterprise Corpus Scale

**What goes wrong:**
GraphRAG extracts entities and relationships via LLM (`rag/graphrag/general/graph_extractor.py`). Entity resolution — determining that "Dr. Smith", "Smith, J.", and "John Smith MD" are the same entity — is probabilistic. At enterprise scale (hundreds of documents with inconsistent naming conventions), the knowledge graph accumulates duplicate nodes. Users see partial or contradictory answers because the graph treats the same real-world entity as multiple disconnected nodes.

The LLM entity resolution costs 3-5x the base RAG processing cost. Poor resolution means paying more for worse results with no error signal.

**Why it happens:**
Entity resolution works well on demo-scale data where naming conventions are consistent. At enterprise scale, especially across domains (healthcare provider names, SDLC component names), naming inconsistency defeats string-similarity merging.

**How to avoid:**
Implement entity resolution as a separate, auditable pipeline stage — not inline with graph construction. Store resolution decisions (entity A merged with entity B, confidence score, merge date) for review and rollback.

Add domain-specific normalization before LLM-based resolution:
- Healthcare: normalize provider names against NPI lookup patterns
- SDLC: normalize component/service names against the existing `glossary` module (already in `be/src/modules/glossary/`)

Set a minimum confidence threshold for automatic merges; below threshold, flag for admin review.

Track entity count per knowledge base over time. Linearly growing entity count despite stable document count signals resolution failures.

**Warning signs:**
- Entity count growing faster than document count in the same knowledge base
- Duplicate entity names with >80% string similarity in graph queries
- Community reports referencing the same real-world entity under different names
- GraphRAG answers mentioning contradictory facts about the same entity

**Phase to address:**
GraphRAG migration phase. Must be addressed before Deep Research, which depends on graph quality for multi-hop traversal.

---

### Pitfall 6: Deep Research Token Costs and Latency Spiral Out of Control

**What goes wrong:**
The existing `rag-deep-research.service.ts` already has a `maxDepth` parameter (default 3). However, there is no hard limit on total LLM calls, total tokens consumed, or total wall-clock time per query. Each depth level calls `sufficiencyCheck` (an LLM call), then potentially `generateFollowUpQuestions` (another LLM call), then recursive `retrieveFromKbs` for each follow-up question. A single Deep Research query at depth 3 with 3 follow-up questions per level can trigger 10-20 LLM calls.

At $0.003-$0.03 per 1K tokens and 50K tokens per Deep Research query, a single query can cost $0.15-$1.50. In multi-tenant environments, one user's Deep Research query can exhaust shared LLM rate limits and degrade service for all users.

**Why it happens:**
Deep Research is designed for thoroughness. Token budgets and cost controls feel like premature optimization during development but become critical in production.

**How to avoid:**
Add hard limits before production deployment:
- Max total LLM calls per query (10-15, not just max depth)
- Max total tokens across all calls in one query (configurable per tenant tier, default 50K)
- Max wall-clock time per query with graceful truncation (default 60 seconds)

Implement progressive disclosure: stream the best answer found after each depth level via SSE. Let users stop when they have enough. The current `onProgress` callback infrastructure already supports this.

Add per-tenant rate limiting and token budgets for Deep Research, separate from regular chat quotas.

Cache Deep Research results keyed by normalized query + kb_ids. Invalidate on dataset modification. Implement semantic similarity caching for repeated similar queries.

**Warning signs:**
- Average Deep Research query time exceeding 30 seconds
- Token usage per query regularly exceeding 50K
- SSE connection closures before completion (users abandoning mid-query)
- Monthly LLM costs increasing without proportional user growth

**Phase to address:**
Deep Research migration phase. Cost controls are architectural decisions — not tuning parameters — and must be implemented at the same time as the feature, not retroactively.

---

### Pitfall 7: Python Worker and Node.js Backend Schema Divergence

**What goes wrong:**
The Python worker uses Peewee ORM (`db/db_models.py`) with its own model definitions. The Node.js backend uses Knex with migrations as the single source of truth. When versioning adds `version_id` to documents, or ABAC adds `security_labels` to chunks in OpenSearch, the Knex migration adds the column but the Peewee model does not know about it — or vice versa. The result is silent data loss or query failures in one service but not the other.

This is confirmed by the existing codebase: `knowledgebase.model.ts` references fields like `tenant_id` (32-char string in PostgreSQL) that must match exactly with the Peewee `Knowledgebase` model field types, or the Python worker will fail to query the same rows correctly.

**Why it happens:**
Two ORMs in two languages modeling the same database tables. Schema changes require updating both, but they are in different workspaces with no automated cross-validation.

**How to avoid:**
- All schema changes go through Knex migrations only (already specified in `CLAUDE.md`)
- After every Knex migration that touches a Peewee-managed table, update the corresponding Peewee model in the same PR — never merge one without the other
- Add a Python worker startup health check that validates Peewee model field definitions against the actual PostgreSQL schema using `INFORMATION_SCHEMA`. Log warnings for mismatches; fail loudly for critical fields
- Add a CI check that lists Peewee models and verifies their fields exist in the corresponding Knex migration

**Warning signs:**
- Python worker failing with `ProgrammingError: column "x" does not exist` after a migration
- Node.js backend querying rows that the Python worker cannot see (query returns different results from each service)
- A migration PR that does not include any changes to `advance-rag/db/db_models.py`

**Phase to address:**
All phases that touch the database schema — versioning, ABAC, GraphRAG metadata tables, Deep Research result caching.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded `SYSTEM_TENANT_ID` read from `process.env` directly | Works for single-tenant now | Every call site must be refactored when multi-tenancy ships; violates `be/CLAUDE.md` config conventions | Never — consolidate to `config` object immediately |
| `getIndexName()` returns a single hardcoded index | Simple, no routing logic | Cannot support per-tenant indexes or pool model without rewriting every search path | Only acceptable pre-multi-tenant with a tracked refactor ticket |
| Skipping `is_current` field in OpenSearch chunks | Simpler chunk schema now | Version transitions cause search gaps and duplicate results | Never if document versioning is planned |
| ABAC enforced only at API middleware | Fast to implement | Retrieval path bypasses it; data leakage risk | Never for healthcare or regulated environments |
| Deep Research without token budget cap | Full recursion depth tested | Unpredictable per-query cost; LLM rate limit starvation in multi-tenant | Never for production |
| Skipping Peewee model update when Knex migrates a shared table | Faster migration authoring | Silent schema drift; Python worker fails unpredictably after deploy | Never — same-PR rule is mandatory |
| Inlining entity resolution with graph construction | Simpler pipeline code | Resolution failures are invisible; no way to audit or correct merges | Only acceptable for prototype/demo; never for production corpus |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenSearch (multi-tenant) | Relying on application-level `tenant_id` filter as the only isolation mechanism | Add OpenSearch Document Level Security (DLS) as a second layer for regulated tenants; use per-tenant indexes as silo model where compliance demands it |
| OpenSearch (versioning) | Using `delete + re-index` for version updates | Use `update_by_query` with `is_current` flag flip; never delete old version chunks until garbage collection window passes |
| Redis (Deep Research) | No TTL on cached intermediate results | Set TTL proportional to dataset update frequency; invalidate on dataset modification events |
| LLM providers (Deep Research) | No per-query timeout in LLM client calls | Set per-call timeouts in `llmClientService.chatCompletion`; implement circuit breaker for provider outages |
| PostgreSQL (ABAC) | Evaluating ABAC policies with N+1 queries per request | Pre-resolve access sets at login or permission-change event; cache in Redis with short TTL (60-300s) |
| Redis (task queue) | No dead-letter queue for failed parsing tasks | Tasks that fail repeatedly should be moved to a dead-letter queue with error metadata, not retried infinitely |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| ABAC policy evaluated with DB queries on every search request | P99 latency spike on search endpoints; slow chat streaming start | Cache resolved access sets (allowed kb_ids/doc_ids per user) in Redis; invalidate on permission change | At 50+ concurrent users with complex ABAC policies |
| GraphRAG community report regeneration on every document add | Ingestion pipeline becomes blocking; document processing queue backs up | Incremental regeneration — only regenerate communities affected by changed entities | At 1000+ documents in a knowledge base |
| Deep Research results not cached | LLM costs scale linearly with repeated similar queries | Semantic similarity caching in Redis with TTL; invalidate on dataset modification | At 100+ users per day asking similar research questions |
| OpenSearch `update_by_query` for version flip under high query load | Search returns stale results during version transition; flip operation times out | Execute version flip during low-traffic windows; use `wait_for_completion=false` with polling | At 10K+ chunks per document version |
| Embedding re-generation for all chunks on minor document update | Re-indexing pipeline blocks for hours; version transitions take too long | Only re-embed changed chunks (compare content hash); reuse embeddings for unchanged chunks | At 500+ chunks per document |
| Redis task queue unbounded growth | Redis memory exhaustion; task executor falls behind permanently | Set `MAXLEN` on Redis streams; implement backpressure signal to backend when queue depth exceeds threshold | At 100+ concurrent document uploads |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| OpenSearch query without mandatory `tenant_id` filter | Cross-tenant data leakage; HIPAA violation for healthcare tenants | Wrap all OpenSearch client calls in a service function that always injects tenant filter; add query audit logging that flags missing tenant filter |
| ABAC policy changes without audit trail | Compliance violation; inability to reconstruct who could access what at a given time | Use immutable policy versioning; log all ABAC changes with before/after snapshots via the existing `audit` module |
| Chat assistant `kb_ids` not intersected with user's allowed `kb_ids` | User retrieves chunks from datasets they lack permission to access | At query time, resolve user's allowed kb_ids from ABAC policy and intersect with assistant's configured kb_ids before passing to search |
| Healthcare document PHI in chunk plaintext without access control at chunk level | PHI exposed to unauthorized users via search | Tag chunks containing PHI at index time; require elevated access labels in ABAC filter; alert admins when PHI-containing documents are uploaded |
| Session-level ABAC cache not invalidated on permission revocation | Revoked user retains access until cache TTL expires (up to 5 minutes) | Implement event-driven cache invalidation: on ABAC policy change, publish to Redis pub/sub; subscribers clear affected user access sets immediately |
| API keys for LLM providers stored without encryption | Provider keys exposed in database breach | Already encrypted at rest in `model_providers` table per `be/CLAUDE.md`; verify encryption is applied to any new ABAC policy storage that may contain secrets |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Deep Research with no progress indication beyond "searching..." | Users abandon long-running queries; perceived as broken | Stream intermediate results via SSE at each depth level; show "Found X sources, checking for more..." with option to stop |
| Version history shown as raw timestamps only | Users cannot understand what changed between versions or which version to trust | Show version labels, author, change summary, and chunk diff count alongside timestamps |
| ABAC access denied with no explanation | Users think the system is broken; cannot request access from admin | Show "You don't have access to this dataset — contact your admin" with the dataset name; log the denied request for admin review |
| GraphRAG results mixed inline with vector search results without labeling | Users cannot tell why they received graph-derived results; lower trust in answers | Label context sections clearly ("From knowledge graph:" vs "From document search:"); allow users to expand graph reasoning chain |
| Document re-parsing progress hidden during version update | Users upload a new version and see no feedback for minutes | Show version re-indexing progress via the existing Socket.IO/Redis pub/sub mechanism; display "Version 2 indexing: 43% complete" |
| "Search all versions" returns duplicate-looking results | Users confused by near-identical chunks from multiple versions | Group results by version; show version number and date alongside each chunk; default to current-version-only with explicit opt-in for historical search |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Multi-tenant isolation:** Index name parameterized — verify no remaining `process.env['SYSTEM_TENANT_ID']` reads outside the `config` object; verify every OpenSearch query includes `tenant_id` in filter clause
- [ ] **ABAC implementation:** API middleware enforces access — verify the OpenSearch retrieval query also includes access control filter derived from user's resolved policy, not just the assistant's configured `kb_ids`
- [ ] **Document versioning:** `document_versions` table exists — verify OpenSearch chunks have `version_id` and `is_current` fields; verify `is_current: true` filter on default search; verify atomic version flip tested under concurrent queries
- [ ] **GraphRAG migration:** Entity extraction running — verify entity resolution decisions are stored and auditable; verify duplicate entity detection is active; verify `knowledge_graph_kwd` filter correctly separates graph nodes from regular chunks
- [ ] **Deep Research:** `maxDepth` parameter exists — verify total LLM call limit enforced; verify token budget cap per query; verify per-tenant rate limiting separate from regular chat; verify SSE streaming of intermediate results
- [ ] **Peewee/Knex parity:** Migration created — verify corresponding Peewee model updated in same PR; verify Python worker startup health check validates schema against actual PostgreSQL columns
- [ ] **ABAC audit trail:** Policy rules stored — verify all policy changes logged with before/after snapshot via `audit` module; verify policy version is recorded alongside each search/chat audit log entry
- [ ] **Healthcare documents:** PHI detection alerts — verify ABAC policy can target PHI-tagged chunks specifically; verify sensitivity levels are configurable per tenant, not hardcoded enum values
- [ ] **Version search UX:** Versioned documents searchable — verify "search all versions" mode is explicit opt-in; verify results show version number; verify point-in-time search mode for compliance use cases

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cross-tenant data leakage discovered post-launch | HIGH | Immediate: add missing `tenant_id` filter to affected search path and deploy. Short-term: audit all recent queries in OpenSearch query logs for cross-tenant hits. Long-term: add DLS as defense-in-depth. Notify affected tenants per compliance requirements. |
| OpenSearch version transition search gap (no `is_current` field) | HIGH | Roll back to previous version's chunks by restoring from S3 source; re-implement versioning with `is_current` flag before re-attempting. Cannot patch in place without the flag. |
| GraphRAG entity duplication at scale | MEDIUM | Run entity deduplication pipeline as a one-time batch: compute string similarity across entity nodes, auto-merge above threshold, flag below threshold for manual review. Regenerate community reports post-merge. |
| Deep Research cost spike | MEDIUM | Immediately add per-query token cap as an emergency config value; disable Deep Research for tenants exceeding budget; enable result caching. Review LLM provider billing for anomalous queries. |
| Peewee/Knex schema divergence discovered | MEDIUM | Identify diverged columns from PostgreSQL `INFORMATION_SCHEMA`. Write a Knex migration to add missing columns (if Knex is behind) or update Peewee models (if Python is behind). Deploy migration before Python worker restart. |
| ABAC cache not invalidated on permission revocation | LOW | Deploy event-driven cache invalidation. Until deployed, reduce Redis TTL for access sets to 60 seconds as a temporary mitigation. |
| GraphRAG community reports stale after document additions | LOW | Trigger full community report regeneration as a background task. Schedule incremental regeneration going forward. No user-visible data loss — just stale summaries. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SYSTEM_TENANT_ID scattered across files (Pitfall 1) | Multi-tenant isolation — first task before feature work | Search for `process.env['SYSTEM_TENANT_ID']` returns zero results after refactor |
| ABAC at wrong layer (Pitfall 2) | ABAC phase | Integration test: restricted user + mixed-access assistant returns only authorized chunks |
| Index-per-tenant scaling (Pitfall 3) | Multi-tenant isolation | Architectural decision documented; pool vs. silo model chosen and implemented in single service |
| Version transition search gap (Pitfall 4) | Document versioning phase | Load test: search during `update_by_query` version flip returns results without gap |
| GraphRAG entity resolution failures (Pitfall 5) | GraphRAG migration phase | Entity count per KB tracked; resolution decisions auditable in DB; duplicate entity alert fires |
| Deep Research cost spiral (Pitfall 6) | Deep Research migration phase | Per-query token budget enforced; Deep Research disabled when budget exhausted; costs predictable |
| Peewee/Knex schema divergence (Pitfall 7) | Every phase that touches DB schema | CI check validates Peewee models match PostgreSQL schema; no migration merged without Peewee update |
| ABAC performance bottleneck | ABAC phase | Benchmark: policy evaluation <10ms cached, <50ms uncached under load |
| GraphRAG + vector search conflicting results | GraphRAG phase (retrieval integration step) | Clear merge strategy implemented; reranker applied after merge; labeled context sections in prompts |
| OpenSearch application-layer-only security (Pitfall 8) | Multi-tenant isolation | DLS configured for regulated tenants; query audit logging active |
| Versioned documents breaking chat context | Document versioning phase, validated in chat stabilization | Chat assistant retrieves `is_current: true` chunks only by default |
| GraphRAG community reports going stale | GraphRAG phase | Incremental regeneration scheduled; report age tracked and surfaced |
| ABAC changes lacking audit trail | ABAC phase | All policy changes logged with before/after snapshot; policy version in search audit log |
| Healthcare sensitivity levels hardcoded | ABAC phase (healthcare tenant specialization) | Sensitivity taxonomy is configurable per tenant; no hardcoded enum values in ABAC rules |

---

## Sources

- Direct codebase analysis — `be/src/modules/rag/services/rag-search.service.ts`, `rag-graphrag.service.ts`, `rag-deep-research.service.ts`, `rag-document.model.ts`, `knowledgebase.model.ts`, `rag-file.model.ts`, `advance-rag/rag/svr/task_executor.py`, `advance-rag/db/db_utils.py`, `be/src/shared/db/migrations/20260312000000_initial_schema.ts` — HIGH confidence
- [AWS: Multi-Tenant SaaS with Amazon OpenSearch](https://aws.amazon.com/blogs/apn/storing-multi-tenant-saas-data-with-amazon-opensearch-service/) — HIGH confidence, authoritative on pool vs. silo model
- [Pinecone: RAG with Access Control](https://www.pinecone.io/learn/rag-access-control/) — MEDIUM confidence, pre-filter access control patterns
- [Cerbos: Access Control for RAG/LLMs](https://www.cerbos.dev/blog/access-control-for-rag-llms) — MEDIUM confidence, retrieval-layer enforcement patterns
- [VersionRAG Paper (arXiv 2510.08109)](https://arxiv.org/abs/2510.08109) — HIGH confidence, version-aware retrieval patterns and failure modes
- [Microsoft GraphRAG Paper (arXiv 2404.16130)](https://arxiv.org/abs/2404.16130) — HIGH confidence, entity resolution and community report patterns
- [HopRAG Paper (arXiv 2502.12442)](https://arxiv.org/abs/2502.12442) — HIGH confidence, multi-hop retrieval cost patterns
- [BigData Boutique: Multi-Tenancy with OpenSearch](https://bigdataboutique.com/blog/multi-tenancy-with-elasticsearch-and-opensearch-c1047b) — MEDIUM confidence, practical index strategy tradeoffs
- [Daxa: Secure RAG in Enterprise Environments](https://www.daxa.ai/blogs/secure-retrieval-augmented-generation-rag-in-enterprise-environments) — MEDIUM confidence, security layer analysis
- RAGFlow upstream codebase conventions — HIGH confidence, reference implementation patterns

---

*Pitfalls research for: Enterprise RAG platform — ABAC, document versioning, GraphRAG, Deep Research, multi-tenant isolation*
*Researched: 2026-03-18*
