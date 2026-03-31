# Agent System: Detail Design Overview

## Architecture Summary

The Agent system is a visual workflow builder and execution engine comprising three layers:

1. **Frontend Canvas** — React Flow-based drag-and-drop editor with the current built-in operator set defined in the agent feature type layer
2. **Backend Orchestrator** — Graph traversal engine with topological sort and dual execution paths
3. **Python Worker** — Redis Streams consumer executing LLM, retrieval, and tool operations

## Component Interaction

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant FE as Frontend (React)
    participant BE as Backend (Express)
    participant RD as Redis (Streams + Pub/Sub)
    participant PY as Python Worker
    participant PG as PostgreSQL
    participant OS as OpenSearch

    Note over U,FE: Design Phase
    U->>FE: Drag nodes, connect edges
    FE->>FE: Update canvas state (zustand)
    U->>FE: Click "Save"
    FE->>BE: PUT /api/agents/:id {dsl}
    BE->>PG: Update agents row

    Note over U,PY: Execution Phase
    U->>FE: Click "Run" with input
    FE->>BE: POST /api/agents/:id/run {input}
    BE->>PG: Create agent_runs record
    BE-->>FE: 201 {run_id}

    FE->>BE: GET /api/agents/:id/run/:runId/stream (SSE)

    loop For each node (topological order)
        BE->>PG: Create agent_run_steps record

        alt Inline Node (begin, switch, merge, etc.)
            BE->>BE: Execute locally
        else Dispatch Node (generate, retrieval, code, etc.)
            BE->>RD: XADD agent_execution_queue
            PY->>RD: XREADGROUP (blocking poll)
            PY->>PY: Execute node (LLM/API/code)
            PY->>RD: Publish result
            RD-->>BE: Receive result via pub/sub
        end

        BE->>PG: Update step status + output
        BE-->>FE: SSE event (step_complete)
    end

    BE->>PG: Update run (completed)
    BE-->>FE: SSE event (done)
```

## Key Design Decisions

### D-01: Version-as-Row Pattern

**Decision**: Store agent versions as rows in the same `agents` table rather than a separate `agent_versions` table.

**Rationale**:
- Single table schema simplifies queries
- Immutable snapshots (version rows never modified)
- Efficient pagination (filter `WHERE parent_id IS NULL` for root agents)
- No foreign key complexity between tables

**Structure**:
```
parent_id = NULL, version_number = 0   → Root agent (current working copy)
parent_id = root, version_number = 1   → Snapshot v1
parent_id = root, version_number = 2   → Snapshot v2
```

### D-02: Dual Execution Path (Inline vs Dispatch)

**Decision**: Classify nodes as inline (Node.js) or dispatch (Python) rather than sending all nodes to the worker.

**Rationale**:
- Inline nodes (switch, merge, variables) are pure logic — no need for Redis round-trip
- Reduces latency for control flow operations by 10-50ms per node
- Python worker focuses on compute-heavy operations (LLM, retrieval, code sandbox)
- Kahn's algorithm ensures correct dependency ordering regardless of execution path

### D-03: Redis Streams for Worker Communication

**Decision**: Use Redis Streams (XADD/XREADGROUP) instead of Redis Lists (LPUSH/BRPOP).

**Rationale**:
- Consumer groups enable multiple worker instances to share the queue
- Automatic acknowledgment tracking (XACK) prevents message loss
- Message retention for debugging and replay
- Blocking XREADGROUP with timeout for graceful shutdown

### D-04: SSE over WebSocket for Run Streaming

**Decision**: Use Server-Sent Events (SSE) instead of WebSocket for streaming run output.

**Rationale**:
- Unidirectional data flow (server→client only) matches the use case
- Simpler error handling and automatic reconnection
- No need for bidirectional communication during runs
- Works through HTTP proxies without upgrade negotiation

### D-05: AES-256-CBC for Tool Credentials

**Decision**: Encrypt tool credentials at rest using AES-256-CBC.

**Rationale**:
- Credentials contain sensitive API keys and tokens
- Decrypted only at dispatch time (never returned to frontend)
- Per-credential IV prevents pattern analysis across stored values
- Standard encryption algorithm with broad library support

## State Machine: Agent Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: Create agent

    Draft --> Draft: Edit DSL / metadata
    Draft --> Published: Publish
    Published --> Draft: Unpublish (edit)

    Draft --> [*]: Delete
    Published --> [*]: Delete

    state Published {
        [*] --> Idle
        Idle --> Running: Start run
        Running --> Completed: All nodes succeed
        Running --> Failed: Node error
        Running --> Cancelled: User cancel
        Completed --> Idle
        Failed --> Idle
        Cancelled --> Idle
    }
```

## State Machine: Run Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending: POST /run

    Pending --> Running: executeGraph() starts
    Running --> Completed: All nodes completed
    Running --> Failed: Unrecoverable error
    Running --> Cancelled: Cancel signal received

    Completed --> [*]
    Failed --> [*]
    Cancelled --> [*]
```

## State Machine: Step Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending: Step created

    Pending --> Running: Execution begins
    Running --> Completed: Output received
    Running --> Failed: Error caught
    Running --> Skipped: Upstream failed / cancelled

    Completed --> [*]
    Failed --> [*]
    Skipped --> [*]
```

## Debug Mode Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant BE as Backend

    U->>FE: Set breakpoints on nodes
    U->>FE: Click "Debug"
    FE->>BE: POST /api/agents/:id/debug {breakpoints: ["node_3", "node_7"]}
    BE-->>FE: 201 {run_id}

    FE->>BE: SSE stream

    Note over BE: Execute nodes until breakpoint
    BE-->>FE: SSE: step_complete (node_1)
    BE-->>FE: SSE: step_complete (node_2)
    BE-->>FE: SSE: breakpoint_hit (node_3)

    U->>FE: Inspect node_3 input/output
    FE->>BE: GET step details

    U->>FE: Click "Step" or "Continue"
    FE->>BE: POST /debug/:runId/step (or /continue)
    Note over BE: Execute next node(s)
    BE-->>FE: SSE: step_complete (node_4)

    Note over U,BE: Additional debug endpoints
    U->>FE: Add breakpoint mid-run
    FE->>BE: POST /debug/:runId/breakpoint {nodeId}
    U->>FE: Remove breakpoint
    FE->>BE: DELETE /debug/:runId/breakpoint/:nodeId
    U->>FE: Inspect step
    FE->>BE: GET /debug/:runId/steps/:nodeId
```

## Trigger Types

### Manual Trigger (UI)

1. User enters input in canvas editor
2. Frontend: `POST /api/agents/:id/run` with `{ input: "..." }`
3. Backend creates run record, starts graph execution async
4. Frontend subscribes to SSE stream for real-time updates

### Webhook Trigger (External)

1. External system: `POST /agents/webhook/:agentId` with `{ input: "query" }`
2. No authentication — public endpoint with rate limiting (100/15min per IP)
3. Agent must be in `published` status
4. Returns `{ run_id }` for status polling

### Embed Widget Trigger (Public)

1. Host page embeds iframe with token
2. Widget loads agent config via embed API
3. User submits input → embed run endpoint
4. Output streamed back via SSE

## Error Handling

| Error Type | Handling |
|-----------|---------|
| Node execution failure | Step marked `failed`, run continues if `retry_on_failure` enabled |
| Python worker crash | Redis Streams retain unACKed messages for redelivery |
| LLM provider error | Retry with exponential backoff in Python worker |
| Timeout exceeded | Run marked `failed` with timeout error |
| Cancel request | Redis cancel signal checked before each node execution |
| Invalid DSL | Validation at run start, 400 error before execution begins |

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/agents/services/agent-executor.service.ts` | Core graph orchestration engine (~900 lines) |
| `be/src/modules/agents/services/agent-redis.service.ts` | Redis Streams + pub/sub communication |
| `be/src/modules/agents/services/agent.service.ts` | CRUD, versioning, duplication |
| `advance-rag/rag/agent/agent_consumer.py` | Python worker task consumer |
| `advance-rag/rag/agent/node_executor.py` | Node dispatch table (~2000 lines) |
| `fe/src/features/agents/components/AgentCanvas.tsx` | React Flow canvas editor |
| `fe/src/features/agents/types/agent.types.ts` | Canonical DSL, operator, run, and template type definitions |
