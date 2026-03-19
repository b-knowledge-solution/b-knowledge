# Phase 4: Domain-Specific Parsers - Research

**Researched:** 2026-03-19
**Domain:** Document parsing, AST-based chunking, OpenAPI spec parsing, LLM classification
**Confidence:** HIGH

## Summary

Phase 4 adds four domain-specific document parsers to the existing RAG pipeline: a code-aware parser using tree-sitter AST parsing, an OpenAPI/Swagger spec parser, an ADR template-aware parser, and a clinical document LLM-based classifier. All parsers follow the established FACTORY registration pattern in `task_executor.py` and produce chunks via the standard `chunk()` function contract.

The existing parser infrastructure is well-established with 15 parsers already implemented. Each parser is a Python module in `advance-rag/rag/app/` that exports a `chunk(filename, binary=None, from_page=0, to_page=100000, lang="Chinese", callback=None, **kwargs)` function returning a list of chunk dicts with `content_with_weight`, tokenized fields, and optional metadata. The clinical classifier integrates with the Phase 3 metadata tagging system via `parser_config.metadata_tags`.

**Primary recommendation:** Follow the existing parser module pattern exactly. Use `tree-sitter` + `tree-sitter-language-pack` for code parsing (pre-built grammars, no compilation). Use `prance` for OpenAPI ref resolution + `ruamel.yaml` (already a dependency) for YAML/JSON parsing. ADR parser is pure regex/heuristic (no new dependencies). Clinical classifier reuses the existing `LLMBundle` + `content_tagging` pattern from `rag/prompts/generator.py`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Code-Aware Parser (PRSR-01):**
- Language-agnostic via tree-sitter -- use tree-sitter for AST parsing across languages
- AST-based chunking with scope context -- chunk at function/class scope boundaries. Each chunk gets: function signature + docstring + body. Parent class/module name stored as metadata. Imports stored once as file-level metadata
- Split large functions at logical sub-boundaries -- if exceeds chunk limit, split at inner blocks. Sub-chunks get parent function signature as context prefix
- Full structured metadata extraction -- function_name, class_name, parameters, return_type, decorators/annotations into chunk metadata
- Comments and docstrings included inline in chunk content

**API Spec Parser (PRSR-02):**
- One chunk per endpoint -- each path+method becomes one chunk with path, method, summary, parameters, request body, responses, and referenced schemas inlined
- Inline schema resolution -- resolve all ref pointers, include full schema in each endpoint chunk
- Support both OpenAPI 3.x and Swagger 2.0 -- convert 2.0 to 3.0 internally, then parse uniformly
- Full endpoint metadata -- path, HTTP method, operation_id, tags, summary, security requirements

**ADR Parser (PRSR-03):**
- Support three template formats -- MADR, Nygard format, and Y-statements
- One chunk per section -- Context, Decision, Consequences each become own chunk with section_type metadata
- Rich metadata extraction -- ADR status, title, section_type, date, superseded_by

**Clinical Document Classification (PRSR-04):**
- LLM-based classification -- send document summary/first page to LLM with classification prompt via existing chat_mdl pipeline
- Four categories -- regulatory, protocol, research, administrative
- Store as metadata tag -- in parser_config.metadata_tags.clinical_classification, searchable via tag filters
- Auto-classify when parser selected -- no extra toggle

### Claude's Discretion
- tree-sitter language grammar selection and installation strategy
- Swagger 2.0 to OpenAPI 3.0 conversion library choice
- ADR section heading detection regex/heuristics
- LLM prompt design for clinical classification
- Test fixture documents for each parser type
- Error handling when tree-sitter grammar is unavailable for a language

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRSR-01 | Code-aware document parsing -- chunk by function/class boundaries with import context preserved | tree-sitter 0.25.2 + tree-sitter-language-pack 0.13.0 provide AST parsing across 165+ languages. Parser follows FACTORY pattern, chunks at function/class scope using tree-sitter node types |
| PRSR-02 | API documentation parser -- parse OpenAPI/Swagger specs into structured endpoint chunks | prance 25.4.8.0 resolves ref pointers; ruamel.yaml (already installed) handles YAML/JSON. Swagger 2.0 converted via prance built-in support |
| PRSR-03 | Technical decision record parser -- template-aware parsing of context/decision/consequences | Pure Python regex/heuristic parser for MADR, Nygard, Y-statement formats. No new dependencies |
| PRSR-04 | Clinical document classification -- auto-classify as regulatory/protocol/research/administrative | Reuses existing LLMBundle + async_chat pattern from task_executor.py auto-extraction pipeline |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tree-sitter | 0.25.2 | Python bindings for tree-sitter incremental parser | Official Python bindings, pre-compiled wheels, no compilation needed |
| tree-sitter-language-pack | 0.13.0 | Pre-built grammars for 165+ languages | Pre-compiled binary wheels, permissive licenses, get_parser/get_language API |
| prance | 25.4.8.0 | OpenAPI/Swagger spec parsing with ref resolution | Resolves JSON references, supports OpenAPI 2.0 and 3.x, validates specs |
| ruamel.yaml | >=0.18.0 | YAML parsing (already installed) | Already a project dependency in pyproject.toml |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| openapi-spec-validator | (prance dep) | Validate OpenAPI specs | Automatically used by prance for validation |
| json_repair | >=0.28.0 | Repair malformed JSON from LLM output | Already installed; use for clinical classifier LLM response parsing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tree-sitter-language-pack | Individual tree-sitter-python, tree-sitter-javascript etc. | Language-pack bundles 165+ languages in one package; individual packages require separate installs per language |
| prance | Manual JSON/YAML parsing + custom ref resolver | Prance handles recursive ref resolution, circular refs, and validation; hand-rolling is error-prone |
| prance convert | swagger2openapi (Node.js) | Prance is pure Python, no Node.js dependency needed; swagger2openapi requires network call |

**Installation:**
```bash
pip install tree-sitter==0.25.2 tree-sitter-language-pack==0.13.0 "prance>=25.4.8.0"
```

## Architecture Patterns

### Recommended Project Structure
```
advance-rag/rag/app/
  code.py              # PRSR-01: Code-aware parser (tree-sitter AST)
  openapi.py           # PRSR-02: OpenAPI/Swagger endpoint parser
  adr.py               # PRSR-03: ADR template-aware section parser
  clinical.py          # PRSR-04: Clinical document classifier
  naive.py             # (existing) Reference parser
  ...                  # (existing 14 other parsers)
```

### Pattern 1: Parser Module Contract
**What:** Every parser module exports a `chunk()` function with a standard signature.
**When to use:** Always -- this is the mandatory contract enforced by the FACTORY dispatch in `task_executor.py`.
**Example:**
```python
# Source: advance-rag/rag/svr/task_executor.py lines 405, 424-437
def chunk(filename, binary=None, from_page=0, to_page=100000,
          lang="Chinese", callback=None, **kwargs):
    """Parse and chunk a document into semantically meaningful segments.

    Args:
        filename: Original filename (used for format detection via extension).
        binary: Raw file bytes from S3/MinIO storage.
        from_page: Start page (0-based), ignored for non-paged formats.
        to_page: End page (inclusive), ignored for non-paged formats.
        lang: Language hint ('English', 'Chinese', etc.).
        callback: Progress callback function(progress_float, message_str).
        **kwargs: Additional params including parser_config, kb_id, tenant_id.

    Returns:
        List of chunk dicts, each containing:
        - content_with_weight: str -- the chunk text content
        - content_ltks: str -- coarse tokenized content
        - content_sm_ltks: str -- fine-grained tokenized content
        - docnm_kwd: str -- source filename
        - title_tks: str -- tokenized title
        - (optional) tag_kwd: list[str] -- tags for filtering
        - (optional) important_kwd: list[str] -- extracted keywords
        - (optional) top_int: list[int] -- position/ordering info
    """
```

The task executor calls this via:
```python
chunker = FACTORY[task["parser_id"].lower()]
cks = await thread_pool_exec(
    chunker.chunk,
    task["name"],
    binary=binary,
    from_page=task["from_page"],
    to_page=task["to_page"],
    lang=task["language"],
    callback=progress_callback,
    kb_id=task["kb_id"],
    parser_config=task["parser_config"],
    tenant_id=task["tenant_id"],
)
```

### Pattern 2: FACTORY Registration
**What:** Register new parsers in the FACTORY dict and ParserType enum.
**When to use:** For every new parser type.
**Example:**
```python
# In common/constants.py - add to ParserType enum:
class ParserType(StrEnum):
    # ... existing values ...
    CODE = "code"
    OPENAPI = "openapi"
    ADR = "adr"
    CLINICAL = "clinical"

# In task_executor.py - add to FACTORY dict + import:
from rag.app import code, openapi, adr, clinical

FACTORY = {
    # ... existing entries ...
    ParserType.CODE.value: code,
    ParserType.OPENAPI.value: openapi,
    ParserType.ADR.value: adr,
    ParserType.CLINICAL.value: clinical,
}
```

### Pattern 3: Chunk Tokenization (from existing parsers)
**What:** Every chunk must be tokenized using `rag_tokenizer` for search indexing.
**When to use:** Always -- every chunk dict must have tokenized fields.
**Example:**
```python
# Source: advance-rag/rag/app/tag.py lines 49-55
from rag.nlp import rag_tokenizer

doc = {
    "docnm_kwd": filename,
    "title_tks": rag_tokenizer.tokenize(re.sub(r"\.[a-zA-Z]+$", "", filename))
}
d["content_with_weight"] = chunk_text
d["content_ltks"] = rag_tokenizer.tokenize(chunk_text)
d["content_sm_ltks"] = rag_tokenizer.fine_grained_tokenize(d["content_ltks"])
```

### Pattern 4: Clinical Classifier LLM Integration
**What:** Use existing LLMBundle + async_chat pattern from the auto-extraction pipeline.
**When to use:** For PRSR-04 clinical classification.
**Example:**
```python
# Source: advance-rag/rag/svr/task_executor.py lines 496-514
# The clinical classifier runs as a post-parse step, similar to auto_keywords
from db.services.llm_service import LLMBundle
from db.joint_services.tenant_model_service import get_model_config_by_type_and_name
from common.constants import LLMType

chat_model_config = get_model_config_by_type_and_name(
    task["tenant_id"], LLMType.CHAT, task["llm_id"]
)
chat_mdl = LLMBundle(task["tenant_id"], chat_model_config, lang=task["language"])
# Then call chat_mdl.async_chat(system_prompt, messages, options)
```

### Pattern 5: FE Parser Type Registration
**What:** Add new parser options to PARSER_OPTIONS and PARSER_DESCRIPTIONS in FE types, and add parser-specific settings to ParserSettingsFields.tsx.
**When to use:** For every new parser that needs UI selection.
**Example locations:**
- `fe/src/features/datasets/types/index.ts` -- PARSER_OPTIONS array and PARSER_DESCRIPTIONS record
- `fe/src/features/datasets/components/ParserSettingsFields.tsx` -- conditional UI fields per parser type

### Anti-Patterns to Avoid
- **Don't create separate chunk storage**: All parsers use the same chunk dict structure and indexing pipeline. Store structured metadata as fields on the chunk dict, not in separate tables.
- **Don't bypass the FACTORY pattern**: Never call parser chunk functions directly from task_executor.py. Always register in FACTORY.
- **Don't duplicate imports in every code chunk**: The CONTEXT.md explicitly says "Imports stored once as file-level metadata, not repeated per chunk."
- **Don't use synchronous LLM calls**: The task executor is async. Always use `async_chat` and `chat_limiter` semaphore for LLM calls.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AST parsing for multiple languages | Per-language regex parsers | tree-sitter + tree-sitter-language-pack | 165+ languages with consistent AST API; regex is fragile for nested scopes |
| OpenAPI ref resolution | Custom JSON pointer resolver | prance.ResolvingParser | Handles recursive refs, circular refs, remote refs, file refs |
| Swagger 2.0 to 3.0 conversion | Custom format converter | prance internal conversion or detect-and-handle-both | Format differences are extensive (parameters, security, servers) |
| YAML/JSON parsing | json.loads + custom YAML | ruamel.yaml (already installed) | Handles both formats, preserves comments, round-trip capable |
| Token counting | Custom word counting | num_tokens_from_string (existing) | Already used throughout codebase, consistent with embedding model |
| Text tokenization for search | Custom tokenizer | rag_tokenizer.tokenize / fine_grained_tokenize | Required for OpenSearch full-text search, already integrated |

**Key insight:** The parser infrastructure is mature. New parsers only need to produce the standard chunk dict format. All downstream processing (embedding, keyword extraction, indexing) is handled automatically by the task executor pipeline.

## Common Pitfalls

### Pitfall 1: tree-sitter Grammar Availability
**What goes wrong:** Not all file extensions map cleanly to tree-sitter language names. A `.jsx` file needs "tsx" grammar, `.h` could be C or C++.
**Why it happens:** tree-sitter grammars are named by language, not file extension.
**How to avoid:** Build an explicit extension-to-language mapping dict. For ambiguous extensions (`.h`), default to the more common language (C). Fall back to naive text chunking when no grammar is available instead of failing.
**Warning signs:** `LookupError` from `tree_sitter_language_pack.get_parser()`.

### Pitfall 2: Large Function Splitting Complexity
**What goes wrong:** Splitting a large function at inner block boundaries can create chunks that lose context about the surrounding function.
**Why it happens:** Inner blocks (if/else, loops) have meaning only within their parent function context.
**How to avoid:** Always prefix sub-chunks with the parent function signature (as specified in CONTEXT.md). Track nesting depth and include the nearest enclosing scope name in metadata.
**Warning signs:** Sub-chunks that read like orphaned code without context.

### Pitfall 3: OpenAPI Circular Refs
**What goes wrong:** Some OpenAPI specs have circular schema references (e.g., TreeNode referencing itself). Inlining these causes infinite recursion.
**Why it happens:** Recursive data structures are valid in OpenAPI schemas.
**How to avoid:** prance handles this with its resolution modes. Set a recursion depth limit for schema inlining (e.g., max 3 levels deep). Beyond that, include a placeholder with a note.
**Warning signs:** Memory growth during spec parsing, RecursionError.

### Pitfall 4: ADR Heading Variations
**What goes wrong:** ADR sections are not detected because headings vary across templates and teams.
**Why it happens:** Different ADR templates use different heading names ("Decision" vs "Decision Outcome" vs "Decided" vs "What was decided").
**How to avoid:** Use fuzzy matching with canonical section keywords. Match against normalized lowercase headings. Accept partial matches (e.g., heading containing "decision" maps to DECISION section type).
**Warning signs:** ADR parsed as single chunk instead of per-section chunks.

### Pitfall 5: Clinical Classifier Token Cost
**What goes wrong:** Sending full documents to LLM for classification burns excessive tokens.
**Why it happens:** Clinical documents can be very long (protocols, regulatory docs).
**How to avoid:** Send only the first page or first 2000 tokens to the LLM, plus the document title. This is sufficient for classification into the four categories.
**Warning signs:** Slow classification, high LLM costs, timeouts.

### Pitfall 6: Missing Tokenization Fields
**What goes wrong:** Chunks indexed without `content_ltks` and `content_sm_ltks` fields are invisible to full-text search.
**Why it happens:** New parser authors forget to call `rag_tokenizer.tokenize()`.
**How to avoid:** Every chunk dict MUST have `content_with_weight`, `content_ltks`, `content_sm_ltks`, `docnm_kwd`, `title_tks`. Copy the pattern from `tag.py` (simplest existing parser).
**Warning signs:** Documents parse successfully but return zero search results.

### Pitfall 7: kwargs Ignored in Chunk Signature
**What goes wrong:** New parsers define `chunk(filename, binary, ...)` without `**kwargs` and crash when task_executor passes `kb_id`, `parser_config`, `tenant_id`.
**Why it happens:** The task executor always passes all params; some parsers use some, all must accept all.
**How to avoid:** Always include `**kwargs` in the chunk function signature. Extract needed params like `parser_config = kwargs.get("parser_config", {})`.
**Warning signs:** TypeError on unexpected keyword arguments.

## Code Examples

### Code Parser: tree-sitter AST Chunking
```python
# Recommended pattern for PRSR-01
from tree_sitter_language_pack import get_parser, get_language

def _get_language_for_extension(ext: str) -> str | None:
    """Map file extension to tree-sitter language name.

    Args:
        ext: File extension (lowercase, with leading dot).

    Returns:
        tree-sitter language name, or None if unsupported.
    """
    EXTENSION_MAP = {
        ".py": "python", ".js": "javascript", ".ts": "typescript",
        ".tsx": "tsx", ".jsx": "tsx", ".java": "java", ".go": "go",
        ".rs": "rust", ".rb": "ruby", ".cpp": "cpp", ".c": "c",
        ".cs": "c_sharp", ".php": "php", ".swift": "swift",
        ".kt": "kotlin", ".scala": "scala", ".lua": "lua",
        ".sh": "bash", ".bash": "bash", ".zsh": "bash",
        ".r": "r", ".R": "r", ".dart": "dart",
        ".vue": "vue", ".svelte": "svelte",
    }
    return EXTENSION_MAP.get(ext.lower())

def _extract_functions_and_classes(tree, source_bytes, language):
    """Walk tree-sitter AST and extract function/class nodes.

    Args:
        tree: Parsed tree-sitter Tree object.
        source_bytes: Source code as bytes.
        language: tree-sitter language name for node type mapping.

    Returns:
        List of dicts with node type, name, signature, body, metadata.
    """
    # Node types vary by language -- map common patterns
    FUNCTION_TYPES = {
        "python": ["function_definition", "decorated_definition"],
        "javascript": ["function_declaration", "arrow_function", "method_definition"],
        "typescript": ["function_declaration", "arrow_function", "method_definition"],
        "java": ["method_declaration", "constructor_declaration"],
        "go": ["function_declaration", "method_declaration"],
        "rust": ["function_item", "impl_item"],
    }
    CLASS_TYPES = {
        "python": ["class_definition"],
        "javascript": ["class_declaration"],
        "typescript": ["class_declaration"],
        "java": ["class_declaration"],
        "go": ["type_declaration"],
        "rust": ["struct_item", "impl_item"],
    }
    # Walk root children, extract scope nodes
    ...
```

### OpenAPI Parser: Endpoint Chunking with prance
```python
# Recommended pattern for PRSR-02
import prance
from io import BytesIO

def _parse_spec(binary: bytes, filename: str) -> dict:
    """Parse and resolve an OpenAPI/Swagger spec file.

    Args:
        binary: Raw file bytes (YAML or JSON).
        filename: Original filename for format detection.

    Returns:
        Fully resolved OpenAPI 3.x spec dict.
    """
    # prance.ResolvingParser handles ref resolution and Swagger 2.0 detection
    parser = prance.ResolvingParser(
        spec_string=binary.decode("utf-8"),
        backend="openapi-spec-validator",
        strict=False,
    )
    return parser.specification

def _endpoint_to_chunk(path: str, method: str, operation: dict, spec: dict) -> str:
    """Build a self-contained chunk text for one API endpoint.

    Args:
        path: URL path (e.g., '/users/{id}').
        method: HTTP method (e.g., 'get').
        operation: Operation object from the spec.
        spec: Full resolved spec for context.

    Returns:
        Human-readable chunk text with endpoint details.
    """
    # Format: METHOD PATH - Summary - Parameters - Request Body - Responses
    ...
```

### ADR Parser: Section Detection Heuristics
```python
# Recommended pattern for PRSR-03
import re

# Canonical section types with heading pattern variations
ADR_SECTION_PATTERNS = {
    "context": re.compile(
        r"^#+\s*(context|background|problem|motivation|issue|forces)",
        re.IGNORECASE
    ),
    "decision": re.compile(
        r"^#+\s*(decision|decided|decision\s+outcome|chosen\s+option|resolution)",
        re.IGNORECASE
    ),
    "consequences": re.compile(
        r"^#+\s*(consequences|implications|results?|outcome|pros?\s+and\s+cons?)",
        re.IGNORECASE
    ),
    "status": re.compile(
        r"^#+\s*(status|state)",
        re.IGNORECASE
    ),
    "options": re.compile(
        r"^#+\s*(options?\s*considered|alternatives?|considered\s+options?)",
        re.IGNORECASE
    ),
}

# Y-statement: "In the context of ... facing ... we decided ... to achieve ..."
Y_STATEMENT_PATTERN = re.compile(
    r"in\s+the\s+context\s+of\s+.+?"
    r"facing\s+.+?"
    r"we\s+decided\s+.+?"
    r"to\s+achieve\s+.+?",
    re.IGNORECASE | re.DOTALL,
)
```

### Clinical Classifier: LLM Classification Prompt
```python
# Recommended pattern for PRSR-04
CLINICAL_CLASSIFICATION_PROMPT = """You are a clinical document classifier.
Classify the following document into exactly ONE of these categories:
- regulatory: FDA submissions, compliance docs, SOPs, audit reports
- protocol: Clinical trial protocols, study designs, amendments
- research: Journal articles, literature reviews, case studies, lab reports
- administrative: Meeting minutes, budgets, contracts, correspondence

Respond with ONLY the category name (one word, lowercase).

Document title: {title}
Document content (first page):
{content}

Category:"""
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tree-sitter-languages (grantjenks) | tree-sitter-language-pack (kreuzberg-dev) | 2024 | Maintained fork with 165+ languages, full typing, active development |
| py-tree-sitter 0.21.x (build from source) | py-tree-sitter 0.25.x (pre-compiled wheels) | 2024 | No compilation needed, Python 3.10+ required |
| Manual OpenAPI parsing | prance ResolvingParser | Stable since 2020+ | Handles all ref resolution edge cases automatically |
| Swagger 2.0 separate parsing | Unified OpenAPI 3.x parsing with conversion | OpenAPI 3.0 spec (2017) | Convert once, parse uniformly |

**Deprecated/outdated:**
- `tree-sitter-languages` (grantjenks): Original package, less actively maintained. Use `tree-sitter-language-pack` instead.
- `py-tree-sitter` older than 0.22: Required building grammars from source with `Language.build_library()`. Current versions use pre-built language objects.

## Open Questions

1. **tree-sitter-language-pack Docker build compatibility**
   - What we know: Package provides pre-built wheels for major platforms
   - What's unclear: Whether the Docker image (likely based on slim/alpine) has compatible wheel or needs build tools
   - Recommendation: Test installation in Docker build. If no wheel, add build-essential to Dockerfile. Alternatively, pin to a known-working platform wheel.

2. **Swagger 2.0 to 3.0 conversion fidelity with prance**
   - What we know: prance supports both formats and has conversion capability
   - What's unclear: Whether prance auto-converts 2.0 to 3.0 internally during resolution, or requires explicit conversion step
   - Recommendation: Test with a sample Swagger 2.0 spec. If prance does not auto-convert, detect version from `swagger: "2.0"` field and handle both formats natively since prance resolves refs in both.

3. **Clinical classifier accuracy with first-page-only approach**
   - What we know: Sending first page + title is cost-effective and fast
   - What's unclear: Whether first page is sufficient for all document types (some protocols have generic first pages)
   - Recommendation: Start with first 2000 tokens + title. Include a confidence score in the LLM response. If confidence is below threshold, extend to first 5000 tokens for a retry.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (Python) + Vitest (FE) |
| Config file | advance-rag/tests/ (existing directory) |
| Quick run command | `cd advance-rag && python -m pytest tests/ -x -q` |
| Full suite command | `cd advance-rag && python -m pytest tests/ -v && npm run test -w fe` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRSR-01 | Code file chunked by function/class boundaries with import context | unit | `python -m pytest tests/test_code_parser.py -x` | No -- Wave 0 |
| PRSR-02 | OpenAPI spec parsed into per-endpoint chunks with resolved schemas | unit | `python -m pytest tests/test_openapi_parser.py -x` | No -- Wave 0 |
| PRSR-03 | ADR parsed with section types as distinct chunks | unit | `python -m pytest tests/test_adr_parser.py -x` | No -- Wave 0 |
| PRSR-04 | Clinical doc classified into one of four categories via LLM | unit | `python -m pytest tests/test_clinical_parser.py -x` | No -- Wave 0 |
| ALL | New parser types appear in FE parser selector | unit | `npm run test -w fe -- --run tests/datasets/parser-types.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd advance-rag && python -m pytest tests/test_{parser}_parser.py -x`
- **Per wave merge:** `cd advance-rag && python -m pytest tests/ -v`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `advance-rag/tests/test_code_parser.py` -- covers PRSR-01 (tree-sitter AST chunking, import extraction, large function splitting)
- [ ] `advance-rag/tests/test_openapi_parser.py` -- covers PRSR-02 (endpoint chunking, ref resolution, Swagger 2.0 handling)
- [ ] `advance-rag/tests/test_adr_parser.py` -- covers PRSR-03 (MADR, Nygard, Y-statement detection, section chunking)
- [ ] `advance-rag/tests/test_clinical_parser.py` -- covers PRSR-04 (LLM classification mock, metadata tag storage)
- [ ] `advance-rag/tests/fixtures/` -- sample files: Python/JS/TS code files, OpenAPI 3.0 YAML, Swagger 2.0 JSON, ADR markdown files (MADR + Nygard + Y-statement), clinical document text
- [ ] Framework install: `pip install tree-sitter==0.25.2 tree-sitter-language-pack==0.13.0 "prance>=25.4.8.0"` -- new dependencies for PRSR-01 and PRSR-02

## Sources

### Primary (HIGH confidence)
- `advance-rag/rag/svr/task_executor.py` lines 99-116 -- FACTORY pattern, chunk() call contract (lines 405, 424-437)
- `advance-rag/rag/app/tag.py` -- simplest parser reference implementation (chunk dict structure)
- `advance-rag/rag/app/naive.py` -- comprehensive parser reference (full chunk pipeline)
- `advance-rag/common/constants.py` lines 121-137 -- ParserType enum
- `advance-rag/rag/prompts/generator.py` lines 340-360, 502-522, 1537-1557 -- LLM extraction patterns (keyword_extraction, content_tagging, gen_metadata)
- `fe/src/features/datasets/types/index.ts` lines 160-289 -- PARSER_OPTIONS and PARSER_DESCRIPTIONS
- PyPI: tree-sitter 0.25.2, tree-sitter-language-pack 0.13.0, prance 25.4.8.0 -- verified via PyPI JSON API

### Secondary (MEDIUM confidence)
- [py-tree-sitter docs](https://tree-sitter.github.io/py-tree-sitter/) -- API reference for tree-sitter Python bindings
- [tree-sitter-language-pack GitHub](https://github.com/Goldziher/tree-sitter-language-pack) -- 165+ languages, get_parser/get_language API
- [prance GitHub](https://github.com/RonnyPfannschmidt/prance) -- ResolvingParser API, ref handling

### Tertiary (LOW confidence)
- Swagger 2.0 to 3.0 conversion fidelity via prance -- needs practical validation with test specs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- tree-sitter and prance are well-established, verified via PyPI
- Architecture: HIGH -- follows exact patterns from 15 existing parsers in the codebase
- Pitfalls: HIGH -- derived from codebase analysis and tree-sitter/OpenAPI known issues
- Clinical classifier: MEDIUM -- LLM prompt design and accuracy need empirical validation

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable libraries, well-established patterns)
