# FR-MEMORY: AI Memory System

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
- Each pool has: name, description, memory_type (bitmask), storage_type, memory_size, extraction settings, and access control
- Pools are tenant-scoped with multi-scope ownership (user, agent, or team)
- Deletion cascades to all OpenSearch messages

### FR-MEM-02: Memory Types (Bitmask)

Memory types are combined using a bitmask integer (default: 15 = all types):

| Type | Bit Value | Description | Extraction |
|------|-----------|-------------|------------|
| **Raw** | 1 | Verbatim conversation storage | Direct copy (no LLM) |
| **Semantic** | 2 | Facts, definitions, key concepts, relationships | LLM extraction |
| **Episodic** | 4 | Events, experiences, interactions, temporal references | LLM extraction |
| **Procedural** | 8 | Step-by-step procedures, workflows, how-to instructions | LLM extraction |

### FR-MEM-03: Memory Extraction Pipeline

- **Realtime mode**: Extract memories per conversation turn as it happens
- **Batch mode**: Extract from full conversation session at end
- Extraction process:
  1. Load memory pool configuration (types, prompts, model)
  2. For each enabled memory type (check bitmask):
     a. Select prompt template (custom or default)
     b. Call LLM with conversation content
     c. Parse JSON array response (with 3-tier fallback)
     d. Generate embedding vector for each extracted item
     e. Store in OpenSearch with metadata
- Custom system/user prompts per pool override defaults
- Configurable LLM model and temperature per pool

### FR-MEM-04: Memory Storage (OpenSearch)

- Per-tenant OpenSearch index: `memory_{tenantId}`
- Each memory message document contains:
  - `message_id` (UUID, used as document _id)
  - `memory_id` (parent pool reference)
  - `content` (extracted text)
  - `content_embed` (knn_vector, dimension 1024, HNSW with cosine similarity)
  - `message_type` (bitmask value: 1, 2, 4, or 8)
  - `status` (1=active, 0=forgotten)
  - `source_id` (originating session/run ID)
  - `valid_at` / `invalid_at` (temporal validity range)
  - `tenant_id` (multi-tenant isolation)

### FR-MEM-05: Hybrid Search

- Combined vector + text search in a single OpenSearch query
- Configurable vector weight (default 0.7) vs text weight (0.3)
- Filter by: memory_id, tenant_id, active status
- Returns scored results sorted by relevance
- Used by agent memory_read nodes and chat context injection

### FR-MEM-06: FIFO Forgetting Policy

- Automatically enforced after each message insertion
- Calculates max messages from pool `memory_size` / approximate message size (9KB)
- When limit exceeded, deletes oldest messages first
- Non-blocking: FIFO failure does not prevent insertion

### FR-MEM-07: Message Management

- List messages with pagination, keyword search, and type filter
- Delete individual messages
- Forget/restore messages (status toggle: active ↔ forgotten)
- Forgotten messages excluded from search results but not deleted

### FR-MEM-08: Chat History Import

- Import messages from existing chat sessions into a memory pool
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
- Multi-scope ownership: `user`, `agent`, or `team` scope_type
- All operations require `manage Memory` CASL ability
- Tenant isolation enforced on all queries

## 5. Authorization

| Action | Required Ability |
|--------|-----------------|
| All memory operations | `manage Memory` (via CASL) |
| Pool visibility | `permission` field: `me` or `team` |
| Tenant isolation | Mandatory on all queries |

## 6. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Extraction latency | < 5s per conversation turn (realtime mode) |
| Search latency | < 200ms for hybrid search |
| Default pool size | 5MB (~555 messages) |
| Embedding dimension | 1024 (HNSW with cosine similarity) |
| Index creation | Idempotent with in-memory cache |
| Multi-tenant isolation | Per-tenant OpenSearch index |

## 7. Dependencies

| Dependency | Purpose |
|------------|---------|
| PostgreSQL | Memory pool metadata (memories table) |
| OpenSearch | Memory message storage, vector search, text search |
| LLM Provider | Memory extraction (configurable per pool) |
| Embedding Model | Vector generation for semantic search |
| Redis | Inter-service communication for agent memory nodes |
