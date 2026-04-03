# Phase 11: Internal Embedding System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 11-internal-embedding-system
**Areas discussed:** Deployment architecture, Model selection & defaults, Existing data migration, Admin configuration UX, Model download & caching, CPU vs GPU runtime, Concurrency & batching, Re-embed trigger mechanism, Query-time embedding (CCU)

---

## Deployment Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| In-process (Recommended) | Load model directly in task_executor Python process. Singleton with threading lock. | ✓ |
| Sidecar HTTP service | Separate Docker container running FastAPI/TEI server. | |
| Hybrid | In-process default, sidecar optional via api_base toggle. | |

**User's choice:** In-process
**Notes:** Follows existing BuiltinEmbed singleton pattern. No extra containers.

---

## Memory Management

| Option | Description | Selected |
|--------|-------------|----------|
| Permanent (Recommended) | Load once, keep for process lifetime. | ✓ |
| Idle unload | Unload after N minutes of inactivity. | |
| You decide | Claude picks during implementation. | |

**User's choice:** Permanent
**Notes:** Avoids 5-30s reload penalty. Matches BuiltinEmbed pattern.

---

## Model Selection & Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| BAAI/bge-m3 (Recommended) | 1024d, multilingual, ~560MB. | |
| all-MiniLM-L6-v2 | 384d, English-focused, ~80MB. | |
| No default — require explicit model name | LOCAL_EMBEDDING_MODEL is required. | ✓ |

**User's choice:** No default — require explicit model name
**Notes:** User specified env-driven approach: `LOCAL_EMBEDDING_ENABLE` + `LOCAL_EMBEDDING_MODEL` (required) + `LOCAL_EMBEDDING_PATH` (optional offline mode). If flag enabled, auto-create model_providers record on backend startup.

---

## LLM Config Page Display

| Option | Description | Selected |
|--------|-------------|----------|
| Badge + disabled controls (Recommended) | Show [System] badge, disable edit/delete. Admin can set as default. | ✓ |
| Visible and fully editable | Treat like any other provider. Re-created on restart if deleted. | |
| Hidden from UI entirely | Record exists in DB but filtered from API response. | |

**User's choice:** Badge + disabled controls
**Notes:** Tooltip: "Managed by LOCAL_EMBEDDING_MODEL environment variable"

---

## Auto-Seed Timing

| Option | Description | Selected |
|--------|-------------|----------|
| On backend startup (Recommended) | Upsert on boot, idempotent, remove if env flag disabled. | ✓ |
| Via db:seed command only | Manual step required after env change. | |
| You decide | Claude picks. | |

**User's choice:** On backend startup
**Notes:** None

---

## Model Download & Caching

**User's choice:** Dual-mode (user-specified, not from options)
**Notes:** User specified: `LOCAL_EMBEDDING_PATH` env var for offline mode (load from local path). If not set, download from HuggingFace Hub on startup with persistent Docker volume cache.

---

## CPU vs GPU Runtime

| Option | Description | Selected |
|--------|-------------|----------|
| CPU-only (Recommended) | torch CPU-only build, ~250MB image delta. | ✓ |
| Auto-detect GPU | Full torch, CUDA if available. ~2GB image delta. | |
| You decide | Claude picks. | |

**User's choice:** CPU-only
**Notes:** None

---

## Concurrency & Batching

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing pipeline (Recommended) | Same EMBEDDING_BATCH_SIZE + embed_limiter. | ✓ |
| Dedicated embedding queue | New Redis queue for local embedding jobs. | |
| You decide | Claude picks. | |

**User's choice:** Reuse existing pipeline
**Notes:** For document embedding (bulk). Query-time embedding handled separately via Valkey Stream.

---

## Re-embed Trigger Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Warning + button on dataset settings (Recommended) | Warning banner when model mismatch, "Re-embed All" button. | ✓ |
| API-only, no UI | POST endpoint, no frontend UI. | |
| You decide | Claude picks. | |

**User's choice:** Warning + button on dataset settings
**Notes:** Progress via existing task pipeline status bar.

---

## Query-Time Embedding (CCU Concern)

| Option | Description | Selected |
|--------|-------------|----------|
| Valkey Stream + consumer group (Recommended) | XADD from Node.js, XREADGROUP from Python workers. Scale via replicas. | ✓ |
| Local model for docs only | Query embedding stays on external API. | |
| Valkey Stream + micro-batching | Collect requests for 50ms, batch encode. | |

**User's choice:** Valkey Stream + consumer group
**Notes:** User raised concern about CCU bottleneck. Confirmed Valkey 8 is API-compatible with Redis Streams. Consumer group pattern distributes load across N workers. Each worker loads model independently (~600MB RAM).

---

## Claude's Discretion

- Python embedding worker implementation details (event loop, graceful shutdown)
- SentenceTransformersEmbed class internals beyond singleton + lock
- Model dimension mismatch detection approach
- Token counting for local models
- Valkey stream key naming and cleanup strategy
- How to mark model_providers as system-managed (column vs sentinel)

## Deferred Ideas

- GPU support (auto-detect CUDA) — add when CPU throughput insufficient
- Micro-batching in query-time workers
- Model download management UI
- Multiple concurrent models in memory
- Sentence Transformers for reranking
