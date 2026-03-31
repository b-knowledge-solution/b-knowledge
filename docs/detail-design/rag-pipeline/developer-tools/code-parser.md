# Code Parser — Detail Design

> **Module**: `advance-rag/rag/app/code.py`
> **Parser Type**: `ParserType.CODE`
> **Category**: Developer Tools
> **Role**: AST-based source code parser with semantic analysis

---

## 1. Overview

The Code Parser processes source code files using Abstract Syntax Tree (AST) analysis via Tree-sitter. It produces semantically meaningful chunks at the function, class, and method level, each with AI-generated summaries. For unsupported languages, it falls back to naive line-based chunking. This parser is unique in that it can also export code structure to a graph database (Memgraph) for code knowledge graph queries.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Code search** | Search across codebases by function name, description, or behavior |
| **Onboarding** | New developers search code knowledge base to understand systems |
| **Code review** | Index code for AI-assisted review and analysis |
| **Documentation** | Auto-generate searchable code documentation |
| **Dependency analysis** | Code graph for understanding relationships |
| **Bug investigation** | Search for code patterns related to bug reports |

---

## 3. Supported Languages

### AST-Supported (via Tree-sitter + code_graph)

| Language | Extensions |
|----------|------------|
| Python | .py |
| JavaScript | .js, .jsx, .mjs |
| TypeScript | .ts, .tsx |
| Java | .java |
| Go | .go |
| Rust | .rs |
| C/C++ | .c, .cpp, .h, .hpp |
| C# | .cs |
| Ruby | .rb |
| PHP | .php |
| Scala | .scala |
| Lua | .lua |

### Fallback (Line-Based Chunking)

All other file extensions use naive line-based chunking (e.g., .sql, .sh, .yaml, .toml, .ini, etc.)

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Check file extension   │
              │  against EXTENSION_MAP  │
              └────┬──────────────┬─────┘
                   │ Supported    │ Unsupported
                   │              │
    ┌──────────────▼────────┐  ┌─▼────────────────┐
    │  AST Path             │  │  Fallback Path   │
    │  (code_graph)         │  │  (line-based)    │
    └──────────────┬────────┘  └─┬────────────────┘
                   │              │
    ┌──────────────▼────────┐  ┌─▼────────────────┐
    │ 1. Parse AST with     │  │ Group lines by   │
    │    Tree-sitter        │  │ token limit      │
    │                       │  │ (chunk_token_num)│
    │ 2. Extract functions, │  │                  │
    │    classes, methods   │  │ Build standard   │
    │                       │  │ chunk dicts      │
    │ 3. Generate semantic  │  │                  │
    │    summaries (LLM)    │  └─┬────────────────┘
    │                       │    │
    │ 4. Build graph nodes  │    │
    │    (for Memgraph)     │    │
    │                       │    │
    │ 5. Build search       │    │
    │    chunks (OpenSearch) │    │
    └──────────────┬────────┘    │
                   │              │
                   └──────┬───────┘
                          │
              ┌───────────▼───────────┐
              │  tokenize_chunks()    │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  Return chunks        │
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

### 5.1 AST Path — Code Graph Extraction

For supported languages, the primary path uses the `code_graph` module:

**Step 1: Tree-sitter AST Parsing**
- Parse the source code into an AST
- Identify structural nodes: functions, classes, methods, imports, constants

**Step 2: Node Extraction**
- Each function/class/method becomes a separate entity
- Extract: name, parameters, return type, docstring, body, line range

**Step 3: Semantic Summary Generation**
- For each extracted entity, generate a natural language summary
- Uses the configured CHAT LLM model
- Example: `"Validates user credentials against the database and returns a JWT token if successful"`

**Step 4: Graph Node Construction**
- Build nodes for Memgraph graph database:
  - `Function`, `Class`, `Method` nodes
  - `CALLS`, `IMPORTS`, `INHERITS` edges
  - `DEFINED_IN` file relationships

**Step 5: Search Chunk Construction**
- Each entity produces an OpenSearch chunk:
  - `content_with_weight`: Semantic summary + raw source code
  - Metadata: function name, file path, line range, language

### 5.2 Fallback Path — Line-Based Chunking

For unsupported file extensions:

1. Read the file as text
2. Split into lines
3. Group consecutive lines until `chunk_token_num` is reached
4. Each group becomes a chunk

```python
# Example: 50-line SQL file with chunk_token_num=200
# Lines 1-25 → Chunk 1
# Lines 26-50 → Chunk 2
```

### 5.3 Single-Pass Architecture

The code_graph module performs **one AST pass** to produce both:
- **Graph nodes** for Memgraph (code knowledge graph)
- **Search chunks** for OpenSearch (text search + embeddings)

This avoids parsing the code twice and ensures consistency between graph and search representations.

### 5.4 Extension Mapping

```python
EXTENSION_MAP = {
    ".py": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".c": "c", ".h": "c",
    ".cpp": "cpp", ".hpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".scala": "scala",
    ".lua": "lua",
}
```

---

## 6. Output Example

```python
# AST-extracted function chunk
{
    "content_with_weight": "Validates user credentials against the database and returns a JWT token if successful. Checks password hash, account status, and login attempt limits.\n\n```python\nasync def authenticate_user(email: str, password: str) -> AuthResult:\n    user = await UserModel.get_by_email(email)\n    if not user or not verify_hash(password, user.password_hash):\n        raise InvalidCredentialsError()\n    if user.is_locked:\n        raise AccountLockedError()\n    return AuthResult(token=generate_jwt(user))\n```",
    "content_ltks": ["validates", "user", "credentials", "database", "jwt", "token", "password"],
    "docnm_kwd": "auth_service.py",
    "title_tks": ["authenticate", "user"],
    "page_num_int": [0]
}

# Fallback line-based chunk
{
    "content_with_weight": "CREATE TABLE users (\n  id UUID PRIMARY KEY,\n  email VARCHAR(255) UNIQUE NOT NULL,\n  password_hash TEXT NOT NULL,\n  created_at TIMESTAMP DEFAULT NOW()\n);",
    "content_ltks": ["create", "table", "users", "uuid", "primary", "key", "email"],
    "docnm_kwd": "schema.sql",
    "title_tks": [],
    "page_num_int": [0]
}
```

---

## 7. Differences from Other Parsers

| Aspect | Code | Naive | Manual |
|--------|------|-------|--------|
| Parsing method | AST (Tree-sitter) | Text-based | Heading-based |
| Chunk boundaries | Function/class/method | Token limit | Section boundary |
| Semantic summaries | Yes (LLM-generated) | No | No |
| Graph export | Yes (Memgraph) | No | No |
| Language awareness | Yes (23+ extensions) | No | No |
| Fallback | Line-based chunking | N/A | N/A |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Unsupported language | Falls back to line-based chunking |
| AST parse error | Falls back to line-based chunking |
| LLM unavailable for summaries | Chunks contain only raw source code |
| Binary file detected | Returns empty list |
| Very large file (>100K lines) | Processed entirely; may be slow |
| Memgraph unavailable | Search chunks still produced (graph export skipped) |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `rag/app/code_graph/` | AST parsing + graph construction |
| `tree-sitter` | AST parsing for supported languages |
| `LLMBundle` | CHAT model for semantic summaries |
| `rag/nlp/rag_tokenizer.py` | Text tokenization |

---

## 10. Performance Considerations

- **Tree-sitter parsing** is very fast (milliseconds for typical files)
- **LLM summary generation** is the bottleneck — one LLM call per function/class
- **Large files** with many functions may require many LLM calls
- **Fallback path** is fast (no LLM needed)
- **Graph construction** adds minimal overhead
