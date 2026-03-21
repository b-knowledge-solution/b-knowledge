# Database Design: Chat & Search Tables

## Chat Tables ER Diagram

```mermaid
erDiagram
    chat_assistants {
        uuid id PK
        uuid tenant_id FK
        varchar name
        text description
        varchar avatar
        uuid llm_id FK "tenant_llm reference"
        jsonb prompt_config "system_prompt, temperature, top_p, max_tokens"
        text kb_ids "comma-separated knowledgebase IDs"
        varchar status "active | inactive"
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    chat_sessions {
        uuid id PK
        uuid assistant_id FK
        uuid user_id FK
        varchar name
        timestamp created_at
        timestamp updated_at
    }

    chat_messages {
        uuid id PK
        uuid session_id FK
        varchar role "user | assistant | system"
        text content
        jsonb reference "source chunks, scores, metadata"
        varchar feedback "good | bad | null"
        int token_count
        int duration_ms
        timestamp created_at
    }

    chat_files {
        uuid id PK
        uuid user_id FK
        varchar name
        varchar s3_key
        bigint size
        varchar type
        timestamp created_at
    }

    chat_assistant_access {
        uuid id PK
        uuid assistant_id FK
        varchar grantee_type "user | team"
        uuid grantee_id
        varchar permission "view | use | manage"
    }

    chat_embed_tokens {
        uuid id PK
        uuid assistant_id FK
        varchar token UK
        varchar name
        jsonb config "theme, allowed_origins"
        boolean is_active
        timestamp created_at
    }

    chat_assistants ||--o{ chat_sessions : "hosts"
    chat_sessions ||--o{ chat_messages : "contains"
    chat_assistants ||--o{ chat_assistant_access : "grants"
    chat_assistants ||--o{ chat_embed_tokens : "embeddable via"
```

## Search Tables ER Diagram

```mermaid
erDiagram
    search_apps {
        uuid id PK
        uuid tenant_id FK
        varchar name
        text description
        text dataset_ids "linked knowledgebase IDs"
        jsonb search_config "similarity_threshold, top_k, rerank, weights"
        varchar status "active | inactive"
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    search_app_access {
        uuid id PK
        uuid search_app_id FK
        varchar grantee_type "user | team"
        uuid grantee_id
        varchar permission "view | use | manage"
    }

    search_embed_tokens {
        uuid id PK
        uuid search_app_id FK
        varchar token UK
        varchar name
        jsonb config "theme, allowed_origins"
        boolean is_active
        timestamp created_at
    }

    search_apps ||--o{ search_app_access : "grants"
    search_apps ||--o{ search_embed_tokens : "embeddable via"
```

## History Tables ER Diagram

```mermaid
erDiagram
    history_chat_sessions {
        uuid id PK
        uuid original_session_id FK
        uuid assistant_id FK
        uuid user_id FK
        varchar assistant_name
        varchar session_name
        timestamp original_created_at
        timestamp archived_at
    }

    history_chat_messages {
        uuid id PK
        uuid session_id FK
        varchar role
        text content
        jsonb reference
        tsvector content_tsv "full-text search index"
        timestamp created_at
    }

    history_search_sessions {
        uuid id PK
        uuid search_app_id FK
        uuid user_id FK
        varchar search_app_name
        timestamp created_at
    }

    history_search_records {
        uuid id PK
        uuid session_id FK
        text query
        jsonb results "ranked results with scores"
        tsvector query_tsv "full-text search index"
        int result_count
        int duration_ms
        timestamp created_at
    }

    history_chat_sessions ||--o{ history_chat_messages : "contains"
    history_search_sessions ||--o{ history_search_records : "contains"
```

## Feedback & Analytics

```mermaid
erDiagram
    answer_feedback {
        uuid id PK
        uuid message_id FK
        uuid user_id FK
        varchar rating "good | bad"
        text comment
        timestamp created_at
    }

    query_log {
        uuid id PK
        uuid tenant_id FK
        varchar source "chat | search | api"
        uuid source_id "assistant_id or search_app_id"
        text query
        int result_count
        int duration_ms
        uuid user_id FK
        varchar ip_address
        timestamp created_at
    }
```

## Table Descriptions

### Chat Assistants

A chat assistant is an AI conversation agent configured with an LLM model, system prompt, and linked knowledge bases. The `prompt_config` JSONB stores the system prompt template, temperature, top_p, max_tokens, and other generation parameters. `kb_ids` links the assistant to knowledge bases for RAG retrieval.

### Chat Sessions & Messages

Sessions group messages into conversations. Each message records the role (user/assistant/system), content, and source references from RAG. The `reference` JSONB stores retrieved chunks with relevance scores and document metadata for citation display.

### Chat Files

User-uploaded files within chat context (e.g., images, documents for analysis). Stored in RustFS with S3 keys for retrieval.

### Access Control (chat_assistant_access, search_app_access)

ABAC permission grants follow the shared grantee pattern. Both user-level and team-level grants are supported. Permission levels: `view` (see metadata), `use` (interact), `manage` (edit config, grant access).

### Embed Tokens (chat_embed_tokens, search_embed_tokens)

Enable embedding chat or search widgets in external websites. Each token has a unique string for URL-based authentication, optional origin restrictions, and theme configuration. Tokens can be deactivated without deletion.

### History Tables

Archived sessions and messages for long-term retention and analytics. History tables include `tsvector` columns for PostgreSQL full-text search, enabling users to search across their conversation and query history.

### answer_feedback

Detailed feedback on individual AI responses, beyond the inline good/bad toggle on messages. Supports free-text comments for qualitative feedback collection.

### query_log

Centralized query analytics across chat and search. Tracks query volume, latency, and result counts per source for monitoring and optimization.

## Indexing Strategy

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `chat_sessions` | `user_id, updated_at` | Composite | User's recent conversations |
| `chat_messages` | `session_id, created_at` | Composite | Message timeline |
| `chat_assistant_access` | `grantee_type, grantee_id` | Composite | Permission lookup |
| `history_chat_messages` | `content_tsv` | GIN | Full-text search on history |
| `history_search_records` | `query_tsv` | GIN | Full-text search on queries |
| `query_log` | `tenant_id, created_at` | Composite | Analytics time range |
| `query_log` | `source, source_id` | Composite | Per-app analytics |
| `chat_embed_tokens` | `token` | Unique | Token authentication lookup |
