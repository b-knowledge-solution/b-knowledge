# Advance-RAG (Python Worker)

Python 3.11 / FastAPI + Uvicorn / Peewee ORM / OpenSearch / RAGFlow-derived pipeline

## Commands

```bash
# Development (from project root, after npm run setup)
npm run dev:worker          # Waits for backend health, then starts executor

# Manual run (from project root, with .venv activated)
source .venv/bin/activate
cd advance-rag
python -m executor_wrapper  # Task executor with progress hooks

# Docker
docker compose -f docker/docker-compose.yml up task-executor
```

## Purpose

Core AI/ML worker that:
- Processes documents (PDF parsing, OCR, layout analysis)
- Performs text chunking, embedding, and indexing into OpenSearch
- Executes RAG retrieval and reranking
- Supports Graph RAG (knowledge graph construction + querying)
- Publishes progress to Redis pub/sub for SSE streaming to frontend

## Architecture

```
advance-rag/
├── config.py                  # Env-driven config (DB, Redis, S3, models)
├── executor_wrapper.py        # Entry point: progress hook + task executor
├── system_tenant.py           # System tenant initialization
├── pyproject.toml             # 108 dependencies
├── common/                    # Shared utilities (35+ modules)
│   ├── doc_store/             # DB connectors (Elasticsearch, OpenSearch, Infinity)
│   ├── settings.py            # Global settings
│   └── ...
├── db/                        # Peewee ORM models + services
│   ├── db_models.py           # Model definitions
│   └── services/              # DB service classes
├── rag/                       # Core RAG pipeline
│   ├── app/                   # Document parsers (book, email, laws, paper, etc.)
│   ├── flow/                  # Processing pipeline stages
│   │   ├── extractor/         # Content extraction
│   │   ├── splitter/          # Text chunking
│   │   ├── parser/            # Document parsing
│   │   └── tokenizer/         # Tokenization
│   ├── graphrag/              # Graph-based RAG (general + light modes)
│   ├── nlp/                   # Query processing, search, tokenizer
│   ├── llm/                   # LLM integrations + OCR
│   ├── svr/task_executor.py   # Main task execution engine
│   └── prompts/               # 50+ LLM prompt templates
├── deepdoc/                   # Pre-built document parsing models
├── api/                       # FastAPI endpoints (port 9380)
└── memory/                    # Cache management
```

## Key Patterns

### Integration Points
- **PostgreSQL:** Shared with Node.js backend (same DB)
- **Redis:** Task queue + progress pub/sub + cache
- **OpenSearch:** Vector store for embeddings + text search
- **S3 (RustFS/MinIO):** Document file storage
- **No direct communication with converter** — both use Redis independently

### Startup Sequence (executor_wrapper.py)
1. Wait for database readiness
2. Initialize DB tables (idempotent)
3. Ensure system tenant exists with default models
4. Install progress hook (Redis pub/sub notifications)
5. Start task executor loop

### Configuration
All via environment variables through `config.py`. Key groups:

| Category | Variables |
|----------|-----------|
| Database | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| Vector DB | `DOC_ENGINE=opensearch`, `VECTORDB_HOST`, `VECTORDB_PASSWORD` |
| Storage | `S3_HOST`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
| Models | `DEFAULT_EMBEDDING_MODEL`, `DEFAULT_CHAT_MODEL`, `DEFAULT_RERANK_MODEL` |
| Tenant | `SYSTEM_TENANT_ID=00000000-0000-0000-0000-000000000001` |

## Documentation Comments (Mandatory)

All code MUST follow the root `CLAUDE.md` comment conventions. Summary:

- **Google-style docstrings on every function, class, and method** — summary, `Args`, `Returns`, `Raises`
- **Inline comments** above control flow, ML/NLP logic, DB queries, Redis operations, pipeline stages
- **Parsers:** Document supported input formats, output structure, and failure modes
- **Flow components:** Document pipeline stage inputs/outputs and transformation logic
- **Services:** Document integration points (OpenSearch, Redis, S3) and retry/error behavior
- **Config:** Document environment variable purpose and valid value ranges

```python
def search_vectors(self, query_embedding: list[float], index: str, top_k: int = 10) -> list[SearchHit]:
    """Search OpenSearch index for nearest neighbors of the query embedding.

    Args:
        query_embedding: Dense vector from the embedding model.
        index: OpenSearch index name (typically the knowledge base ID).
        top_k: Maximum number of results to return.

    Returns:
        List of SearchHit with document ID, score, and chunk content.

    Raises:
        OpenSearchError: If the index does not exist or query fails.
    """
    # Use script_score with cosine similarity — OpenSearch kNN plugin requires this wrapper
    body = build_knn_query(query_embedding, top_k)

    # Execute search with a timeout to prevent blocking the task executor
    response = self.client.search(index=index, body=body, request_timeout=30)
    return parse_hits(response)
```

## Gotchas

- **Derived from RAGFlow:** This is an extracted/modified version of RAGFlow's core — patterns follow RAGFlow conventions, not the Node.js backend
- **Peewee ORM (not Knex):** Database models use Peewee, separate from the Node.js Knex models
- **Pre-cached models:** Docker image copies deepdoc, NLTK, Tika, tiktoken models during build — do not assume network access at runtime
- **System dependencies:** Requires `poppler-utils` (PDF), `tesseract-ocr` (OCR), JRE (Tika for .doc)
- **Single tenant mode:** Uses fixed `SYSTEM_TENANT_ID` for all operations
- **Heavy dependencies:** 108 Python packages — builds are slow

## Environment

Copy `advance-rag/.env.example` → `advance-rag/.env`
