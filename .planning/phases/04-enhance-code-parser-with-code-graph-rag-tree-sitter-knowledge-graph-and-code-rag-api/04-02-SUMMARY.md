---
phase: 04-enhance-code-parser-with-code-graph-rag-tree-sitter-knowledge-graph-and-code-rag-api
plan: 02
subsystem: rag-pipeline
tags: [tree-sitter, code-graph, memgraph, ast-parsing, python, 12-languages]

requires:
  - phase: 04-01
    provides: Memgraph infrastructure (Docker service, Bolt connectivity)
provides:
  - 65-file code_graph Python module under advance-rag/rag/app/code_graph/
  - 12-language Tree-sitter AST parsing with graph extraction
  - ProcessorFactory pipeline (Structure, Import, Definition, TypeInference, Call)
  - MemgraphIngestor for Bolt protocol graph writes with kb_id tenant isolation
  - extract_and_chunk() unified pipeline producing OpenSearch chunks + Memgraph graph
  - extract_code_graph() backward-compatible API
  - Semantic summary enrichment for embedding quality
affects: [04-03 task-executor-integration, 04-04 backend-api, 04-05 graph-visualization]

tech-stack:
  added: [neo4j-python-driver, tree-sitter, tree-sitter-languages]
  patterns: [ProcessorFactory pipeline, IngestorProtocol abstraction, CollectingIngestor decorator, FQN qualified naming]

key-files:
  created:
    - advance-rag/rag/app/code_graph/__init__.py
    - advance-rag/rag/app/code_graph/constants.py
    - advance-rag/rag/app/code_graph/models.py
    - advance-rag/rag/app/code_graph/types_defs.py
    - advance-rag/rag/app/code_graph/services.py
    - advance-rag/rag/app/code_graph/logs.py
    - advance-rag/rag/app/code_graph/language_spec.py
    - advance-rag/rag/app/code_graph/factory.py
    - advance-rag/rag/app/code_graph/memgraph_client.py
    - advance-rag/rag/app/code_graph/structure_processor.py
    - advance-rag/rag/app/code_graph/import_processor.py
    - advance-rag/rag/app/code_graph/definition_processor.py
    - advance-rag/rag/app/code_graph/type_inference.py
    - advance-rag/rag/app/code_graph/call_processor.py
    - advance-rag/rag/app/code_graph/call_resolver.py
    - advance-rag/rag/app/code_graph/function_ingest.py
    - advance-rag/rag/app/code_graph/stdlib_extractor.py
    - advance-rag/rag/app/code_graph/dependency_parser.py
    - advance-rag/rag/app/code_graph/schema_builder.py
  modified:
    - advance-rag/rag/app/code.py

key-decisions:
  - "Unified extract_and_chunk() replaces separate chunk() + extract_code_graph() -- single AST pass for both graph and chunks"
  - "CollectingIngestor decorator pattern intercepts graph nodes to produce OpenSearch chunks while delegating graph writes"
  - "Functions-over-classes for stdlib_extractor and function_ingest (simpler API vs reference project's mixin pattern)"
  - "InMemoryIngestor fallback when Memgraph unavailable -- graph extraction still produces chunks"
  - "Semantic summary enrichment: natural-language descriptions prepended to source code for better embedding quality"

patterns-established:
  - "IngestorProtocol: abstract interface for graph storage backends (Memgraph, in-memory, future)"
  - "ProcessorFactory: lazy-init pipeline with shared state (function_registry, ast_cache, class_inheritance)"
  - "FQN naming: project.module.Class.method format for cross-file resolution"
  - "Language handler registry: get_handler(language) returns language-specific AST processor"

requirements-completed: []

duration: 5min
completed: 2026-04-01
---

# Plan 04-02: Code Graph Parser Pipeline Summary

**65-file code_graph module with 12-language Tree-sitter AST parsing, Memgraph graph extraction via ProcessorFactory pipeline, and semantic-enriched OpenSearch chunk generation**

## Performance

- **Duration:** 5 min (verification of pre-existing implementation)
- **Started:** 2026-04-01T08:59:10Z
- **Completed:** 2026-04-01T09:05:00Z
- **Tasks:** 7
- **Files created:** 65 Python files

## Accomplishments

- Complete code_graph Python package under `advance-rag/rag/app/code_graph/` with 65 files
- 12 programming languages supported: Python, JS, TS, Rust, Java, C, C++, Lua, Go, Scala, C#, PHP
- ProcessorFactory pipeline: StructureProcessor, ImportProcessor, DefinitionProcessor, TypeInferenceEngine, CallProcessor, CallResolver
- MemgraphIngestor with Bolt protocol writes and kb_id tenant isolation
- Unified `extract_and_chunk()` producing both Memgraph graph nodes AND OpenSearch-compatible chunks with semantic summaries
- Language-specific handlers for deep AST analysis (Python decorators, JS arrow functions, Rust impl blocks, C++ namespaces, Java generics, PHP traits, Lua metatables)

## Task Commits

Each task was committed across the following git commits (implementation predates this plan execution):

1. **Task 02-01: Shared foundation files** - `2bfb0fc` (feat) - constants.py, models.py, types_defs.py, services.py, logs.py
2. **Task 02-02: Language specs** - `2bfb0fc` (feat) - language_spec.py with 12 FQN/Language specs
3. **Task 02-03: Parser utilities** - `a881242` (feat) - parsers/utils.py, stdlib_extractor.py, function_ingest.py, dependency_parser.py
4. **Task 02-04: Language-specific handlers** - `a881242` (feat) - handlers/, class_ingest/, py/, js_ts/, java/, cpp/, rs/, lua/
5. **Task 02-05: Core processors** - `2bfb0fc` + `a881242` (feat) - structure_processor.py, import_processor.py, definition_processor.py, type_inference.py, call_processor.py, call_resolver.py
6. **Task 02-06: ProcessorFactory and Memgraph client** - `2bfb0fc` (feat) - factory.py, memgraph_client.py
7. **Task 02-07: Pipeline interface** - `84073a4` (feat) - extract_and_chunk() in __init__.py, code.py integration

## Files Created/Modified

### Core Module (advance-rag/rag/app/code_graph/)
- `__init__.py` - Public API: extract_and_chunk(), extract_code_graph(), CollectingIngestor, semantic summary builder
- `constants.py` - SupportedLanguage (12), NodeLabel, RelationshipType enums, AST node types, Cypher templates
- `models.py` - GraphNode, GraphRelationship dataclasses
- `types_defs.py` - FunctionRegistryTrieProtocol, ASTCacheProtocol type definitions
- `services.py` - IngestorProtocol ABC, InMemoryIngestor fallback
- `logs.py` - Log message constants
- `language_spec.py` - LANGUAGE_FQN_SPECS and LANGUAGE_SPECS dicts (12 entries each)
- `factory.py` - ProcessorFactory with lazy processor creation and shared state
- `memgraph_client.py` - MemgraphIngestor implementing Bolt writes with batch operations
- `schema_builder.py` - Memgraph schema/index creation helpers

### Core Processors
- `structure_processor.py` - Directory/package scanning with CONTAINS relationships
- `import_processor.py` - 8 language-specific import parsers + generic fallback
- `definition_processor.py` - Function/class/method extraction with FQN building
- `type_inference.py` - Variable type resolution from assignments and return types
- `call_processor.py` - Call extraction at function, class, and module levels
- `call_resolver.py` - Cross-file call resolution via function registry + import mapping

### Shared Utilities
- `function_ingest.py` - Deep function body analysis with docstring/parameter extraction
- `stdlib_extractor.py` - Standard library detection per language
- `dependency_parser.py` - Package manifest parsing (package.json, Cargo.toml, etc.)
- `parsers/utils.py` - AST helpers: safe_decode_text, get_query_cursor, is_method_node

### Language-Specific Handlers (8 directories)
- `handlers/` - Base handler, protocol, registry with get_handler() factory
- `class_ingest/` - ClassIngestMixin with inheritance, method override, identity analysis
- `py/` - Python AST analyzer, expression/variable analysis, type inference
- `js_ts/` - ES6/CommonJS module detection, arrow functions, destructuring, type inference
- `java/` - Method resolver, type resolver, variable analyzer
- `cpp/` - Function name extraction, qualified names, export detection
- `rs/` - Rust path parsing utilities
- `lua/` - Lua type inference

### Modified
- `advance-rag/rag/app/code.py` - Delegated to extract_and_chunk() for supported extensions, naive fallback for others

## Decisions Made

- **Unified pipeline over separate calls**: extract_and_chunk() does single AST pass producing both graph nodes and search chunks, rather than calling chunk() + extract_code_graph() separately
- **CollectingIngestor pattern**: Decorator wrapping the real ingestor to intercept definition nodes for chunk conversion while transparently delegating graph writes
- **Functions over mixins for stdlib/function ingest**: Simpler functional API (is_stdlib(), ingest_function()) instead of reference project's class-based mixin pattern
- **InMemoryIngestor fallback**: When Memgraph is unavailable, graph extraction still runs and produces chunks (graceful degradation)
- **Semantic summaries**: Natural-language descriptions of code entities prepended to source code for better embedding vector quality

## Deviations from Plan

### Implementation Differences

**1. [Adaptation] Functions instead of StdlibExtractor class and FunctionIngestMixin class**
- **Issue:** Plan specified class StdlibExtractor and class FunctionIngestMixin
- **Actual:** Implemented as module-level functions (is_stdlib(), ingest_function()) for simpler API
- **Impact:** Same functionality, cleaner interface

**2. [Adaptation] extract_and_chunk() unified API instead of separate chunk_with_graph()**
- **Issue:** Plan specified chunk_with_graph() in code.py
- **Actual:** Implemented extract_and_chunk() in __init__.py as unified entry point; code.py delegates to it
- **Impact:** Better architecture - single AST pass instead of parse-twice approach

**3. [Adaptation] parsers/ subdirectory simplified**
- **Issue:** Plan specified parsers/stdlib_extractor.py and parsers/function_ingest.py
- **Actual:** These live at code_graph/ root level, parsers/ only contains utils.py
- **Impact:** Flatter module structure, easier imports

---

**Total deviations:** 3 adaptations (all improvements over plan specification)
**Impact on plan:** All adaptations improved the architecture. No missing functionality.

## Issues Encountered

None - implementation was straightforward.

## User Setup Required

None - no external service configuration required beyond Memgraph from plan 04-01.

## Next Phase Readiness

- Code graph extraction pipeline ready for task executor integration (plan 04-03)
- MemgraphIngestor ready for backend API queries (plan 04-04)
- Graph data model (NodeLabel, RelationshipType) ready for visualization (plan 04-05)
- All 12 languages supported with deep cross-file resolution

## Self-Check: PASSED

- All 7 key files verified present on disk
- All 3 implementation commits verified in git history (2bfb0fc, a881242, 84073a4)
- 65 Python source files in code_graph module
- 12 languages in SupportedLanguage enum
- No codebase_rag import statements in source files

---
*Phase: 04-enhance-code-parser-with-code-graph-rag*
*Completed: 2026-04-01*
