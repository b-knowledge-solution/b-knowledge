# Phase 4: Enhance Code Parser with Code-Graph-RAG — Research

**Researched:** 2026-03-24
**Status:** Complete (forced re-research)

## Executive Summary

This phase integrates a sophisticated code knowledge graph system into b-knowledge. The reference project (code-graph-rag) provides a mature, battle-tested parser pipeline with 12-language support. The integration requires: adding Memgraph to infrastructure, porting the parser pipeline into `advance-rag`, adding a Node.js API for graph queries, and building a visualization UI.

---

## 1. Memgraph Infrastructure

### Docker Setup
```yaml
memgraph:
  image: memgraph/memgraph:latest
  ports:
    - "7687:7687"   # Bolt protocol
    - "7444:7444"   # Monitoring/web
  volumes:
    - memgraph_data:/var/lib/memgraph
  environment:
    - MEMGRAPH_BOLT_PORT=7687
  command: ["--bolt-port=7687", "--log-level=WARNING"]
```

### Connectivity
- **Python (advance-rag)**: `neo4j` Python driver (`pip install neo4j`) — connects via Bolt
- **Node.js (backend)**: `neo4j-driver` npm package — connects via Bolt
- Both use the same Bolt protocol, same Cypher dialect
- Memgraph is ~50MB RAM idle, scales with graph size

### Multi-tenant Isolation
- Use `kb_id` as graph partition label: `MATCH (n {kb_id: $kbId})` in all queries
- Alternative: Memgraph multi-tenancy via separate databases (enterprise feature)
- **Recommendation:** Property-based isolation using `kb_id` (works with community edition)

---

## 2. Reference Parser Architecture

### Pipeline Order (Critical)
```
StructureProcessor  →  ImportProcessor  →  DefinitionProcessor
                                         →  TypeInferenceEngine
                                                   →  CallProcessor
                                                        →  CallResolver
```

### ProcessorFactory
- Lazily creates all 5 processors with shared state
- Key shared state: `function_registry` (FunctionRegistryTrie), `ast_cache`, `class_inheritance`, `module_qn_to_file_path`
- Each processor reads/writes to these shared dicts

### DefinitionProcessor (most complex)
- Uses 3 mixins: `ClassIngestMixin`, `FunctionIngestMixin`, `JsTsIngestMixin`
- Builds module QN (qualified name): `project.path.to.file`
- Handles `__init__.py` → package-level QN, `mod.rs` → crate-level QN
- Registers all functions/methods in the `function_registry` trie

### ImportProcessor
- 8 language-specific parse methods: Python, JS/TS, Java, Rust, Go, C++, Lua, PHP
- Generic fallback for Scala, C#, C
- Uses `lru_cache(4096)` for local module checks
- `StdlibExtractor` identifies stdlib vs local imports
- Creates `IMPORTS` relationships in the graph

### CallProcessor + CallResolver
- Resolves function calls to their fully qualified target
- Cross-file resolution via import mapping + function registry trie
- Type inference for method calls on objects (e.g., `obj.method()` → resolve `obj` type → find `Type.method`)
- Class inheritance traversal for inherited method calls

### LanguageSpec / FQNSpec
- Each language has two specs:
  - `LanguageSpec`: file extensions, AST node types, Tree-sitter queries
  - `FQNSpec`: scope resolution, name extraction, file-to-module mapping
- 12 languages fully specified

### Graph Schema (Cypher)
**Node labels:** Project, Folder, Package, Module, Function, Method, Class, Interface, Enum, Trait, Struct, ExternalDependency
**Relationship types:** CONTAINS, CONTAINS_MODULE, CONTAINS_PACKAGE, DEFINES, CALLS, IMPORTS, INHERITS, IMPLEMENTS, DEFINED_IN
**Key properties:** `qualified_name`, `name`, `path`, `absolute_path`, `start_line`, `end_line`, `source_code`, `kb_id`

---

## 3. Integration with Existing Code Parser

### Current `rag/app/code.py`
- Already has Tree-sitter parsing with `EXTENSION_MAP` (20+ languages)
- `FUNCTION_NODE_TYPES`, `CLASS_NODE_TYPES`, `IMPORT_NODE_TYPES` — partial overlap with reference
- `chunk()` function produces text chunks — **extend, don't replace**

### Pipeline Interface Design
```python
def chunk_with_graph(filename, binary, **kwargs):
    """Extended chunk function that also extracts code knowledge graph.
    
    Returns:
        tuple: (chunks: list[dict], graph_data: dict)
    """
    # 1. Run existing chunk() for text chunks → OpenSearch
    chunks = chunk(filename, binary, **kwargs)
    
    # 2. Run graph extraction pipeline → Memgraph
    graph_data = extract_code_graph(filename, binary, kb_id=kwargs.get('kb_id'))
    
    return chunks, graph_data
```

### Task Executor Integration Point
- `task_executor.py` line 430: `chunker.chunk()` → replace with `chunker.chunk_with_graph()`
- After chunks are built, store graph in Memgraph via Bolt client
- Graph extraction runs in same pipeline, no separate queue needed

---

## 4. Node.js API Design

### neo4j-driver Usage
```typescript
import neo4j from 'neo4j-driver'

const driver = neo4j.driver('bolt://memgraph:7687')

async function queryGraph(cypher: string, params: Record<string, unknown>) {
  const session = driver.session()
  try {
    const result = await session.run(cypher, params)
    return result.records.map(r => r.toObject())
  } finally {
    await session.close()
  }
}
```

### API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/code-graph/query` | NL query → AI Cypher → results |
| GET | `/api/v1/code-graph/:kbId/stats` | Graph summary (node/rel counts) |
| GET | `/api/v1/code-graph/:kbId/callers/:name` | Who calls this function? |
| GET | `/api/v1/code-graph/:kbId/callees/:name` | What does this function call? |
| GET | `/api/v1/code-graph/:kbId/hierarchy/:name` | Class inheritance tree |
| GET | `/api/v1/code-graph/:kbId/snippet/:name` | Source code of function |

### AI Cypher Generation Prompt Pattern
```
Given this graph schema:
- Node labels: {labels}
- Relationship types: {rel_types}
- Properties: {properties}

Translate this question to a Cypher query:
"{user_question}"

Return ONLY the Cypher query.
```

---

## 5. Graph Visualization

### Library Options
| Library | Pros | Cons |
|---------|------|------|
| React Flow | Great UX, drag/zoom built-in, React-native | Less suited for force-directed |
| Cytoscape.js | Purpose-built for graphs, good perf at scale | Heavier, learning curve |
| D3 force-graph | Most flexible, lightweight | Most manual work |
| react-force-graph | D3-based, React wrapper, 2D/3D | Good balance |

**Recommendation:** `react-force-graph-2d` — lightest weight, D3-powered, native React, good for code dependency graphs. Falls back to Cytoscape.js if graph exceeds ~5000 nodes.

### Export
- **PNG/SVG**: Canvas `toDataURL()` or SVG serialization
- **JSON**: Raw Cypher `MATCH (n)-[r]->(m) RETURN n, r, m` → serialize

---

## 6. Adaptation Notes (b-knowledge specific)

### What to Port As-Is
- `constants.py`: SupportedLanguage enum, AST node types, Cypher queries
- `models.py`: GraphNode, GraphRelationship, FQNSpec
- `language_spec.py`: All 12 language specs
- `parsers/factory.py`: ProcessorFactory
- `parsers/structure_processor.py`: Directory scanning
- `parsers/call_processor.py` + `call_resolver.py`: Call resolution
- `parsers/definition_processor.py`: Definition extraction
- `parsers/type_inference.py`: Type inference
- `parsers/import_processor.py`: Import parsing
- Language-specific dirs: `py/`, `js_ts/`, `java/`, `cpp/`, `rs/`, `lua/`
- `parsers/handlers/`: Language handler abstraction
- `parsers/class_ingest/`: Class ingestion mixins

### What to Adapt
- `IngestorProtocol` → adapt to write to Memgraph instead of the reference's own graph store
- `StdlibExtractor` → simplify (skip subprocess-based introspection, use static lists)
- File path handling → b-knowledge files come from MinIO, not local filesystem (extract to temp dir or parse from binary)
- `function_ingest.py` → merge into definition_processor or keep as mixin

### What to Skip
- CLI tools (interactive setup, shell commands)
- MCP server
- File watcher
- Code editing/surgical replacement
- Session management

---

## Validation Architecture

### Unit Tests
- Graph extraction: Parse Python/TS/Java fixtures → verify nodes + relationships in graph
- Import resolution: Verify cross-file imports produce correct IMPORTS edges
- Call resolution: Verify direct and inherited method calls produce CALLS edges

### Integration Tests
- Full pipeline: Upload code file → verify chunks in OpenSearch + graph in Memgraph
- API: Query graph endpoints → verify correct Cypher results
- Multi-file: Upload 2+ related files → verify cross-file edges

### Performance
- Target: <5s graph extraction for 1000-line file
- Target: <500ms Cypher query response
- Memgraph memory: monitor with `SHOW STORAGE INFO`

---

## RESEARCH COMPLETE

All domains researched. Ready for detailed planning.
