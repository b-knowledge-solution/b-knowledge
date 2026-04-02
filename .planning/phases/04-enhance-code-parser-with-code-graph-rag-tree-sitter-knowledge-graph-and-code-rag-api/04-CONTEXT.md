# Phase 4: Enhance Code Parser with Code-Graph-RAG — Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** User request with reference project https://github.com/vitali87/code-graph-rag

<domain>
## Phase Boundary

Enhance the code parser to extract code structure relationships from Tree-sitter AST, store the code knowledge graph in **Memgraph**, expose a **Node.js backend API** for querying via Bolt protocol, support **AI-powered NL-to-Cypher translation**, port all parsers from the reference project with a pipeline interface, and provide a **graph visualization UI** with export capabilities.

**NOT in scope:** MCP server, CLI tools, shell command execution, real-time file watcher, code editing via graph targeting.

</domain>

<decisions>
## Implementation Decisions

### Graph Storage
- **Add Memgraph** to `docker/docker-compose-base.yml` (Cypher-native, ~50MB RAM)
- Code knowledge graph in Memgraph; text chunks in OpenSearch
- Graph schema: nodes (File, Module, Class, Function, Method, Interface, Enum, Trait, Struct) + relationships (CONTAINS, CALLS, IMPORTS, INHERITS, IMPLEMENTS, DEFINED_IN)

### Graph Extraction
- **Automatic** for every code file during parsing (no opt-in toggle)
- **Deep cross-file analysis** — resolve imports for cross-file call relationships
- **Merged** per KB into one interconnected knowledge graph

### Parser Enhancement
- Port **all parsers** from code-graph-rag reference: ProcessorFactory, StructureProcessor, ImportProcessor, DefinitionProcessor, TypeInferenceEngine, CallProcessor, CallResolver
- **12 languages**: Python, JS, TS, Rust, Java, C, C++, Lua, Go, Scala, C#, PHP
- Use LanguageSpec/FQNSpec pattern from reference for language-agnostic design
- **Pipeline interface** in `code.py` — `chunk_with_graph()` runs full extraction pipeline
- Nested function/class hierarchy support with qualified names

### Query API Architecture
- **Node.js backend** queries Memgraph directly via Bolt (`neo4j-driver` npm)
- New Express module `be/src/modules/code-graph/`
- AI-powered NL-to-Cypher using tenant's configured LLM providers
- Code snippet retrieval for found functions/methods
- Reference-guided optimization: analyze code against uploaded standards docs

### Graph Visualization UI
- **Location**: Button in project code category opens a **separate full page** (`/code-graph/:kbId`)
- **Library**: Claude's discretion (React Flow, D3, Cytoscape.js, etc.)
- **Export**: Both PNG/SVG image + JSON graph data
- Interactive: pan, zoom, click nodes for details

### Claude's Discretion
- Graph visualization library choice
- Internal parser module organization
- Caching strategy for Memgraph queries
- Error handling for partial extraction failures
- Cypher prompt engineering details
- Test fixtures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reference Project (code-graph-rag)
- https://github.com/vitali87/code-graph-rag — Full reference architecture
- `codebase_rag/language_spec.py` — LanguageSpec/FQNSpec for 12 languages
- `codebase_rag/parsers/factory.py` — ProcessorFactory wiring 5 processors
- `codebase_rag/parsers/structure_processor.py` — Directory/package scanning
- `codebase_rag/parsers/call_processor.py` — Call resolution with type inference
- `codebase_rag/parsers/import_processor.py` — Import resolution
- `codebase_rag/parsers/definition_processor.py` — Function/class definitions
- `codebase_rag/parsers/type_inference.py` — Type inference engine
- `codebase_rag/parsers/call_resolver.py` — Cross-file call resolution
- `codebase_rag/graph_loader.py` — GraphNode/GraphRelationship models
- `codebase_rag/cypher_queries.py` — Pre-built Cypher queries

### Existing Code
- `advance-rag/rag/app/code.py` — Current Tree-sitter parser (extend with pipeline interface)
- `advance-rag/rag/svr/task_executor.py` — Integration point (line 430)
- `docker/docker-compose-base.yml` — Add Memgraph service
- `be/src/modules/` — Express module patterns

### Frontend
- `fe/src/features/` — Feature module pattern for new code-graph feature
- Phase 3 project/category UI — button placement for code-graph link

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `rag/app/code.py`: EXTENSION_MAP, tree-sitter parsing, AST traversal — extend for pipeline
- `rag/graphrag/`: Pattern reference for graph operations
- `neo4j-driver` npm: Works with Memgraph Bolt protocol

### Established Patterns
- Task executor pipeline: parse → chunk → embed → index
- BE module: routes → controller → service → model
- FE feature: pages, components, api, queries
- Docker base: infra services with health checks

### Integration Points
- `task_executor.py` line 430: add graph extraction
- `docker-compose-base.yml`: add Memgraph
- Project code category: add "Code Graph" button

</code_context>

<specifics>
## Specific Ideas

- Reference parser pipeline: StructureProcessor → ImportProcessor → DefinitionProcessor → TypeInferenceEngine → CallProcessor
- ProcessorFactory lazily creates processors with shared state (function_registry, ast_cache, class_inheritance)
- FQN (Fully Qualified Names): `project.module.ClassName.method_name`
- Cypher prompt: include graph schema (node labels + rel types + properties) as context
- Visualization: interactive graph with node click → show source code snippet

</specifics>

<deferred>
## Deferred Ideas

- Real-time file watcher for automatic graph updates — future phase
- Code editing via graph targeting (surgical replacement) — future phase
- MCP server integration — not applicable
- Dependency analysis from package manifests — future phase

</deferred>

---

*Phase: 04-enhance-code-parser-with-code-graph-rag*
*Context gathered: 2026-03-24*
