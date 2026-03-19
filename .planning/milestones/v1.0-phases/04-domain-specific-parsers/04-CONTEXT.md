# Phase 4: Domain-Specific Parsers - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Add four domain-specific document parsers for SDLC and healthcare workflows. Each parser produces semantically meaningful chunks preserving the structure unique to its document type: code files chunked by function/class boundaries, OpenAPI specs chunked per endpoint, ADRs chunked by section, and clinical documents auto-classified by category. All parsers register in the existing FACTORY pattern and integrate with the Phase 3 metadata tagging system.

</domain>

<decisions>
## Implementation Decisions

### Code-Aware Parser (PRSR-01)
- **Language-agnostic via tree-sitter** — use tree-sitter for AST parsing across languages, not limited to specific languages
- **AST-based chunking with scope context** — chunk at function/class scope boundaries using tree-sitter AST. Each chunk gets: function signature + docstring + body. Parent class/module name stored as metadata (not duplicated in content). Imports stored once as file-level metadata, not repeated per chunk
- **Split large functions at logical sub-boundaries** — if a function exceeds chunk limit, split at inner blocks (if/else, loops, nested functions). Each sub-chunk gets parent function signature as context prefix
- **Full structured metadata extraction** — extract function_name, class_name, parameters, return_type, decorators/annotations into chunk metadata for search filtering
- **Comments and docstrings included inline** — stay in chunk content as-is for natural language search matching

### API Spec Parser (PRSR-02)
- **One chunk per endpoint** — each path+method (e.g., GET /users) becomes one chunk containing: path, method, summary, parameters, request body, responses, and referenced schemas inlined
- **Inline schema resolution** — resolve all $ref pointers and include full schema in each endpoint chunk. Self-contained, some duplication acceptable
- **Support both OpenAPI 3.x and Swagger 2.0** — convert Swagger 2.0 to 3.0 internally, then parse uniformly
- **Full endpoint metadata** — extract: path, HTTP method, operation_id, tags, summary, security requirements into chunk metadata

### ADR Parser (PRSR-03)
- **Support three template formats** — MADR, Nygard format, and Y-statements
- **One chunk per section** — each section (Context, Decision, Consequences) becomes its own chunk with section_type as metadata. Enables targeted queries
- **Rich metadata extraction** — extract: ADR status (accepted/deprecated/superseded), title, section_type, date, superseded_by (if applicable)

### Clinical Document Classification (PRSR-04)
- **LLM-based classification** — send document summary/first page to LLM with classification prompt. Uses existing chat_mdl pipeline
- **Four categories** — regulatory, protocol, research, administrative (as specified in PRSR-04)
- **Store as metadata tag** — classification stored in `parser_config.metadata_tags.clinical_classification`. Uses Phase 3 metadata tagging system, searchable via tag filters, usable in ABAC policies
- **Auto-classify when parser selected** — classification runs automatically during parsing when user selects clinical parser type. No extra toggle

### Claude's Discretion
- tree-sitter language grammar selection and installation strategy
- Swagger 2.0 → OpenAPI 3.0 conversion library choice
- ADR section heading detection regex/heuristics
- LLM prompt design for clinical classification
- Test fixture documents for each parser type
- Error handling when tree-sitter grammar is unavailable for a language

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Parser Infrastructure
- `advance-rag/rag/svr/task_executor.py` §FACTORY (lines 99-116) — Parser registration dict mapping parser_id to module. New parsers register here
- `advance-rag/rag/app/naive.py` — Reference parser implementation pattern. All existing parsers follow this structure
- `advance-rag/rag/flow/splitter/` — Chunking pipeline stages that parsers feed into
- `advance-rag/CLAUDE.md` — Python worker conventions, architecture, gotchas

### Metadata Integration (Phase 3)
- `be/src/modules/rag/services/rag.service.ts` §bulkUpdateMetadata — Metadata tag storage pattern (parser_config.metadata_tags)
- `advance-rag/rag/svr/task_executor.py` §auto_keywords, §auto_questions, §enable_metadata (lines 496-604) — Auto-extraction pipeline that clinical classifier can plug into

### Parser Settings UI
- `fe/src/features/datasets/components/ParserSettingsFields.tsx` — Parser config UI. New parser types need entries here

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Parser FACTORY pattern**: Register new parsers in `task_executor.py:99-116` dict with ParserType enum
- **15 existing parsers**: naive, paper, book, presentation, manual, laws, qa, table, resume, picture, one, audio, email, kg, tag — follow their module structure
- **Auto-extraction pipeline**: auto_keywords, auto_questions, enable_metadata already work for any parser via parser_config
- **Metadata tagging**: parser_config.metadata_tags from Phase 3 — clinical classifier stores results here
- **deepdoc/**: OCR and layout analysis capabilities for document preprocessing

### Established Patterns
- Each parser is a Python module in `advance-rag/rag/app/` with a chunking function
- Parser returns list of chunks with `content_with_weight` field
- Parser config passed via `task["parser_config"]` dict
- ParserType enum values used as parser_id strings

### Integration Points
- **FACTORY dict**: New parsers register here
- **ParserType enum**: Add new enum values
- **ParserSettingsFields.tsx**: FE parser config UI for new types
- **parser_ids on tenant**: Parser list shown in dataset creation

</code_context>

<specifics>
## Specific Ideas

- tree-sitter provides consistent AST parsing across languages — avoids building per-language parsers
- OpenAPI spec parser should handle both YAML and JSON input formats
- ADR parser should be forgiving with heading variations (e.g., "Decision" vs "Decision Outcome" vs "Decided")
- Clinical classification result goes through the existing metadata tagging system, making it immediately filterable and ABAC-compatible

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-domain-specific-parsers*
*Context gathered: 2026-03-19*
