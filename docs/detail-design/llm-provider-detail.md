# LLM Provider Management Detail Design

## Overview

The LLM Provider module manages connections to external AI model services. Admins configure providers, test connections, and set defaults. All AI-consuming services resolve models through a priority chain: explicit provider ID, tenant default, then system default.

## Architecture

```mermaid
flowchart TD
    A[Admin] -->|Configure| B[Create Provider]
    B --> C{Test Connection}
    C -->|Success| D[Save Provider]
    C -->|Failure| E[Show Error]
    D --> F[Set as Default?]
    F -->|Yes| G[Default for model_type]
    F -->|No| H[Available Provider]
    G --> I[Services Use Provider]
    H --> I
    I --> J[Chat Service]
    I --> K[Embedding Service]
    I --> L[Rerank Service]
    I --> M[Speech/TTS/Image Services]
```

## Model Types

| Type | Purpose | Example Providers |
|------|---------|-------------------|
| `chat` | Conversational LLM | OpenAI GPT, Azure OpenAI, Anthropic |
| `embedding` | Text embeddings for RAG | OpenAI Ada, Jina, Cohere |
| `rerank` | Re-ranking search results | Cohere Rerank, Jina Rerank |
| `speech2text` | Audio transcription | OpenAI Whisper, Azure Speech |
| `tts` | Text-to-speech | OpenAI TTS, Azure Speech |
| `image2text` | Image understanding | OpenAI Vision, Azure Vision |

## API Endpoints

### Provider CRUD

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/llm-provider` | Create provider |
| GET | `/api/llm-provider` | List providers for tenant |
| GET | `/api/llm-provider/:id` | Get provider details |
| PUT | `/api/llm-provider/:id` | Update provider config |
| DELETE | `/api/llm-provider/:id` | Soft delete (set status=inactive) |

### Operations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/llm-provider/:id/test-connection` | Test API connectivity |
| GET | `/api/llm-provider/defaults` | Get default provider per model_type |
| GET | `/api/llm-provider/presets` | Factory preset configurations |
| GET | `/api/models` | Public model list for authenticated users |

## Connection Test Flow

```mermaid
sequenceDiagram
    actor Admin
    participant FE as Frontend
    participant API as Provider API
    participant LLM as External LLM Service

    Admin->>FE: Click "Test Connection"
    FE->>API: POST /api/llm-provider/:id/test-connection
    API->>API: Load provider config
    API->>LLM: Minimal API call (e.g., list models)
    alt Success
        LLM-->>API: 200 OK
        API-->>FE: { success: true, latency_ms }
    else Failure
        LLM-->>API: Error / Timeout
        API-->>FE: { success: false, error: "message" }
    end
    FE->>Admin: Show result
```

## Model Resolution Chain

When a service needs an LLM model, it resolves through a priority chain.

```mermaid
sequenceDiagram
    participant Service as AI Service
    participant Resolver as Model Resolver
    participant DB as PostgreSQL

    Service->>Resolver: Need model (type, provider_id?)
    alt Explicit provider_id given
        Resolver->>DB: SELECT WHERE id = provider_id AND status = active
        DB-->>Resolver: Provider record
        Resolver-->>Service: Use explicit provider
    else No explicit provider_id
        Resolver->>DB: SELECT WHERE tenant_id = ? AND model_type = ? AND is_default = true
        alt Tenant default exists
            DB-->>Resolver: Tenant default provider
            Resolver-->>Service: Use tenant default
        else No tenant default
            Resolver->>DB: SELECT WHERE is_system_default = true AND model_type = ?
            DB-->>Resolver: System default provider
            Resolver-->>Service: Use system default
        end
    end
```

## Factory Presets

`GET /api/llm-provider/presets` returns built-in configurations for common providers:

| Preset | Base URL | Models |
|--------|----------|--------|
| OpenAI | `https://api.openai.com/v1` | gpt-4o, gpt-4o-mini, text-embedding-3-small |
| Azure OpenAI | `https://{resource}.openai.azure.com` | Deployment-based |
| Jina | `https://api.jina.ai/v1` | jina-embeddings-v3, jina-reranker-v2 |
| Cohere | `https://api.cohere.ai/v2` | embed-english-v3.0, rerank-v3.5 |

Presets pre-fill the create form; the admin still provides API keys and customizes settings.

## Soft Delete

`DELETE /api/llm-provider/:id` sets `status = 'inactive'` rather than removing the record. This preserves referential integrity with historical chat sessions and search logs that reference the provider.

## Public Model List

`GET /api/models` returns available models across all active providers for the tenant. Used by chat configuration and search app setup UIs to let users pick models without needing provider admin access.

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/llm-provider/` | Module root |
| `be/src/modules/llm-provider/llm-provider.controller.ts` | Route handlers |
| `be/src/modules/llm-provider/llm-provider.service.ts` | Business logic, resolution chain |
| `be/src/modules/llm-provider/llm-provider.model.ts` | Knex model (tenant_llm table) |
| `be/src/modules/llm-provider/llm-provider.validation.ts` | Zod schemas |
| `fe/src/features/llm-provider/` | Frontend feature |
