# Phase 2: Investigate mem0 for memory feature - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 02-investigate-mem0-for-memory-feature
**Areas discussed:** Integration strategy, Scope of investigation, Evaluation criteria, Investigation output

---

## Integration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Replace current system | Rip out existing memory implementation and use mem0 as core engine | |
| Augment with graph memory | Keep existing for table storage, add mem0 for graph-based memory | |
| Learn and port concepts | Study mem0 and implement best ideas natively | |
| Wrap mem0 as backend | Use mem0 as pluggable backend behind existing API layer | ✓ |

**User's choice:** Wrap mem0 as backend
**Notes:** Keep same frontend/API, swap storage+extraction engine

---

| Option | Description | Selected |
|--------|-------------|----------|
| Full replacement | All pools use mem0, remove OpenSearch+LLM extraction | |
| Configurable per pool | Each pool chooses native or mem0 backend | |
| Default mem0, native fallback | New pools default to mem0, existing keep native | ✓ |

**User's choice:** Default mem0, native fallback
**Notes:** Migration path approach, no UI toggle

---

| Option | Description | Selected |
|--------|-------------|----------|
| Share existing infra | Configure mem0 to use b-knowledge's PostgreSQL and OpenSearch | ✓ |
| Separate storage | mem0 manages its own database/vector store | |

**User's choice:** Share existing infrastructure
**Notes:** Fewer moving parts

---

## Scope of Investigation

| Option | Description | Selected |
|--------|-------------|----------|
| Graph memory | Knowledge graph feature (entities + relationships) | ✓ |
| Memory CRUD + search API | How mem0's operations map to existing API | ✓ |
| Multi-level memory | User/agent/session levels vs scope_type | ✓ |
| Self-hosted deployment | Can run alongside b-knowledge's Docker stack | ✓ |

**User's choice:** All four capabilities
**Notes:** Comprehensive evaluation for backend swap

---

| Option | Description | Selected |
|--------|-------------|----------|
| Open-source only | Only evaluate self-hosted open-source version | ✓ |
| Both, prefer open-source | Evaluate both but design for self-hosted | |

**User's choice:** Open-source only
**Notes:** No dependency on mem0's cloud service

---

| Option | Description | Selected |
|--------|-------------|----------|
| Python sidecar service | Run mem0 as separate Python service via HTTP | |
| Embed in advance-rag | Add mem0 as dependency in advance-rag worker | |
| You decide | Claude's discretion based on architecture | ✓ |

**User's choice:** You decide (Claude's discretion)
**Notes:** Claude determines based on mem0's architecture and b-knowledge patterns

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, compare quality | Run sample conversations through both pipelines | ✓ |
| No, trust mem0's approach | Focus on API compatibility | |

**User's choice:** Yes, compare extraction quality
**Notes:** Important for validating the switch

---

| Option | Description | Selected |
|--------|-------------|----------|
| Must support multi-tenant | mem0 must isolate data per tenant | ✓ |
| Single-tenant OK for now | Multi-tenant can be added later | |

**User's choice:** Must support multi-tenant
**Notes:** Critical for production use

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, map agent integration | Ensure memory_read/memory_write nodes work through mem0 | ✓ |
| Defer agent nodes | Focus on core CRUD/search first | |

**User's choice:** Yes, map agent integration
**Notes:** Key integration point

---

| Option | Description | Selected |
|--------|-------------|----------|
| Use existing embeddings | mem0 uses b-knowledge's tenant-configured models | ✓ |
| mem0 manages its own | Let mem0 handle its own embedding generation | |

**User's choice:** Use existing embeddings
**Notes:** Keeps model management centralized

---

| Option | Description | Selected |
|--------|-------------|----------|
| OpenSearch only | Stick with existing OpenSearch | ✓ |
| OpenSearch + pgvector | Test both OpenSearch and pgvector | |

**User's choice:** OpenSearch only
**Notes:** No new vector store infrastructure

---

| Option | Description | Selected |
|--------|-------------|----------|
| Add Neo4j to stack | Accept Neo4j as new infrastructure dependency | |
| Find alternatives | Investigate lighter alternatives | |
| Investigate Neo4j CE + alternatives | Verify licensing, evaluate alternatives | ✓ |

**User's choice:** Investigate Neo4j CE + alternatives
**Notes:** User asked about Neo4j licensing for enterprise closed-source use. Need to verify Community Edition licensing and evaluate FalkorDB, Apache AGE as alternatives.

---

| Option | Description | Selected |
|--------|-------------|----------|
| REST API preferred | Investigate if mem0 can run as standalone HTTP service | ✓ |
| Python SDK is fine | Direct Python SDK usage within advance-rag | |

**User's choice:** REST API preferred
**Notes:** Fits b-knowledge's polyglot architecture

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, critical feature | Must verify mem0 has forgetting policy + size limits | ✓ |
| Nice to have | Not a blocker | |

**User's choice:** Forgetting policy is critical
**Notes:** Must verify equivalent or better lifecycle management

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, map settings impact | Document which settings map, which become obsolete | ✓ |
| Defer to implementation | Figure out during actual integration | |

**User's choice:** Yes, map settings impact
**Notes:** Important for planning UI changes

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, plan migration path | Document how existing memories migrate | ✓ |
| No, fresh start OK | Only new pools use mem0 | |

**User's choice:** Yes, plan migration path
**Notes:** Important for production adoption

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, map prompt system | Understand how custom instructions compare | ✓ |
| Not critical | Secondary concern | |

**User's choice:** Yes, map prompt system
**Notes:** Ensure customization isn't lost

---

| Option | Description | Selected |
|--------|-------------|----------|
| Must use existing LLM system | Route through tenant_llm configured providers | ✓ |
| mem0 manages its own | Simpler but duplicate config | |

**User's choice:** Must use existing LLM system
**Notes:** Keeps LLM management centralized, respects tenant model choices

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, key differentiator | Major reason to consider mem0 | ✓ |
| Nice to have | Note but don't make deciding factor | |

**User's choice:** Dedup/conflict resolution is key differentiator
**Notes:** Current system lacks these (out-of-scope in FR-MEMORY)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Not needed | Trust mem0's project health (25k+ stars) | ✓ |
| Yes, assess project health | Check release cadence, contributors, breaking changes | |

**User's choice:** Not needed
**Notes:** mem0 has sufficient community trust

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, evaluate versioning | Memory versioning valuable for audit trails | ✓ |
| Not in scope | Current status-based approach sufficient | |

**User's choice:** Yes, evaluate versioning
**Notes:** Current system only has active/forgotten status

---

## Evaluation Criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Go/no-go decision | Clear recommendation with supporting evidence | ✓ |
| Feasibility assessment | Understand gaps, decide later | |
| Integration roadmap | Not just whether, but HOW | |

**User's choice:** Go/no-go decision
**Notes:** Binary outcome required

---

Deal-breakers (all selected):
- No OpenSearch support ✓
- No multi-tenant isolation ✓
- Can't use existing LLM/embedding ✓
- Licensing incompatible ✓

**Notes:** Any single deal-breaker = reject mem0

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, benchmark both | Run identical workloads through both systems | ✓ |
| Qualitative only | Note architectural differences only | |

**User's choice:** Yes, benchmark both
**Notes:** Compare add/search latency and throughput

---

## Investigation Output

| Option | Description | Selected |
|--------|-------------|----------|
| ADR only | Formal ADR with evaluation matrix | |
| ADR + proof-of-concept | ADR plus working PoC branch | |
| ADR + full integration plan | ADR plus detailed phase-by-phase integration plan | ✓ |

**User's choice:** ADR + full integration plan
**Notes:** If mem0 passes, include detailed plan for actual integration

---

| Option | Description | Selected |
|--------|-------------|----------|
| docs/adr/ | New ADR directory, first ADR in project | ✓ |
| docs/basic-design/ | Alongside existing architecture docs | |

**User's choice:** docs/adr/
**Notes:** Establishes ADR convention for the project

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, full API mapping | Detailed endpoint-to-endpoint table | ✓ |
| High-level only | Major operations only | |

**User's choice:** Yes, full API mapping
**Notes:** Essential for the wrapper approach

---

| Option | Description | Selected |
|--------|-------------|----------|
| Separate, update later | ADR standalone, arch doc updated in integration phase | ✓ |
| ADR includes proposed architecture | ADR includes updated architecture diagram | |

**User's choice:** Separate, update later
**Notes:** Architecture doc updated during actual integration

---

## Claude's Discretion

- Python integration architecture (sidecar service vs embed in advance-rag)
- ADR document structure and format
- Performance benchmark tooling and test data
- Order of evaluation tasks
- Integration plan granularity

## Deferred Ideas

None — discussion stayed within phase scope.
