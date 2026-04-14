# FR-AGENTS: Agent Workflow Engine

> Version 1.2 | Updated 2026-04-14

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
- **27 node types** defined in `AgentNodeType` constants

> **Note:** `memory_read` and `memory_write` agent nodes are listed in the frontend palette but are NOT yet implemented in backend code (node types missing from backend constants).

### FR-AGT-03: Execution Modes

| Mode | Description |
|------|-------------|
| **Agent** | LLM-driven execution with dynamic routing based on model decisions |
| **Pipeline** | Deterministic DAG execution following topological order |

### FR-AGT-04: Execution Engine

- Graph traversal using **Kahn's algorithm** (topological sort)
- Nodes classified as **inline** (executed in Node.js) or **dispatch** (sent to the Python worker through Redis)
- Inline nodes currently include lightweight logic/content nodes such as `begin`, `answer`, `message`, `switch`, `condition`, `merge`, `note`, `concentrator`, `template`, and `keyword_extract`
- Dispatch nodes currently include LLM, retrieval, loop, and external-tool nodes such as `generate`, `categorize`, `retrieval`, `code`, `api`, `email`, web search tools, finance tools, and similar integrations
- `getDownstreamNodes()` handles routing for switch/condition nodes, selecting the correct downstream branch
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
- In-memory breakpoint state using `Map<runId, DebugRunState>`

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
- List available tools from MCP servers (`listTools`)
- Call MCP tools during agent execution (`callTool`) with timeout (30s)
- Connection caching by URL

### FR-AGT-12: Export/Import

- Export agent as JSON file (DSL + metadata)
- Duplicate agent with "(copy)" suffix

### FR-AGT-13: Run History

- List all execution runs for an agent
- View run details: status, duration, input/output, error
- View per-node step details with input/output data
- Filter by status (pending, running, completed, failed, cancelled)

### FR-AGT-14: Sandbox Execution

- Docker containers for code execution nodes
- Sandbox limits: **256MB memory**, no network access, read-only filesystem, **30-second timeout**
- Supported languages: Python, JavaScript, Bash

### FR-AGT-15: Redis Streams Worker Communication

- `queueNodeExecution` dispatches node work to the Python worker via Redis Streams
- `subscribeToRunOutput` listens for execution progress from worker
- `publishNodeResult` returns node results from worker to orchestrator

## 5. API Endpoints

### 5.1 Agent CRUD

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents` | Create agent |
| GET | `/api/agents` | List agents |
| GET | `/api/agents/:id` | Get agent details |
| PUT | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |
| POST | `/api/agents/:id/duplicate` | Duplicate agent |
| POST | `/api/agents/:id/publish` | Publish agent |

### 5.2 Execution

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents/:id/run` | Start agent run |
| POST | `/api/agents/:id/run/:runId/cancel` | Cancel running agent |
| GET | `/api/agents/:id/runs` | List runs for agent |
| GET | `/api/agents/:id/runs/:runId` | Get run details |
| GET | `/api/agents/:id/runs/:runId/steps` | Get run step details |

### 5.3 Debug Mode

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents/:id/debug` | Start debug run with breakpoints |
| POST | `/api/agents/:id/debug/:runId/step` | Step to next node |
| POST | `/api/agents/:id/debug/:runId/continue` | Continue from breakpoint |
| POST | `/api/agents/:id/debug/breakpoints` | Set breakpoints |
| DELETE | `/api/agents/:id/debug/breakpoints` | Clear breakpoints |
| GET | `/api/agents/:id/debug/:runId/steps/:stepId` | Get step details |

### 5.4 Version Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents/:id/versions` | List versions |
| POST | `/api/agents/:id/versions` | Save new version |
| DELETE | `/api/agents/:id/versions/:versionId` | Delete version |
| POST | `/api/agents/:id/versions/:versionId/restore` | Restore to version |

### 5.5 Tool Credentials

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents/tools/credentials` | List tool credentials |
| POST | `/api/agents/tools/credentials` | Create tool credential |
| PUT | `/api/agents/tools/credentials/:id` | Update tool credential |
| DELETE | `/api/agents/tools/credentials/:id` | Delete tool credential |

### 5.6 Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents/templates` | List templates |
| POST | `/api/agents/templates` | Create template |
| POST | `/api/agents/:id/from-template` | Create agent from template |

### 5.7 Webhook

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agents/webhook/:agentId` | Public webhook trigger (rate-limited 100/15min per IP) |

### 5.8 Embed Widget

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents/embed/:token/:agentId/config` | Get public agent config via token |
| POST | `/api/agents/embed/:token/:agentId/config` | Create/update embed config |
| POST | `/api/agents/embed/:token/:agentId/run` | Execute agent via embed token (SSE streaming) |

## 6. Authorization

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

## 7. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Canvas render performance | Smooth at 200+ nodes |
| Execution timeout | Configurable per agent (default: 300s) |
| SSE streaming latency | < 200ms per event |
| Webhook rate limit | 100 requests / 15 minutes per IP |
| Tool credential encryption | AES-256-CBC |
| Multi-tenant isolation | All queries filtered by tenant_id |
| Sandbox memory limit | 256MB per container |
| Sandbox timeout | 30 seconds |
| MCP tool call timeout | 30 seconds |

## 8. Dependencies

| Dependency | Purpose |
|------------|---------|
| PostgreSQL | Agent, run, step, template, credential storage |
| Redis Streams | Node execution dispatch to Python worker (`queueNodeExecution`, `subscribeToRunOutput`, `publishNodeResult`) |
| Redis Pub/Sub | Real-time SSE event delivery |
| OpenSearch | Retrieval nodes (knowledge base search) |
| Python Worker | LLM, retrieval, code, API node execution |
| React Flow | Visual canvas editor |
| Docker | Sandbox container execution for code nodes |
