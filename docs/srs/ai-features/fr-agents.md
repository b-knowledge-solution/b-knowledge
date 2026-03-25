# FR-AGENTS: Agent Workflow Engine

## 1. Purpose

Provide a visual, no-code/low-code agent builder that allows users to design, execute, and monitor AI workflows (agents and pipelines) using a drag-and-drop canvas. Agents orchestrate multi-step tasks combining LLM reasoning, knowledge retrieval, external tool usage, and conditional logic.

## 2. Scope

| In Scope | Out of Scope |
|----------|-------------|
| Visual canvas editor (React Flow) | Custom operator SDK for third-party developers |
| Visual workflow canvas with the current built-in operator set | Agent marketplace / sharing across tenants |
| Agent and Pipeline execution modes | Multi-agent collaboration (agents calling agents) |
| Version management (version-as-row) | Scheduled/cron-triggered agent runs |
| Debug mode with breakpoints | |
| Webhook and embed widget triggers | |
| Encrypted tool credentials | |
| Template gallery | |
| MCP server integration | |
| Real-time SSE streaming of execution | |

## 3. Actors

| Actor | Description |
|-------|-------------|
| **Admin / Leader** | Create, configure, publish, and manage agents |
| **Member** | Execute published agents, view run history |
| **External System** | Trigger agent runs via webhook (unauthenticated, rate-limited) |
| **Embed Widget** | Public agent execution via token-based embed |

## 4. Functional Requirements

### FR-AGT-01: Agent CRUD

- Users with `manage Agent` ability can create, update, duplicate, and delete agents
- Each agent has: name, description, avatar, mode (agent/pipeline), status (draft/published), DSL (workflow graph), and policy_rules (ABAC)
- Agents are scoped to a tenant and can optionally be associated with a project
- Deletion cascades to all versions, runs, and run steps

### FR-AGT-02: Visual Canvas Editor

- Infinite canvas with pan/zoom powered by React Flow
- Node system split across 6 UI categories with a broad built-in operator set. The frontend type layer currently defines 50+ operator identifiers and the palette surfaces the commonly used ones:
  - **Input/Output** (blue): begin, answer, message, fillup
  - **LLM/AI** (purple): generate, categorize, rewrite, relevant, agent_with_tools
  - **Retrieval** (green): retrieval, wikipedia, tavily, pubmed, memory_read
  - **Logic Flow** (amber): switch, condition, loop, loop_item, iteration, iteration_item, exit_loop, merge, note, concentrator
  - **Code/Tool** (pink): code, github, sql, api, email, invoke, MCP tools
  - **Data** (cyan): template, keyword_extract, web search engines (baidu, bing, duckduckgo, google), finance APIs (akshare, yahoofinance, jin10, tushare, wencai), data_operations, list_operations, string_transform, docs_generator, excel_processor, arxiv, google_scholar, deepl, qweather, exesql, crawler, variable_assigner, variable_aggregator, memory_write
- Each node type has a dedicated configuration form
- Edge drawing with conditional routing support
- Smart copy/paste for subgraph duplication
- Undo/redo support

### FR-AGT-03: Execution Modes

| Mode | Description |
|------|-------------|
| **Agent** | LLM-driven execution with dynamic routing based on model decisions |
| **Pipeline** | Deterministic DAG execution following topological order |

### FR-AGT-04: Execution Engine

- Graph traversal using Kahn's algorithm (topological sort)
- Nodes classified as **inline** (executed in Node.js) or **dispatch** (sent to the Python worker through Redis)
- Inline nodes currently include lightweight logic/content nodes such as `begin`, `answer`, `message`, `switch`, `condition`, `merge`, `note`, `concentrator`, `template`, and `keyword_extract`
- Dispatch nodes currently include LLM, retrieval, loop, and external-tool nodes such as `generate`, `categorize`, `retrieval`, `code`, `api`, `email`, web search tools, finance tools, and similar integrations
- Real-time progress tracking (completed_nodes / total_nodes)
- Configurable max execution time
- Cancellation support via Redis signal

### FR-AGT-05: Version Management

- Version-as-row pattern: root agent (parent_id=NULL, version_number=0) plus snapshot rows (parent_id=root, version_number=1,2,3...)
- Save version with optional label
- Restore to any previous version
- Delete specific versions
- Immutable snapshots (version rows never modified after creation)

### FR-AGT-06: Debug Mode

- Start debug run with pre-set breakpoints
- Step-by-step node execution
- Continue from breakpoint
- Inspect input/output data at each step
- View full execution trace

### FR-AGT-07: Webhook Triggers

- Public endpoint: `POST /agents/webhook/:agentId`
- No authentication required (rate-limited: 100 requests/15 minutes per IP)
- Agent must be in `published` status
- Input extracted from request body (`input`, `message`, or `query` field)
- Returns `{ run_id }` for status polling

### FR-AGT-08: Embed Widget

- Token-based public access (similar to chat/search embed pattern)
- Configurable widget appearance (agent name, avatar)
- SSE streaming of execution output
- Token management (create, list, revoke) requires admin permissions

### FR-AGT-09: Tool Credentials

- Encrypted storage using AES-256-CBC
- Tenant-level defaults (agent_id=NULL) and agent-specific overrides
- Unique constraint per (tenant, agent, tool_type)
- Credentials never returned to frontend (sanitized in API responses)
- Decrypted only when dispatching to Python worker

### FR-AGT-10: Template Gallery

- Pre-built workflow templates for common use cases
- System templates (is_system=true, cannot be deleted)
- Tenant-specific custom templates
- Category-based organization for gallery filtering
- Create new agent from template

### FR-AGT-11: MCP Server Integration

- Connect to external MCP servers via HTTP streaming transport
- List available tools from MCP servers
- Call MCP tools during agent execution
- Connection caching by URL

### FR-AGT-12: Export/Import

- Export agent as JSON file (DSL + metadata)
- Duplicate agent with "(copy)" suffix

### FR-AGT-13: Run History

- List all execution runs for an agent
- View run details: status, duration, input/output, error
- View per-node step details with input/output data
- Filter by status (pending, running, completed, failed, cancelled)

## 5. Authorization

| Action | Required Ability |
|--------|-----------------|
| List/view agents | `read Agent` |
| Create/update/delete agents | `manage Agent` |
| Run published agents | `read Agent` |
| Cancel runs | `manage Agent` |
| Manage tool credentials | `manage Agent` |
| Webhook trigger | Public (rate-limited) |
| Embed widget | Token-based (public) |

See [RBAC & ABAC Detail](/detail-design/auth/rbac-abac) for full permission model.

## 6. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Canvas render performance | Smooth at 200+ nodes |
| Execution timeout | Configurable per agent (default: 300s) |
| SSE streaming latency | < 200ms per event |
| Webhook rate limit | 100 requests / 15 minutes per IP |
| Tool credential encryption | AES-256-CBC |
| Multi-tenant isolation | All queries filtered by tenant_id |

## 7. Dependencies

| Dependency | Purpose |
|------------|---------|
| PostgreSQL | Agent, run, step, template, credential storage |
| Redis Streams | Node execution dispatch to Python worker |
| Redis Pub/Sub | Real-time SSE event delivery |
| OpenSearch | Retrieval nodes (knowledge base search) |
| Python Worker | LLM, retrieval, code, API node execution |
| React Flow | Visual canvas editor |
