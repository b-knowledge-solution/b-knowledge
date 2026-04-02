# 2026-03-25 Documentation Coverage Audit

## Goal

Verify that the active docs tree covers every active source area at a module/feature level after removing obsolete docs.

## Coverage Rule

A source area is considered covered when it has either:

- a dedicated SRS/basic-design/detail-design page, or
- explicit coverage inside a broader current page that documents that module's behavior and interfaces

This is module-level coverage, not line-by-line code commentary.

## Coverage Summary

| Source Area | Coverage Status | Primary Documentation |
|-------------|-----------------|-----------------------|
| Backend core modules | Covered | SRS + basic-design + detail-design pages across auth, chat, search, rag, projects, memory, agents, sync, admin, audit, broadcast, glossary, feedback, preview, system tools |
| Frontend application features | Covered | Feature-specific pages plus new supporting docs for uncovered utility features |
| Advance-RAG pipeline | Covered | RAG pipeline overview, step docs, parser docs, GraphRAG docs, dataset docs |
| Converter worker | Covered | Converter pipeline + converter detail + citation/preview support docs |
| External API + API keys | Covered | External API reference/openapi + `api-keys-detail` |
| Code graph feature | Covered | `code-graph-detail` plus existing graph/code parser docs |
| Tokenizer utility | Covered | `tokenizer-detail` |
| Landing/public marketing shell | Covered | `landing-page-detail` |

## Gaps Closed In This Pass

### Gap Register

| Gap ID | Uncovered Source Area Before Audit | Gap Type | Status |
|--------|------------------------------------|----------|--------|
| GAP-01 | `be/src/modules/external/*`, `fe/src/features/api-keys/*` | No dedicated API key management doc | Closed |
| GAP-02 | `be/src/modules/code-graph/*`, `fe/src/features/code-graph/*` | No dedicated code graph feature doc | Closed |
| GAP-03 | `fe/src/features/ai/*` | No dedicated tokenizer utility doc | Closed |
| GAP-04 | `fe/src/features/landing/*` | No dedicated landing/public shell doc | Closed |
| GAP-05 | `fe/src/features/chat-widget/*` | No dedicated chat widget client doc | Closed |
| GAP-06 | `fe/src/features/search-widget/*` | No dedicated search widget client doc | Closed |
| GAP-07 | `fe/src/features/agent-widget/*` | No dedicated agent widget client doc | Closed |

### Closed Gaps

| Added Page | Gap Closed | Source Area Covered | Coverage Added |
|-----------|------------|---------------------|----------------|
| `/detail-design/supporting/api-keys-detail` | GAP-01 | `be/src/modules/external/*`, `fe/src/features/api-keys/*` | Session-authenticated key CRUD, external API key scopes, frontend management dialogs |
| `/detail-design/supporting/code-graph-detail` | GAP-02 | `be/src/modules/code-graph/*`, `fe/src/features/code-graph/*` | Memgraph-backed graph API, visualization page, symbol inspection workflows |
| `/detail-design/supporting/tokenizer-detail` | GAP-03 | `fe/src/features/ai/*` | Browser-only tokenizer utility, `js-tiktoken` model mapping, UI behavior |
| `/detail-design/supporting/landing-page-detail` | GAP-04 | `fe/src/features/landing/*` | Public marketing shell, section composition, unauthenticated route behavior |
| `/detail-design/supporting/chat-widget-detail` | GAP-05 | `fe/src/features/chat-widget/*` | Dual-mode chat widget client, session/embed modes, streaming UI |
| `/detail-design/supporting/search-widget-detail` | GAP-06 | `fe/src/features/search-widget/*` | Dual-mode search widget client, metadata + ask flow |
| `/detail-design/supporting/agent-widget-detail` | GAP-07 | `fe/src/features/agent-widget/*` | Public agent launcher and SSE run client |

### Closure Detail

#### GAP-01: API Keys

Before this pass, the docs covered the external evaluation API, but they did not separately document the API key lifecycle used to access that API. That left the `external` backend module and the `api-keys` frontend feature only implicitly covered.

Closed by:

- `/detail-design/supporting/api-keys-detail`

Now documented:

- `/api/external/api-keys` CRUD endpoints
- `/api/v1/external/*` scope-based usage model
- frontend dialogs and one-time plaintext key reveal flow
- separation between API keys and embed tokens

#### GAP-02: Code Graph

Before this pass, GraphRAG and parser documentation existed, but the dedicated code graph feature itself had no standalone detail page. That left the code graph backend API and frontend visualization feature under-documented.

Closed by:

- `/detail-design/supporting/code-graph-detail`

Now documented:

- `/api/code-graph/:kbId/*` route surface
- graph stats, graph data, schema, callers/callees, snippet, hierarchy, dependency, NL query, and Cypher endpoints
- frontend page structure and force-graph workflow

#### GAP-03: Tokenizer Utility

Before this pass, the tokenizer playground existed only in source and route wiring. It had no dedicated documentation page.

Closed by:

- `/detail-design/supporting/tokenizer-detail`

Now documented:

- supported model list
- `js-tiktoken` browser-only implementation
- input/output/copy/clear behavior
- tokenizer hook state flow

#### GAP-04: Landing Page

Before this pass, the public landing shell was present in the frontend source but had no dedicated documentation. That left the public marketing route outside the design docs.

Closed by:

- `/detail-design/supporting/landing-page-detail`

Now documented:

- landing page composition
- section breakdown
- public/unauthenticated behavior
- relation to the authenticated product shell

#### GAP-05: Chat Widget Client

Before this pass, chat embed APIs were documented, but the standalone `chat-widget` frontend client was only indirectly covered.

Closed by:

- `/detail-design/supporting/chat-widget-detail`

Now documented:

- internal vs external auth modes
- widget shell responsibilities
- session bootstrap and streaming behavior
- widget-specific frontend file structure

#### GAP-06: Search Widget Client

Before this pass, search embed/share APIs were documented, but the dedicated `search-widget` frontend client lacked its own page.

Closed by:

- `/detail-design/supporting/search-widget-detail`

Now documented:

- widget metadata loading
- query submission and SSE answer flow
- widget-specific frontend structure

#### GAP-07: Agent Widget Client

Before this pass, agent embed endpoints existed in docs, but the standalone `agent-widget` frontend client was not described separately.

Closed by:

- `/detail-design/supporting/agent-widget-detail`

Now documented:

- public config loading
- run submission and streaming behavior
- launcher-oriented frontend structure

## Deleted Obsolete Documentation

- Removed `docs/legacy/`
- Removed `docs/ragflow/`

These pages were obsolete and no longer represented the current implementation.

## Remaining Limitation

The docs now cover the active source tree at a module/feature level, but the docs build is still blocked locally by an `esbuild` host/binary mismatch. Content coverage is present; toolchain verification is still pending environment repair.
