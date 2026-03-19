---
phase: 04-domain-specific-parsers
plan: 01
subsystem: rag
tags: [tree-sitter, ast-parsing, code-chunking, python, typescript, java]

# Dependency graph
requires: []
provides:
  - "Code-aware parser (rag/app/code.py) with tree-sitter AST chunking"
  - "ParserType enum with CODE, OPENAPI, ADR, CLINICAL values"
  - "FACTORY registration for all four new parser types"
  - "Stub modules for openapi, adr, clinical parsers"
affects: [04-02, 04-03]

# Tech tracking
tech-stack:
  added: [tree-sitter 0.25.2, tree-sitter-language-pack 0.13.0, prance >=25.4.8.0]
  patterns: [AST-based code chunking, scope-boundary splitting, import metadata extraction]

key-files:
  created:
    - advance-rag/rag/app/code.py
    - advance-rag/rag/app/openapi.py
    - advance-rag/rag/app/adr.py
    - advance-rag/rag/app/clinical.py
    - advance-rag/tests/test_code_parser.py
    - advance-rag/tests/fixtures/sample_code.py
    - advance-rag/tests/fixtures/sample_code.ts
    - advance-rag/tests/fixtures/sample_code.java
  modified:
    - advance-rag/pyproject.toml
    - advance-rag/common/constants.py
    - advance-rag/rag/svr/task_executor.py

key-decisions:
  - "Mock rag_tokenizer in tests to avoid heavy NLP dependency chain"
  - "decorated_definition wrapping class treated as class scope (not function)"
  - "Recursive container-type traversal (block, class_body) for finding nested methods"

patterns-established:
  - "Code parser pattern: tree-sitter parse -> extract imports -> extract scope nodes -> split large -> build chunks"
  - "Stub parser pattern: NotImplementedError with plan reference for unimplemented parsers"

requirements-completed: [PRSR-01]

# Metrics
duration: 10min
completed: 2026-03-19
---

# Phase 04 Plan 01: Code-Aware Parser Summary

**Tree-sitter AST-based code parser supporting 20+ languages with function/class boundary chunking, import metadata, and large function splitting**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-19T05:32:47Z
- **Completed:** 2026-03-19T05:43:38Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Code parser chunks Python/TypeScript/Java files by function/class boundaries using tree-sitter AST
- Import statements stored as file-level metadata on first chunk (not duplicated)
- Large functions split at inner block boundaries (if/for/while/try) with parent signature prefix
- Unsupported file extensions fall back to naive line-based chunking
- All 12 unit tests pass covering Python, TypeScript, Java, and fallback scenarios
- ParserType enum and FACTORY dict updated with CODE, OPENAPI, ADR, CLINICAL

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, register parser types, create test fixtures and test scaffold** - `0c4ebf8` (test)
2. **Task 2: Implement code-aware parser with tree-sitter AST chunking** - `b569e12` (feat)

## Files Created/Modified
- `advance-rag/rag/app/code.py` - Code-aware parser with tree-sitter AST chunking for 20+ languages
- `advance-rag/rag/app/openapi.py` - Stub parser for OpenAPI specs (NotImplementedError)
- `advance-rag/rag/app/adr.py` - Stub parser for ADR documents (NotImplementedError)
- `advance-rag/rag/app/clinical.py` - Stub parser for clinical documents (NotImplementedError)
- `advance-rag/tests/test_code_parser.py` - 12 pytest tests covering all parser behaviors
- `advance-rag/tests/fixtures/sample_code.py` - Python fixture with functions, classes, decorators, large function
- `advance-rag/tests/fixtures/sample_code.ts` - TypeScript fixture with exported functions, arrow functions, class
- `advance-rag/tests/fixtures/sample_code.java` - Java fixture with class and methods
- `advance-rag/pyproject.toml` - Added tree-sitter, tree-sitter-language-pack, prance dependencies
- `advance-rag/common/constants.py` - Added CODE, OPENAPI, ADR, CLINICAL to ParserType enum
- `advance-rag/rag/svr/task_executor.py` - Added FACTORY registration for all four new parsers

## Decisions Made
- Mock rag_tokenizer in tests via sys.modules patching to avoid importing heavy NLP stack (tiktoken, transformers, etc.)
- When a Python `decorated_definition` wraps a `class_definition`, treat it as class scope (not function scope)
- Recursive container-type traversal into block/class_body/statement_block nodes to find nested methods inside classes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed decorated class definitions treated as functions**
- **Found during:** Task 2 (code parser implementation)
- **Issue:** Python `@dataclass class UserProfile` was extracted as a function node because `decorated_definition` is in FUNCTION_NODE_TYPES
- **Fix:** Added check for inner class_definition inside decorated_definition; route to class handling when found
- **Files modified:** advance-rag/rag/app/code.py
- **Verification:** test_class_methods_have_class_name_metadata passes
- **Committed in:** b569e12 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed methods not found inside class bodies**
- **Found during:** Task 2 (code parser implementation)
- **Issue:** `_walk` recursion did not traverse into `block`/`class_body` container nodes, so class methods were invisible
- **Fix:** Added container_types set and recursive traversal into block, statement_block, class_body, etc.
- **Files modified:** advance-rag/rag/app/code.py
- **Verification:** All class method tests pass for Python, TypeScript, and Java
- **Committed in:** b569e12 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for correct AST traversal. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Code parser complete, FACTORY infrastructure ready for plans 02 (OpenAPI) and 03 (ADR + Clinical)
- Stub modules exist as placeholders; will be replaced with full implementations

---
*Phase: 04-domain-specific-parsers*
*Completed: 2026-03-19*
