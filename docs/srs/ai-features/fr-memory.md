# FR-MEMORY: AI Memory System

> Version 1.2 | Updated 2026-04-14

## 1. Purpose

Provide persistent, searchable memory pools that store extracted knowledge from conversations and agent interactions. The memory system enables AI assistants and agents to recall past interactions, user preferences, learned facts, and procedural knowledge across sessions.

## 2. Scope

| In Scope | Out of Scope |
|----------|-------------|
| Memory pool CRUD with configurable types | Cross-tenant memory sharing |
| 4 memory types via bitmask (Raw, Semantic, Episodic, Procedural) | Graph-based memory storage (planned) |
| LLM-powered extraction with custom prompts | Memory conflict resolution |
| Hybrid vector+text search (OpenSearch) | Automatic memory decay/aging |
| FIFO forgetting policy | Memory deduplication |
| Chat history import | |
| Agent memory_read/memory_write nodes | |
| Batch and realtime extraction modes | |
| Per-pool embedding and LLM model configuration | |
| Multi-scope ownership (user, agent, team) | |

## 3. Actors

| Actor | Description |
|-------|-------------|
| **Admin / Leader** | Create and manage memory pools, configure extraction settings |
| **Member** | Use memories through chat/agent interactions |
| **Agent Workflow** | Read/write memories via memory_read/memory_write nodes |
| **Extraction Service** | Background LLM pipeline that converts conversations to memories |

## 4. Functional Requirements

### FR-MEM-01: Memory Pool CRUD

- Users with `manage Memory` ability can create, update, and delete memory pools
- Each pool has: name, description, memory_type (bitmask), storage_type, memory_size, model overrides, prompts, extraction settings, and access control
- Pools are tenant-scoped with multi-scope ownership via `scope_type` + `scope_id` (user, agent, or team)
- Deletion cascades to all OpenSearch messages

### FR-MEM-02: Memory Types (Bitmask)

Memory types are combined using a bitmask integer (default: 15 = all types):

| Type | Bit Value | Description | Extraction |
|------|-----------|-------------|------------|
| **Raw** | 1 | Verbatim conversation storage | Direct copy (no LLM) |
| **Semantic** | 2 | Facts, definitions, key concepts, relationships | LLM extraction |
| **Episodic** | 4 | Events, experiences, interactions, temporal references | LLM extraction |
| **Procedural** | 8 | Step-by-step procedures, workflows, how-to instructions | LLM extraction |

The 4-type bitmask system allows any combination of types to be enabled per pool (e.g., 6 = Semantic + Episodic).

### FR-MEM-03: Memory Extraction Pipeline

- **Realtime mode**: Extract memories per conversation turn as it happens
- **Batch mode**: Extract from full conversation session at end
- Extraction process:
  1. Load memory pool configuration (types, prompts, model)
  2. For each enabled memory type (check bitmask):
     a. Select prompt template (custom or default)
     b. Call LLM via `llmClientService` with conversation content (per-type extraction)
     c. Parse JSON array response with **3-tier fallback**: (1) direct JSON parse, (2) extract JSON from markdown code block, (3) regex extraction of array
     d. Generate embedding vector for each extracted item
     e. Store in OpenSearch with metadata
- Custom system/user prompts per pool override defaults
- Configurable LLM model, embedding model, and temperature per pool

> **CRITICAL: Embedding generation currently passes empty vector `[]`** -- vector search is disabled and the system falls back to text-only search. The `content_embed` field exists in the OpenSearch mapping but is populated with empty arrays.

> **CRITICAL: Realtime extraction mode is NOT WIRED in the chat pipeline** despite schema support. The `extraction_mode` field exists on memory pools but the chat completion flow does not trigger realtime extraction. Only batch import via the `/import` endpoint is functional.

### FR-MEM-04: Memory Storage (OpenSearch)

- Per-tenant OpenSearch index: `memory_{tenantId}`
- Each memory message document contains:
  - `message_id` (UUID, used as document _id)
  - `memory_id` (parent pool reference)
  - `content` (extracted text)
  - `content_embed` (knn_vector, dimension 1024, HNSW with cosine similarity, engine: nmslib)
  - `message_type` (bitmask value: 1, 2, 4, or 8)
  - `status` (1=active, 0=forgotten)
  - `source_id` (originating session/run ID)
  - `user_id` (originating user, optional)
  - `valid_at` / `invalid_at` (temporal validity range)
  - `tenant_id` (multi-tenant isolation)

### FR-MEM-05: Hybrid Search

- Combined vector + text search in a single OpenSearch query
- Configurable vector weight (default 0.7) vs text weight (0.3)
- Filter by: memory_id, tenant_id, active status
- Returns scored results sorted by relevance
- Used by agent memory_read nodes and chat context injection
- **Note:** Due to empty embedding vectors (see FR-MEM-03), search currently operates as text-only fallback

### FR-MEM-06: FIFO Forgetting Policy

- Automatically enforced after each message insertion
- Estimates **~9KB per message** for size calculations
- Calculates max messages from pool `memory_size` (default **5MB**) / approximate message size
- When limit exceeded, deletes oldest messages first via OpenSearch `deleteByQuery`
- Non-blocking: FIFO failure does not prevent insertion

### FR-MEM-07: Message Management

- List messages with pagination, keyword search, and type filter
- Delete individual messages
- Forget messages (set status to forgotten; one-way operation)
- Forgotten messages excluded from search results but not deleted
- Direct message insert for programmatic memory creation

### FR-MEM-08: Chat History Import

- Import messages from existing chat sessions into a memory pool via `POST /:id/import`
- Loads messages from a specified chat session
- Groups chat messages into user+assistant pairs
- Each pair processed through the extraction pipeline
- Returns count of imported memory items

### FR-MEM-09: Agent Integration

- **memory_read** node: Search a memory pool during agent execution
- **memory_write** node: Store new memories during agent execution
- Direct message insert API for programmatic memory creation
- Memory pools can be scoped to specific agents

### FR-MEM-10: Access Control

- Pool-level permission: `me` (creator only) or `team` (all team members)
- Multi-scope ownership: `scope_type` + `scope_id` fields supporting `user`, `agent`, or `team` scope
- All operations require `manage Memory` CASL ability
- Tenant isolation enforced on all queries

## 5. API Endpoints

### 5.1 Memory Pool CRUD

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/memory` | Create memory pool |
| GET | `/api/memory` | List memory pools |
| GET | `/api/memory/:id` | Get memory pool details |
| PUT | `/api/memory/:id` | Update memory pool |
| DELETE | `/api/memory/:id` | Delete memory pool |

### 5.2 Message Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/memory/:id/messages` | List messages with pagination and filters |
| POST | `/api/memory/:id/messages` | Insert memory message directly |
| DELETE | `/api/memory/:id/messages/:messageId` | Delete individual message |
| PUT | `/api/memory/:id/messages/:messageId/forget` | Mark message as forgotten (one-way) |
| POST | `/api/memory/:id/search` | Hybrid search within memory pool |
| POST | `/api/memory/:id/import` | Import chat history into memory pool |

## 6. Authorization

| Action | Required Ability |
|--------|-----------------|
| All memory operations | `manage Memory` (via CASL) |
| Pool visibility | `permission` field: `me` or `team` |
| Tenant isolation | Mandatory on all queries |

## 7. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Extraction latency | < 5s per conversation turn (realtime mode) |
| Search latency | < 200ms for hybrid search |
| Default pool size | 5MB (~582 messages at ~9KB per message) |
| Embedding dimension | 1024 (HNSW with cosine similarity) |
| Index creation | Idempotent with in-memory cache |
| Multi-tenant isolation | Per-tenant OpenSearch index |

## 8. Dependencies

| Dependency | Purpose |
|------------|---------|
| PostgreSQL | Memory pool metadata (memories table) |
| OpenSearch | Memory message storage, vector search, text search |
| LLM Provider | Memory extraction via `llmClientService` (configurable per pool) |
| Embedding Model | Vector generation for semantic search (currently non-functional -- empty vectors) |
| Redis | Inter-service communication for agent memory nodes |
