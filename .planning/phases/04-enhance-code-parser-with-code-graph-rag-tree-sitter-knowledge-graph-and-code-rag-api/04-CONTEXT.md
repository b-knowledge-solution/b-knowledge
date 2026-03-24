# Phase 4: Enhance Code Parser with Code-Graph-RAG — Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** User request with reference project https://github.com/vitali87/code-graph-rag

<domain>
## Phase Boundary

Enhance the existing code parser (`rag/app/code.py`) to extract code structure relationships (calls, imports, inheritance, containment) as a knowledge graph, store it using the existing GraphRAG infrastructure (NetworkX + OpenSearch), and expose a separate FastAPI endpoint for Code-RAG natural language queries over codebase structure.

**NOT in scope:** Memgraph (reference project uses it, but b-knowledge uses OpenSearch — we reuse existing infra). MCP server, CLI tools, file editing, code optimization, shell command execution — these are code-graph-rag features we don't need.

</domain>

<decisions>
## Implementation Decisions

### Graph Storage
- Reuse existing NetworkX + OpenSearch approach from `rag/graphrag/` — no new graph database (Memgraph) needed
- Code knowledge graph stored as entities (File, Module, Class, Function/Method) and relationships (CALLS, IMPORTS, INHERITS, CONTAINS, DEFINED_IN) in OpenSearch via the existing `graph_node_to_chunk` / `graph_edge_to_chunk` pattern

### Parser Enhancement
- Enhance `rag/app/code.py` to extract a NetworkX graph alongside chunks
- New function `extract_code_graph()` that builds a NetworkX graph from Tree-sitter AST
- Relationships to extract: CONTAINS (file→class, class→method), CALLS (function→function), IMPORTS (file→module), INHERITS (class→class)
- The existing `chunk()` function continues to produce standard chunks for vector search
- A new `chunk_with_graph()` function wraps `chunk()` + `extract_code_graph()` to return both

### Code-RAG Query API
- New FastAPI endpoint at `/api/v1/code-rag/query` for natural language queries about code structure
- Separate from the existing GraphRAG retrieval — specialized for code-specific queries
- Uses existing LLM/embedding infrastructure for query rewriting and embedding

### Claude's Discretion
- Internal function naming and organization
- Error handling strategy for partial graph extraction failures
- Caching strategy for graph operations
- Test fixture selection and coverage details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Code Parser
- `advance-rag/rag/app/code.py` — Current Tree-sitter code parser with AST chunking

### GraphRAG Infrastructure
- `advance-rag/rag/graphrag/utils.py` — Graph utilities: merge, serialize, node/edge→chunk conversion
- `advance-rag/rag/graphrag/search.py` — KGSearch retrieval: entity, relation, N-hop search
- `advance-rag/rag/graphrag/general/` — Full graph extraction pipeline
- `advance-rag/rag/graphrag/entity_resolution.py` — Entity deduplication

### API & Config
- `advance-rag/api/` — FastAPI API layer
- `advance-rag/config.py` — Environment-driven configuration

### Reference Project
- https://github.com/vitali87/code-graph-rag — Graph schema, language specs, parser patterns

### Tests
- `advance-rag/tests/test_code_parser.py` — Existing code parser tests

</canonical_refs>

<specifics>
## Specific Ideas

- Node types from reference: Repository, Directory, File, Module, Class, Function, Method, Interface, Enum, Trait, Struct
- Relationship types from reference: CONTAINS, CALLS, IMPORTS, INHERITS, IMPLEMENTS, DEFINED_IN
- Language-specific AST node mappings already exist in `code.py` FUNCTION_NODE_TYPES, CLASS_NODE_TYPES, IMPORT_NODE_TYPES
- Use qualified names (e.g., `module.ClassName.method_name`) for graph node identifiers

</specifics>

<deferred>
## Deferred Ideas

- Dependency analysis (pyproject.toml/package.json parsing) — future phase
- Real-time graph updates (file watcher) — future phase
- Graph visualization/export — future phase
- Code optimization/editing features — not applicable to b-knowledge
- MCP server integration — not applicable to b-knowledge

</deferred>

---

*Phase: 04-enhance-code-parser-with-code-graph-rag*
*Context gathered: 2026-03-24*
