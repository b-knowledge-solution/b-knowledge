# Phase 4: Enhance Code Parser with Code-Graph-RAG — Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** User request with reference project https://github.com/vitali87/code-graph-rag

<domain>
## Phase Boundary

Enhance the code parser to extract code structure relationships (calls, imports, inheritance, containment) from Tree-sitter AST, store the code knowledge graph in **Memgraph** (Cypher-native graph DB), expose a **Node.js backend API** for querying the graph via Bolt protocol, and support **AI-powered NL-to-Cypher translation** for natural language codebase queries.

**NOT in scope:** MCP server, CLI tools, shell command execution, file system watching — these are code-graph-rag features not needed in b-knowledge.

</domain>

<decisions>
## Implementation Decisions

### Graph Storage
- **Add Memgraph** to `docker/docker-compose-base.yml` as new infrastructure service
- Memgraph provides native Cypher support required for AI NL-to-Cypher translation
- Code knowledge graph stored in Memgraph; regular text chunks still in OpenSearch
- Graph schema: nodes (File, Module, Class, Function, Method, Interface, Enum, Trait, Struct) + relationships (CONTAINS, CALLS, IMPORTS, INHERITS, IMPLEMENTS, DEFINED_IN)

### Graph Extraction Trigger
- **Automatic** — code knowledge graph built for every code file during parsing (no opt-in toggle)
- Runs after standard chunk extraction in the task executor pipeline

### Relationship Depth
- **Deep cross-file analysis** — resolve imports to trace cross-file call relationships
- When multiple code files are in the same KB, their graphs are **merged** into one interconnected knowledge graph enabling cross-file call tracking

### Query API Architecture
- **Node.js backend** directly queries Memgraph via Bolt protocol using `neo4j-driver` npm package (no Python proxy)
- New Express module in `be/src/modules/code-graph/`
- Endpoints: query code structure, get callers/callees, class hierarchy, code snippets

### AI-Powered Cypher Generation
- LLM translates natural language → Cypher queries
- Supports configured LLM providers (OpenAI, Gemini, Ollama — whatever tenant has configured)
- Uses graph schema as context in the prompt

### Code Snippet Retrieval
- When a function/method is found in the graph, retrieve the actual source code snippet
- Source code stored as node properties in Memgraph OR fetched from OpenSearch chunks

### Reference-Guided Optimization
- System analyzes code against user-uploaded coding standards/architecture docs from the same KB
- Generates optimization/refactoring suggestions based on reference documents

### Parser Enhancement
- Match code-graph-rag's parser architecture for **all 12 languages**: Python, JS, TS, Rust, Java, C, C++, Lua, Go, Scala, C#, PHP
- Use LanguageSpec/FQNSpec pattern from reference project
- Support nested function/class hierarchies with qualified names
- Language-agnostic unified graph schema across all languages

### Claude's Discretion
- Internal function naming and module organization within parsers
- Caching strategy for Memgraph queries
- Error handling for partial graph extraction failures
- Cypher prompt engineering details
- Test fixture selection

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reference Project (code-graph-rag)
- https://github.com/vitali87/code-graph-rag — Full reference architecture
- `codebase_rag/language_spec.py` — LanguageSpec/FQNSpec pattern for 12 languages
- `codebase_rag/parsers/` — Parser modules: call_processor, call_resolver, definition_processor, import_processor, structure_processor, type_inference, factory
- `codebase_rag/graph_loader.py` — GraphNode/GraphRelationship models, graph loading
- `codebase_rag/cypher_queries.py` — Pre-built Cypher queries for common patterns

### Existing Code Parser
- `advance-rag/rag/app/code.py` — Current Tree-sitter code parser with AST chunking

### GraphRAG Infrastructure (for pattern reference)
- `advance-rag/rag/graphrag/utils.py` — Graph utilities, NetworkX patterns
- `advance-rag/rag/graphrag/search.py` — KGSearch retrieval patterns

### Docker
- `docker/docker-compose-base.yml` — Infrastructure services (add Memgraph here)

### Backend
- `be/src/modules/` — Express module patterns for new code-graph module

### Tests
- `advance-rag/tests/test_code_parser.py` — Existing code parser tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `rag/app/code.py`: EXTENSION_MAP (20+ languages), FUNCTION_NODE_TYPES, CLASS_NODE_TYPES, IMPORT_NODE_TYPES, tree-sitter parsing — extend for graph extraction
- `rag/graphrag/utils.py`: Graph merge patterns, chunk conversion — pattern reference
- `rag/svr/task_executor.py`: FACTORY dict (line 98-120) maps parser_id → module, `build_chunks()` calls `chunker.chunk()` (line 430) — integration point
- `neo4j-driver` npm package works with Memgraph's Bolt protocol — no special Memgraph client needed

### Established Patterns
- Task executor pipeline: parse → chunk → embed → index (extend with graph extraction step)
- Backend module pattern: routes, controller, service, model (follow for code-graph module)
- Docker base services: PostgreSQL, Valkey, OpenSearch, RustFS (add Memgraph alongside)

### Integration Points
- `advance-rag/rag/svr/task_executor.py` line 430: where `chunker.chunk()` is called — add graph extraction after
- `docker/docker-compose-base.yml`: add Memgraph service
- `be/src/modules/`: new code-graph Express module
- `be/.env` / `docker/.env`: Memgraph connection config

</code_context>

<specifics>
## Specific Ideas

- Node types from reference: Repository, Directory, File, Module, Class, Function, Method, Interface, Enum, Trait, Struct, ExternalDependency
- Relationship types from reference: CONTAINS, CALLS, IMPORTS, INHERITS, IMPLEMENTS, DEFINED_IN
- Language support (12): Python, JS, TS, Rust, Java, C, C++, Lua, Go, Scala, C#, PHP
- Use FQNSpec pattern: scope_node_types, function_node_types, get_name, file_to_module_parts per language
- Use LanguageSpec pattern: file_extensions, function_node_types, class_node_types, module_node_types, call_node_types, import_node_types, import_from_node_types, package_indicators, function_query, class_query, call_query
- Qualified names: `module.ClassName.method_name`
- Cypher query prompt should include graph schema (node labels + relationship types + property keys)

</specifics>

<deferred>
## Deferred Ideas

- Graph visualization/export UI — future phase
- Real-time file watcher for automatic graph updates — future phase
- MCP server integration — not applicable to b-knowledge
- Code editing via graph targeting — future phase
- Dependency analysis from package manifests (pyproject.toml, package.json) — future phase

</deferred>

---

*Phase: 04-enhance-code-parser-with-code-graph-rag*
*Context gathered: 2026-03-24*
