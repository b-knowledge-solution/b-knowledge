# Support Tables ER Diagram

## Overview

Support tables provide glossary management, LLM provider configuration, data connectors, and tenant multi-tenancy for the B-Knowledge platform.

## ER Diagram

```mermaid
erDiagram
    tenant {
        uuid id PK
        string name
        timestamp created_at
        timestamp updated_at
    }

    tenant_langfuse {
        uuid id PK
        uuid tenant_id FK
        string host
        string public_key
        string secret_key
        boolean enabled
        timestamp created_at
    }

    glossary_tasks {
        uuid id PK
        string name_en
        string name_vi
        string name_ja
        text description
        string status
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    glossary_keywords {
        uuid id PK
        uuid task_id FK
        string keyword
        text description
        timestamp created_at
    }

    model_provider {
        uuid id PK
        uuid tenant_id FK
        string factory_name
        string model_name
        enum model_type "chat|embedding|rerank|speech2text|tts|image2text"
        text api_key
        string api_base
        string status
        jsonb config
        timestamp created_at
        timestamp updated_at
    }

    llm_factories {
        uuid id PK
        string name
        string logo
        jsonb tags
        string status
        timestamp created_at
    }

    llm {
        uuid id PK
        uuid factory_id FK
        string model_name
        enum model_type "chat|embedding|rerank|speech2text|tts|image2text"
        integer max_tokens
        jsonb tags
        string status
    }

    tenant_llm {
        uuid id PK
        uuid tenant_id FK
        uuid llm_factory_id FK
        string model_name
        enum model_type "chat|embedding|rerank|speech2text|tts|image2text"
        text api_key
        string api_base
        boolean is_default
        timestamp created_at
    }

    connector {
        uuid id PK
        string name
        string type
        jsonb config
        uuid kb_id FK
        string schedule
        string status
        timestamp created_at
        timestamp updated_at
    }

    sync_log {
        uuid id PK
        uuid connector_id FK
        string status
        jsonb details
        timestamp started_at
        timestamp completed_at
    }

    tenant ||--o{ tenant_langfuse : "has"
    tenant ||--o{ model_provider : "configures"
    tenant ||--o{ tenant_llm : "provisions"
    glossary_tasks ||--o{ glossary_keywords : "contains"
    llm_factories ||--o{ llm : "provides"
    llm_factories ||--o{ tenant_llm : "sourced from"
    connector ||--o{ sync_log : "produces"
```

## LLM Model Type Enum

```mermaid
graph LR
    MT[model_type] --> C[chat]
    MT --> E[embedding]
    MT --> R[rerank]
    MT --> S[speech2text]
    MT --> T[tts]
    MT --> I[image2text]
```

| Value | Purpose | Example Models |
|-------|---------|----------------|
| `chat` | Conversational LLM | GPT-4o, Claude 3.5, Qwen |
| `embedding` | Text to vector | text-embedding-3-large, BGE-M3 |
| `rerank` | Re-rank search results | BGE-Reranker, Cohere Rerank |
| `speech2text` | Audio transcription | Whisper |
| `tts` | Text to speech | Azure TTS, OpenAI TTS |
| `image2text` | Vision / OCR | GPT-4o Vision, Qwen-VL |

## Table Ownership

| Table | Managed By | Migrations |
|-------|-----------|------------|
| `glossary_tasks` | Knex (Backend) | Knex migrations |
| `glossary_keywords` | Knex (Backend) | Knex migrations |
| `model_provider` | Knex (Backend) | Knex migrations |
| `llm_factories` | Peewee (RAG Worker) | Knex migrations |
| `llm` | Peewee (RAG Worker) | Knex migrations |
| `tenant_llm` | Peewee (RAG Worker) | Knex migrations |
| `connector` | Knex (Backend) | Knex migrations |
| `sync_log` | Knex (Backend) | Knex migrations |
| `tenant` | Knex (Backend) | Knex migrations |
| `tenant_langfuse` | Knex (Backend) | Knex migrations |

> **Convention:** All schema migrations go through Knex, even for Peewee-managed tables. The Python RAG worker only reads/writes data via its ORM and never modifies the schema.

## Connector Types

| Type | Config Fields | Schedule |
|------|--------------|----------|
| `web_crawl` | `url`, `depth`, `selectors` | Cron expression |
| `s3` | `bucket`, `prefix`, `credentials` | Cron expression |
| `database` | `connection_string`, `query` | Cron expression |
| `api` | `endpoint`, `headers`, `auth` | Cron expression |

## Sync Log Status Flow

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> running : Connector triggered
    running --> completed : All records synced
    running --> partial : Some records failed
    running --> failed : Fatal error
    completed --> [*]
    partial --> [*]
    failed --> [*]
```
