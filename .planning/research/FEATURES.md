# Feature Landscape

**Domain:** RAG Knowledge Base Platform (SDLC + Healthcare)
**Researched:** 2026-03-18
**Overall confidence:** MEDIUM-HIGH

## Table Stakes

Features users expect from an enterprise RAG platform in 2026. Missing any of these and users will look elsewhere.

### Core RAG Pipeline (Already Validated)

These are shipped and confirmed — listed for completeness. They form the foundation everything else builds on.

| Feature | Why Expected | Complexity | Status |
|---------|--------------|------------|--------|
| Multi-format document ingestion (PDF, DOCX, XLSX, etc.) | Every RAG platform does this | High (already done) | Validated |
| Configurable chunking strategies | Users need control over retrieval granularity | Med (already done) | Validated |
| Hybrid search (BM25 + vector) | Industry standard since 2024; pure vector misses exact matches | Med (already done) | Validated |
| Reranking support | 20-40% accuracy improvement; expected by 2025 | Med (already done) | Validated |
| Streaming chat with citations | Users need to verify answers against sources | Med (already done) | Validated |
| Multi-LLM provider support | Vendor lock-in is a dealbreaker for enterprises | Med (already done) | Validated |
| Multi-turn conversation | Single-turn chat feels broken | Med (already done) | Validated |

### Access Control and Tenant Isolation (Active — Must Ship)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Org-level tenant isolation | Zero-tolerance for data leakage between organizations; every enterprise RAG platform enforces this | Med | Pre-filter at query time + row-level DB isolation. Not negotiable for healthcare or enterprise SDLC. |
| Role-based access control (RBAC) | Baseline expectation: admin, editor, viewer roles within an org | Med | Foundation layer that ABAC extends. Ship RBAC first, ABAC second. |
| ABAC (attribute-based access control) | Healthcare: "only doctors see clinical docs." SDLC: "only project members see project specs." Fine-grained rules based on user attributes, document metadata, and context | High | Pre-filter approach (filter before vector search) is more efficient for large corpora with low hit rates. Attach security attributes as metadata to every chunk at index time. At query time, construct metadata filters from user attributes. |
| Document-level permission inheritance | Documents inherit permissions from dataset/project but allow overrides | Med | Without this, admins manually set permissions on every document — untenable at scale. |
| Audit logging | Who accessed what, when, and what answer was generated. Regulatory requirement for healthcare (HIPAA). | Med | Log every query, retrieved chunks, and generated response. Essential for compliance. Already have Langfuse tracing — extend to access audit. |

### Document Management (Active — Must Ship)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Document version history | VersionRAG research shows 90% accuracy on version-sensitive questions vs 58% for naive RAG. Users ask "what changed?" and "what was the policy last quarter?" | High | Store all versions. Re-index each version's chunks. Track version metadata (author, timestamp, change summary). PROJECT.md already specifies "not git-like" — simple linear version chain per document. |
| Bulk document operations | Upload/delete/re-parse hundreds of docs at once | Low | Already partially implemented (bulk parse/cancel). Extend to bulk permission changes, bulk tagging. |
| Document metadata and tagging | Filter and organize documents by custom attributes | Med | Feeds into ABAC (tags become filterable attributes). RAGFlow supports auto-generation of metadata during parsing — replicate this. |
| Dataset (knowledge base) organization | Group documents into datasets with shared settings | Low | Already validated. Extend with project-level scoping. |

### Search and Retrieval Quality (Active — Must Ship)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Chunk visualization and intervention | Users must see how documents were chunked and fix bad chunks. RAGFlow's key differentiator that B-Knowledge inherits. | Med | Already partially built. Critical for trust — users who can't inspect chunks don't trust answers. |
| Answer quality feedback (thumbs up/down) | Minimum viable feedback loop. Without it, no signal on whether RAG is working. | Low | Store feedback linked to query + retrieved chunks + response. Use for future retrieval tuning. |
| Retrieval transparency (show sources) | Users must see which chunks were used and their relevance scores | Low | Already have citations. Ensure chunk-level source display with confidence scores. |

## Differentiators

Features that set B-Knowledge apart. Not expected by every user, but create competitive advantage in SDLC and healthcare domains.

### GraphRAG — Knowledge Graph Retrieval (Active — From RAGFlow)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Entity and relationship extraction | Build knowledge graphs from documents automatically. GraphRAG achieves 80% accuracy vs 50% for traditional RAG on complex multi-hop queries | High | RAGFlow already has this — migration target. Extract entities (people, systems, concepts) and relationships from chunks during indexing. |
| Community detection and summarization | Group related entities into hierarchical communities with auto-generated summaries. Enables "global sensemaking" queries. | High | Microsoft's GraphRAG pattern. Critical for queries like "what are the main themes across all our project specs?" |
| Multi-hop question answering | Answer questions requiring reasoning across multiple documents and relationships | High | "Which teams depend on Service X, and what's the impact if it goes down?" — requires traversing entity relationships. |
| Graph + vector hybrid retrieval | Combine structured graph traversal with semantic vector search | High | Use graph for relationship queries, vector for semantic similarity, fuse results. LazyGraphRAG (2025) reduced indexing cost to 0.1% of full GraphRAG. |

**Complexity note:** GraphRAG indexing costs 10-100x more than vector-only RAG. LazyGraphRAG mitigates this but adds architectural complexity. Budget for significant compute during ingestion.

### Deep Research — Multi-Hop Recursive Retrieval (Active — From RAGFlow)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Recursive query decomposition | Break complex questions into sub-questions, retrieve for each, synthesize | High | "Compare our authentication approaches across all three microservices" decomposes into 3+ sub-queries. |
| Iterative retrieval with reasoning | Retrieve, reason about gaps, retrieve more until answer is complete | High | HopRAG pattern: retrieve-reason-prune. Essential for research-style queries in both SDLC and healthcare. |
| Cross-dataset retrieval | Search across multiple knowledge bases in a single query | Med | SDLC: search across project specs + API docs + runbooks. Healthcare: search across clinical protocols + drug interactions + regulatory docs. Respect ABAC across datasets. |
| Research report generation | Generate structured reports from multi-hop retrieval with full citation chains | High | Outputs a document, not just a chat message. Valuable for healthcare literature reviews and SDLC impact analysis. |

### SDLC Domain Features

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Project-scoped knowledge bases | Isolate project documentation with team-level access. Map datasets to SDLC projects. | Med | Each project gets its own datasets. Team members see only their projects. Cross-project search for authorized users. |
| Code-aware document parsing | Parse code files (Python, TypeScript, Java, etc.) with syntax-aware chunking | Med | Chunk by function/class boundaries, not arbitrary character counts. Preserve import context. Extend existing parser infrastructure. |
| API documentation parser | Understand OpenAPI/Swagger specs, generate structured chunks per endpoint | Med | Parse endpoint, parameters, response schemas as structured chunks. Enable queries like "which endpoints accept user IDs?" |
| Changelog and release notes tracking | Track document changes as project evolves through SDLC phases | Med | Ties into document versioning. Surface "what changed since last sprint?" queries. |
| Technical decision records (ADR) parser | Understand ADR format (context, decision, consequences) and enable structured retrieval | Low | Template-aware parsing. Query "what decisions affect the auth module?" |

### Healthcare Domain Features

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Clinical document classification | Auto-classify documents as regulatory, clinical protocol, research, administrative | Med | Use document metadata + content analysis. Feeds into ABAC rules (clinical docs restricted to clinical staff). |
| Regulatory document tracking | Track document applicability dates, expiry, superseded-by relationships | Med | Healthcare regulations change frequently. Surface "which protocols are outdated?" Flag documents approaching regulatory deadlines. |
| PHI detection and redaction alerts | Detect Protected Health Information in uploaded documents, warn before indexing | High | Not full PII redaction (that's an anti-feature scope-wise), but alerting admins when PHI-containing docs are uploaded. Critical for HIPAA awareness. |
| Citation chain verification | Full traceability from answer back through reasoning chain to source documents | Med | HIPAA compliance requires demonstrating which source informed a clinical decision. Extends existing citation system with audit-grade traceability. |
| Medical terminology awareness | Understand medical abbreviations, drug names, ICD codes in queries and chunks | Med | Enhance retrieval quality for healthcare-specific terminology. Can leverage specialized embedding models or terminology mappings. |

### Observability and Evaluation

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| RAG quality metrics dashboard | Track retrieval precision, answer faithfulness, hallucination rate over time | Med | 60% of new RAG deployments include systematic evaluation from day one (2026). Already have Langfuse — extend with retrieval-specific metrics. |
| A/B testing for retrieval configs | Compare chunking strategies, embedding models, reranking approaches | Med | Run same queries against different configs, compare answer quality. Essential for tuning. |
| Query analytics | Most common queries, failed retrievals, low-confidence answers | Low | Surface patterns like "users keep asking about X but we have no docs for it." |

## Anti-Features

Features to explicitly NOT build. Each has a clear reason.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full PII/PHI redaction engine | Massive compliance liability. If redaction fails, legal exposure. Not a RAG platform's job. | Detect and alert. Let dedicated compliance tools (Presidio, AWS Macie) handle redaction before upload. Integrate, don't build. |
| Custom model training/fine-tuning | Out of scope per PROJECT.md. Maintaining training infrastructure is a separate product. | Support configurable external LLM providers. Let users bring fine-tuned models via OpenAI-compatible API. |
| Real-time collaborative editing | Not a document editor. Scope creep into Google Docs territory. | Accept document uploads. Version history covers "what changed." |
| Visual workflow builder (drag-and-drop agent canvas) | RAGFlow has this but it adds massive UI complexity. B-Knowledge targets knowledge retrieval, not agent orchestration. | Provide well-configured defaults for retrieval pipelines. Expose config via settings panels, not visual canvases. |
| Mobile app | Web-first per PROJECT.md. Mobile adds platform-specific maintenance burden. | Ensure responsive web design works on mobile browsers. |
| Agentic tool integration (MCP, function calling) | Scope creep. Turns RAG platform into an agent framework. | Focus on retrieval quality. If agent integration is needed later, expose as API for external agent frameworks to consume. |
| Per-query billing/metering | Adds accounting complexity. B-Knowledge is self-hosted, not SaaS. | Track usage metrics for observability, not billing. |
| Custom embedding model hosting | Operating ML inference infrastructure is a separate concern. | Support external embedding APIs (OpenAI, Cohere, local Ollama). Don't host models. |

## Feature Dependencies

```
Org-level tenant isolation
  --> RBAC (roles within an org)
    --> ABAC (attribute-based rules extending RBAC)
      --> Document-level permission inheritance
        --> Cross-dataset retrieval (must respect ABAC across datasets)

Document upload + parsing (validated)
  --> Document metadata and tagging
    --> Document version history (versions need metadata tracking)
    --> Clinical document classification (healthcare-specific metadata)
    --> Auto-metadata generation during parsing

Chunking + embedding (validated)
  --> Chunk visualization and intervention
  --> Entity and relationship extraction (GraphRAG)
    --> Community detection and summarization
    --> Multi-hop question answering
    --> Graph + vector hybrid retrieval

Hybrid search (validated)
  --> Answer quality feedback
  --> Query analytics
  --> Retrieval transparency
  --> RAG quality metrics dashboard
    --> A/B testing for retrieval configs

Document version history
  --> Changelog and release notes tracking (SDLC)
  --> Regulatory document tracking (Healthcare)

Entity extraction (GraphRAG)
  --> Deep Research (recursive multi-hop retrieval)
    --> Research report generation
    --> Cross-dataset retrieval
```

## MVP Recommendation

### Phase 1 Priority: Stabilize + Access Control Foundation

Prioritize (in order):
1. **Bug fixes and migration stabilization** — nothing else matters if core pipeline is unreliable
2. **Org-level tenant isolation** — foundational for multi-tenant; everything else layers on top
3. **RBAC** — baseline access control; unblocks real multi-user deployments
4. **Audit logging** — required for healthcare compliance; cheap to add early, expensive to retrofit
5. **Answer quality feedback** — low complexity, immediate value for measuring RAG effectiveness

### Phase 2 Priority: Domain Value

6. **ABAC** — extends RBAC with attribute-based rules for healthcare and SDLC
7. **Document version history** — high value for both domains; complex but well-understood
8. **Document metadata and tagging** — feeds ABAC and improves retrieval filtering
9. **Project-scoped knowledge bases** — SDLC domain differentiator

### Phase 3 Priority: Advanced Retrieval

10. **GraphRAG migration** — entity extraction, community detection, graph-hybrid retrieval
11. **Deep Research** — multi-hop recursive retrieval
12. **Cross-dataset retrieval** — search across knowledge bases with ABAC enforcement

### Defer

- **Code-aware parsing, API doc parser, ADR parser** — valuable but niche; can add incrementally after core is solid
- **Healthcare-specific features** (PHI detection, medical terminology, regulatory tracking) — add when healthcare tenant demand materializes
- **RAG quality metrics dashboard, A/B testing** — important but not blocking; Langfuse covers basic observability now
- **Research report generation** — high complexity, dependent on Deep Research being solid first

## Sources

### Access Control in RAG
- [Pinecone: RAG with Access Control](https://www.pinecone.io/learn/rag-access-control/) — HIGH confidence
- [Oso: Right Approach to Authorization in RAG](https://www.osohq.com/post/right-approach-to-authorization-in-rag) — MEDIUM confidence
- [Axiomatics: Secure Your RAG](https://axiomatics.com/blog/secure-your-rag-where-to-start) — MEDIUM confidence
- [Cerbos: Authorization for RAG with LangChain](https://www.cerbos.dev/blog/authorization-for-rag-applications-langchain-chromadb-cerbos) — MEDIUM confidence

### GraphRAG
- [Microsoft GraphRAG Paper (arXiv)](https://arxiv.org/abs/2404.16130) — HIGH confidence
- [GraphRAG Survey (ACM)](https://dl.acm.org/doi/10.1145/3777378) — HIGH confidence
- [ArticSledge: What is GraphRAG 2026](https://www.articsledge.com/post/graphrag-retrieval-augmented-generation) — MEDIUM confidence

### Document Versioning
- [VersionRAG Paper (arXiv)](https://arxiv.org/abs/2510.08109) — HIGH confidence
- [Towards AI: RAG Versioning in Practice](https://pub.towardsai.net/rag-in-practice-exploring-versioning-observability-and-evaluation-in-production-systems-85dc28e1d9a8) — MEDIUM confidence

### Deep Research / Multi-Hop
- [HopRAG Paper (arXiv)](https://arxiv.org/abs/2502.12442) — HIGH confidence
- [MultiHop-RAG Benchmark](https://arxiv.org/abs/2401.15391) — HIGH confidence

### Healthcare RAG
- [Arkenea: RAG in Healthcare 2025](https://arkenea.com/blog/rag-in-healthcare/) — MEDIUM confidence
- [SCIMUS: RAG Healthcare Guide](https://thescimus.com/blog/retrieval-augmented-generation-healthcare-guide/) — MEDIUM confidence
- [Springer: Survey on RAG for Healthcare](https://link.springer.com/article/10.1007/s00521-025-11666-9) — HIGH confidence

### Enterprise RAG Landscape
- [Firecrawl: Best Enterprise RAG Platforms 2025](https://www.firecrawl.dev/blog/best-enterprise-rag-platforms-2025) — MEDIUM confidence
- [NStarX: Next Frontier of RAG 2026-2030](https://nstarxinc.com/blog/the-next-frontier-of-rag-how-enterprise-knowledge-systems-will-evolve-2026-2030/) — MEDIUM confidence
- [RAGFlow GitHub](https://github.com/infiniflow/ragflow) — HIGH confidence

### RAG Evaluation and Observability
- [Maxim AI: RAG Evaluation Guide 2025](https://www.getmaxim.ai/articles/complete-guide-to-rag-evaluation-metrics-methods-and-best-practices-for-2025/) — MEDIUM confidence
- [Prem AI: RAG Evaluation Metrics 2026](https://blog.premai.io/rag-evaluation-metrics-frameworks-testing-2026/) — MEDIUM confidence
