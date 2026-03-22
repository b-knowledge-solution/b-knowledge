# Phase 01: Migrate Agent Features from RAGFlow to B-Knowledge - Research

**Researched:** 2026-03-22
**Domain:** Agent/workflow visual builder, hybrid execution engine, canvas UI, MCP integration
**Confidence:** MEDIUM-HIGH

## Summary

This phase migrates RAGFlow's complete agent/workflow system into B-Knowledge. The migration spans three major technical domains: (1) a visual canvas builder using ReactFlow with Zustand state management, rewritten to shadcn/ui + Tailwind, (2) a hybrid execution engine where Node.js orchestrates the graph and dispatches heavy operations to Python workers via existing Redis Streams, and (3) supporting infrastructure including versioning, debug mode, webhooks, MCP integration, sandbox code execution, and embeddable widgets.

The project already has mature patterns for every integration point: Redis Streams communication with Python workers (rag-redis.service.ts), SSE streaming for chat output (chat-conversation.service.ts + useChatStream), Socket.IO for real-time updates (socket.service.ts), ABAC with CASL + JSONB policy rules, crypto service for credential encryption, version-as-row model for document versioning, and embed widget infrastructure. The agent module can follow these established patterns directly, reducing risk significantly.

The primary technical challenges are: (a) designing the agent graph DSL JSONB schema that supports all 23 operators + 23 tools with extensibility, (b) implementing the hybrid Node.js/Python execution model with proper error handling and timeout management, (c) building 40+ ReactFlow node type renderers and configuration forms in shadcn/ui, and (d) integrating MCP tool calling alongside traditional tool execution.

**Primary recommendation:** Structure implementation as incremental sub-features: data model + CRUD first, then canvas UI with basic nodes, then execution engine, then advanced features (debug, versioning, webhooks, MCP, sandbox). Each layer builds on the previous and can be validated independently.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full parity migration: ALL 23 operators + ALL 23 tools + ALL 24 templates
- Both Agent (conversational) and Pipeline (batch processing) modes
- Webhook-triggered agents included
- Agent versioning included (save/restore canvas versions)
- Full debug mode with step-by-step execution, per-node logs, input/output inspection, and run history
- Sandboxed code execution using Docker containers (ephemeral containers for isolation)
- MCP (Model Context Protocol) integration for tool calling
- Team sharing only -- agents shared within team/project via existing ABAC. No public explore/gallery page.
- Agents can optionally be linked to projects (project-scoped via ABAC) or exist at tenant level (unlinked)
- Embeddable agent widgets, reusing B-Knowledge's existing embed infrastructure
- Unification: new chat assistants and search apps created via agent canvas (agent-first). Existing ones keep legacy UI with gradual transition path.
- Hybrid execution model: Node.js (be) orchestrates the graph, dispatches heavy operations to Python worker (advance-rag) via Redis/Valkey queue
- SSE for agent chat output streaming (consistent with existing chat). Socket.IO for debug/step-by-step execution status updates.
- Tool credentials: shared tenant-level defaults with per-agent overrides (matches LLM provider pattern)
- Full execution log persisted: every node input/output, timing, and errors stored per run in PostgreSQL
- Docker containers for sandbox code execution (ephemeral, isolated)
- Redis queue (existing Valkey infrastructure) for Node.js to Python worker communication
- Keep ReactFlow (@xyflow/react) as the canvas library
- Full rewrite of all node forms, panels, and dialogs to shadcn/ui + Tailwind (no Ant Design components)
- Zustand for canvas-specific state (nodes, edges, selections, drag). TanStack Query for server data.
- Top-level sidebar navigation item for Agents (first-class feature alongside Chat, Search, Datasets, Projects)
- Agent graph DSL stored as JSONB column in PostgreSQL, with denormalized metadata columns
- Agent versioning uses version-as-row model (new row per version with parent_id reference)
- Execution logs in PostgreSQL: agent_runs + agent_run_steps tables
- Tool credentials encrypted in PostgreSQL using existing crypto.service.ts
- Agents have own ABAC policies (policy_rules JSONB column)
- Incremental Knex migrations per sub-feature

### Claude's Discretion
- Exact operator-by-operator migration order within the full parity scope
- Internal graph execution scheduling algorithm (topological sort, BFS, etc.)
- Redis queue message format for agent operations
- Canvas node visual styling within shadcn/Tailwind constraints
- Debug panel layout and UX details
- Template seeding strategy (migration script vs seed file)
- MCP server discovery and connection management details

### Deferred Ideas (OUT OF SCOPE)
- Public explore/gallery page for community agent sharing -- future phase
- Auto-migration of existing chat/search configs to agent DSL -- future unification phase
- Agent marketplace or import/export between tenants -- future phase
- Per-agent billing/metering -- out of scope (self-hosted)
- Agent-to-agent orchestration (meta-agents) -- future phase
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@xyflow/react` | 12.10.1 | Visual canvas for node-based agent builder | Industry standard for node-based UIs in React; compatible with React 19 |
| `zustand` | 5.0.12 | Canvas-specific state (nodes, edges, selections, drag) | Lightweight, works outside React tree, perfect for canvas state that changes at 60fps |
| `@modelcontextprotocol/sdk` | 1.27.1 | MCP client for tool calling integration | Official TypeScript SDK for Model Context Protocol |
| `dockerode` | 4.0.10 | Docker Engine API client for sandbox code execution | De facto Node.js Docker library; manages ephemeral containers |
| `@types/dockerode` | 4.0.1 | TypeScript types for dockerode | Type definitions for Docker API |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | ^5.90.12 | Server data (agent CRUD, templates, runs) | All API data fetching for agent list, detail, runs |
| `redis` | ^5.10.0 | Redis Streams for Node.js-to-Python dispatch | Reuse existing rag-redis.service.ts pattern |
| `socket.io` | ^4.8.3 | Real-time debug status updates | Debug mode step-by-step node execution events |
| `zod` | (existing) | Request validation for agent API endpoints | All POST/PUT/DELETE agent routes |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand | React Context | Context re-renders entire tree on any state change; Zustand selectors prevent unnecessary re-renders -- critical for canvas performance |
| Dockerode | Execa + docker CLI | Dockerode provides streaming stdout/stderr and container lifecycle events natively; CLI wrapping is fragile |
| Redis Streams | BullMQ | Project already uses Redis Streams for rag tasks; consistency outweighs BullMQ's richer job management features |

**Installation:**
```bash
# Frontend dependencies
npm install -w fe @xyflow/react zustand

# Backend dependencies
npm install -w be @modelcontextprotocol/sdk dockerode @types/dockerode
```

## Architecture Patterns

### Recommended Backend Module Structure

```
be/src/modules/agents/
├── routes/
│   ├── agent.routes.ts           # CRUD, run, debug, version, share
│   ├── agent-embed.routes.ts     # Embed widget endpoints
│   └── agent-webhook.routes.ts   # Webhook trigger endpoint
├── controllers/
│   ├── agent.controller.ts       # Main agent CRUD + run
│   ├── agent-debug.controller.ts # Debug mode endpoints
│   └── agent-embed.controller.ts # Embed widget controller
├── services/
│   ├── agent.service.ts          # Agent CRUD, versioning
│   ├── agent-executor.service.ts # Graph orchestration engine
│   ├── agent-redis.service.ts    # Redis Streams dispatch to Python
│   ├── agent-debug.service.ts    # Debug/step-by-step execution
│   ├── agent-sandbox.service.ts  # Docker container sandbox
│   ├── agent-mcp.service.ts      # MCP client integration
│   └── agent-tool-credential.service.ts # Encrypted tool credentials
├── models/
│   ├── agent.model.ts            # agents table (JSONB DSL + metadata)
│   ├── agent-run.model.ts        # agent_runs table
│   ├── agent-run-step.model.ts   # agent_run_steps table
│   ├── agent-template.model.ts   # agent_templates table
│   └── agent-tool-credential.model.ts # tool credentials table
├── schemas/
│   └── agent.schemas.ts          # Zod schemas for all mutations
└── index.ts                      # Barrel export
```

### Recommended Frontend Feature Structure

```
fe/src/features/agents/
├── api/
│   ├── agentApi.ts               # Raw HTTP calls
│   └── agentQueries.ts           # TanStack Query hooks
├── components/
│   ├── AgentCanvas.tsx           # ReactFlow wrapper
│   ├── AgentToolbar.tsx          # Top toolbar
│   ├── TemplateGallery.tsx       # Template picker
│   ├── RunHistorySheet.tsx       # Run history drawer
│   ├── WebhookSheet.tsx          # Webhook config drawer
│   ├── VersionDialog.tsx         # Version management
│   ├── canvas/
│   │   ├── CanvasNode.tsx        # Generic node renderer shell
│   │   ├── NodeConfigPanel.tsx   # Right-side config panel
│   │   ├── NodePalette.tsx       # Cmd+K node picker
│   │   ├── edges/
│   │   │   └── SmartEdge.tsx     # Custom edge with animation
│   │   └── nodes/                # Per-operator node renderers
│   │       ├── BeginNode.tsx
│   │       ├── GenerateNode.tsx
│   │       ├── RetrievalNode.tsx
│   │       └── ... (23 total)
│   ├── debug/
│   │   └── DebugPanel.tsx        # Step-by-step execution viewer
│   └── forms/                    # Per-operator config forms
│       ├── GenerateForm.tsx
│       ├── RetrievalForm.tsx
│       └── ... (23 total)
├── hooks/
│   ├── useAgentCanvas.ts         # Canvas interaction orchestration
│   ├── useAgentStream.ts         # SSE streaming for agent chat output
│   ├── useAgentDebug.ts          # Socket.IO debug events
│   └── useCanvasHistory.ts       # Undo/redo canvas state
├── store/
│   └── canvasStore.ts            # Zustand store for canvas state
├── pages/
│   ├── AgentListPage.tsx         # /agents list view
│   └── AgentCanvasPage.tsx       # /agents/:id canvas view
├── types/
│   └── agent.types.ts            # TypeScript interfaces
└── index.ts                      # Barrel export
```

### Pattern 1: Zustand Canvas Store with ReactFlow

**What:** Dedicated Zustand store for canvas state, separate from TanStack Query server state.
**When to use:** All canvas interactions (node CRUD, edge connections, selections, drag).

```typescript
// Source: @xyflow/react docs + Zustand docs
import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react'

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  selectNode: (id: string | null) => void
  addNode: (node: Node) => void
  updateNodeData: (id: string, data: Record<string, unknown>) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
  },
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },
  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) })
  },
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  selectNode: (id) => set({ selectedNodeId: id }),
  addNode: (node) => set({ nodes: [...get().nodes, node] }),
  updateNodeData: (id, data) => set({
    nodes: get().nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...data } } : n
    ),
  }),
}))
```

### Pattern 2: Hybrid Execution via Redis Streams

**What:** Node.js orchestrates graph traversal, dispatches compute-heavy nodes to Python via Redis Streams.
**When to use:** Agent execution -- both run and debug modes.

```typescript
// Extends existing rag-redis.service.ts pattern
// Node.js side: agent-redis.service.ts
const AGENT_QUEUE_NAME = 'agent_execution_queue'
const AGENT_CONSUMER_GROUP = 'agent_task_broker'

// Message format for agent node execution
interface AgentNodeTask {
  id: string                   // Task UUID
  run_id: string               // Agent run UUID
  agent_id: string             // Agent UUID
  node_id: string              // Node UUID within the graph
  node_type: string            // Operator type (e.g., 'generate', 'retrieval')
  input_data: Record<string, unknown>  // Node input from upstream nodes
  config: Record<string, unknown>      // Node configuration (model, params)
  tenant_id: string
  task_type: 'agent_node_execute'
}

// Python side publishes results back via Redis pub/sub
// Channel: agent:run:{run_id}:node:{node_id}:result
```

### Pattern 3: Agent Graph DSL Schema

**What:** JSONB structure representing the complete agent workflow graph.
**When to use:** Stored in agents.dsl column, sent to/from frontend.

```typescript
// Agent DSL stored as JSONB
interface AgentDSL {
  nodes: Record<string, AgentNodeDef>  // nodeId -> node definition
  edges: AgentEdgeDef[]                // connections between nodes
  variables: Record<string, AgentVariable>  // global agent variables
  settings: {
    mode: 'agent' | 'pipeline'
    max_execution_time: number         // seconds
    retry_on_failure: boolean
  }
}

interface AgentNodeDef {
  id: string
  type: string              // operator type: 'begin', 'generate', 'retrieval', etc.
  position: { x: number; y: number }
  config: Record<string, unknown>  // operator-specific configuration
  label: string
}

interface AgentEdgeDef {
  source: string            // source node ID
  target: string            // target node ID
  sourceHandle?: string     // for nodes with multiple outputs (switch, categorize)
  condition?: string        // edge condition expression
}
```

### Anti-Patterns to Avoid

- **Storing ReactFlow state as-is in DB:** ReactFlow Node/Edge types include UI-specific fields (selected, dragging, measured). Strip UI state before persisting; reconstruct on load.
- **Synchronous graph execution:** Never execute all nodes synchronously in Node.js. The hybrid model exists because LLM calls, retrieval, and code execution are slow. Always dispatch to Python worker.
- **Single monolithic Zustand store:** Canvas store should ONLY hold canvas state (nodes, edges, selection). Agent metadata (name, description, version) stays in TanStack Query. Mixing causes unnecessary re-renders.
- **Direct cross-module imports:** Agent module must NOT import from chat/search modules directly. Shared patterns (SSE streaming, ABAC) live in shared/ services.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Node-based canvas | Custom SVG/Canvas renderer | `@xyflow/react` 12.10.1 | Zoom, pan, selection, minimap, edge routing, accessibility all built-in |
| Canvas state management | React Context for nodes/edges | `zustand` 5.0.12 | 60fps drag operations need selective re-renders; Context re-renders everything |
| Graph topological sort | Custom sort algorithm | `graphlib` or manual Kahn's algorithm | Small enough to implement inline, but verify cycle detection |
| Docker container management | Shell exec `docker run` | `dockerode` 4.0.10 | Streaming stdout/stderr, lifecycle events, proper cleanup on timeout |
| MCP tool calling | Custom HTTP tool protocol | `@modelcontextprotocol/sdk` 1.27.1 | Official SDK handles transport, schema validation, tool listing |
| Encrypted credential storage | Custom encryption | Existing `crypto.service.ts` | AES-256-CBC already implemented, byte-compatible with Python |
| Redis queue communication | Custom Redis commands | Existing `rag-redis.service.ts` pattern | XADD/XREAD with consumer groups already proven in production |
| SSE streaming | Custom streaming implementation | Existing `chat-conversation.service.ts` pattern | `res.write()` + `text/event-stream` pattern already established |
| ABAC access control | Custom permission checks | Existing CASL ability + policy_rules JSONB | Pattern proven across datasets, chat, search modules |
| Version management | Custom versioning logic | Existing version-as-row pattern | parent_id + version_number + pagerank boost already established |

**Key insight:** B-Knowledge already has every integration pattern needed. The agent module is primarily a *composition* of existing patterns (Redis dispatch, SSE streaming, Socket.IO events, ABAC, versioning, embed widgets) with a new domain model and UI layer.

## Common Pitfalls

### Pitfall 1: ReactFlow + React Compiler Conflict
**What goes wrong:** React Compiler auto-memoizes components, but ReactFlow custom nodes need stable references. Double-rendering or stale node data.
**Why it happens:** React Compiler (babel-plugin-react-compiler) may optimize away updates that ReactFlow expects.
**How to avoid:** Test custom node components thoroughly. If issues arise, mark specific canvas components with `'use no memo'` directive (React Compiler escape hatch). ReactFlow 12 is designed for React 18+ concurrent features and should be compatible.
**Warning signs:** Node data not updating after config changes, visual glitches during drag.

### Pitfall 2: Zustand Store Subscription Granularity
**What goes wrong:** Components re-render on every canvas change (node drag = 60fps updates) because they subscribe to the entire store.
**Why it happens:** Using `useCanvasStore()` without a selector returns the entire state object.
**How to avoid:** Always use selectors: `useCanvasStore((s) => s.selectedNodeId)`. Never destructure the full store in a component.
**Warning signs:** Laggy canvas interactions, React DevTools showing excessive re-renders on non-canvas components.

### Pitfall 3: JSONB DSL Schema Migration Pain
**What goes wrong:** Agent DSL schema changes after initial release break existing saved agents.
**Why it happens:** JSONB columns don't enforce schema; old agents have old shape.
**How to avoid:** Version the DSL schema explicitly (add `dsl_version` field). Write migration functions that upgrade DSL from version N to N+1. Apply lazily on load.
**Warning signs:** Null/undefined errors when loading old agents after DSL changes.

### Pitfall 4: Redis Streams Message Size Limits
**What goes wrong:** Large node outputs (e.g., retrieval results with full document chunks) exceed practical Redis message sizes.
**Why it happens:** Sending entire retrieval results through Redis messages instead of storing them in PostgreSQL and passing references.
**How to avoid:** Store large payloads in agent_run_steps table. Pass only references (step_id) in Redis messages. Python worker reads/writes to PostgreSQL for large data.
**Warning signs:** Redis memory spikes during agent execution, slow message processing.

### Pitfall 5: Docker Socket Security for Sandbox
**What goes wrong:** Mounting /var/run/docker.sock gives the backend container root-equivalent access to the host.
**Why it happens:** Dockerode needs Docker Engine API access to manage ephemeral containers.
**How to avoid:** Use docker-socket-proxy (tecnativa/docker-socket-proxy) to limit API surface. Only allow container create/start/stop/remove operations. Set resource limits (CPU, memory, timeout) on sandbox containers. Never allow volume mounts from sandbox.
**Warning signs:** Unrestricted Docker API access in production, no container cleanup on timeout.

### Pitfall 6: Graph Cycle Detection
**What goes wrong:** Infinite loop in agent execution when user creates a cycle in the graph (A -> B -> A).
**Why it happens:** Topological sort assumes DAG. Loops (intentional via Loop operator) need special handling.
**How to avoid:** Distinguish between DAG edges and Loop-back edges. Loop operator has explicit max_iterations config. Validate graph structure before execution. Detect unintentional cycles at save time.
**Warning signs:** Agent execution never completes, Python worker consuming 100% CPU.

### Pitfall 7: SSE Connection Limits
**What goes wrong:** Multiple concurrent agent runs from same user exhaust browser SSE connection limit (6 per domain in HTTP/1.1).
**Why it happens:** Each agent run opens a new SSE connection; browser limits concurrent connections.
**How to avoid:** Multiplex debug events through a single Socket.IO connection (already planned). Use SSE only for final chat-style output streaming. Consider HTTP/2 which removes the 6-connection limit.
**Warning signs:** Agent runs queuing in browser, "net::ERR_CONNECTION_LIMIT" errors.

### Pitfall 8: Canvas State vs Server State Sync
**What goes wrong:** User makes canvas changes, navigates away without saving, returns to stale server data.
**Why it happens:** Zustand canvas state and TanStack Query server state can diverge.
**How to avoid:** Implement dirty state tracking. Show unsaved changes indicator. Auto-save on interval (30s) or on significant actions. Confirm navigation away with unsaved changes.
**Warning signs:** Users losing work, inconsistent state between tabs.

## Code Examples

### SSE Streaming for Agent Chat Output (Backend)

```typescript
// Reuses existing pattern from chat-conversation.service.ts
// Source: be/src/modules/chat/services/chat-conversation.service.ts

async streamAgentOutput(
  agentId: string,
  input: string,
  res: ExpressResponse,
  tenantId: string,
): Promise<void> {
  // Set SSE headers (matches existing chat pattern)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    // Start agent execution
    const runId = await agentExecutorService.startRun(agentId, input, tenantId)

    // Subscribe to node execution results via Redis pub/sub
    const subscriber = getRedisClient().duplicate()
    await subscriber.subscribe(`agent:run:${runId}:output`, (message) => {
      const event = JSON.parse(message)
      // Forward deltas to SSE stream
      if (event.delta) {
        res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`)
      }
      if (event.done) {
        res.write(`data: [DONE]\n\n`)
        subscriber.unsubscribe()
      }
    })
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`)
  } finally {
    if (!res.writableEnded) res.end()
  }
}
```

### Socket.IO Debug Events (Backend)

```typescript
// Extends existing socket.service.ts pattern
// Source: be/src/shared/services/socket.service.ts

// Emit debug step event to agent canvas
socketService.emitToUser(userId, 'agent:debug:step', {
  run_id: runId,
  node_id: nodeId,
  status: 'running',  // 'running' | 'completed' | 'failed' | 'skipped'
  input: nodeInput,
  output: nodeOutput,
  duration_ms: executionTime,
  error: errorMessage,
})
```

### Redis Streams Agent Task Dispatch (Backend)

```typescript
// Extends existing rag-redis.service.ts pattern
// Source: be/src/modules/rag/services/rag-redis.service.ts

async queueAgentNodeExecution(task: AgentNodeTask): Promise<void> {
  const client = this.getClient()

  // Ensure consumer group exists
  try {
    await client.xGroupCreate(AGENT_QUEUE_NAME, AGENT_CONSUMER_GROUP, '0', { MKSTREAM: true })
  } catch (err: any) {
    if (!err.message?.includes('BUSYGROUP')) {
      log.warn('Failed to create agent consumer group', { error: String(err) })
    }
  }

  // XADD with same format as existing rag tasks
  await client.xAdd(AGENT_QUEUE_NAME, '*', {
    message: JSON.stringify(task),
  })
}
```

### Database Migration: Agents Table

```typescript
// Knex migration following existing pattern
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('agents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 255).notNullable()
    table.text('description').nullable()
    table.string('avatar', 512).nullable()
    table.enum('mode', ['agent', 'pipeline']).notNullable().defaultTo('agent')
    table.enum('status', ['draft', 'published']).notNullable().defaultTo('draft')
    table.jsonb('dsl').notNullable().defaultTo('{}')          // Graph DSL
    table.integer('dsl_version').notNullable().defaultTo(1)   // Schema version
    table.jsonb('policy_rules').nullable()                     // ABAC policies
    table.string('tenant_id', 64).notNullable()
    table.uuid('project_id').nullable().references('id').inTable('projects').onDelete('SET NULL')
    table.uuid('parent_id').nullable().references('id').inTable('agents').onDelete('SET NULL')
    table.integer('version_number').notNullable().defaultTo(0)
    table.string('version_label', 128).nullable()
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)

    // Indexes for common queries
    table.index(['tenant_id', 'parent_id'])
    table.index(['tenant_id', 'status'])
    table.index(['created_by'])
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `reactflow` package | `@xyflow/react` package | v12 (2024) | New package name, improved TypeScript types, better React 18+ support |
| Zustand v4 `create()` | Zustand v5 `create()` | v5 (2024) | Removed default context, simpler API, better TypeScript inference |
| Custom tool protocols | MCP (Model Context Protocol) | 2024-2025 | Standardized tool calling across LLM providers; official SDK available |
| RAGFlow Ant Design UI | shadcn/ui + Tailwind | B-Knowledge standard | Full component rewrite; no migration of Ant Design components |
| RAGFlow Python-only execution | Hybrid Node.js + Python | This migration | Node.js orchestrates graph, Python executes compute-heavy nodes |

**Deprecated/outdated:**
- `reactflow` (old package name) -- use `@xyflow/react` instead
- Ant Design components from RAGFlow -- full rewrite to shadcn/ui required
- RAGFlow's direct Python execution model -- replaced by hybrid Redis-dispatched execution

## Open Questions

1. **Graph execution scheduling algorithm**
   - What we know: RAGFlow uses canvas.py with a custom traversal. Topological sort (Kahn's algorithm) is standard for DAGs.
   - What's unclear: How Loop operator back-edges interact with topological ordering. Need to study RAGFlow's canvas.py traversal logic.
   - Recommendation: Implement Kahn's algorithm for DAG traversal. Treat Loop as a special node that re-enqueues its body subgraph. Max iterations guard against infinite loops.

2. **Redis message format for agent operations**
   - What we know: Existing rag tasks use `{ id, doc_id, task_type, ... }` format via XADD.
   - What's unclear: Optimal granularity -- one message per node execution or batched.
   - Recommendation: One message per node execution. Matches the existing per-task pattern. Include run_id + node_id + input_data + config. Store large payloads in PostgreSQL, pass references.

3. **MCP server discovery and lifecycle**
   - What we know: MCP SDK supports stdio and Streamable HTTP transports. Agents may connect to multiple MCP servers.
   - What's unclear: How to manage MCP server processes (start/stop/restart). Connection pooling across concurrent agent runs.
   - Recommendation: Start with HTTP transport for remote MCP servers. Store MCP server URLs in tool credentials. Connection pooling at the agent-executor.service level.

4. **Template seeding strategy**
   - What we know: 24 templates need to be available per tenant.
   - What's unclear: Seed once via migration vs. seed on tenant creation vs. lazy-load from JSON files.
   - Recommendation: Store template JSON files in `be/src/modules/agents/templates/`. Seed via Knex seed file for existing tenants. Hook into tenant creation for new tenants.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (BE: node environment, FE: jsdom environment) |
| Config file | `be/vitest.config.ts`, `fe/vitest.config.ts` |
| Quick run command | `npx vitest run tests/agents/ --reporter=verbose` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Agent CRUD (create, read, update, delete) | unit | `npx vitest run -w be tests/agents/agent.service.test.ts -x` | Wave 0 |
| Agent versioning (save, restore, delete version) | unit | `npx vitest run -w be tests/agents/agent-versioning.test.ts -x` | Wave 0 |
| Graph execution engine (topological sort, node dispatch) | unit | `npx vitest run -w be tests/agents/agent-executor.test.ts -x` | Wave 0 |
| Redis Streams agent dispatch | unit | `npx vitest run -w be tests/agents/agent-redis.test.ts -x` | Wave 0 |
| Agent Zod schemas validation | unit | `npx vitest run -w be tests/agents/agent.schemas.test.ts -x` | Wave 0 |
| Docker sandbox execution | unit | `npx vitest run -w be tests/agents/agent-sandbox.test.ts -x` | Wave 0 |
| Tool credential encryption | unit | `npx vitest run -w be tests/agents/agent-tool-credential.test.ts -x` | Wave 0 |
| ABAC policy for agents | unit | `npx vitest run -w be tests/agents/agent-abac.test.ts -x` | Wave 0 |
| Canvas store (Zustand) | unit | `npx vitest run -w fe tests/features/agents/canvasStore.test.ts -x` | Wave 0 |
| Agent API layer | unit | `npx vitest run -w fe tests/features/agents/agentApi.test.ts -x` | Wave 0 |
| Agent list page | unit | `npx vitest run -w fe tests/features/agents/AgentListPage.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/agents/ --reporter=verbose`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `be/tests/agents/agent.service.test.ts` -- CRUD operations with mocked Knex
- [ ] `be/tests/agents/agent-executor.test.ts` -- Graph traversal with mocked Redis
- [ ] `be/tests/agents/agent-redis.test.ts` -- Redis Streams dispatch (mock redis client)
- [ ] `be/tests/agents/agent.schemas.test.ts` -- Zod schema validation
- [ ] `fe/tests/features/agents/canvasStore.test.ts` -- Zustand store actions
- [ ] `fe/tests/features/agents/agentApi.test.ts` -- API layer HTTP calls
- [ ] `fe/tests/features/agents/AgentListPage.test.tsx` -- Page rendering with mock data

## Sources

### Primary (HIGH confidence)
- npm registry: `@xyflow/react@12.10.1`, `zustand@5.0.12`, `@modelcontextprotocol/sdk@1.27.1`, `dockerode@4.0.10` -- versions verified via `npm view`
- Existing codebase: `be/src/modules/rag/services/rag-redis.service.ts` -- Redis Streams pattern
- Existing codebase: `be/src/modules/chat/services/chat-conversation.service.ts` -- SSE streaming pattern
- Existing codebase: `be/src/shared/services/crypto.service.ts` -- AES-256-CBC encryption
- Existing codebase: `be/src/shared/services/socket.service.ts` -- Socket.IO event pattern
- B-Knowledge skills: `.agents/skills/be-expressjs/SKILL.md`, `.agents/skills/fe-reactjs/SKILL.md`

### Secondary (MEDIUM confidence)
- [ReactFlow docs](https://reactflow.dev) -- Canvas API, node types, edge types
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- MCP client/server patterns
- [xyflow/xyflow discussions](https://github.com/xyflow/xyflow/discussions/3764) -- v12 migration notes

### Tertiary (LOW confidence)
- Docker sandbox security patterns -- based on web search, needs validation against actual Docker setup in project's docker-compose

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified via npm registry, peer deps confirmed compatible
- Architecture: MEDIUM-HIGH -- based on existing project patterns, but agent execution engine is novel
- Pitfalls: MEDIUM -- based on common patterns in similar systems, some project-specific validation needed
- Canvas UI: HIGH -- @xyflow/react is well-documented, Zustand integration is standard pattern

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (30 days -- stable libraries, mature ecosystem)
