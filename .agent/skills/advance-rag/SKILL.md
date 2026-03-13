---
name: b-knowledge-advance-rag
description: RAG pipeline development skill — enforces B-Knowledge advance-rag architecture for parsers, flow components, and services
---

# B-Knowledge Advance-RAG Development Skill

Use this skill when modifying or extending the `advance-rag/` Python workspace.

## Stack

- Python 3.10+, async/await, Peewee ORM, Pydantic 2
- loguru for logging, type hints throughout
- Pipeline: Parser → Splitter → Extractor → Tokenizer → Vector DB
- Storage: MinIO/S3/GCS/Azure via factory pattern

## Architecture

```
advance-rag/
├── common/                    # Shared utilities (encoding, crypto, file, string, etc.)
│   └── doc_store/             # Vector DB connections (ES, Infinity, OceanBase)
├── config.py                  # Runtime config loader
├── db/
│   ├── db_models.py           # Peewee ORM model definitions
│   ├── db_utils.py            # DB connection utilities
│   ├── services/              # Business logic layer (one file per domain)
│   │   ├── document_service.py
│   │   ├── file_service.py
│   │   ├── knowledgebase_service.py
│   │   ├── task_service.py
│   │   └── ...
│   └── joint_services/        # Cross-domain service compositions
├── deepdoc/
│   ├── parser/                # Document format parsers (PDF, DOCX, Excel, etc.)
│   │   ├── pdf_parser.py
│   │   ├── docx_parser.py
│   │   ├── excel_parser.py
│   │   └── ...
│   └── vision/                # OCR and layout recognition (PaddleOCR, ONNX)
├── rag/
│   ├── app/                   # Document-type-specific processors
│   │   ├── naive.py           # Simple text extraction
│   │   ├── book.py            # Book parsing
│   │   ├── paper.py           # Academic paper parsing
│   │   └── ...
│   ├── flow/                  # Pipeline flow components (async)
│   │   ├── base.py            # ProcessBase — async foundation class
│   │   ├── parser/            # Parser component
│   │   ├── splitter/          # Text chunking component
│   │   ├── extractor/         # Metadata/TOC extraction via LLM
│   │   ├── tokenizer/         # Token counting component
│   │   └── ...
│   ├── graphrag/              # Graph-based RAG (entity extraction, community detection)
│   ├── nlp/                   # NLP utilities (tokenization, query processing, search)
│   ├── utils/                 # Storage factory, cloud connections, helpers
│   └── settings.py            # Global RAG settings
├── memory/                    # Long-term memory systems
├── executor_wrapper.py        # Entry point: wraps task_executor with Redis progress pub/sub
└── pyproject.toml             # Dependencies
```

---

## Conventions

### Code Style
- Type hints on all function signatures and return types (Python 3.10+ style: `dict[str, Any]`, `list[str]`)
- Docstrings on all public functions and classes
- `loguru` logger — never stdlib `logging`
- `async`/`await` for all I/O-bound operations
- Pydantic models for data crossing boundaries (API, config, schemas)
- Peewee ORM for all database operations

### Module Organization
- Every package has `__init__.py` with public exports
- Service methods are instance methods or `@staticmethod`
- Flow components inherit from `ProcessBase`
- Storage backends accessed via factory

---

## Patterns & Code Examples

### DB Service Pattern (`db/services/`)

Each service file handles one domain:

```python
from db.db_models import DomainModel
from loguru import logger


class DomainService:
    """Service for DomainModel CRUD operations."""

    @staticmethod
    def get_by_id(model_id: str) -> DomainModel | None:
        """
        Get a record by ID.
        @param model_id: UUID of the record.
        @returns: Model instance or None.
        """
        return DomainModel.select().where(
            DomainModel.id == model_id
        ).first()

    @staticmethod
    def list_by_tenant(tenant_id: str) -> list[DomainModel]:
        """
        List records for a tenant.
        @param tenant_id: Tenant UUID.
        @returns: List of model instances.
        """
        return list(
            DomainModel.select().where(
                DomainModel.tenant_id == tenant_id
            ).order_by(DomainModel.create_time.desc())
        )

    @staticmethod
    def create(data: dict) -> DomainModel:
        """
        Create a new record.
        @param data: Dictionary of field values.
        @returns: Created model instance.
        """
        return DomainModel.create(**data)

    @staticmethod
    def delete_by_id(model_id: str) -> int:
        """
        Delete a record by ID.
        @param model_id: UUID of the record.
        @returns: Number of rows deleted.
        """
        return DomainModel.delete().where(
            DomainModel.id == model_id
        ).execute()
```

### Parser App Pattern (`rag/app/`)

Each document type processor implements a `chunk()` function:

```python
from loguru import logger


def chunk(
    filename: str,
    binary: bytes,
    lang: str = "English",
    callback=None,
    **kwargs,
) -> list[dict]:
    """
    Parse and chunk a document into retrievable segments.
    @param filename: Original file name (used for format detection).
    @param binary: File content as bytes.
    @param lang: Document language for NLP processing.
    @param callback: Progress callback function (receives float 0.0-1.0).
    @returns: List of chunk dicts, each with 'content_with_weight' text and metadata.
    """
    logger.info(f"Parsing {filename} with lang={lang}")

    # 1. Parse the document into raw sections
    sections = _parse_document(binary, filename)

    # 2. Split sections into chunks
    chunks = _split_into_chunks(sections)

    # 3. Report progress
    if callback:
        callback(1.0)

    return chunks
```

### Flow Component Pattern (`rag/flow/`)

Flow components extend `ProcessBase` for async pipeline processing:

```python
from rag.flow.base import ProcessBase, ProcessParamBase
from pydantic import BaseModel, Field
from loguru import logger


class MyProcessorParam(ProcessParamBase):
    """Configuration for MyProcessor."""
    max_tokens: int = Field(default=512, description="Maximum tokens per chunk")
    overlap: int = Field(default=50, description="Token overlap between chunks")


class MyProcessor(ProcessBase):
    """
    Pipeline component for processing document chunks.
    @description Applies custom processing logic to chunks in the RAG pipeline.
    """

    async def process(self, input_data: list[dict], params: MyProcessorParam) -> list[dict]:
        """
        Process input chunks through this pipeline step.
        @param input_data: Chunks from the previous pipeline step.
        @param params: Processing configuration.
        @returns: Processed chunks for the next pipeline step.
        """
        logger.info(f"Processing {len(input_data)} chunks with max_tokens={params.max_tokens}")

        results = []
        for chunk in input_data:
            # Apply processing logic
            processed = self._transform(chunk, params)
            results.append(processed)

        return results

    def _transform(self, chunk: dict, params: MyProcessorParam) -> dict:
        """
        Transform a single chunk.
        @param chunk: Input chunk dictionary.
        @param params: Processing parameters.
        @returns: Transformed chunk.
        """
        # Implementation
        return chunk
```

### Storage Factory Pattern

Access cloud storage through the factory — never instantiate connections directly:

```python
from rag.utils.storage_factory import get_storage

# Get storage instance based on config (S3, GCS, Azure, MinIO)
storage = get_storage()

# Upload
storage.put(bucket="documents", key="path/to/file.pdf", data=binary_data)

# Download
data = storage.get(bucket="documents", key="path/to/file.pdf")

# Check existence
exists = storage.obj_exist(bucket="documents", key="path/to/file.pdf")
```

### Peewee Model Pattern (`db/db_models.py`)

```python
import peewee
from db.db_utils import get_database


class DomainModel(peewee.Model):
    """Peewee model for the domain table."""

    id = peewee.CharField(max_length=64, primary_key=True)
    name = peewee.CharField(max_length=255)
    tenant_id = peewee.CharField(max_length=64)
    create_time = peewee.BigIntegerField()
    update_time = peewee.BigIntegerField()

    class Meta:
        database = get_database()
        table_name = "domain"
```

---

## Adding a New Parser

1. Create `rag/app/<parser_name>.py` implementing `chunk(filename, binary, lang, callback, **kwargs)`
2. Register the parser by its `parser_id` — this ID is referenced from dataset configuration
3. If the document format is new, add a deepdoc parser in `deepdoc/parser/<format>_parser.py`
4. Test with representative documents of the target format

## Adding a New Flow Component

1. Create directory `rag/flow/<component_name>/` with `__init__.py` and `schema.py`
2. Extend `ProcessBase` in `__init__.py`, implement `async process()`
3. Create `ProcessParamBase` subclass in `schema.py` for configuration
4. Wire into the pipeline in `rag/flow/pipeline.py`

## Adding a New DB Service

1. Create `db/services/<domain>_service.py` with static methods
2. Import the Peewee model from `db/db_models.py`
3. Expose via `db/services/__init__.py`

---

## Checklist for Changes

1. [ ] Type hints on all functions (use `dict[str, Any]`, `list[str]`, `T | None` syntax)
2. [ ] Docstrings with `@param` / `@returns` / `@description`
3. [ ] Use `loguru` logger for all logging
4. [ ] Pydantic models for any data structures crossing boundaries
5. [ ] Peewee ORM for all database operations (never raw SQL unless ORM insufficient)
6. [ ] `async`/`await` for I/O-bound operations
7. [ ] Follow existing parser/flow/service patterns
8. [ ] Storage via factory (`get_storage()`), never direct instantiation
9. [ ] Update `pyproject.toml` if new dependencies added
10. [ ] Test with representative data

## Key Files Reference

- `advance-rag/executor_wrapper.py` — Task execution entry point
- `advance-rag/config.py` — Runtime configuration
- `advance-rag/conf/service_conf.yaml` — Default service config
- `advance-rag/db/db_models.py` — All Peewee model definitions
- `advance-rag/db/services/` — Business logic services
- `advance-rag/rag/flow/base.py` — ProcessBase async foundation
- `advance-rag/rag/app/` — Document type parsers
- `advance-rag/rag/utils/storage_factory.py` — Cloud storage factory
- `advance-rag/deepdoc/parser/` — Format-specific document parsers
- `advance-rag/common/` — Shared utility modules
- `advance-rag/pyproject.toml` — Dependencies and project config
