# Requirements: B-Knowledge RAG Platform

**Defined:** 2026-03-18
**Core Value:** Users can ask questions in natural language and get accurate, cited answers from their organization's knowledge base — with strict access control ensuring each team only sees what they're authorized to access.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Migration Stabilization

- [x] **STAB-01**: Fix known bugs in dataset creation workflow (create, update, delete knowledge bases)
- [ ] **STAB-02**: Fix known bugs in document parsing pipeline (file upload, parser selection, parse execution)
- [ ] **STAB-03**: Fix known bugs in chunking pipeline (chunk generation, embedding, OpenSearch indexing)
- [x] **STAB-04**: Systematic testing to discover and fix undocumented bugs across the RAG pipeline
- [ ] **STAB-05**: Complete migration of remaining document type parsers from RAGFlow

### Access Control

- [ ] **ACCS-01**: Org-level tenant isolation — each organization's data fully isolated with zero data leakage
- [ ] **ACCS-02**: RBAC with admin, editor, and viewer roles within each org
- [ ] **ACCS-03**: ABAC — attribute-based access rules (e.g., "doctors see clinical docs", "project members see project specs")
- [ ] **ACCS-04**: Document-level permission inheritance from dataset/project with override capability
- [ ] **ACCS-05**: Audit logging — who accessed what document, when, and what answer was generated
- [ ] **ACCS-06**: Project-scoped access — project-level isolation within orgs for SDLC teams

### Document Management

- [ ] **DOCM-01**: Document version history — upload new version, keep all previous versions stored
- [ ] **DOCM-02**: Search across document versions — query current or historical versions
- [ ] **DOCM-03**: Version metadata — track author, timestamp, and change summary per version
- [ ] **DOCM-04**: Document metadata and tagging — custom attributes on documents for filtering and ABAC
- [ ] **DOCM-05**: Auto-metadata extraction during document parsing
- [ ] **DOCM-06**: Bulk metadata and tag operations across multiple documents

### Domain-Specific Parsers

- [ ] **PRSR-01**: Code-aware document parsing — chunk by function/class boundaries with import context preserved
- [ ] **PRSR-02**: API documentation parser — parse OpenAPI/Swagger specs into structured endpoint chunks
- [ ] **PRSR-03**: Technical decision record (ADR) parser — template-aware parsing of context/decision/consequences
- [ ] **PRSR-04**: Clinical document classification — auto-classify documents as regulatory, protocol, research, administrative

### Advanced Retrieval

- [ ] **RETR-01**: GraphRAG entity and relationship extraction — build knowledge graphs from documents during indexing
- [ ] **RETR-02**: GraphRAG community detection and summarization — group related entities with auto-generated summaries
- [ ] **RETR-03**: Graph + vector hybrid retrieval — combine structured graph traversal with semantic vector search
- [ ] **RETR-04**: Deep Research recursive query decomposition — break complex questions into sub-queries
- [ ] **RETR-05**: Deep Research iterative retrieval with reasoning — retrieve, reason about gaps, retrieve more
- [ ] **RETR-06**: Cross-dataset retrieval — search across multiple knowledge bases respecting ABAC rules
- [ ] **RETR-07**: Deep Research token budget and call limits — hard caps on LLM calls and tokens per research session

### Chat & Search Experience

- [ ] **CHAT-01**: Chat experience stabilization — fix bugs in streaming, citation display, and conversation management
- [ ] **CHAT-02**: Search experience stabilization — fix bugs in search results, filtering, and pagination
- [ ] **CHAT-03**: Answer quality feedback — thumbs up/down on AI-generated answers linked to query + chunks + response

### Observability

- [ ] **OBSV-01**: Query analytics — most common queries, failed retrievals, low-confidence answers
- [ ] **OBSV-02**: RAG quality metrics dashboard — track retrieval precision, answer faithfulness, hallucination rate
- [ ] **OBSV-03**: Answer feedback analytics — aggregate feedback signals for retrieval tuning insights

### Multi-Tenant Project Management

- [ ] **PROJ-01**: Project CRUD — create, update, delete projects within an org
- [ ] **PROJ-02**: Project-dataset binding — map datasets to SDLC projects with team-level access
- [ ] **PROJ-03**: Project member management — add/remove team members with project-scoped roles
- [ ] **PROJ-04**: Cross-project search for authorized users — search across multiple projects with access enforcement

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Healthcare-Specific

- **HLTH-01**: PHI detection and redaction alerts — detect Protected Health Information, warn before indexing
- **HLTH-02**: Medical terminology awareness — enhanced retrieval for medical abbreviations, drug names, ICD codes
- **HLTH-03**: Regulatory document tracking — track applicability dates, expiry, superseded-by relationships
- **HLTH-04**: Citation chain verification — audit-grade traceability from answer to source for HIPAA compliance

### Advanced Observability

- **AOBS-01**: A/B testing for retrieval configurations — compare chunking, embedding, and reranking approaches
- **AOBS-02**: Research report generation — structured reports from multi-hop retrieval with citation chains

### SDLC-Specific

- **SDLC-01**: Changelog and release notes tracking — surface "what changed since last sprint?"

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full PII/PHI redaction engine | Massive compliance liability; integrate with dedicated tools (Presidio, AWS Macie) instead |
| Custom model training/fine-tuning | Separate concern; support external LLM providers via OpenAI-compatible API |
| Real-time collaborative editing | Not a document editor; version history covers "what changed" |
| Visual workflow builder (agent canvas) | RAGFlow has this but adds massive UI complexity; use well-configured defaults instead |
| Mobile app | Web-first; ensure responsive design works on mobile browsers |
| Agentic tool integration (MCP, function calling) | Scope creep into agent framework territory; expose API for external agents |
| Per-query billing/metering | Self-hosted, not SaaS; track usage for observability, not billing |
| Custom embedding model hosting | Support external APIs (OpenAI, Cohere, Ollama); don't host models |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAB-01 | Phase 1 | Complete |
| STAB-02 | Phase 1 | Pending |
| STAB-03 | Phase 1 | Pending |
| STAB-04 | Phase 1 | Complete |
| STAB-05 | Phase 1 | Pending |
| CHAT-01 | Phase 1 | Pending |
| CHAT-02 | Phase 1 | Pending |
| CHAT-03 | Phase 1 | Pending |
| ACCS-01 | Phase 2 | Pending |
| ACCS-02 | Phase 2 | Pending |
| ACCS-03 | Phase 2 | Pending |
| ACCS-04 | Phase 2 | Pending |
| ACCS-05 | Phase 2 | Pending |
| ACCS-06 | Phase 2 | Pending |
| DOCM-01 | Phase 3 | Pending |
| DOCM-02 | Phase 3 | Pending |
| DOCM-03 | Phase 3 | Pending |
| DOCM-04 | Phase 3 | Pending |
| DOCM-05 | Phase 3 | Pending |
| DOCM-06 | Phase 3 | Pending |
| PRSR-01 | Phase 4 | Pending |
| PRSR-02 | Phase 4 | Pending |
| PRSR-03 | Phase 4 | Pending |
| PRSR-04 | Phase 4 | Pending |
| RETR-01 | Phase 5 | Pending |
| RETR-02 | Phase 5 | Pending |
| RETR-03 | Phase 5 | Pending |
| RETR-04 | Phase 5 | Pending |
| RETR-05 | Phase 5 | Pending |
| RETR-06 | Phase 5 | Pending |
| RETR-07 | Phase 5 | Pending |
| OBSV-01 | Phase 6 | Pending |
| OBSV-02 | Phase 6 | Pending |
| OBSV-03 | Phase 6 | Pending |
| PROJ-01 | Phase 6 | Pending |
| PROJ-02 | Phase 6 | Pending |
| PROJ-03 | Phase 6 | Pending |
| PROJ-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after roadmap creation — all 38 requirements mapped*
