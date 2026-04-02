# OpenAPI Parser — Detail Design

> **Module**: `advance-rag/rag/app/openapi.py`
> **Parser Type**: `ParserType.OPENAPI`
> **Category**: Developer Tools
> **Role**: Parser for OpenAPI 3.x and Swagger 2.0 specifications

---

## 1. Overview

The OpenAPI Parser processes API specification files (OpenAPI 3.x and Swagger 2.0) in YAML or JSON format. It resolves all `$ref` references using the `prance` library, then creates one chunk per API endpoint (path + method combination). Each chunk contains the endpoint description, request parameters with resolved schemas, response schemas, and security requirements — making API documentation fully searchable.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **API documentation search** | Search across multiple API specs by endpoint behavior |
| **Integration research** | Find API endpoints for specific capabilities |
| **API governance** | Index all API specs for compliance checking |
| **Developer onboarding** | New developers search API specs to understand available services |
| **Migration planning** | Compare API endpoints across versions |

---

## 3. Supported Formats

| Format | Detection | Notes |
|--------|-----------|-------|
| YAML (.yaml, .yml) | File extension or content inspection | Most common OpenAPI format |
| JSON (.json) | File extension or content inspection | Alternative format |
| OpenAPI 3.x | Detected by `openapi: "3.x.x"` field | Current standard |
| Swagger 2.0 | Detected by `swagger: "2.0"` field | Legacy standard |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Detect format          │
              │  (YAML vs JSON)         │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Resolve all $ref       │
              │  (prance library)       │
              │  Full inlining          │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Iterate paths +        │
              │  methods                │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  For each endpoint:     │
              │                         │
              │  1. Path + Method       │
              │  2. Description/Summary │
              │  3. Request parameters  │
              │  4. Request body schema │
              │  5. Response schemas    │
              │  6. Security reqs       │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Render schemas as      │
              │  human-readable text    │
              │  (depth-limited: 3)     │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  1 endpoint = 1 chunk   │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  tokenize_chunks()      │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Return endpoint chunks │
              └─────────────────────────┘
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

### 5.1 Reference Resolution

OpenAPI specs commonly use `$ref` pointers to reuse schema definitions:

```yaml
# Before resolution
requestBody:
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/UserCreate'

# After resolution (prance inlines everything)
requestBody:
  content:
    application/json:
      schema:
        type: object
        properties:
          email:
            type: string
            format: email
          password:
            type: string
            minLength: 8
```

The `prance` library resolves ALL `$ref` references recursively, producing a fully inlined spec.

### 5.2 Endpoint-per-Chunk Strategy

Each unique `path + method` combination produces one chunk:

| Path | Method | → Chunk |
|------|--------|---------|
| `/api/users` | GET | Chunk 1: List users |
| `/api/users` | POST | Chunk 2: Create user |
| `/api/users/{id}` | GET | Chunk 3: Get user by ID |
| `/api/users/{id}` | PUT | Chunk 4: Update user |
| `/api/users/{id}` | DELETE | Chunk 5: Delete user |

### 5.3 Schema Rendering

JSON Schema objects are converted to human-readable indented text:

```
UserCreate:
  email (string, required) - User's email address
  password (string, required) - Password, min 8 characters
  profile (object):
    first_name (string) - First name
    last_name (string) - Last name
    avatar_url (string, format: uri) - Profile picture URL
```

**Depth limit**: Schemas are rendered to a maximum depth of 3 to prevent excessively deep nested schemas from producing enormous chunks.

### 5.4 Chunk Content Structure

Each endpoint chunk contains:

```
[METHOD] /path/to/endpoint
Summary: Brief description
Description: Detailed description

Parameters:
  - name (in: query, type: string, required) - Description

Request Body (application/json):
  UserCreate:
    email (string, required)
    password (string, required)

Responses:
  200 - Success:
    UserResponse:
      id (string, format: uuid)
      email (string)
  400 - Bad Request:
    ErrorResponse:
      message (string)
      code (integer)

Security: bearerAuth
```

### 5.5 Format Detection

The parser determines YAML vs JSON format:
1. **By extension**: `.json` → JSON parser, `.yaml`/`.yml` → YAML parser
2. **By content inspection**: If extension is ambiguous, try JSON parse first, then YAML

---

## 6. Output Example

```python
{
    "content_with_weight": "POST /api/v1/documents/upload\nSummary: Upload a document for processing\nDescription: Uploads a document file to the knowledge base and initiates parsing.\n\nParameters:\n  - kb_id (in: query, type: string, required) - Knowledge base ID\n\nRequest Body (multipart/form-data):\n  file (string, format: binary, required) - Document file\n  parser_type (string) - Parser type override\n\nResponses:\n  200 - Document uploaded successfully:\n    id (string, format: uuid)\n    status (string) - Processing status\n  413 - File too large:\n    message (string)\n\nSecurity: bearerAuth",
    "content_ltks": ["post", "documents", "upload", "knowledge", "base", "parsing"],
    "docnm_kwd": "api-spec.yaml",
    "title_tks": ["upload", "document"],
    "page_num_int": [0]
}
```

---

## 7. Differences from Other Parsers

| Aspect | OpenAPI | Code | Naive |
|--------|---------|------|-------|
| Input format | YAML/JSON API specs | Source code | Multi-format |
| Chunk boundary | 1 endpoint = 1 chunk | 1 function = 1 chunk | Token limit |
| Schema resolution | Yes ($ref inlining) | N/A | N/A |
| Structure awareness | Paths, methods, schemas | AST nodes | None |
| LLM required | No | Yes (summaries) | No |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid YAML/JSON | Logs parse error, returns empty list |
| Unresolvable $ref | prance may error; logged and returned empty |
| No paths defined | Returns empty list |
| Very large spec (1000+ endpoints) | All endpoints processed; may be slow |
| Circular $ref references | prance handles with recursion limit |
| Mixed OpenAPI/non-OpenAPI content | Attempts to parse; may produce partial results |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `prance` | OpenAPI $ref resolution and validation |
| `yaml` / `json` | Format parsing |
| `rag/nlp/rag_tokenizer.py` | Text tokenization |
