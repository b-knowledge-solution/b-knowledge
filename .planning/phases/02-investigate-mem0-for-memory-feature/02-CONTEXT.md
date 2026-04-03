# Phase 2: Investigate mem0 for memory feature - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Investigate mem0 (https://github.com/mem0ai/mem0) as a pluggable backend replacement for b-knowledge's existing memory system. Produce a go/no-go Architecture Decision Record with full API mapping, deal-breaker evaluation, and integration plan. The existing memory API layer and frontend remain unchanged — mem0 would replace the storage and extraction engine underneath.

</domain>

<decisions>
## Implementation Decisions

### Integration Strategy
- **D-01:** **Wrap mem0 as a pluggable backend** behind the existing b-knowledge memory API. Frontend and API layer stay the same; mem0 handles storage + extraction underneath.
- **D-02:** **Default mem0 for new pools, native fallback for existing.** New memory pools default to mem0 backend. Existing pools continue on native OpenSearch+LLM pipeline. No UI toggle — migration path approach.
- **D-03:** **Share existing infrastructure.** Configure mem0 to use b-knowledge's existing PostgreSQL and OpenSearch instances. No new database or vector store infrastructure (except potentially a graph database).

### Scope of Investigation
- **D-04:** Evaluate ALL four major mem0 capabilities: graph memory, memory CRUD + search API, multi-level memory (user/agent/session), and self-hosted deployment.
- **D-05:** **Open-source self-hosted only.** Do not evaluate mem0's managed platform (paid API). No cloud service dependency.
- **D-06:** **Compare extraction quality.** Run sample conversations through both pipelines (mem0 vs current 4-type bitmask extraction) and compare quality of extracted memories.
- **D-07:** **Must support multi-tenant isolation.** mem0 backend must isolate data per tenant, matching current `tenant_id`-based isolation. This is a hard requirement, not optional.
- **D-08:** **Map agent node integration.** Ensure memory_read/memory_write agent canvas nodes work seamlessly through the mem0 backend.
- **D-09:** **Must use b-knowledge's existing embedding models.** mem0 should use tenant-configured embedding models (embd_id per pool) from the tenant_llm system, not its own embedding config.
- **D-10:** **OpenSearch as vector store.** Stick with existing OpenSearch. Do not evaluate alternative vector stores (Qdrant, pgvector, etc.).
- **D-11:** **Investigate Neo4j CE + alternatives for graph memory.** Verify Neo4j Community Edition licensing for closed-source enterprise use. Also evaluate lighter alternatives: FalkorDB, Apache AGE (PostgreSQL extension). Licensing compatibility is a deal-breaker.
- **D-12:** **REST API preferred.** Investigate if mem0 can run as a standalone HTTP service. This fits b-knowledge's polyglot architecture (TypeScript backend calling Python services via HTTP).
- **D-13:** **Forgetting policy and memory lifecycle is critical.** Must verify mem0 has equivalent or better memory management (FIFO forgetting, size limits) compared to current system.
- **D-14:** **Map frontend settings impact.** Document which MemorySettingsPanel settings (bitmask types, extraction mode, prompts, temperature, etc.) map to mem0 concepts and which become obsolete.
- **D-15:** **Plan data migration path.** Document how existing memory messages would migrate from OpenSearch native format to mem0's format. Important for production adoption.
- **D-16:** **Must use b-knowledge's existing LLM providers.** mem0 should route through b-knowledge's tenant_llm configured providers for extraction, not its own LLM config.
- **D-17:** **Map prompt customization.** Understand how mem0's custom instructions compare to b-knowledge's per-pool system_prompt/user_prompt templates. Ensure customization isn't lost.
- **D-18:** **Deduplication and conflict resolution are key differentiators.** These are features the current system lacks (listed as out-of-scope in FR-MEMORY). Evaluate thoroughly as major reasons to adopt mem0.
- **D-19:** **Evaluate memory versioning.** Check mem0's memory versioning and history tracking capabilities. Current system only has status (active/forgotten) with no version history.

### Evaluation Criteria
- **D-20:** **Go/no-go decision required.** Investigation must produce a clear recommendation: adopt mem0 or stick with native. Binary outcome with supporting evidence.
- **D-21:** **Deal-breakers (any one = reject mem0):**
  1. No OpenSearch support as vector store
  2. No multi-tenant data isolation
  3. Cannot use b-knowledge's existing LLM/embedding providers
  4. Licensing incompatible with closed-source enterprise use
- **D-22:** **Performance benchmarks required.** Run identical workloads through both systems. Compare add/search latency and throughput.

### Investigation Output
- **D-23:** **ADR document in `docs/adr/`.** Create a new `docs/adr/` directory for Architecture Decision Records. This will be the first ADR in the project.
- **D-24:** **Full API mapping table.** Create a detailed table: b-knowledge memory endpoint → mem0 equivalent → gaps/differences. Essential for the wrapper approach.
- **D-25:** **Full integration plan.** If mem0 passes evaluation, include a detailed phase-by-phase plan for how the actual integration would proceed.
- **D-26:** **ADR is standalone.** Do not update existing architecture docs (docs/basic-design/memory-architecture.md). Architecture doc gets updated in the actual integration phase.

### Claude's Discretion
- Architecture of the Python integration layer (sidecar service vs embed in advance-rag)
- Structure and format of the ADR document
- How to run performance benchmarks (tooling, test data)
- Order of evaluation tasks within the investigation
- How to structure the integration plan (number of phases, granularity)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### External Sources
- `https://github.com/mem0ai/mem0` — mem0 GitHub repository. Primary investigation target. Read README, architecture docs, and source code.

### Current Memory System
- `docs/basic-design/memory-architecture.md` — Current memory system architecture (C4 diagrams, data model, extraction pipeline)
- `docs/srs/fr-memory.md` — Functional requirements for the memory system (FR-MEM-01 through FR-MEM-10+)
- `docs/detail-design/memory-overview.md` — Detailed design for memory module
- `docs/basic-design/database-design-agents-memory.md` — Database schema design for memory tables

### Backend Memory Module
- `be/src/modules/memory/` — TypeScript memory API (controllers, services, models, routes, schemas)
- `be/src/modules/memory/services/memory-extraction.service.ts` — LLM extraction pipeline (4-type bitmask, custom prompts)
- `be/src/modules/memory/services/memory-message.service.ts` — OpenSearch message storage and search
- `be/src/modules/memory/services/memory.service.ts` — Memory pool CRUD service
- `be/src/modules/memory/models/memory.model.ts` — Memory pool data model (PostgreSQL)

### Frontend Memory Module
- `fe/src/features/memory/` — React frontend (list, detail, settings, import)
- `fe/src/features/memory/components/MemorySettingsPanel.tsx` — Pool configuration UI (needs impact mapping)

### Agent Integration
- `fe/src/features/agents/components/canvas/forms/MemoryForm.tsx` — Agent canvas memory node config
- `advance-rag/api/utils/memory_utils.py` — Python memory utilities
- `advance-rag/memory/` — Python memory handlers

### Phase 1 Context
- `.planning/phases/01-migrate-latest-ragflow-upstream-to-b-knowledge/01-CONTEXT.md` — Prior phase context (memory user_id tracking ported)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `be/src/modules/memory/` — Full CRUD, extraction, message service. The API layer remains unchanged; only the backend implementation swaps.
- `be/src/modules/memory/prompts/extraction.prompts.ts` — 4 prompt templates (raw, semantic, episodic, procedural). Need to understand how these map to mem0's approach.
- `be/src/shared/services/llm-client.service.ts` — Centralized LLM client. mem0 should route through this for tenant-configured models.
- `advance-rag/db/db_models.py` — Peewee models including memory-related tables.

### Established Patterns
- **Dual-service architecture:** Node.js Express API (port 3001) + Python FastAPI worker (advance-rag). mem0 integration likely follows this pattern.
- **Tenant isolation:** All queries filter by tenant_id. Memory OpenSearch index is per-tenant: `memory_{tenantId}`.
- **LLM provider system:** tenant_llm table stores configured models per tenant. Services use llm_id/embd_id references.
- **Module boundaries:** No cross-module imports. Barrel exports via index.ts.

### Integration Points
- `be/src/modules/memory/services/memory-extraction.service.ts` — Primary replacement target. This is what mem0 replaces.
- `be/src/modules/memory/services/memory-message.service.ts` — OpenSearch message operations. May need adapter layer for mem0.
- Agent canvas memory nodes — memory_read/memory_write operations flow through the memory API.
- Docker Compose stack — `docker/docker-compose-base.yml` for infrastructure services.

</code_context>

<specifics>
## Specific Ideas

- mem0's graph memory could fill the currently unimplemented `storage_type: 'graph'` option in the memory pool model
- mem0's deduplication and conflict resolution would close two items listed as "out of scope" in FR-MEMORY
- The wrapper approach means the investigation should produce an interface/contract that the mem0 backend adapter must implement
- Neo4j licensing for closed-source enterprise use is a specific concern that must be resolved with evidence (license text, legal analysis)
- Performance benchmarks should use realistic workloads matching b-knowledge's expected usage (multi-turn conversations, concurrent tenants)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- "Merge latest RAGFlow upstream to b-knowledge" (score 0.2, matched on keyword "memory") — not relevant to mem0 investigation, this is the Phase 1 todo.

</deferred>

---

*Phase: 02-investigate-mem0-for-memory-feature*
*Context gathered: 2026-03-24*
