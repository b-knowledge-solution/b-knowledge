# Phase 4: Code-Graph-RAG — Research

## Research Summary

Investigated the reference project [code-graph-rag](https://github.com/vitali87/code-graph-rag) and the existing b-knowledge advance-rag architecture to determine the best integration approach.

## Reference Project Architecture

The `code-graph-rag` project uses:
- **Tree-sitter** for multi-language AST parsing (Python, JS/TS, Java, Go, Rust, C/C++, C#, Ruby, Scala, Lua, PHP)
- **Memgraph** (Cypher graph DB) for knowledge graph storage
- **Graph Schema**: Nodes (Repository, Directory, File, Module, Class, Function, Method, Interface, Enum, Trait, Struct, ExternalDependency) and Relationships (CONTAINS, CALLS, IMPORTS, INHERITS, IMPLEMENTS, DEFINED_IN)
- **NL Query**: LLM converts natural language → Cypher query → graph traversal → code snippets

### Key Design Patterns
1. **language_spec.py**: Registry mapping language → (node_types, function_types, class_types, call_expression_types)
2. **graph_loader.py**: Ingests AST into graph with qualified names (e.g., `module.Class.method`)
3. **graph_updater.py**: Incremental graph updates by re-parsing changed files
4. **cypher_queries.py**: Pre-built Cypher queries for common patterns (find callers, find dependencies, etc.)

## B-Knowledge Existing Architecture

### Code Parser (`rag/app/code.py`)
- Already uses Tree-sitter via `tree-sitter-language-pack`
- Supports 20+ languages with `EXTENSION_MAP`, `FUNCTION_NODE_TYPES`, `CLASS_NODE_TYPES`, `IMPORT_NODE_TYPES`
- Extracts function/class boundaries but does NOT extract relationships (calls, imports, inheritance)
- Produces standard chunks with metadata: `function_name`, `class_name`, `parameters`, `return_type`, `decorators`

### GraphRAG (`rag/graphrag/`)
- Uses **NetworkX** graphs stored in **OpenSearch** (not Memgraph)
- `utils.py`: `graph_node_to_chunk()`, `graph_edge_to_chunk()` — convert graph elements to indexable chunks
- `search.py`: `KGSearch` class — hybrid retrieval with entity/relation/N-hop/community search
- Entities stored as OpenSearch documents with `knowledge_graph_kwd: "entity"` and dimensions
- Relations stored as OpenSearch documents with `from_entity_kwd`, `to_entity_kwd`, and embeddings

### Key Insight
We do NOT need a new graph database. The existing GraphRAG infrastructure in b-knowledge stores NetworkX graphs in OpenSearch and provides full entity/relation retrieval. We can:
1. Build a code-specific NetworkX graph from Tree-sitter AST
2. Store it using the existing `set_graph()` / `graph_node_to_chunk()` / `graph_edge_to_chunk()` functions
3. Query it using the existing `KGSearch` retrieval or a code-specific variant

## Implementation Strategy

### Plan 1: Code Graph Extraction Module
Create `rag/app/code_graph.py` — extracts relationships from AST:
- **CONTAINS**: File→Class, Class→Method, File→Function
- **CALLS**: Function→Function (via call_expression nodes in AST)
- **IMPORTS**: File→Module (from import statements)
- **INHERITS**: Class→Class (from superclass lists)

Uses existing `_extract_scope_nodes()` from `code.py` for AST traversal, adds relationship extraction.

### Plan 2: Code-RAG Query API
Add FastAPI endpoint for code-specific queries.
New module `rag/app/code_rag_api.py` with specialized code graph search.

### Plan 3: Integration + Tests
Wire the code graph into the task executor pipeline. Add tests.

## Validation Architecture

### Testable Claims
1. Code graph extraction produces correct nodes and edges for Python/TS/Java
2. Graph can be stored and retrieved via existing OpenSearch infrastructure
3. Code-RAG API returns relevant code structure information for NL queries
4. Existing code parser tests continue to pass (no regression)

---

*Research completed: 2026-03-24*
