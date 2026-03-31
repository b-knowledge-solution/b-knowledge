# Laws Parser — Detail Design

> **Module**: `advance-rag/rag/app/laws.py`
> **Parser Type**: `ParserType.LAWS`
> **Category**: Document Parsing
> **Role**: Specialized parser for legal documents, regulations, and statutes

---

## 1. Overview

The Laws Parser is designed for legal documents such as laws, regulations, statutes, contracts, and compliance documents. It uses **tree-based merging** (`tree_merge()`) instead of naive or hierarchical merge to preserve the hierarchical structure of legal text (Part → Chapter → Section → Article → Paragraph). This structure is critical for legal search where users need to find specific articles, sections, or clauses.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Laws & regulations** | National/regional laws, government regulations |
| **Contracts** | Legal contracts with numbered clauses |
| **Compliance documents** | Regulatory compliance frameworks (GDPR, SOX, etc.) |
| **Corporate policies** | Internal policy documents with article structure |
| **Standards** | ISO, IEEE, or other numbered standards |

---

## 3. Supported Formats

| Format | Parser Used | Notes |
|--------|-------------|-------|
| DOCX | `RAGFlowDocxParser` + Node tree builder | Best for structured legal docs |
| PDF | `PdfParser` with `ParserType.LAWS` model | Vertical merge for article preservation |
| TXT | Direct text read | Plain text legal documents |
| HTML | `RAGFlowHtmlParser` | Web-published legal texts |
| DOC | `RAGFlowDocxParser` (via LibreOffice) | Legacy format support |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Format Detection       │
              └────┬──────────────┬─────┘
                   │              │
         ┌─────────▼──────┐  ┌───▼───────────┐
         │   DOCX Path    │  │   PDF/TXT/    │
         │                │  │   HTML Path   │
         └─────────┬──────┘  └───┬───────────┘
                   │              │
         ┌─────────▼──────┐  ┌───▼───────────┐
         │ Extract text + │  │ Layout engine │
         │ heading levels │  │ or direct     │
         │ from DOCX      │  │ text read     │
         └─────────┬──────┘  └───┬───────────┘
                   │              │
         ┌─────────▼──────┐  ┌───▼───────────┐
         │ Build Node     │  │ Detect section│
         │ tree from      │  │ levels from   │
         │ heading        │  │ font/number   │
         │ hierarchy      │  │ patterns      │
         └─────────┬──────┘  └───┬───────────┘
                   │              │
                   └──────┬───────┘
                          │
              ┌───────────▼───────────┐
              │  tree_merge()         │
              │  Hierarchical tree    │
              │  chunking with depth  │
              │  parameter            │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  tokenize_chunks()    │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  Return hierarchical  │
              │  chunks               │
              └───────────────────────┘
```

### 4.2 Function Signature

```python
def chunk(
    filename: str,
    binary: bytes,
    from_page: int = 0,
    to_page: int = 100000,
    lang: str = "English",
    callback=None,
    **kwargs
) -> list[dict]:
```

---

## 5. Business Logic

### 5.1 Node Tree Structure (DOCX Path)

The DOCX path builds a hierarchical `Node` tree:

```python
class Node:
    level: int          # Heading depth (1=Part, 2=Chapter, 3=Section, etc.)
    text: str           # The text content of this node
    children: list      # Child nodes
```

**Tree building process**:
1. Extract all paragraphs with their heading levels from DOCX
2. Build tree by nesting paragraphs under their parent headings
3. Non-heading paragraphs become leaf nodes under the nearest heading

**Example tree**:
```
Part I: General Provisions (Level 1)
├── Chapter 1: Definitions (Level 2)
│   ├── Article 1: "Person" means... (Level 3)
│   └── Article 2: "Property" means... (Level 3)
└── Chapter 2: Scope (Level 2)
    ├── Article 3: This law applies to... (Level 3)
    └── Article 4: Exceptions include... (Level 3)
```

### 5.2 PDF Processing — Legal Layout Model

The PDF path uses `ParserType.LAWS` for layout recognition:

1. **Vertical merge**: Adjacent text blocks with the same article number are merged (legal text often wraps across lines)
2. **Section detection**: Font size changes, bold text, and numbering patterns identify hierarchy levels
3. **Article preservation**: Individual articles/clauses are kept intact as much as possible

### 5.3 Tree Merge Strategy

The `tree_merge()` function (from `rag/nlp/`) is unique to the Laws Parser:

```
tree_merge(sections, depth_parameter)
```

**Algorithm**:
1. Build a tree from detected sections/heading levels
2. Walk the tree depth-first
3. At each node, accumulate text from children
4. If accumulated text exceeds `chunk_token_num`, create a chunk and start a new accumulation
5. Each chunk includes its full hierarchy path as context (e.g., "Part I > Chapter 1 > Article 3")
6. The `depth` parameter controls how deep to merge — shallower = larger chunks with more context

**Key property**: Chunks never cross hierarchy boundaries. An article from Chapter 1 is never merged with an article from Chapter 2.

### 5.4 Section Level Detection Patterns

For non-DOCX formats, section levels are detected via patterns:

| Pattern | Level | Example |
|---------|-------|---------|
| `Part [ROMAN/NUMBER]` | 1 | Part I, Part 1 |
| `Chapter [NUMBER]` | 2 | Chapter 3 |
| `Section [NUMBER]` | 3 | Section 5.2 |
| `Article [NUMBER]` | 4 | Article 12 |
| `§ [NUMBER]` | 4 | § 15 |
| `([letter/number])` | 5 | (a), (1), (i) |

### 5.5 Hierarchy Path Preservation

Each chunk preserves its path in the document hierarchy:

```python
# Chunk content includes parent context
"Part I: General Provisions > Chapter 1: Definitions > Article 1\n\n\"Person\" means any natural or legal entity..."
```

This ensures that when a chunk is retrieved, the user sees its full context within the legal document.

---

## 6. Output Example

```python
{
    "content_with_weight": "Part I: General Provisions > Chapter 2: Scope\n\nArticle 3: This law applies to all commercial transactions conducted within the territory. Cross-border transactions are subject to additional regulations as specified in Part III.",
    "content_ltks": ["part", "general", "provisions", "chapter", "scope", "article", "law", "applies", "commercial", "transactions"],
    "content_sm_ltks": ["par", "gen", "pro", ...],
    "docnm_kwd": "commercial-law-2024.pdf",
    "title_tks": ["article", "scope"],
    "page_num_int": [5]
}
```

---

## 7. Differences from Other Parsers

| Aspect | Laws | Naive | Manual | Book |
|--------|------|-------|--------|------|
| Merge strategy | `tree_merge()` | `naive_merge()` | Position-based | `hierarchical_merge()` |
| Hierarchy preservation | Full path in chunks | No | Section IDs | No |
| Cross-boundary chunks | Never | May cross | May cross | May cross |
| Node tree structure | Yes | No | Q&A tree | No |
| Target content | Legal documents | General | Technical docs | Books |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| No heading hierarchy detected | Falls back to numbered paragraph detection |
| Flat legal text (no sections) | Uses naive_merge as fallback |
| Very deeply nested hierarchy | Tree flattened beyond depth limit |
| Mixed heading formats | Best-effort level assignment |
| Empty sections | Skipped in tree building |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/pdf_parser.py` | PDF with LAWS model |
| `deepdoc/parser/docx_parser.py` | DOCX heading extraction |
| `deepdoc/parser/html_parser.py` | HTML legal text parsing |
| `rag/nlp/` | tree_merge(), tokenize_chunks() |
