# Chat Feature -- Architecture & Detail Design

> **Version:** 1.0
> **Date:** 2026-03-15
> **Status:** Current implementation
> **Audience:** Developers, architects, QA engineers

---

## 1. Executive Summary

The Chat feature in B-Knowledge provides a multi-tenant, RAG-augmented conversational interface. Users interact with AI assistants that retrieve knowledge from curated datasets (knowledge bases) stored in OpenSearch, then generate answers via any OpenAI-compatible LLM provider.

### Business Logic Differences from RAGFlow

| Aspect | RAGFlow | B-Knowledge |
|--------|---------|-------------|
| **Data ownership** | Single-tenant, dialog owned by `tenant_id` | Multi-tenant with RBAC (owner, public, user/team grants) |
| **Conversation storage** | All messages and references in a single JSON column | Normalized: separate `chat_sessions` and `chat_messages` tables |
| **LLM integration** | Built-in LLM factory with 50+ provider adapters | Any OpenAI-compatible API via `model_providers` table (OpenAI SDK) |
| **Pipeline location** | Python async generator in `dialog_service.py` | TypeScript in `chat-conversation.service.ts` with identical pipeline steps |
| **Embedding** | Embeddable via shared `/chat/share` URL + API token | Dual-mode embed widget (internal session auth + external API key auth) |
| **OpenAI API compat** | SDK endpoints at `/api/v1/chats` | Full OpenAI-format API at `/api/v1/chat/completions` with Bearer token |
| **File attachments** | Not supported in chat | Image/PDF uploads to S3 with multimodal LLM support |
| **Observability** | Internal logging | Langfuse tracing integration per pipeline step |
| **Access control** | Owner only (tenant-based) | RBAC with admin, owner, public, user/team grant levels |

---

## 2. RAGFlow Chat Architecture (Reference)

### 2.1 Data Model

```mermaid
erDiagram
    Dialog {
        string id PK "VARCHAR(32)"
        string tenant_id FK "VARCHAR(32)"
        string name "VARCHAR(255)"
        text description
        text icon "base64 string"
        string language "English|Chinese"
        string llm_id "VARCHAR(128)"
        json llm_setting "temperature, top_p, etc."
        string prompt_type "simple|advanced"
        json prompt_config "system, prologue, parameters, empty_response"
        json meta_data_filter
        float similarity_threshold "default 0.2"
        float vector_similarity_weight "default 0.3"
        int top_n "default 6"
        int top_k "default 1024"
        string do_refer "0|1"
        string rerank_id "VARCHAR(128)"
        json kb_ids "array of knowledge base IDs"
        string status "0=wasted, 1=valid"
        datetime create_time
        datetime update_time
    }

    Conversation {
        string id PK "VARCHAR(32)"
        string dialog_id FK "VARCHAR(32)"
        string name "VARCHAR(255)"
        json message "array of {role, content, id}"
        json reference "array of {chunks, doc_aggs}"
        string user_id "VARCHAR(255)"
        datetime create_time
        datetime update_time
    }

    APIToken {
        string tenant_id PK "VARCHAR(32)"
        string token PK "VARCHAR(255)"
        string dialog_id "VARCHAR(32)"
        string source "none|agent|dialog"
        string beta "VARCHAR(255)"
    }

    Dialog ||--o{ Conversation : "has"
    Dialog ||--o{ APIToken : "referenced by"
```

### 2.2 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/dialog/set` | Login | Create or update a dialog |
| `GET` | `/dialog/get?dialog_id=` | Login | Get dialog by ID |
| `GET` | `/dialog/list` | Login | List all dialogs for tenant |
| `POST` | `/dialog/next` | Login | Paginated dialog list with search |
| `POST` | `/dialog/rm` | Login | Soft-delete dialogs |
| `POST` | `/conversation/set` | Login | Create or update conversation |
| `GET` | `/conversation/get?conversation_id=` | Login | Get conversation with messages |
| `GET` | `/conversation/list?dialog_id=` | Login | List conversations for a dialog |
| `POST` | `/conversation/rm` | Login | Delete conversations |
| `POST` | `/conversation/completion` | Login | SSE streaming chat completion |
| `POST` | `/conversation/delete_msg` | Login | Delete a message pair |
| `POST` | `/conversation/thumbup` | Login | Feedback on a message |
| `POST` | `/conversation/tts` | Login | Text-to-speech |
| `POST` | `/conversation/sequence2txt` | Login | Speech-to-text |
| **SDK (token-based)** | | | |
| `POST` | `/chats` | Token | Create chat assistant |
| `PUT` | `/chats/<chat_id>` | Token | Update chat assistant |
| `DELETE` | `/chats` | Token | Delete chat assistants |
| `GET` | `/chats` | Token | List chat assistants |
| `POST` | `/chats/<chat_id>/sessions` | Token | Create session |
| `PUT` | `/chats/<chat_id>/sessions/<session_id>` | Token | Update session |
| `GET` | `/chats/<chat_id>/sessions` | Token | List sessions |
| `DELETE` | `/chats/<chat_id>/sessions` | Token | Delete sessions |
| `POST` | `/chats/<chat_id>/completions` | Token | SSE chat completion |

### 2.3 Chat Completion Pipeline

```mermaid
sequenceDiagram
    participant Client
    participant API as conversation_app.py
    participant Service as dialog_service.py
    participant ES as OpenSearch
    participant LLM as LLM Bundle

    Client->>API: POST /conversation/completion<br/>{conversation_id, messages}
    API->>API: Load conversation & dialog
    API->>Service: async_chat(dialog, messages)

    Service->>Service: Refine multi-turn question
    Service->>ES: Hybrid search (BM25 + vector)<br/>across kb_ids[]
    ES-->>Service: Retrieved chunks
    Service->>Service: Rerank chunks (if rerank_id set)
    Service->>Service: Build prompt with {knowledge} context
    Service->>LLM: Stream chat completion

    loop Token by token
        LLM-->>Service: Delta token
        Service-->>API: yield answer dict
        API-->>Client: SSE data: {code:0, data:{answer, reference}}
    end

    API->>API: ConversationService.update_by_id<br/>(persist messages + references)
    API-->>Client: SSE data: {code:0, data:true}
```

### 2.4 Configuration Model

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `system` | string | `""` | System prompt template (supports `{knowledge}`, `{variable}` placeholders) |
| `prologue` | string | `"Hi! I'm your assistant..."` | Welcome message on new conversation |
| `parameters` | array | `[]` | Variable definitions: `[{key, optional}]` |
| `empty_response` | string | `"Sorry! No relevant..."` | Response when no KB results found |
| `quote` | boolean | `true` | Insert citation references into answer |
| `tts` | boolean | `false` | Enable text-to-speech |
| `refine_multiturn` | boolean | `true` | Synthesize multi-turn into single question |
| `temperature` | float | `0.1` | LLM sampling temperature |
| `top_p` | float | `0.3` | Top-p nucleus sampling |
| `frequency_penalty` | float | `0.7` | Frequency penalty |
| `presence_penalty` | float | `0.4` | Presence penalty |
| `max_tokens` | int | `512` | Maximum generation tokens |
| `similarity_threshold` | float | `0.2` | Minimum vector similarity score |
| `vector_similarity_weight` | float | `0.3` | Weight for vector vs keyword (0=keyword, 1=vector) |
| `top_n` | int | `6` | Number of chunks to retrieve per KB |
| `top_k` | int | `1024` | BM25 candidate pool size |

### 2.5 Sharing & Embedding

RAGFlow shares dialogs via API tokens stored in the `api_token` table. The `beta` column holds a secondary token used for embed iframe access. The `/conversation/getsse/<dialog_id>` endpoint validates the Bearer token and returns dialog config for the embedded chat widget.

### 2.6 Feature List

| Feature | Supported |
|---------|-----------|
| Multi-turn conversation refinement | Yes |
| Hybrid search (BM25 + vector) | Yes |
| Reranking (model-based) | Yes |
| Citation insertion | Yes |
| Conversation persistence (JSON blob) | Yes |
| Thumbs up/down feedback | Yes |
| Message deletion | Yes |
| Text-to-speech | Yes |
| Speech-to-text | Yes |
| Knowledge graph retrieval | Yes |
| Web search (Tavily) | Yes |
| Metadata filtering | Yes |
| SDK API (token-based) | Yes |
| Embeddable widget | Yes (iframe) |
| Per-message LLM override | Yes |
| File attachments in chat | No |
| RBAC access control | No (tenant-only) |
| OpenAI-compatible API format | No |

---

## 3. B-Knowledge Chat Architecture (Current)

### 3.1 Data Model

```mermaid
erDiagram
    users {
        text id PK "gen_random_uuid()"
        text email UK
        text display_name
        text role "user|admin|superadmin"
        text permissions "JSON array"
        text department
        text job_title
        text mobile_phone
        text created_by
        text updated_by
        timestamp created_at
        timestamp updated_at
    }

    teams {
        text id PK "gen_random_uuid()"
        text name
        text project_name
        text description
        text created_by
        text updated_by
        timestamp created_at
        timestamp updated_at
    }

    user_teams {
        text user_id PK_FK
        text team_id PK_FK
        text role "member|lead"
        timestamp joined_at
    }

    chat_dialogs {
        uuid id PK "gen_random_uuid()"
        varchar_128 name "NOT NULL"
        text description
        varchar_256 icon
        jsonb kb_ids "UUID array, default []"
        varchar_128 llm_id
        jsonb prompt_config "default {}"
        boolean is_public "default false"
        text created_by FK
        text updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    chat_dialog_access {
        uuid id PK "gen_random_uuid()"
        uuid dialog_id FK "NOT NULL, CASCADE"
        varchar_16 entity_type "user|team, CHECK"
        uuid entity_id "NOT NULL"
        text created_by FK
        timestamp created_at
    }

    chat_sessions {
        text id PK "gen_random_uuid()"
        text user_id FK "NOT NULL, CASCADE"
        text title "NOT NULL"
        uuid dialog_id
        text created_by
        text updated_by
        timestamp created_at
        timestamp updated_at
    }

    chat_messages {
        text id PK "gen_random_uuid()"
        text session_id FK "NOT NULL, CASCADE"
        text role "user|assistant"
        text content "NOT NULL"
        jsonb citations "nullable"
        varchar_64 message_id "nullable"
        text created_by
        text updated_by
        timestamp timestamp
    }

    chat_embed_tokens {
        uuid id PK "gen_random_uuid()"
        uuid dialog_id FK "NOT NULL, CASCADE"
        varchar_64 token UK "NOT NULL"
        varchar_128 name "NOT NULL"
        boolean is_active "default true"
        text created_by FK
        timestamp created_at
        timestamp expires_at "nullable"
    }

    chat_files {
        uuid id PK "gen_random_uuid()"
        uuid session_id FK "NOT NULL, CASCADE"
        text message_id "nullable"
        varchar_256 original_name "NOT NULL"
        varchar_128 mime_type "NOT NULL"
        bigint size "NOT NULL"
        varchar_1024 s3_key "NOT NULL"
        varchar_256 s3_bucket "NOT NULL"
        text url "nullable"
        text uploaded_by FK
        timestamp created_at
        timestamp expires_at "nullable"
    }

    users ||--o{ chat_dialogs : "creates"
    users ||--o{ chat_sessions : "owns"
    users ||--o{ user_teams : "belongs to"
    teams ||--o{ user_teams : "has"
    chat_dialogs ||--o{ chat_dialog_access : "has access entries"
    chat_dialogs ||--o{ chat_sessions : "has conversations"
    chat_dialogs ||--o{ chat_embed_tokens : "has embed tokens"
    chat_sessions ||--o{ chat_messages : "contains"
    chat_sessions ||--o{ chat_files : "has attachments"
    users ||--o{ chat_embed_tokens : "creates"
    users ||--o{ chat_files : "uploads"
```

**Database indexes:**

| Table | Index | Type |
|-------|-------|------|
| `chat_dialog_access` | `idx_chat_dialog_access_dialog_id` | B-tree on `dialog_id` |
| `chat_dialog_access` | `idx_chat_dialog_access_entity` | Composite on `(entity_type, entity_id)` |
| `chat_dialog_access` | Unique | `(dialog_id, entity_type, entity_id)` |
| `chat_embed_tokens` | `idx_embed_tokens_dialog` | B-tree on `dialog_id` |
| `chat_embed_tokens` | `idx_embed_tokens_token` | B-tree on `token` |
| `chat_files` | `idx_chat_files_session` | B-tree on `session_id` |
| `chat_files` | `idx_chat_files_expires` | B-tree on `expires_at` |

### 3.2 API Endpoints

#### Dialog Management (Admin: `manage_users` permission)

| Method | Endpoint | Validation Schema | Description |
|--------|----------|-------------------|-------------|
| `POST` | `/api/chat/dialogs` | `createDialogSchema` | Create dialog |
| `GET` | `/api/chat/dialogs` | `listDialogsQuerySchema` | List dialogs (RBAC-filtered, paginated) |
| `GET` | `/api/chat/dialogs/:id` | `dialogIdParamSchema` | Get dialog by ID |
| `PUT` | `/api/chat/dialogs/:id` | `updateDialogSchema` + `dialogIdParamSchema` | Update dialog |
| `DELETE` | `/api/chat/dialogs/:id` | `dialogIdParamSchema` | Delete dialog |
| `GET` | `/api/chat/dialogs/:id/access` | `dialogIdParamSchema` | Get access entries |
| `PUT` | `/api/chat/dialogs/:id/access` | `dialogAccessSchema` + `dialogIdParamSchema` | Set access entries |

#### Conversation Management (Authenticated users)

| Method | Endpoint | Validation Schema | Description |
|--------|----------|-------------------|-------------|
| `POST` | `/api/chat/conversations` | `createConversationSchema` | Create conversation |
| `GET` | `/api/chat/conversations/:id` | `conversationIdParamSchema` | Get conversation + messages |
| `GET` | `/api/chat/conversations` | Query: `dialogId` | List conversations for dialog |
| `PATCH` | `/api/chat/conversations/:id` | `renameConversationSchema` | Rename conversation |
| `DELETE` | `/api/chat/conversations` | `deleteConversationsSchema` | Bulk delete conversations |
| `DELETE` | `/api/chat/conversations/:id/messages/:msgId` | `deleteMessageParamsSchema` | Delete a message |
| `POST` | `/api/chat/conversations/:id/completion` | `chatCompletionSchema` | SSE streaming chat |
| `POST` | `/api/chat/conversations/:id/feedback` | `feedbackSchema` | Thumbs up/down |
| `POST` | `/api/chat/tts` | `ttsSchema` | Text-to-speech |

#### File Upload (Authenticated users)

| Method | Endpoint | Validation | Description |
|--------|----------|------------|-------------|
| `POST` | `/api/chat/conversations/:id/files` | `fileUploadParamsSchema` + multer (max 5) | Upload files |
| `GET` | `/api/chat/files/:fileId/content` | `fileContentParamsSchema` | Stream file content |

#### Embed Token Management (Admin: `manage_users` permission)

| Method | Endpoint | Validation | Description |
|--------|----------|------------|-------------|
| `POST` | `/api/chat/dialogs/:id/embed-tokens` | `createEmbedTokenSchema` | Create token |
| `GET` | `/api/chat/dialogs/:id/embed-tokens` | `embedDialogIdParamSchema` | List tokens (masked) |
| `DELETE` | `/api/chat/embed-tokens/:tokenId` | `embedTokenIdParamSchema` | Revoke token |

#### Public Embed Widget (Token-based, no session auth)

| Method | Endpoint | Validation | Description |
|--------|----------|------------|-------------|
| `GET` | `/api/chat/embed/:token/info` | `embedTokenParamSchema` | Get dialog info |
| `POST` | `/api/chat/embed/:token/sessions` | `embedCreateSessionSchema` | Create anonymous session |
| `POST` | `/api/chat/embed/:token/completions` | `embedCompletionSchema` | SSE streaming completion |

#### OpenAI-Compatible API (Bearer token auth)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/chat/completions` | Bearer token | Chat completion (stream/non-stream) |
| `GET` | `/api/v1/models` | Public | List available models |

### 3.3 RAG Pipeline (14-Step `streamChat`)

The `ChatConversationService.streamChat()` method implements the full RAG pipeline migrated from RAGFlow's `dialog_service.py::async_chat()`.

#### 3.3.1 Sequence Diagram

```mermaid
sequenceDiagram
    participant Client
    participant Controller as ChatConversationController
    participant Service as ChatConversationService
    participant DB as PostgreSQL
    participant LLM as LLM Client Service
    participant OS as OpenSearch
    participant S3 as RustFS (S3)
    participant Web as Tavily Web Search
    participant LF as Langfuse

    Client->>Controller: POST /conversations/:id/completion<br/>{content, dialog_id, variables, file_ids}
    Controller->>Service: streamChat(id, content, dialogId, userId, res, overrides)

    Service->>Service: Set SSE headers<br/>Content-Type: text/event-stream
    Service->>LF: Create trace (fire-and-forget)

    Note over Service: Step 1: Store user message
    Service->>DB: INSERT chat_messages (role=user)
    Service-->>Client: SSE {status: "refining_question"}

    Note over Service: Step 2: Load dialog config
    Service->>DB: SELECT chat_dialogs WHERE id = dialogId
    Service->>Service: Parse prompt_config, merge overrides

    Note over Service: Step 3: Variable substitution
    Service->>Service: substitutePromptVariables(template, defs, values)

    Note over Service: Step 4: Multi-turn refinement
    Service->>DB: SELECT chat_messages WHERE session_id (last 6)
    Service->>LLM: fullQuestionPrompt(history + question)
    LLM-->>Service: Refined question

    Note over Service: Step 5: Cross-language expansion
    Service->>LLM: crossLanguagePrompt(query, languages)
    LLM-->>Service: query + translations

    Note over Service: Step 6: Keyword extraction
    Service->>LLM: keywordPrompt(query, 8)
    LLM-->>Service: keyword array

    Service-->>Client: SSE {status: "retrieving"}

    Note over Service: Step 7: Hybrid retrieval
    loop For each kb_id in dialog.kb_ids
        Service->>LLM: embedTexts(expandedQuery)
        LLM-->>Service: query vector
        Service->>OS: hybridSearch(kb_id, query, vector, topK, threshold)
        OS-->>Service: chunks[]
    end

    Note over Service: Step 8: Web search (conditional)
    Service->>Web: searchWeb(query, tavily_api_key)
    Web-->>Service: web results as chunks

    Service-->>Client: SSE {status: "reranking"}

    Note over Service: Step 9: Reranking
    Service->>Service: ragRerankService or LLM-based rerank
    Service->>Service: Deduplicate, sort by score, keep top_n

    Note over Service: Step 10: Load file attachments (conditional)
    Service->>DB: SELECT chat_files WHERE id IN (file_ids)
    Service->>S3: presignedGetObject(s3_key)
    S3-->>Service: presigned URLs

    Note over Service: Step 11: Prompt assembly
    Service->>Service: buildContextPrompt(system, chunks, citations)
    Service->>Service: Build message array with history + multimodal user message

    Service-->>Client: SSE {reference: {chunks, doc_aggs}}
    Service-->>Client: SSE {status: "generating"}

    Note over Service: Step 12: Delta SSE streaming
    Service->>LLM: chatCompletionStream(messages, options)
    loop Token by token
        LLM-->>Service: {content: delta, done: false}
        Service-->>Client: SSE {delta: "token"}
    end

    Note over Service: Step 13: Citation post-processing
    Service->>Service: processCitations(answer, chunks)
    Service->>Service: buildReference(chunks, citedIndices)
    Service-->>Client: SSE {answer: finalAnswer, reference, metrics}

    Note over Service: Step 14: Persist assistant message
    Service->>DB: INSERT chat_messages (role=assistant, citations)
    Service->>LF: End trace with metrics
    Service-->>Client: SSE data: [DONE]
```

#### 3.3.2 Pipeline Decision Flowchart

```mermaid
flowchart TD
    Start([User sends message]) --> StoreMsg[1. Store user message in DB]
    StoreMsg --> LoadDialog[2. Load dialog config + merge overrides]
    LoadDialog --> SubstVars{3. Has variables<br/>in prompt_config?}

    SubstVars -->|Yes| DoSubst["Substitute {key} placeholders"]
    SubstVars -->|No| CheckRefine
    DoSubst --> CheckRefine{4. refine_multiturn<br/>enabled?}

    CheckRefine -->|Yes| DoRefine[Refine multi-turn question<br/>via LLM call]
    CheckRefine -->|No| CheckCross
    DoRefine --> CheckCross{5. cross_languages<br/>configured?}

    CheckCross -->|Yes| DoCross[Expand query with<br/>cross-language translations]
    CheckCross -->|No| CheckKeyword
    DoCross --> CheckKeyword{6. keyword<br/>enabled?}

    CheckKeyword -->|Yes| DoKeyword[Extract keywords via LLM]
    CheckKeyword -->|No| CheckKBs
    DoKeyword --> CheckKBs{7. kb_ids<br/>not empty?}

    CheckKBs -->|Yes| DoRetrieval[Hybrid search across<br/>all knowledge bases]
    CheckKBs -->|No| CheckWeb
    DoRetrieval --> CheckWeb{8. tavily_api_key<br/>configured?}

    CheckWeb -->|Yes| DoWeb[Search web via Tavily API<br/>Merge results with KB chunks]
    CheckWeb -->|No| CheckRerank
    DoWeb --> CheckRerank{"9. Chunks count<br/>#gt; top_n?"}

    CheckRerank -->|Yes| DoRerank[Rerank via rerank service<br/>or LLM-based reranking]
    CheckRerank -->|No| CheckFiles
    DoRerank --> CheckFiles{10. file_ids<br/>provided?}

    CheckFiles -->|Yes| DoFiles[Load files from S3<br/>Generate presigned URLs]
    CheckFiles -->|No| AssemblePrompt
    DoFiles --> AssemblePrompt[11. Build context prompt<br/>with chunks + citation instructions]

    AssemblePrompt --> SendRef[Send reference SSE event]
    SendRef --> StreamLLM[12. Stream LLM generation<br/>token-by-token SSE deltas]
    StreamLLM --> PostProcess[13. Post-process citations<br/>Normalize ##ID:n$$ format]
    PostProcess --> Persist[14. Persist assistant message<br/>with citations JSON]
    Persist --> Done[Send DONE sentinel]
    Done --> End([Stream closed])
```

### 3.4 Configuration Model

#### PromptConfig Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `system` | `string` | `undefined` | System prompt template. Supports `{variable_name}` and `{knowledge}` placeholders |
| `prologue` | `string` | `undefined` | Welcome message inserted as first assistant message on conversation creation |
| `refine_multiturn` | `boolean` | `undefined` | Enable multi-turn question synthesis via LLM |
| `cross_languages` | `string` | `undefined` | Comma-separated target languages for query expansion (e.g. `"English,Japanese,Vietnamese"`) |
| `keyword` | `boolean` | `undefined` | Enable keyword extraction and appending to search query |
| `quote` | `boolean` | `undefined` | Enable citation marker insertion (##ID:n$$) in answers |
| `empty_response` | `string` | `undefined` | Fallback response when no KB results found |
| `toc_enhance` | `boolean` | `undefined` | Enable table-of-contents re-ranking |
| `tavily_api_key` | `string` | `undefined` | Tavily API key to enable web search augmentation |
| `use_kg` | `boolean` | `undefined` | Enable knowledge graph retrieval |
| `rerank_id` | `string` | `undefined` | Model provider ID for dedicated reranking model |
| `reasoning` | `boolean` | `undefined` | Enable deep research mode (recursive retrieval with sufficiency checks) |
| `temperature` | `number` | `0.7` | LLM sampling temperature (0-2) |
| `top_p` | `number` | `undefined` | Top-p nucleus sampling (0-1) |
| `frequency_penalty` | `number` | `undefined` | Frequency penalty |
| `presence_penalty` | `number` | `undefined` | Presence penalty |
| `max_tokens` | `number` | `4096` | Maximum tokens for generation (1-128000) |
| `top_n` | `number` | `6` | Number of chunks to retrieve per knowledge base (1-100) |
| `similarity_threshold` | `number` | `0.0` | Minimum similarity score for vector search (0-1) |
| `vector_similarity_weight` | `number` | `0.3` | Balance between vector and keyword search (0=keyword, 1=vector) |
| `variables` | `PromptVariable[]` | `[]` | Custom prompt variable definitions |
| `metadata_filter` | `MetadataFilter` | `undefined` | Default metadata filter conditions for RAG search |

#### Type Definitions

```mermaid
classDiagram
    class PromptConfig {
        +string system
        +string prologue
        +boolean refine_multiturn
        +string cross_languages
        +boolean keyword
        +boolean quote
        +string empty_response
        +boolean toc_enhance
        +string tavily_api_key
        +boolean use_kg
        +string rerank_id
        +boolean reasoning
        +number temperature
        +number top_p
        +number frequency_penalty
        +number presence_penalty
        +number max_tokens
        +number top_n
        +number similarity_threshold
        +number vector_similarity_weight
        +PromptVariable[] variables
        +MetadataFilter metadata_filter
    }

    class PromptVariable {
        +string key
        +string description
        +boolean optional
        +string default_value
    }

    class MetadataFilter {
        +string logic "and|or"
        +MetadataCondition[] conditions
    }

    class MetadataCondition {
        +string name
        +string comparison_operator "is|is_not|contains|gt|lt|range"
        +string|number|number[] value
    }

    class ChatRequestOverrides {
        +Record~string_string~ variables
        +MetadataFilter metadata_condition
        +string[] doc_ids
        +string llm_id
        +number temperature
        +number max_tokens
        +string[] file_ids
    }

    PromptConfig "1" *-- "0..*" PromptVariable
    PromptConfig "1" *-- "0..1" MetadataFilter
    MetadataFilter "1" *-- "1..*" MetadataCondition
    ChatRequestOverrides "1" *-- "0..1" MetadataFilter
```

### 3.5 Access Control (RBAC)

```mermaid
flowchart TD
    Request([User requests<br/>dialog access]) --> IsAdmin{User role is<br/>admin or superadmin?}

    IsAdmin -->|Yes| GrantAll[Access ALL dialogs]
    IsAdmin -->|No| IsOwner{User is<br/>dialog creator?}

    IsOwner -->|Yes| Grant[Access GRANTED]
    IsOwner -->|No| IsPublic{Dialog is_public<br/>= true?}

    IsPublic -->|Yes| Grant
    IsPublic -->|No| CheckGrants{User has explicit<br/>grant in<br/>chat_dialog_access?}

    CheckGrants -->|Yes| Grant
    CheckGrants -->|No| CheckTeam{User belongs to<br/>a team with<br/>access grant?}

    CheckTeam -->|Yes| Grant
    CheckTeam -->|No| Deny[Access DENIED]

    style Grant fill:#d4edda,stroke:#28a745
    style GrantAll fill:#d4edda,stroke:#28a745
    style Deny fill:#f8d7da,stroke:#dc3545
```

#### Access Matrix

| Action | Admin / Superadmin | Dialog Owner | Granted User/Team | Public Dialog User | No Access |
|--------|:-:|:-:|:-:|:-:|:-:|
| List dialogs (visible) | All | Own | Granted | Public only | None |
| Get dialog by ID | Yes | Yes | Yes | Yes | No |
| Create dialog | Yes | -- | -- | -- | -- |
| Update dialog | Yes | -- | -- | -- | -- |
| Delete dialog | Yes | -- | -- | -- | -- |
| Manage access entries | Yes | -- | -- | -- | -- |
| Create conversation | Yes | Yes | Yes | Yes | No |
| Chat completion | Yes | Yes | Yes | Yes | No |
| Manage embed tokens | Yes | -- | -- | -- | -- |

**Implementation files:**
- `be/src/modules/chat/services/chat-dialog.service.ts` -- `listAccessibleDialogs()`, `checkUserAccess()`
- `be/src/modules/chat/models/chat-dialog-access.model.ts` -- `findAccessibleDialogIds()`, `bulkReplace()`

### 3.6 File Upload System

```mermaid
sequenceDiagram
    participant Client as Frontend
    participant API as Chat File Controller
    participant Svc as ChatFileService
    participant S3 as RustFS (S3)
    participant DB as PostgreSQL

    Note over Client,DB: Upload Flow
    Client->>API: POST /conversations/:id/files<br/>multipart/form-data (max 5 files)
    API->>Svc: validateFile(file) for each

    alt Validation fails
        Svc-->>API: {valid: false, error: "..."}
        API-->>Client: 400 {error: "..."}
    else All valid
        loop Each file
            Svc->>S3: putObject(bucket, "chat-files/:sessionId/:fileId/:name", buffer)
            S3-->>Svc: OK
            Svc->>DB: INSERT chat_files (id, session_id, s3_key, mime_type, size, expires_at)
            DB-->>Svc: ChatFile record
        end
        API-->>Client: 201 [{id, original_name, mime_type, size}]
    end

    Note over Client,DB: Usage in Chat Completion
    Client->>API: POST /conversations/:id/completion<br/>{content, file_ids: ["uuid1", "uuid2"]}
    API->>Svc: getFilesByIds(file_ids)
    Svc->>DB: SELECT * FROM chat_files WHERE id IN (...)
    DB-->>Svc: ChatFile[]

    loop Each image file
        Svc->>S3: presignedGetObject(s3_key, 3600)
        S3-->>Svc: presigned URL
    end

    Svc->>Svc: buildMultimodalUserMessage(text, imageUrls)
    Note right of Svc: Constructs OpenAI vision<br/>message with image_url parts
```

**Constraints:**
- Allowed MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`
- Maximum file size: 20 MB
- Maximum files per upload: 5
- Retention: 30 days (auto-cleanup via `expires_at` + cron)
- Storage: S3 path pattern: `chat-files/{sessionId}/{fileId}/{originalName}`

**Implementation files:**
- `be/src/modules/chat/services/chat-file.service.ts` -- `ChatFileService`
- `be/src/modules/chat/controllers/chat-file.controller.ts` -- `ChatFileController`
- `be/src/modules/chat/routes/chat-file.routes.ts`
- `be/src/shared/db/migrations/20260316000004_chat_files.ts`

### 3.7 Embed Widget (Dual-Mode)

The chat widget supports two authentication modes: **internal** (session cookie for authenticated users) and **external** (embed token for anonymous users on third-party sites).

#### Auth Routing

```mermaid
flowchart LR
    Init([Widget Initialized]) --> Mode{Auth Mode?}

    Mode -->|Internal| IntAuth[Session Cookie Auth]
    IntAuth --> IntAPI["/api/chat/conversations<br/>/api/chat/dialogs/:id"]

    Mode -->|External| ExtAuth[Embed Token Auth]
    ExtAuth --> ExtAPI["/api/chat/embed/:token/info<br/>/api/chat/embed/:token/sessions<br/>/api/chat/embed/:token/completions"]

    IntAPI --> SharedPipeline["ChatConversationService<br/>.streamChat()"]
    ExtAPI --> ValidateToken{"Token valid<br/>#amp; not expired?"}

    ValidateToken -->|Yes| SyntheticUser["Create synthetic user ID<br/>embed:{tokenId}"]
    ValidateToken -->|No| Reject[401 Unauthorized]

    SyntheticUser --> SharedPipeline
    SharedPipeline --> SSEStream[SSE Response]
```

#### External Widget Initialization

```mermaid
sequenceDiagram
    participant Page as Third-Party Page
    participant Widget as ChatWidget Component
    participant API as Embed API
    participant Service as ChatConversationService
    participant LLM as LLM Provider

    Page->>Widget: BKnowledgeChat.init({token, baseUrl})
    Widget->>Widget: Create ChatWidgetApi(external mode)

    Note over Widget: User opens widget
    Widget->>API: GET /embed/:token/info
    API->>API: validateToken(token) [30s cache]
    API->>API: Load dialog by token.dialog_id
    API-->>Widget: {name, icon, description, prologue}
    Widget->>Widget: Display dialog info in header

    Note over Widget: User sends first message
    Widget->>API: POST /embed/:token/sessions<br/>{name: "Widget Session"}
    API->>API: validateToken(token)
    API->>Service: createConversation(dialogId, name, "embed:{tokenId}")
    Service-->>API: session
    API-->>Widget: {id, dialog_id, name}

    Widget->>API: POST /embed/:token/completions<br/>{content, session_id}
    API->>API: validateToken(token)
    API->>Service: streamChat(sessionId, content, dialogId, syntheticUserId, res)

    loop SSE deltas
        Service-->>API: token chunks
        API-->>Widget: SSE {delta: "..."}
    end

    API-->>Widget: SSE {answer: "...", reference: {...}}
    API-->>Widget: SSE [DONE]
```

**Implementation files:**
- `fe/src/features/chat-widget/ChatWidget.tsx` -- Root component with SSE parsing
- `fe/src/features/chat-widget/ChatWidgetWindow.tsx` -- 380px overlay window
- `fe/src/features/chat-widget/ChatWidgetButton.tsx` -- Floating action button
- `fe/src/features/chat-widget/chatWidgetApi.ts` -- `ChatWidgetApi` class with dual-mode
- `be/src/modules/chat/controllers/chat-embed.controller.ts` -- `ChatEmbedController`
- `be/src/modules/chat/routes/chat-embed.routes.ts`
- `be/src/shared/services/embed-token.service.ts` -- `EmbedTokenService` with 30s validation cache

### 3.8 OpenAI-Compatible API

```mermaid
sequenceDiagram
    participant Client as External Client<br/>LangChain, Cursor, etc.
    participant API as ChatOpenaiController
    participant TokenSvc as EmbedTokenService
    participant DB as PostgreSQL
    participant Pipeline as ChatConversationService

    Client->>API: POST /api/v1/chat/completions<br/>Authorization: Bearer sk-abc...xyz<br/>{messages, stream, model}

    API->>API: Extract Bearer token from header
    API->>TokenSvc: validateToken(apiKey)
    TokenSvc->>TokenSvc: Check 30s in-memory cache

    alt Cache miss
        TokenSvc->>DB: SELECT FROM chat_embed_tokens<br/>WHERE token = ? AND is_active = true
        DB-->>TokenSvc: Token row with dialog_id
        TokenSvc->>TokenSvc: Check expires_at
        TokenSvc->>TokenSvc: Cache token (30s TTL)
    end

    TokenSvc-->>API: tokenRecord {dialog_id, created_by}

    API->>API: extractLastUserMessage(messages)
    API->>DB: INSERT chat_sessions (temporary)

    alt Streaming mode (stream=true)
        API->>API: Set SSE headers
        API->>API: Create stream interceptor<br/>(converts B-Knowledge SSE to OpenAI chunks)
        API->>Pipeline: streamChat(sessionId, userMessage, dialogId, userId, mockRes)

        loop Delta tokens
            Pipeline-->>API: SSE {delta: "token"}
            API->>API: Wrap in OpenAI chunk format
            API-->>Client: SSE data: {id, object: "chat.completion.chunk",<br/>choices: [{delta: {content}}]}
        end

        API-->>Client: SSE data: {choices: [{finish_reason: "stop"}]}
        API-->>Client: SSE data: [DONE]
    else Non-streaming mode (stream=false)
        API->>API: Create buffer interceptor
        API->>Pipeline: streamChat(sessionId, userMessage, dialogId, userId, bufferRes)
        Pipeline-->>API: Full answer (buffered)
        API->>API: buildOaiCompletion(answer, model)
        API-->>Client: {id, object: "chat.completion",<br/>choices: [{message: {content}}],<br/>usage: {prompt_tokens, completion_tokens}}
    end
```

**Model identifier:** `b-knowledge-rag`

**Implementation files:**
- `be/src/modules/chat/controllers/chat-openai.controller.ts` -- `ChatOpenaiController`, `createStreamInterceptor()`, `createBufferInterceptor()`
- `be/src/modules/chat/routes/chat-openai.routes.ts`
- `be/src/shared/services/openai-format.service.ts` -- `buildOaiCompletion()`, `buildOaiStreamChunk()`, `extractLastUserMessage()`

---

## 4. Frontend Architecture

### 4.1 Component Tree

```mermaid
flowchart TD
    App[App.tsx] --> Routes[Route: /chat]
    Routes --> ChatPage[ChatPage.tsx]

    ChatPage --> Sidebar[ChatSidebar]
    ChatPage --> Center[Center Panel]
    ChatPage --> RefPanel[ChatReferencePanel]
    ChatPage --> DocDrawer[ChatDocumentPreviewDrawer]
    ChatPage --> Guide[GuidelineDialog]

    Center --> Header[Chat Header<br/>conversation name + dialog name]
    Center --> MsgList[ChatMessageList]
    Center --> VarForm[Variable Form<br/>conditional: hasRequiredVars]
    Center --> FileUpload[ChatFileUpload]
    Center --> Input[ChatInput]

    MsgList --> Msg1[ChatMessage]
    MsgList --> Msg2[ChatMessage]
    MsgList --> StreamMsg[Streaming Message<br/>partial currentAnswer]

    Msg1 --> Citation[CitationInline]

    Input --> SendBtn[Send / Stop Button]
    Input --> ReasonBtn[Brain Toggle<br/>reasoning mode]
    Input --> WebBtn[Globe Toggle<br/>internet search]
    Input --> FileBtn[Paperclip<br/>file upload]

    Sidebar --> ConvList[Conversation List]
    Sidebar --> SearchInput[Search Filter]
    Sidebar --> NewBtn[New Conversation]

    RefPanel --> ChunkList[Chunk Cards]
    RefPanel --> DocAggs[Document Aggregates]

    style ChatPage fill:#e8f4fd,stroke:#0d6efd
    style Center fill:#fff3cd,stroke:#ffc107
    style Sidebar fill:#d1ecf1,stroke:#0c5460
    style RefPanel fill:#d4edda,stroke:#28a745
```

### 4.2 State Management

```mermaid
flowchart LR
    subgraph "TanStack Query (Server State)"
        QDialogs[useChatDialogs<br/>queryKey: chat.dialogs]
        QConvs["useChatConversations<br/>queryKey: chat.conversations.{dialogId}"]
        QAdmin["useChatDialogsAdmin<br/>queryKey: chat.dialogs.{params}"]
    end

    subgraph "Local State (useState)"
        ActiveDialog[activeDialogId]
        ActiveConv[activeConversationId]
        ShowRef[showReferences]
        ShowDoc[showDocPreview]
        VarValues[variableValues]
    end

    subgraph "Imperative SSE (useChatStream)"
        Messages["messages: ChatMessage[]"]
        IsStreaming[isStreaming]
        CurrentAnswer[currentAnswer]
        References[references]
        PipeStatus[pipelineStatus]
        Metrics[metrics]
    end

    subgraph "File State (useChatFiles)"
        Files["files: UploadedFile[]"]
        IsUploading[isUploading]
        FileIds["fileIds: string[]"]
    end

    QDialogs -->|data| ActiveDialog
    ActiveDialog -->|dialogId| QConvs
    QConvs -->|data| ActiveConv
    ActiveConv -->|conversationId + dialogId| Messages

    Messages -->|setMessages on load| QConvs
    FileIds -->|included in sendMessage| Messages

    style Messages fill:#fff3cd
    style IsStreaming fill:#fff3cd
    style CurrentAnswer fill:#fff3cd
```

**Key data flow:**
1. `useChatDialogs()` fetches available dialogs via TanStack Query
2. User selects a dialog, triggering `useChatConversations(dialogId)`
3. User selects or creates a conversation
4. `useChatStream(conversationId, dialogId)` manages imperative SSE streaming
5. SSE events update `currentAnswer` (delta tokens), `references`, and `pipelineStatus` in real-time
6. On stream completion, the final message is appended to the `messages` array
7. File uploads via `useChatFiles()` are independent -- file IDs are passed to `sendMessage()`

### 4.3 Key Components

| Component | File | Props | Purpose |
|-----------|------|-------|---------|
| `ChatPage` | `pages/ChatPage.tsx` | -- | Main page; orchestrates all chat state and layout |
| `ChatSidebar` | `components/ChatSidebar.tsx` | `conversations, onSelect, onCreate, onDelete, onRename, search` | Left panel listing conversations with search and CRUD |
| `ChatMessageList` | `components/ChatMessageList.tsx` | `messages, isStreaming, currentAnswer, onCitationClick, onRegenerate` | Scrollable message list with streaming indicator |
| `ChatMessage` | `components/ChatMessage.tsx` | `message, onCitationClick, onChunkCitationClick, isLast, onRegenerate` | Single message with avatar, markdown, copy, TTS, feedback, citations |
| `ChatInput` | `components/ChatInput.tsx` | `onSend, onStop, isStreaming, disabled, showReasoningToggle, showInternetToggle, showFileUpload, onFilesSelected, fileIds` | Auto-resize textarea with toggle buttons |
| `ChatReferencePanel` | `components/ChatReferencePanel.tsx` | `reference, onClose, onDocumentClick` | Right panel showing retrieved chunks and doc aggregates |
| `ChatDocumentPreviewDrawer` | `components/ChatDocumentPreviewDrawer.tsx` | `open, onClose, chunk, datasetId` | Slide-over drawer for document/chunk preview |
| `ChatFileUpload` | `components/ChatFileUpload.tsx` | `files, isUploading, uploadError, onRemove` | File attachment preview strip above input |
| `ChatDialogConfig` | `components/ChatDialogConfig.tsx` | `open, onClose, onSave, dialog, datasets` | Admin dialog for creating/editing chat assistants |
| `ChatDialogAccessDialog` | `components/ChatDialogAccessDialog.tsx` | `open, onClose, dialog` | Admin dialog for managing RBAC access entries |
| `ChatVariableForm` | `components/ChatVariableForm.tsx` | `value, onChange` | Admin form for configuring custom prompt variables |
| `CitationInline` | `components/CitationInline.tsx` | (shared) | Renders inline citation badges ##ID:n$$ |

### 4.4 Admin Pages

```mermaid
flowchart TD
    AdminPage[ChatDialogManagementPage] --> SearchBar[Search Input<br/>URL-synced via useSearchParams]
    AdminPage --> Table[Dialog Table]
    AdminPage --> Pagination[Pagination Controls]
    AdminPage --> HeaderActions[Create Button]
    AdminPage --> ConfigDialog[ChatDialogConfig<br/>Create/Edit Modal]
    AdminPage --> AccessDialog[ChatDialogAccessDialog<br/>RBAC Modal]

    Table --> Row1[TableRow]
    Row1 --> Name[Name]
    Row1 --> Desc[Description]
    Row1 --> KBCount[KB Count Badge]
    Row1 --> LLM[LLM Model]
    Row1 --> Status[Public/Private Badge]
    Row1 --> Actions[Action Buttons]

    Actions --> EditBtn[Pencil: Edit]
    Actions --> AccessBtn[Shield: Manage Access]
    Actions --> DeleteBtn[Trash: Delete]

    EditBtn --> ConfigDialog
    AccessBtn --> AccessDialog
    DeleteBtn --> ConfirmDialog[Confirm Delete]
    HeaderActions --> ConfigDialog

    ConfigDialog --> KBSelector[Knowledge Base Multi-Select]
    ConfigDialog --> LLMSelect[LLM Model Dropdown]
    ConfigDialog --> SystemPrompt[System Prompt Textarea]
    ConfigDialog --> Sliders[Temperature / TopN / Threshold Sliders]
    ConfigDialog --> VarForm[ChatVariableForm]
    ConfigDialog --> PublicToggle[Is Public Switch]

    AccessDialog --> UserTab[Users Tab]
    AccessDialog --> TeamTab[Teams Tab]
    UserTab --> UserCheckboxes[Searchable User Checkboxes]
    TeamTab --> TeamCheckboxes[Searchable Team Checkboxes]
```

**Implementation files:**
- `fe/src/features/chat/pages/ChatDialogManagementPage.tsx`
- `fe/src/features/chat/api/chatQueries.ts` -- `useChatDialogsAdmin()`

---

## 5. Comparison: RAGFlow vs B-Knowledge

| Feature | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Dialog CRUD | Yes (soft-delete) | Yes (hard-delete) | Implemented |
| Conversation CRUD | Yes | Yes | Implemented |
| Multi-turn question refinement | Yes | Yes | Implemented |
| Cross-language query expansion | Yes | Yes | Implemented |
| Keyword extraction | Yes | Yes | Implemented |
| Hybrid search (BM25 + vector) | Yes | Yes | Implemented |
| Reranking (dedicated model) | Yes | Yes (via rag-rerank service) | Implemented |
| LLM-based reranking | No | Yes (fallback) | Implemented |
| Web search (Tavily) | Yes | Yes | Implemented |
| Knowledge graph retrieval | Yes | Yes (via rag-graphrag service) | Implemented |
| Deep research / reasoning | No | Yes (rag-deep-research service) | Implemented |
| Citation insertion | Yes (`##ID:n$$`) | Yes (`##ID:n$$`, same format) | Implemented |
| Prologue message | Yes (in conversation JSON) | Yes (separate DB row) | Implemented |
| Thumbs up/down feedback | Yes (in message JSON) | Yes (in citations JSONB) | Implemented |
| Message deletion | Yes (pair deletion) | Yes (single message) | Implemented |
| Text-to-speech | Yes (LLM Bundle TTS) | Yes (configurable TTS provider) | Implemented |
| Speech-to-text | Yes | No | Not implemented |
| RBAC access control | No (tenant-only) | Yes (admin/owner/public/user/team grants) | Implemented |
| File attachments (multimodal) | No | Yes (images + PDF, S3 storage) | Implemented |
| Embed widget (external) | Yes (iframe + API token) | Yes (React component + embed token) | Implemented |
| Embed widget (internal) | No | Yes (session cookie auth) | Implemented |
| OpenAI-compatible API | No | Yes (`/v1/chat/completions`) | Implemented |
| Metadata filtering | Yes (dialog-level) | Yes (dialog-level + per-message override) | Implemented |
| Custom prompt variables | Yes (`{knowledge}` only) | Yes (admin-defined `{key}` variables with defaults) | Implemented |
| Per-message LLM override | Yes | Yes | Implemented |
| Paginated dialog listing | Yes | Yes (server-side with search) | Implemented |
| Delta SSE streaming | No (accumulated answer) | Yes (token-by-token deltas) | Implemented |
| Pipeline status indicators | No | Yes (refining, retrieving, reranking, generating) | Implemented |
| Pipeline performance metrics | No | Yes (refinement_ms, retrieval_ms, generation_ms) | Implemented |
| Langfuse observability | No | Yes (trace per pipeline) | Implemented |
| SQL-to-data retrieval | No | Yes (rag-sql service) | Implemented |
| Auto-expire file cleanup | No | Yes (30-day retention + cron) | Implemented |
| Embed token expiration | No | Yes (configurable expires_at) | Implemented |
| Conversation rename | No | Yes | Implemented |
| Message regeneration | No | Yes (delete last + re-send) | Implemented |

---

## 6. Use Cases

### UC-01: Admin Creates Chat Assistant

- **Actor:** Admin user
- **Precondition:** User has `admin` or `superadmin` role with `manage_users` permission; at least one knowledge base exists
- **Flow:**
  1. Admin navigates to Chat Management page (`/admin/chat-assistants`)
  2. Admin clicks "Create Dialog" button
  3. System opens `ChatDialogConfig` modal
  4. Admin enters name, description, selects knowledge bases, selects LLM model
  5. Admin optionally configures system prompt, temperature, top_n, similarity threshold
  6. Admin optionally adds custom prompt variables via `ChatVariableForm`
  7. Admin optionally toggles `is_public`
  8. Admin clicks Save
  9. Frontend calls `POST /api/chat/dialogs` with `createDialogSchema`-validated body
  10. Backend checks name uniqueness (case-insensitive), creates dialog in `chat_dialogs`
  11. Dialog appears in the management table
- **Postcondition:** New dialog record exists; accessible to admin and (if public) all users
- **Alternative flow:** If name already exists, backend returns 409 Conflict

### UC-02: Admin Configures RAG Pipeline Settings

- **Actor:** Admin user
- **Precondition:** Dialog exists
- **Flow:**
  1. Admin clicks Edit on an existing dialog
  2. System loads dialog config into `ChatDialogConfig` modal
  3. Admin adjusts RAG settings in `prompt_config`:
     - Enables `refine_multiturn` for multi-turn conversations
     - Sets `cross_languages` to "English,Japanese,Vietnamese"
     - Enables `keyword` extraction
     - Sets `similarity_threshold` to 0.3
     - Sets `top_n` to 8
     - Adds Tavily API key for web search
     - Enables `quote` for citation insertion
  4. Admin clicks Save
  5. Frontend calls `PUT /api/chat/dialogs/:id`
  6. Backend merges update into existing dialog
- **Postcondition:** Updated `prompt_config` drives subsequent chat completions
- **Alternative flow:** Admin can reset to defaults by clearing optional fields

### UC-03: Admin Grants Access to Users/Teams

- **Actor:** Admin user
- **Precondition:** Dialog exists; users and teams exist
- **Flow:**
  1. Admin clicks Shield icon on a dialog row
  2. System opens `ChatDialogAccessDialog` with tabs for Users and Teams
  3. System fetches current access entries via `GET /api/chat/dialogs/:id/access`
  4. System fetches all users and teams for selection
  5. Admin checks/unchecks users and teams
  6. Admin clicks Save
  7. Frontend calls `PUT /api/chat/dialogs/:id/access` with `{entries: [...]}`
  8. Backend atomically replaces all access entries (delete + insert in transaction)
- **Postcondition:** Granted users/teams can see and chat with the dialog
- **Alternative flow:** Removing all entries makes the dialog accessible only to owner and admins

### UC-04: Admin Manages Embed Tokens

- **Actor:** Admin user
- **Precondition:** Dialog exists
- **Flow:**
  1. Admin navigates to dialog embed token management
  2. Admin clicks "Create Token"
  3. System calls `POST /api/chat/dialogs/:id/embed-tokens` with name and optional expiry
  4. Backend generates 64-char hex token via `crypto.randomBytes(32)`
  5. Token is displayed once to admin (full value)
  6. Subsequent listing shows masked tokens (`abcd1234...wxyz`)
  7. Admin can revoke tokens via `DELETE /api/chat/embed-tokens/:tokenId`
- **Postcondition:** Token can be used in external widget or OpenAI-compatible API
- **Alternative flow:** Expired tokens return 401 on validation

### UC-05: User Starts New Conversation

```mermaid
sequenceDiagram
    actor User
    participant FE as ChatPage
    participant BE as Backend API
    participant DB as PostgreSQL

    User->>FE: Selects a dialog from list
    FE->>BE: GET /api/chat/conversations?dialogId=xxx
    BE->>DB: SELECT * FROM chat_sessions WHERE dialog_id AND user_id
    DB-->>BE: conversations[]
    BE-->>FE: conversations[]
    FE->>FE: Display conversation list in sidebar

    User->>FE: Clicks "New Conversation" or types first message
    FE->>FE: No active conversation exists

    alt First message triggers auto-create
        FE->>BE: POST /api/chat/conversations<br/>{dialog_id, name: "first 50 chars..."}
        BE->>DB: SELECT chat_dialogs WHERE id = dialogId
        DB-->>BE: dialog with prompt_config
        BE->>DB: INSERT chat_sessions

        alt prologue configured
            BE->>DB: INSERT chat_messages (role=assistant, content=prologue)
        end

        DB-->>BE: session
        BE-->>FE: session {id, dialog_id, title}
        FE->>FE: Set active conversation
    end

    User->>FE: Types message and presses Enter
    FE->>BE: POST /api/chat/conversations/:id/completion<br/>{content, dialog_id}

    Note over BE: Full RAG pipeline executes<br/>(see Section 3.3)

    loop SSE stream
        BE-->>FE: data: {status: "retrieving"}
        BE-->>FE: data: {delta: "token"}
        BE-->>FE: data: {answer: "...", reference: {...}}
    end
    BE-->>FE: data: [DONE]

    FE->>FE: Append assistant message to list
    FE->>FE: Show references in panel
```

- **Actor:** Authenticated user with dialog access
- **Precondition:** User has access to at least one dialog
- **Postcondition:** New conversation with user message and assistant response persisted

### UC-06: User Sends Message with File Attachment

```mermaid
sequenceDiagram
    actor User
    participant FE as ChatPage
    participant Hook as useChatFiles
    participant API as Backend API
    participant S3 as RustFS
    participant LLM as LLM Provider

    User->>FE: Clicks paperclip icon
    FE->>FE: Opens file picker (image/PDF)
    User->>FE: Selects 2 images

    FE->>Hook: uploadFiles(fileList)
    Hook->>Hook: Client-side validation<br/>(type, size < 20MB)
    Hook->>API: POST /conversations/:id/files<br/>FormData with 'files' field
    API->>API: Server-side validation
    API->>S3: putObject(bucket, "chat-files/session/fileId/name", buffer)
    S3-->>API: OK
    API->>API: INSERT chat_files (expires_at = now + 30d)
    API-->>Hook: [{id, original_name, mime_type, size}]
    Hook->>Hook: Create blob preview URLs
    Hook-->>FE: files[] updated, fileIds[]

    FE->>FE: Show file preview strip (ChatFileUpload)

    User->>FE: Types question and presses Enter
    FE->>API: POST /conversations/:id/completion<br/>{content, dialog_id, file_ids: ["uuid1", "uuid2"]}

    API->>API: Load files by IDs
    API->>S3: presignedGetObject(s3_key, 1h)
    S3-->>API: presigned URL
    API->>API: buildMultimodalUserMessage(text, [url1, url2])
    Note right of API: Creates OpenAI vision format:<br/>[{type:"text"}, {type:"image_url", image_url:{url}}]

    API->>LLM: Stream completion with multimodal message
    loop SSE deltas
        LLM-->>API: token
        API-->>FE: SSE {delta: "..."}
    end

    FE->>Hook: clearFiles()
    Hook->>Hook: Revoke blob URLs
```

- **Actor:** Authenticated user
- **Precondition:** Active conversation exists; LLM supports vision (multimodal)
- **Postcondition:** Files stored in S3 with 30-day expiry; assistant response considers image content

### UC-07: User Clicks Citation to View Document

- **Actor:** Authenticated user
- **Precondition:** Assistant message contains `##ID:n$$` citation markers
- **Flow:**
  1. User sees inline citation badges rendered by `CitationInline`
  2. User clicks a citation badge
  3. `onChunkCitationClick(chunk)` fires with the chunk data
  4. `ChatDocumentPreviewDrawer` opens with the chunk's content, document name, page number, and positions
  5. User can view the source text and optionally navigate to the full document
- **Postcondition:** User sees the source chunk that informed the answer
- **Alternative flow:** User clicks reference panel icon to see all chunks

### UC-08: User Regenerates Response

- **Actor:** Authenticated user
- **Precondition:** At least one user-assistant message pair exists
- **Flow:**
  1. User clicks the regenerate button on the last assistant message
  2. `regenerateLastMessage()` in `useChatStream`:
     a. Finds the last user message content
     b. If assistant message has a real DB ID, calls `DELETE /conversations/:id/messages/:msgId`
     c. Removes both last user and assistant messages from local state
     d. Calls `sendMessage(lastUserContent)` to re-trigger the pipeline
  3. New SSE stream begins with fresh retrieval and generation
- **Postcondition:** New assistant response replaces the old one
- **Alternative flow:** Cannot regenerate while streaming is in progress

### UC-09: User Renames Conversation

- **Actor:** Authenticated user
- **Precondition:** Conversation exists and is owned by the user
- **Flow:**
  1. User double-clicks or right-clicks a conversation in the sidebar
  2. Inline edit field appears
  3. User types new name and presses Enter
  4. Frontend calls `PATCH /api/chat/conversations/:id` with `{name: "..."}`
  5. Backend verifies ownership (`session.user_id === userId`)
  6. Backend updates `chat_sessions.title`
  7. Sidebar refreshes with new name
- **Postcondition:** Conversation title updated in database

### UC-10: External Widget User Chats via Embed

```mermaid
sequenceDiagram
    actor Visitor as Website Visitor
    participant Page as Third-Party Website
    participant Widget as ChatWidget
    participant API as B-Knowledge API
    participant Pipeline as RAG Pipeline

    Page->>Widget: BKnowledgeChat.init({<br/>  token: "abc123...xyz",<br/>  baseUrl: "https://bk.example.com"<br/>})

    Visitor->>Widget: Clicks floating chat button
    Widget->>API: GET /api/chat/embed/abc123...xyz/info
    API->>API: validateToken("abc123...xyz")

    alt Token invalid or expired
        API-->>Widget: 401 {error: "Invalid or expired embed token"}
        Widget->>Widget: Show error state
    else Token valid
        API-->>Widget: {name: "Support Bot", prologue: "How can I help?"}
        Widget->>Widget: Display header + prologue
    end

    Visitor->>Widget: Types "How do I reset my password?"
    Widget->>API: POST /api/chat/embed/abc123...xyz/sessions<br/>{name: "How do I reset my..."}
    API->>API: validateToken (cached)
    API->>API: Create session with user_id = "embed:{tokenId}"
    API-->>Widget: {id: "session-uuid", dialog_id: "..."}

    Widget->>API: POST /api/chat/embed/abc123...xyz/completions<br/>{content: "How do I reset my password?", session_id: "session-uuid"}
    API->>Pipeline: streamChat(sessionId, content, dialogId, syntheticUserId, res)

    loop SSE stream
        Pipeline-->>API: tokens
        API-->>Widget: SSE {delta: "To"}, {delta: " reset"}, ...
    end
    API-->>Widget: SSE {answer: "To reset your password, ..."}
    API-->>Widget: SSE [DONE]

    Widget->>Widget: Display complete answer
```

- **Actor:** Anonymous visitor on a third-party website
- **Precondition:** Admin has created an embed token for a dialog
- **Postcondition:** Visitor receives RAG-augmented answer; conversation persisted under synthetic user ID

### UC-11: API Consumer Uses OpenAI-Compatible Endpoint

- **Actor:** External tool (LangChain, Cursor, RAGAS evaluation harness)
- **Precondition:** Admin has created an embed token
- **Flow:**
  1. Consumer sends request:
     ```
     POST /api/v1/chat/completions
     Authorization: Bearer bk-embed-token-value
     {
       "model": "b-knowledge-rag",
       "messages": [{"role": "user", "content": "What is the refund policy?"}],
       "stream": true
     }
     ```
  2. Controller extracts Bearer token, validates via `EmbedTokenService`
  3. Controller extracts last user message from messages array
  4. Controller creates a temporary `chat_sessions` record
  5. For streaming: creates a `StreamInterceptor` that converts B-Knowledge SSE to OpenAI chunk format
  6. Delegates to `chatConversationService.streamChat()` (same pipeline as internal chat)
  7. Each B-Knowledge `{delta: "token"}` is wrapped as OpenAI `{choices: [{delta: {content: "token"}}]}`
  8. Stream ends with `{finish_reason: "stop"}` and `[DONE]` sentinel
- **Postcondition:** Consumer receives OpenAI-format response; can be used as a drop-in replacement for OpenAI API
- **Alternative flow (non-streaming):** Controller buffers full answer, returns single JSON response with `buildOaiCompletion()`

---

## 7. Feature List (Complete)

### Dialog Management

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| Create dialog | Admin creates chat assistant with KB, LLM, and prompt config | Implemented | `be/src/modules/chat/services/chat-dialog.service.ts` |
| Update dialog | Admin edits any dialog field | Implemented | `be/src/modules/chat/controllers/chat-dialog.controller.ts` |
| Delete dialog | Admin hard-deletes dialog (cascades sessions, messages, tokens) | Implemented | `be/src/modules/chat/services/chat-dialog.service.ts` |
| List dialogs (RBAC) | Paginated listing with admin/owner/public/grant filtering | Implemented | `be/src/modules/chat/services/chat-dialog.service.ts::listAccessibleDialogs()` |
| Search dialogs | Case-insensitive search on name and description | Implemented | `be/src/modules/chat/services/chat-dialog.service.ts` |
| Public/private toggle | `is_public` flag on dialog | Implemented | `be/src/shared/db/migrations/20260312000000_initial_schema.ts` |
| Name uniqueness | Case-insensitive unique name check on create | Implemented | `be/src/modules/chat/services/chat-dialog.service.ts::createDialog()` |

### Access Control

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| User access grants | Grant individual users access to a dialog | Implemented | `be/src/modules/chat/models/chat-dialog-access.model.ts` |
| Team access grants | Grant teams access to a dialog | Implemented | `be/src/modules/chat/models/chat-dialog-access.model.ts::findAccessibleDialogIds()` |
| Bulk replace access | Atomic delete + insert of access entries | Implemented | `be/src/modules/chat/models/chat-dialog-access.model.ts::bulkReplace()` |
| Access check | Multi-level check: admin > owner > public > grants | Implemented | `be/src/modules/chat/services/chat-dialog.service.ts::checkUserAccess()` |
| Display name resolution | Joins user/team names for access entry display | Implemented | `be/src/modules/chat/services/chat-dialog.service.ts::getDialogAccess()` |

### Conversation Management

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| Create conversation | With prologue message insertion | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::createConversation()` |
| Get conversation + messages | Ordered by timestamp, ownership check | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::getConversation()` |
| List conversations | Filtered by dialog_id and user_id | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::listConversations()` |
| Rename conversation | With ownership verification | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::renameConversation()` |
| Bulk delete | Delete multiple conversations with messages | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::deleteConversations()` |
| Delete message | Single message deletion with ownership check | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::deleteMessage()` |
| Auto-create conversation | Frontend auto-creates on first message | Implemented | `fe/src/features/chat/pages/ChatPage.tsx::handleSendMessage()` |

### RAG Pipeline

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| Multi-turn refinement | LLM-based question synthesis from conversation history | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::refineMultiturnQuestion()` |
| Cross-language expansion | Translate query to target languages for broader retrieval | Implemented | `be/src/shared/services/rag-query.service.ts::expandCrossLanguage()` |
| Keyword extraction | LLM-based keyword extraction for enhanced BM25 | Implemented | `be/src/shared/services/rag-query.service.ts::extractKeywords()` |
| Hybrid search | Combined BM25 full-text + vector search with deduplication | Implemented | `be/src/modules/rag/services/rag-search.service.ts::hybridSearch()` |
| Multi-KB search | Search across multiple knowledge bases from dialog config | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::streamChat()` |
| Web search (Tavily) | Internet search results merged with KB chunks | Implemented | `be/src/shared/services/web-search.service.ts` |
| LLM reranking | LLM-based relevance reranking when no dedicated model | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::rerankChunks()` |
| Dedicated reranking | Rerank via configured rerank model provider | Implemented | `be/src/modules/rag/services/rag-rerank.service.ts` |
| Knowledge graph | GraphRAG retrieval integration | Implemented | `be/src/modules/rag/services/rag-graphrag.service.ts` |
| Deep research | Recursive retrieval with sufficiency checks | Implemented | `be/src/modules/rag/services/rag-deep-research.service.ts` |
| SQL retrieval | Natural language to SQL query execution | Implemented | `be/src/modules/rag/services/rag-sql.service.ts` |
| Metadata filtering | Dialog-level and per-message metadata filters for OpenSearch | Implemented | `be/src/modules/rag/services/rag-search.service.ts::buildMetadataFilter()` |
| Document ID filtering | Restrict search to specific document IDs | Implemented | `be/src/modules/rag/services/rag-search.service.ts::buildExtraFilters()` |
| Citation insertion | Post-process answer with `##ID:n$$` markers | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::processCitations()` |
| Empty response fallback | Custom response when no KB results found | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::streamChat()` |

### Streaming & LLM

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| Delta SSE streaming | Token-by-token streaming (not accumulated) | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::streamChat()` |
| Pipeline status events | Real-time status: refining, retrieving, reranking, generating | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts` |
| Performance metrics | Timing for refinement, retrieval, generation phases | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts` |
| Configurable LLM | Any OpenAI-compatible API via model_providers table | Implemented | `be/src/shared/services/llm-client.service.ts` |
| Per-message LLM override | Override LLM provider, temperature, max_tokens per message | Implemented | `be/src/modules/chat/schemas/chat-conversation.schemas.ts::chatCompletionSchema` |
| Multimodal support | Images sent as OpenAI vision format content parts | Implemented | `be/src/shared/services/llm-client.service.ts::buildMultimodalUserMessage()` |
| Stream cancellation | Frontend can abort streaming via AbortController | Implemented | `fe/src/features/chat/hooks/useChatStream.ts::stopStream()` |
| Message regeneration | Delete last assistant message and re-send user message | Implemented | `fe/src/features/chat/hooks/useChatStream.ts::regenerateLastMessage()` |

### Prompt & Variables

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| System prompt template | Customizable system prompt with `{variable}` placeholders | Implemented | `be/src/modules/chat/schemas/chat-dialog.schemas.ts::promptConfigSchema` |
| Custom variables | Admin-defined variables with key, description, optional flag, default | Implemented | `fe/src/features/chat/components/ChatVariableForm.tsx` |
| Variable substitution | Replace `{key}` placeholders with user-provided or default values | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts::substitutePromptVariables()` |
| Required variable validation | Reject completion if required variables missing | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts` |
| Variable form (user) | Dynamic form shown above chat input for required variables | Implemented | `fe/src/features/chat/pages/ChatPage.tsx` |

### File Upload

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| Multi-file upload | Up to 5 files per upload request | Implemented | `be/src/modules/chat/routes/chat-file.routes.ts` |
| Type validation | JPEG, PNG, GIF, WebP, PDF only | Implemented | `be/src/modules/chat/services/chat-file.service.ts` |
| Size validation | 20 MB maximum per file | Implemented | `be/src/modules/chat/services/chat-file.service.ts` |
| S3 storage | Files stored in RustFS with structured key paths | Implemented | `be/src/modules/chat/services/chat-file.service.ts::uploadFile()` |
| Presigned URLs | 1-hour presigned URLs for LLM consumption | Implemented | `be/src/modules/chat/services/chat-file.service.ts::getPresignedUrl()` |
| File streaming | Stream file content with correct Content-Type | Implemented | `be/src/modules/chat/controllers/chat-file.controller.ts::getFileContent()` |
| Auto-expiry | 30-day retention with automatic S3 + DB cleanup | Implemented | `be/src/modules/chat/services/chat-file.service.ts::cleanupExpired()` |
| Client preview | Blob URL previews for uploaded images | Implemented | `fe/src/features/chat/hooks/useChatFiles.ts` |

### Embed & API

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| Embed token CRUD | Create, list (masked), revoke tokens per dialog | Implemented | `be/src/shared/services/embed-token.service.ts` |
| Token validation cache | 30-second in-memory cache for fast validation | Implemented | `be/src/shared/services/embed-token.service.ts::validateToken()` |
| Token expiration | Optional `expires_at` with automatic rejection | Implemented | `be/src/shared/services/embed-token.service.ts` |
| External widget auth | 64-char hex token in URL path for anonymous access | Implemented | `be/src/modules/chat/controllers/chat-embed.controller.ts` |
| Internal widget auth | Session cookie auth for authenticated widget usage | Implemented | `fe/src/features/chat-widget/chatWidgetApi.ts` |
| Anonymous sessions | Synthetic user ID (`embed:{tokenId}`) for external users | Implemented | `be/src/modules/chat/controllers/chat-embed.controller.ts::createSession()` |
| OpenAI streaming | SSE with `chat.completion.chunk` format | Implemented | `be/src/modules/chat/controllers/chat-openai.controller.ts` |
| OpenAI non-streaming | JSON with `chat.completion` format | Implemented | `be/src/modules/chat/controllers/chat-openai.controller.ts` |
| Model listing | `GET /api/v1/models` returns `b-knowledge-rag` | Implemented | `be/src/modules/chat/controllers/chat-openai.controller.ts::listModels()` |
| Stream interceptor | Converts B-Knowledge SSE to OpenAI chunk format | Implemented | `be/src/modules/chat/controllers/chat-openai.controller.ts::createStreamInterceptor()` |

### Frontend Features

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| Three-panel layout | Sidebar + chat center + reference panel | Implemented | `fe/src/features/chat/pages/ChatPage.tsx` |
| Conversation sidebar | Search, create, select, delete, rename | Implemented | `fe/src/features/chat/components/ChatSidebar.tsx` |
| Markdown rendering | Assistant messages rendered as markdown | Implemented | `fe/src/features/chat/components/ChatMessage.tsx` |
| Copy to clipboard | One-click copy of assistant messages | Implemented | `fe/src/features/chat/components/ChatMessage.tsx` |
| Text-to-speech | Play/stop TTS for assistant messages | Implemented | `fe/src/features/chat/hooks/useTts.ts` |
| Feedback buttons | Thumbs up/down on assistant messages | Implemented | `fe/src/features/chat/components/ChatMessage.tsx` |
| Inline citations | Clickable `##ID:n$$` badges in messages | Implemented | `fe/src/components/CitationInline.tsx` |
| Document preview drawer | Slide-over drawer showing source chunk | Implemented | `fe/src/features/chat/components/ChatDocumentPreviewDrawer.tsx` |
| Reference panel | Right panel showing all retrieved chunks and doc aggregates | Implemented | `fe/src/features/chat/components/ChatReferencePanel.tsx` |
| Pipeline status indicator | Shows current pipeline phase during streaming | Implemented | `fe/src/features/chat/hooks/useChatStream.ts::PipelineStatus` |
| Reasoning toggle | Brain icon to enable deep thinking mode | Implemented | `fe/src/features/chat/components/ChatInput.tsx` |
| Internet search toggle | Globe icon to enable web search | Implemented | `fe/src/features/chat/components/ChatInput.tsx` |
| File upload button | Paperclip icon with drag-and-drop support | Implemented | `fe/src/features/chat/components/ChatInput.tsx` |
| Auto-resize textarea | Input grows with content, Shift+Enter for newline | Implemented | `fe/src/features/chat/components/ChatInput.tsx` |
| First-visit guide | `GuidelineDialog` shown on first chat visit | Implemented | `fe/src/features/chat/pages/ChatPage.tsx` |
| Admin management page | Table with search, pagination, CRUD, access control | Implemented | `fe/src/features/chat/pages/ChatDialogManagementPage.tsx` |
| URL-synced filters | Search and page state in URL search params | Implemented | `fe/src/features/chat/pages/ChatDialogManagementPage.tsx` |
| i18n support | All strings in en.json, vi.json, ja.json | Implemented | `fe/src/i18n/` |
| Dark mode | Full dark mode support via Tailwind `dark:` classes | Implemented | All chat components |

### Observability

| Feature | Description | Status | Location |
|---------|-------------|--------|----------|
| Langfuse tracing | Trace per pipeline execution with spans per step | Implemented | `be/src/modules/chat/services/chat-conversation.service.ts` |
| LLM generation tracking | Token usage, model, input/output logged to Langfuse | Implemented | `be/src/shared/services/llm-client.service.ts` |
| Structured logging | All operations logged via shared logger service | Implemented | All service files |
