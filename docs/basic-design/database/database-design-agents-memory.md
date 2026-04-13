# Agent & Memory Tables ER Diagram

## Overview

Agent and Memory tables support the visual workflow builder (agents) and persistent AI memory system (memories). These tables were introduced in the initial schema migration and extend the platform with orchestration and knowledge retention capabilities.

## Agent Tables ER Diagram

```mermaid
erDiagram
    agents {
        text id PK "UUID"
        text name "Human-readable name"
        text description "Optional description"
        text avatar "Avatar URL"
        enum mode "agent | pipeline"
        enum status "draft | published"
        jsonb dsl "Workflow graph definition"
        int dsl_version "DSL schema version"
        jsonb policy_rules "ABAC authorization rules"
        text parent_id FK "NULL=root, root_id=version"
        int version_number "0=root, 1+=snapshot"
        varchar version_label "Human-readable version name"
        text tenant_id "Multi-tenant isolation"
        text knowledge_base_id FK "Optional knowledge-base association"
        text created_by "Creator user UUID"
        timestamp created_at
        timestamp updated_at
    }

    agent_runs {
        text id PK "UUID"
        text agent_id FK "Parent agent"
        text tenant_id "Multi-tenant isolation"
        enum status "pending | running | completed | failed | cancelled"
        enum mode "Copied from agent at start"
        text input "User input text"
        text output "Final result text"
        text error "Error message if failed"
        timestamp started_at
        timestamp completed_at
        int duration_ms "Execution time"
        int total_nodes "Total nodes in graph"
        int completed_nodes "Progress counter"
        text triggered_by FK "User who triggered"
        enum trigger_type "manual | webhook | embed"
        timestamp created_at
        timestamp updated_at
    }

    agent_run_steps {
        text id PK "UUID"
        text run_id FK "Parent run"
        text node_id "Node ID in DSL graph"
        text node_type "Operator type"
        text node_label "Human-readable label"
        enum status "pending | running | completed | failed | skipped"
        jsonb input_data "Node input payload"
        jsonb output_data "Node output payload"
        text error "Error message if failed"
        timestamp started_at
        timestamp completed_at
        int duration_ms "Node execution time"
        int execution_order "Sequential order"
        timestamp created_at
    }

    agent_templates {
        text id PK "UUID"
        text name "Template name"
        text description "Template description"
        text avatar "Template avatar"
        varchar category "Gallery category filter"
        enum mode "agent | pipeline"
        jsonb dsl "Workflow graph definition"
        int dsl_version "DSL schema version"
        boolean is_system "System templates cannot be deleted"
        text tenant_id "NULL=global, set=tenant-specific"
        text created_by "Creator user UUID"
        timestamp created_at
        timestamp updated_at
    }

    agent_tool_credentials {
        text id PK "UUID"
        text tenant_id "Multi-tenant isolation"
        text agent_id FK "NULL=tenant default, set=agent-specific"
        varchar tool_type "Tool identifier (tavily, github, sql)"
        text name "Human-readable label"
        text encrypted_credentials "AES-256-CBC encrypted"
        text created_by "Creator user UUID"
        timestamp created_at
        timestamp updated_at
    }

    agents ||--o{ agent_runs : "executions"
    agents ||--o{ agents : "parent_id (versions)"
    agent_runs ||--o{ agent_run_steps : "steps"
    agents ||--o{ agent_tool_credentials : "credentials"
```

## Memory Tables ER Diagram

```mermaid
erDiagram
    memories {
        text id PK "UUID, gen_random_uuid()"
        varchar name "Pool name (255)"
        text description "Optional description"
        text avatar "Avatar URL"
        int memory_type "Bitmask: RAW=1 SEMANTIC=2 EPISODIC=4 PROCEDURAL=8, default 15"
        varchar storage_type "table | graph (20), CHECK constraint"
        int memory_size "Max size in bytes, default 5242880"
        varchar forgetting_policy "FIFO (20)"
        varchar embd_id "Per-pool embedding model (255), soft reference to model_providers"
        varchar llm_id "Per-pool LLM model (255), soft reference to model_providers"
        float temperature "LLM temperature, default 0.1"
        text system_prompt "Custom extraction system prompt"
        text user_prompt "Custom extraction user prompt"
        varchar extraction_mode "batch | realtime (20), CHECK, default batch"
        varchar permission "me | team (10), CHECK, default me"
        varchar scope_type "user | agent | team (20), CHECK, default user"
        text scope_id "Owner entity UUID"
        varchar tenant_id "Multi-tenant isolation (255), NOT NULL"
        varchar created_by "Creator user UUID (255), no FK constraint"
        timestamp created_at "with tz, default now()"
        timestamp updated_at "with tz, default now()"
    }
```

> **Note**: Memory messages are stored in OpenSearch (not PostgreSQL). See [Memory Architecture](/basic-design/agent-memory/memory-architecture) for the OpenSearch index mapping.
>
> **Note**: `embd_id`, `llm_id`, and `created_by` are soft references to `model_providers` and `users`; the migration does not enforce foreign keys for them.

## Memory Table Indexes

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| memories | idx_memories_tenant_id | `(tenant_id)` | Tenant-scoped queries |
| memories | idx_memories_scope | `(scope_type, scope_id)` | Scope-based lookup |
| memories | idx_memories_created_by | `(created_by)` | Creator filtering |

## Agent Table Indexes

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| agents | idx_agents_tenant_parent | `(tenant_id, parent_id)` | Fast version listing within tenant |
| agents | idx_agents_tenant_status | `(tenant_id, status)` | Filter by status within tenant |
| agents | idx_agents_project_id | `(knowledge_base_id)` | Knowledge-base association lookup |
| agent_runs | idx_runs_agent | `(agent_id)` | Execution history per agent |
| agent_runs | idx_runs_tenant_status | `(tenant_id, status)` | Filter runs by status |
| agent_run_steps | idx_steps_run | `(run_id)` | All steps for a run |
| agent_run_steps | idx_steps_run_node | `(run_id, node_id)` | Specific step lookup |
| agent_templates | idx_templates_tenant | `(tenant_id)` | Template discovery |
| agent_templates | idx_templates_category | `(category)` | Category filtering |
| agent_tool_credentials | idx_creds_tenant | `(tenant_id)` | Credential listing |
| agent_tool_credentials | idx_creds_agent | `(agent_id)` | Agent-specific credentials |
| agent_tool_credentials | UNIQUE | `(tenant_id, COALESCE(agent_id, '00...'), tool_type)` | One credential per scope+type |

## Agent Version-as-Row Pattern

Agents use a single-table versioning pattern where root agents and version snapshots coexist in the same table:

| `parent_id` | `version_number` | Meaning |
|-------------|-----------------|---------|
| `NULL` | `0` | Root agent (current working copy) |
| `<root_id>` | `1` | First version snapshot |
| `<root_id>` | `2` | Second version snapshot |
| `<root_id>` | `N` | Nth version snapshot |

**Key queries:**
- List root agents: `WHERE parent_id IS NULL AND tenant_id = ?`
- List versions: `WHERE parent_id = ? ORDER BY version_number`
- Restore version: Copy DSL from version row to root row

## Memory Type Bitmask Reference

| Type | Bit Value | Combined Example |
|------|-----------|-----------------|
| Raw | 1 | `1` = Raw only |
| Semantic | 2 | `3` = Raw + Semantic |
| Episodic | 4 | `6` = Semantic + Episodic |
| Procedural | 8 | `15` = All four types |

Check enabled: `(memory_type & BIT_VALUE) !== 0`

## Memory OpenSearch Index

Memory messages are stored in per-tenant OpenSearch indices:

- **Index pattern**: `memory_{tenantId}`
- **Vector field**: `content_embed` (knn_vector, dim=1024, HNSW cosine)
- **Text field**: `content` (standard analyzer)
- **Key filters**: `memory_id`, `tenant_id`, `status`

See [Memory Architecture](/basic-design/agent-memory/memory-architecture) for the full index mapping.

## Relationships to Existing Tables

```mermaid
erDiagram
    users ||--o{ agents : "created_by"
    users ||--o{ agent_runs : "triggered_by"
    users ||--o{ memories : "created_by"
    knowledge_base ||--o{ agents : "knowledge_base_id"
    tenant ||--o{ agents : "tenant_id"
    tenant ||--o{ memories : "tenant_id"
    model_providers ||--o{ memories : "embd_id, llm_id"
```

| Relationship | FK Column | Target Table | Notes |
|-------------|-----------|-------------|-------|
| Agent → User | `created_by` | `users` | Creator tracking |
| Agent → Knowledge Base | `knowledge_base_id` | `knowledge_base` | Optional knowledge-base scope |
| Agent → Tenant | `tenant_id` | `tenant` | Multi-tenant isolation |
| Agent Run → User | `triggered_by` | `users` | Who started the run |
| Memory → User | `created_by` | `users` | Pool creator (soft ref, no FK) |
| Memory → Tenant | `tenant_id` | `tenant` | Multi-tenant isolation (soft ref, no FK) |
| Memory → LLM | `embd_id`, `llm_id` | `model_providers` | Model overrides (soft ref, no FK) |

---

## Peewee-Managed Canvas Tables

The following tables are managed by the Python worker's Peewee ORM. Their schema is defined in the initial migration but data access is via Peewee models in `advance-rag/`.

### canvas_template

Agent canvas templates (reusable workflow patterns):

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| Various | — | Template definition fields managed by Peewee |

### user_canvas

Per-user workflow canvas state:

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| Various | — | Canvas state and metadata managed by Peewee |

### user_canvas_version

Canvas version history:

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| Various | — | Version snapshots managed by Peewee |

> **Note**: These tables are created by the backend Knex migration but exclusively read/written by the Python Peewee ORM. See `advance-rag/db/db_models.py` for full column definitions.
