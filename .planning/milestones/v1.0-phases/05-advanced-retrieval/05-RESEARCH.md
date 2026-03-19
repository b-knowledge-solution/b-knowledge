# Phase 5: Advanced Retrieval - Research

**Researched:** 2026-03-19
**Domain:** GraphRAG indexing/retrieval, Deep Research recursive retrieval, cross-dataset search, language detection
**Confidence:** HIGH

## Summary

Phase 5 is primarily a **wiring phase** -- the core Python implementations for GraphRAG (entity extraction, community detection, Leiden clustering) and Deep Research (tree-structured query decomposition) already exist in `advance-rag/`. The TypeScript backend services (`rag-graphrag.service.ts`, `rag-deep-research.service.ts`) and the chat conversation pipeline (`chat-conversation.service.ts`) already import and call these services. The frontend already has `KnowledgeGraphTab.tsx` with graph visualization, status badges, run buttons, and `ChatAssistantConfig.tsx` with `use_kg` and `reasoning` toggles.

The primary new work involves: (1) ensuring the GraphRAG indexing pipeline is correctly wired through task routing with LazyGraphRAG as default, (2) adding entity resolution as an auditable stage, (3) extending KnowledgeGraphTab with metrics (entity/relation/community counts, last-built timestamp), (4) implementing token budget and call limits for Deep Research, (5) extending SSE streaming for intermediate Deep Research results, (6) implementing cross-dataset retrieval with ABAC enforcement, (7) adding RBAC dataset access toggle to assistant config, and (8) adding language detection with forced response language in system prompts.

**Primary recommendation:** Wire existing implementations with budget controls and ABAC enforcement; do not rewrite any Python RAG logic. Focus on the integration glue, cost guardrails, and cross-dataset security.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **LazyGraphRAG (light mode) as default** -- lower cost, faster indexing. Full GraphRAG available as opt-in
- **Graph indexing only when explicitly enabled** -- user enables "Knowledge Graph" toggle on a dataset in Data Studio. Indexing runs as a separate task after parsing. No graph construction by default
- **Rebuild from scratch on mode switch** -- when switching from Light to Full GraphRAG, graph is rebuilt entirely. No incremental enhancement
- **Default budget: 50K tokens + 15 LLM calls** per session. Configurable per org by admin
- **Partial answer with disclaimer on budget cap** -- synthesize best answer from completed sub-queries with visible disclaimer
- **Progressive SSE streaming** -- each sub-query result streams as it completes
- **Dataset access toggle in assistant config** -- "Allow user's RBAC datasets" toggle in Data Studio chat assistant settings
- **Results mixed by relevance** -- cross-dataset results ranked by relevance score regardless of source
- **ABAC enforcement at query time** -- existing Phase 2 ABAC filters applied to all cross-dataset queries
- **Extend existing KnowledgeGraphTab** -- show entity count, relationship count, community count, indexing status, last built timestamp. No interactive graph visualization -- just metrics and status
- **Toggles in chat assistant config** -- "Knowledge Graph mode" and "Deep Research mode" toggles
- **Detect user input language** -- analyze the user's prompt to detect language
- **Force LLM response language via system prompt variable** -- add a variable in the system prompt template

### Claude's Discretion
- Language detection library/approach (could be LLM-based, langdetect, or fasttext)
- System prompt template format for language instruction
- GraphRAG entity resolution merge strategy
- Deep Research sub-query generation prompt design
- SSE event format for intermediate Deep Research results
- Cross-dataset query routing (parallel vs sequential)

### Deferred Ideas (OUT OF SCOPE)
None -- language detection and RBAC dataset toggle were explicitly included in Phase 5 scope per user decision.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RETR-01 | GraphRAG entity and relationship extraction -- build knowledge graphs from documents during indexing | Python `graphrag/general/index.py` `run_graphrag_for_kb()` already implements full pipeline; task_executor.py has `"graphrag"` task type mapped to `PipelineTaskType.GRAPH_RAG`; `kg_limiter` semaphore exists |
| RETR-02 | GraphRAG community detection and summarization -- group related entities with auto-generated summaries | `CommunityReportsExtractor` in `graphrag/general/community_reports_extractor.py` implements Leiden clustering + LLM report generation; `with_community` flag controls activation |
| RETR-03 | Graph + vector hybrid retrieval -- combine structured graph traversal with semantic vector search | `KGSearch.retrieval()` in `graphrag/search.py` implements full hybrid pipeline (entity+relation+N-hop+community); `RagGraphragService.retrieval()` in TypeScript mirrors this; already called in chat pipeline step 8a |
| RETR-04 | Deep Research recursive query decomposition -- break complex questions into sub-queries | `TreeStructuredQueryDecompositionRetrieval._research()` implements recursive decomposition with `multi_queries_gen()`; `RagDeepResearchService.research()` in TypeScript mirrors this with `searchRound()` recursion |
| RETR-05 | Deep Research iterative retrieval with reasoning -- retrieve, reason about gaps, retrieve more | `sufficiency_check()` in both Python and TypeScript checks retrieval completeness and triggers follow-up queries when insufficient |
| RETR-06 | Cross-dataset retrieval -- search across multiple knowledge bases respecting ABAC rules | `ragSearchService.search()` already accepts tenantId; `buildOpenSearchAbacFilters()` and `buildAccessFilters()` in ability.service.ts provide ABAC query-time enforcement; need to wire multi-KB aggregation |
| RETR-07 | Deep Research token budget and call limits -- hard caps on LLM calls and tokens per research session | Currently no budget tracking exists; `RagDeepResearchService` uses only `maxDepth:3` guard; need to add token counter + call counter with graceful truncation |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| networkx | (in advance-rag) | Graph data structure for entity resolution, PageRank, community detection | Already used by graphrag pipeline |
| editdistance | (in advance-rag) | String similarity pre-filter for entity resolution | Already used in entity_resolution.py |
| @opensearch-project/opensearch | (in be/) | OpenSearch client for entity/relation/community search | Already used throughout rag services |
| franc | 6.2.0 | Language detection for user input | Lightweight, no native deps, 187 languages, ~460KB |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tinyld | 1.3.4 | Alternative language detection | If franc proves insufficient for short texts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| franc | tinyld | tinyld is smaller (73KB) and faster but supports fewer languages (60 vs 187) |
| franc | LLM-based detection | More accurate for short text but adds latency + cost; user said "lightweight" |
| franc | fasttext | More accurate but requires native bindings and 900KB+ model file |

**Recommendation for language detection:** Use `franc` for its zero-dependency approach and broad language coverage. For very short inputs (< 20 chars), fall back to a simple heuristic (detect CJK/Cyrillic/Arabic script ranges). This avoids an extra LLM call per message.

**Installation:**
```bash
npm install franc -w be
```

## Architecture Patterns

### Existing Code Structure (No Changes Needed)
```
advance-rag/rag/
  graphrag/
    general/              # Full GraphRAG: entity extraction, community reports, Leiden
      index.py            # run_graphrag_for_kb() -- orchestrator
      graph_extractor.py
      community_reports_extractor.py
      extractor.py
    light/                # LazyGraphRAG: lighter entity extraction
      graph_extractor.py
      graph_prompt.py
    search.py             # KGSearch hybrid retrieval
    entity_resolution.py  # LLM-based dedup with edit-distance pre-filter
    utils.py              # Graph merge, cache, helpers
  advanced_rag/
    tree_structured_query_decomposition_retrieval.py  # Deep Research
  svr/
    task_executor.py      # FACTORY + TASK_TYPE_TO_PIPELINE_TASK_TYPE routing
```

### Backend Services (TypeScript) -- Files to Modify
```
be/src/
  modules/rag/services/
    rag-graphrag.service.ts      # Add metrics aggregation endpoint
    rag-deep-research.service.ts # Add token budget + call limit tracking
    rag-search.service.ts        # Add cross-dataset multi-KB search method
  modules/chat/services/
    chat-conversation.service.ts # Add language detection, budget-aware deep research, cross-dataset
  shared/
    prompts/index.ts             # Add language instruction prompt template
    services/ability.service.ts  # Reuse buildAccessFilters for cross-dataset ABAC
```

### Frontend -- Files to Modify
```
fe/src/features/
  datasets/components/
    KnowledgeGraphTab.tsx   # Add metrics panel, mode selector (light/full), last-built timestamp
  chat/components/
    ChatAssistantConfig.tsx # Add RBAC dataset toggle, rename reasoning to Deep Research
  chat/hooks/
    useChatStream.ts        # Extend to handle deep_research intermediate SSE events
```

### Pattern 1: Task Type Routing (GraphRAG Indexing)
**What:** Task executor already maps `"graphrag"` to `PipelineTaskType.GRAPH_RAG` and calls `run_graphrag_for_kb()`. The backend triggers this by creating a task with `task_type: "graphrag"`.
**When to use:** When user enables Knowledge Graph on a dataset and clicks "Run GraphRAG".
**Key insight:** The routing is already wired. The backend endpoint `runGraphRAG(datasetId, docIds?)` creates the task in DB; the Python worker picks it up via Redis queue.

```python
# Already exists in task_executor.py line 1332-1380
# task_type == "graphrag":
#   ok, kb = KnowledgebaseService.get_by_id(task_dataset_id)
#   graphrag_conf = kb_parser_config.get("graphrag", {})
#   result = run_graphrag_for_kb(
#       row=task, doc_ids=task.get("doc_ids", []),
#       language=task_language, kb_parser_config=kb_parser_config,
#       chat_model=chat_model, embedding_model=embedding_model,
#       callback=progress_callback,
#       with_resolution=graphrag_conf.get("resolution", False),
#       with_community=graphrag_conf.get("community", False),
#   )
```

### Pattern 2: Token Budget Tracking (Deep Research)
**What:** Wrap LLM calls in Deep Research with a budget tracker that counts tokens consumed and calls made. When budget is exceeded, stop recursion and synthesize from available results.
**When to use:** All Deep Research operations.
**Example:**

```typescript
// New: Add to rag-deep-research.service.ts
interface BudgetTracker {
  maxTokens: number     // Default: 50_000
  maxCalls: number      // Default: 15
  tokensUsed: number
  callsUsed: number
  isExhausted(): boolean
  recordCall(tokensConsumed: number): void
}
```

### Pattern 3: Cross-Dataset Search with ABAC
**What:** At query time, resolve which KBs the user can access (RBAC check), then search all authorized KBs in parallel, merge results by relevance.
**When to use:** When assistant has "Allow user's RBAC datasets" enabled.
**Example:**

```typescript
// Cross-dataset search: search all authorized KBs in single query
const authorizedKbIds = await getAuthorizedKbIds(tenantId, userId)
const allKbIds = [...dedicatedKbIds, ...authorizedKbIds]
const abacFilters = buildOpenSearchAbacFilters(userPolicies)

// Search all KBs in single OpenSearch query (they share the same index)
// The pool model uses knowledge_{SYSTEM_TENANT_ID} -- a single shared index
const results = await ragSearchService.search(tenantId, allKbIds, {
  query, method: 'hybrid', top_k: topN,
  abacFilters, // ABAC enforcement at query time
})
```

### Pattern 4: SSE Event Format for Deep Research
**What:** Extend the existing SSE streaming to include structured intermediate results.
**When to use:** During Deep Research recursive retrieval.
**Example:**

```typescript
// Existing pattern in chat-conversation.service.ts
// res.write(data: JSON({ status: 'deep_research', message: msg }))

// Extended format for intermediate results:
// Sub-query started
{ status: 'deep_research', subEvent: 'subquery_start', query: 'What is X?', depth: 1, index: 1, total: 3 }
// Sub-query result
{ status: 'deep_research', subEvent: 'subquery_result', query: 'What is X?', chunks: 5 }
// Budget warning
{ status: 'deep_research', subEvent: 'budget_warning', tokensUsed: 45000, tokensMax: 50000, callsUsed: 12, callsMax: 15 }
// Budget exhausted -- partial answer
{ status: 'deep_research', subEvent: 'budget_exhausted', completed: 2, total: 3, message: 'Research was limited by budget.' }
```

### Anti-Patterns to Avoid
- **Never skip ABAC filters in cross-dataset search:** Every OpenSearch query MUST include `buildAccessFilters(tenantId, abacFilters)`. Cross-dataset search adds more KBs, not fewer filters.
- **Never use unbounded recursion in Deep Research:** Always enforce both `maxDepth` AND token/call budget.
- **Never block SSE stream during Deep Research:** Each sub-query should stream progress independently; use async patterns, not sequential blocking.
- **Never auto-enable graph indexing:** Graph construction is expensive. Only run when user explicitly enables it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Language detection | Regex-based language guesser | `franc` library | Handles 187 languages, tested across scripts, handles mixed-script text |
| Entity resolution | Custom string matching | Existing `EntityResolution` class | Already handles edit-distance pre-filter, LLM comparison, connected-component merge, PageRank recompute |
| Graph community detection | Manual clustering | Existing `CommunityReportsExtractor` with Leiden | Already implemented with LLM report generation |
| ABAC filter construction | Manual OpenSearch query building | `buildOpenSearchAbacFilters()` + `buildAccessFilters()` | Already handles allow/deny policies, tenant isolation |
| Token counting | Character-based estimation | `num_tokens_from_string()` (Python) or tiktoken-equivalent (TS) | Accurate token counting needed for budget enforcement |

**Key insight:** This phase is about integration, not implementation. The complex algorithms (graph construction, entity resolution, community detection, recursive query decomposition) already exist. The work is wiring, budget controls, and security enforcement.

## Common Pitfalls

### Pitfall 1: Deep Research Token Spiral
**What goes wrong:** Without hard caps, Deep Research generates exponential sub-queries (depth 3 with 3 sub-queries each = 39 total LLM calls).
**Why it happens:** Each sub-query can generate multiple follow-ups, and sufficiency checks are themselves LLM calls.
**How to avoid:** Enforce BOTH token budget (50K default) AND call limit (15 default). Count sufficiency checks and follow-up generation as LLM calls. Track cumulatively across the entire recursion tree.
**Warning signs:** Deep Research taking > 30 seconds or generating > 5 follow-up rounds.

### Pitfall 2: Cross-Dataset ABAC Bypass
**What goes wrong:** Cross-dataset search returns chunks from KBs the user is not authorized to access.
**Why it happens:** New multi-KB search path forgets to include ABAC filters, or applies them to the dedicated KBs but not the RBAC-expanded ones.
**How to avoid:** ALL search paths MUST go through `buildAccessFilters()`. Test with a user who has partial KB access -- verify they cannot see unauthorized chunks.
**Warning signs:** Chunks appearing without `kb_id` in user's authorized set.

### Pitfall 3: GraphRAG Mode Switch Data Corruption
**What goes wrong:** Switching from Light to Full GraphRAG produces corrupted graph because old entity format differs from new.
**Why it happens:** Light GraphRAG extracts fewer entity attributes; Full GraphRAG expects richer node properties.
**How to avoid:** Per CONTEXT.md decision: rebuild from scratch on mode switch. Delete existing graph data before running new mode.
**Warning signs:** Entity resolution failing on mixed-format nodes.

### Pitfall 4: SSE Stream Ordering in Deep Research
**What goes wrong:** Intermediate results arrive out of order, confusing the frontend.
**Why it happens:** Parallel sub-queries complete at different times; `asyncio.gather` does not guarantee event ordering.
**How to avoid:** Include `depth`, `index`, and `total` in each SSE event so the frontend can reconstruct ordering. The frontend should render results as they arrive (progressive), not buffer and reorder.
**Warning signs:** Frontend showing "Researching: Q3" before "Researching: Q1".

### Pitfall 5: Language Detection on Very Short Input
**What goes wrong:** `franc` returns `und` (undetermined) for inputs shorter than ~10 characters.
**Why it happens:** Statistical language detection needs sufficient text to work.
**How to avoid:** For very short inputs (< 20 chars), use Unicode script detection as fallback (CJK = Chinese, Hangul = Korean, Hiragana/Katakana = Japanese, etc.). For truly ambiguous short inputs, default to English.
**Warning signs:** System prompt always saying "respond in English" regardless of user's language.

### Pitfall 6: OpenSearch Query Size Limit
**What goes wrong:** Cross-dataset search with many KB IDs creates a terms query that exceeds OpenSearch limits.
**Why it happens:** A user with access to 100+ KBs generates a large `terms: { kb_id: [...100 ids] }` clause.
**How to avoid:** Cap cross-dataset expansion to a reasonable limit (e.g., 20 KBs). Sort by relevance/recency and take top N KBs. Document the limit in the UI.
**Warning signs:** OpenSearch returning 400 errors on cross-dataset queries.

## Code Examples

### Language Detection with Script Fallback
```typescript
// Source: franc npm package + custom script detection
import { franc } from 'franc'

/**
 * @description Detect the language of user input text.
 * Uses franc for statistical detection with Unicode script fallback for short text.
 * @param {string} text - User input text
 * @returns {string} ISO 639-3 language code (e.g., 'eng', 'vie', 'jpn')
 */
function detectLanguage(text: string): string {
  // For very short text, use Unicode script ranges as heuristic
  if (text.length < 20) {
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'jpn'
    if (/[\uAC00-\uD7AF]/.test(text)) return 'kor'
    if (/[\u4E00-\u9FFF]/.test(text)) return 'cmn'
    if (/[\u0400-\u04FF]/.test(text)) return 'rus'
    if (/[\u0600-\u06FF]/.test(text)) return 'ara'
    if (/[\u0E00-\u0E7F]/.test(text)) return 'tha'
    return 'eng'
  }

  const detected = franc(text)
  return detected === 'und' ? 'eng' : detected
}
```

### System Prompt Language Instruction Template
```typescript
// Source: be/src/shared/prompts/ (new prompt template)

/** Map ISO 639-3 codes to human-readable language names */
const LANG_NAMES: Record<string, string> = {
  eng: 'English', vie: 'Vietnamese', jpn: 'Japanese',
  cmn: 'Chinese', kor: 'Korean', fra: 'French',
  deu: 'German', spa: 'Spanish', ara: 'Arabic',
  rus: 'Russian', tha: 'Thai',
}

/**
 * @description Build language instruction to prepend to system prompt.
 * @param {string} langCode - ISO 639-3 language code
 * @returns {string} Language instruction text
 */
function buildLanguageInstruction(langCode: string): string {
  const name = LANG_NAMES[langCode] || 'the same language as the user'
  return `IMPORTANT: You MUST respond in ${name}. All your answers, explanations, and citations must be in ${name}.`
}
```

### Token Budget Tracker
```typescript
// Source: New code for rag-deep-research.service.ts

/**
 * @description Tracks token and call usage for Deep Research budget enforcement.
 */
class BudgetTracker {
  private tokensUsed = 0
  private callsUsed = 0

  constructor(
    private readonly maxTokens: number = 50_000,
    private readonly maxCalls: number = 15
  ) {}

  /** Record an LLM call and its token consumption */
  recordCall(tokens: number): void {
    this.tokensUsed += tokens
    this.callsUsed += 1
  }

  /** Check if budget is exhausted */
  isExhausted(): boolean {
    return this.tokensUsed >= this.maxTokens || this.callsUsed >= this.maxCalls
  }

  /** Get budget status for SSE events */
  getStatus(): { tokensUsed: number; tokensMax: number; callsUsed: number; callsMax: number } {
    return {
      tokensUsed: this.tokensUsed, tokensMax: this.maxTokens,
      callsUsed: this.callsUsed, callsMax: this.maxCalls,
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full GraphRAG by default | LazyGraphRAG as default | Phase 5 decision | 5-10x cost reduction for graph indexing |
| maxDepth:3 only guard | Token budget + call limit | Phase 5 decision | Prevents runaway Deep Research costs |
| Single-dataset search | Cross-dataset with ABAC | Phase 5 | Users can search across all authorized KBs |
| No language-aware responses | Detect input language, force response language | Phase 5 | Better multilingual UX |

**Key existing state:**
- GraphRAG task type already registered in task executor (`"graphrag"` -> `PipelineTaskType.GRAPH_RAG`)
- Full and Light graph extractors both exist in Python
- Entity resolution with edit-distance pre-filter and LLM comparison exists
- Community reports extractor with Leiden clustering exists
- Deep Research with recursive decomposition exists
- `use_kg` and `reasoning` toggles exist in ChatAssistantConfig
- KnowledgeGraphTab exists with canvas visualization, status badges, run buttons
- ABAC filter infrastructure exists (`buildOpenSearchAbacFilters`, `buildAccessFilters`)

## Open Questions

1. **Token counting in TypeScript**
   - What we know: Python uses `num_tokens_from_string()` from `common.token_utils`. The frontend already imports tiktoken (in vendor chunk split).
   - What's unclear: Whether the backend has a token counting utility or if we need to add one.
   - Recommendation: Use `tiktoken` (already available in `fe/` vendor) or add `gpt-tokenizer` to `be/`. For budget tracking, approximate counting (chars/4) is acceptable as a first pass since the budget is a soft cap.

2. **Cross-dataset KB resolution**
   - What we know: `ragSearchService.search()` takes a single `kbId`. The chat pipeline iterates over `kbIds`.
   - What's unclear: Whether searching across KBs from different tenants is supported (pool model uses `knowledge_{SYSTEM_TENANT_ID}` single index).
   - Recommendation: Since the pool model uses a single shared index with `tenant_id` filter, cross-dataset search within the same tenant is straightforward -- just expand the `kb_id` terms filter. Cross-tenant search is out of scope (not in requirements).

3. **GraphRAG metrics API**
   - What we know: KnowledgeGraphTab currently fetches graph data (nodes/edges) for visualization. GraphRAG status polling exists.
   - What's unclear: Whether there is an existing endpoint that returns entity/relation/community counts.
   - Recommendation: Add an aggregation query to the existing GraphRAG status endpoint -- use OpenSearch `_count` or `terms` aggregation on `knowledge_graph_kwd` field filtered by `kb_id`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (BE: be/tests/, FE: fe/tests/) |
| Config file | be/vitest.config.ts, fe/vitest.config.ts |
| Quick run command | `npm run test -w be -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RETR-01 | GraphRAG task creation and routing | unit | `npm run test -w be -- --run be/tests/rag/graphrag-indexing.test.ts` | Wave 0 |
| RETR-02 | Community detection config propagation | unit | `npm run test -w be -- --run be/tests/rag/graphrag-indexing.test.ts` | Wave 0 |
| RETR-03 | Graph+vector hybrid retrieval returns results | unit | `npm run test -w be -- --run be/tests/rag/graphrag-retrieval.test.ts` | Wave 0 |
| RETR-04 | Deep Research generates sub-queries | unit | `npm run test -w be -- --run be/tests/rag/deep-research.test.ts` | Wave 0 |
| RETR-05 | Sufficiency check triggers follow-up | unit | `npm run test -w be -- --run be/tests/rag/deep-research.test.ts` | Wave 0 |
| RETR-06 | Cross-dataset search respects ABAC | unit | `npm run test -w be -- --run be/tests/rag/cross-dataset-search.test.ts` | Wave 0 |
| RETR-07 | Budget tracker stops at limits | unit | `npm run test -w be -- --run be/tests/rag/deep-research-budget.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- --run`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `be/tests/rag/graphrag-indexing.test.ts` -- covers RETR-01, RETR-02 (task creation, config propagation)
- [ ] `be/tests/rag/graphrag-retrieval.test.ts` -- covers RETR-03 (hybrid retrieval, entity+relation scoring)
- [ ] `be/tests/rag/deep-research.test.ts` -- covers RETR-04, RETR-05 (recursive decomposition, sufficiency)
- [ ] `be/tests/rag/deep-research-budget.test.ts` -- covers RETR-07 (token budget, call limit enforcement)
- [ ] `be/tests/rag/cross-dataset-search.test.ts` -- covers RETR-06 (multi-KB ABAC enforcement)
- [ ] Framework install: `npm install franc -w be` -- language detection library

## Sources

### Primary (HIGH confidence)
- **advance-rag/rag/graphrag/** -- Full source code review of entity extraction, search, entity resolution, community reports
- **advance-rag/rag/advanced_rag/tree_structured_query_decomposition_retrieval.py** -- Deep Research implementation
- **advance-rag/rag/svr/task_executor.py** -- Task routing (FACTORY, TASK_TYPE_TO_PIPELINE_TASK_TYPE)
- **be/src/modules/rag/services/rag-graphrag.service.ts** -- TypeScript GraphRAG service
- **be/src/modules/rag/services/rag-deep-research.service.ts** -- TypeScript Deep Research service
- **be/src/modules/chat/services/chat-conversation.service.ts** -- Chat pipeline with KG + Deep Research integration
- **be/src/shared/services/ability.service.ts** -- ABAC filter construction
- **fe/src/features/datasets/components/KnowledgeGraphTab.tsx** -- Existing KG tab
- **fe/src/features/chat/components/ChatAssistantConfig.tsx** -- Existing assistant config with toggles
- **fe/src/features/chat/hooks/useChatStream.ts** -- SSE streaming with status events

### Secondary (MEDIUM confidence)
- **franc** npm package (v6.2.0) -- verified via `npm view franc version`
- **tinyld** npm package (v1.3.4) -- verified as alternative

### Tertiary (LOW confidence)
- Token counting approach for TypeScript (needs validation during implementation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all core libraries already in project, only adding franc for language detection
- Architecture: HIGH -- all integration points identified, existing code thoroughly reviewed
- Pitfalls: HIGH -- budget spiral risk well-documented in STATE.md; ABAC bypass is a known security concern from Phase 2

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- existing code, no external API changes expected)
