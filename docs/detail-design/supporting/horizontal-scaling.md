# Horizontal Scaling — Detail Design

> How to scale B-Knowledge services for high concurrency (1k-10k+ CCU)

## 1. Overview

B-Knowledge is designed for horizontal scaling. All application services are stateless — session state lives in Redis, files live in S3, and search data lives in OpenSearch. This document covers the concrete scaling mechanisms, configuration, and capacity planning for each service tier.

### 1.1 Architecture Tiers

```
                  +---------------------+
                  |   Load Balancer     |
                  |   (Nginx)           |
                  +---------+-----------+
                            |
            +---------------+---------------+
            |               |               |
     +------+------+ +-----+------+ +------+------+
     | Backend #1  | | Backend #2 | | Backend #N  |
     | (Node.js)   | | (Node.js)  | | (Node.js)   |
     +------+------+ +-----+------+ +------+------+
            |               |               |
            +-------+-------+-------+-------+
                    |               |
             +------+------+ +-----+------+
             | PostgreSQL  | | Valkey     |
             | (Primary DB)| | (Redis)    |
             +-------------+ +-----+------+
                                    |
                    +---------------+---------------+
                    |               |               |
             +------+------+ +-----+------+ +------+------+
             | Worker #1   | | Worker #2  | | Worker #N   |
             | (Python)    | | (Python)   | | (Python)    |
             +------+------+ +-----+------+ +------+------+
                    |               |               |
            +-------+-------+-------+-------+-------+
            |               |               |
     +------+------+ +-----+------+ +------+------+
     | OpenSearch  | | RustFS/S3  | | Converter   |
     | (Vector DB) | | (Files)    | | Worker #N   |
     +-------------+ +------------+ +-------------+
```

### 1.2 What Makes This Scalable

| Component | Stateless? | Shared State Location | Scaling Method |
|-----------|-----------|----------------------|----------------|
| **Backend (Node.js)** | YES | Sessions in Redis, data in PostgreSQL | Add instances behind nginx |
| **Task Executor (Python)** | YES | Tasks in Redis Streams, chunks in OpenSearch | Add instances via `--scale` |
| **Agent Consumer (Python)** | YES | Tasks in Redis Streams, results via pub/sub | Runs inside task-executor |
| **Converter (Python)** | YES | Jobs in Redis, files in S3 | Add instances via `--scale` |
| **PostgreSQL** | NO (primary) | Self-contained | Read replicas (advanced) |
| **Valkey/Redis** | NO (primary) | Self-contained | Sentinel or cluster (advanced) |
| **OpenSearch** | Partially | Sharded + replicated | Add replicas, add data nodes |
| **RustFS/S3** | YES | Self-contained | Already designed for scale |

---

## 2. Container Resource Limits (4-Core / 8 GB Reference)

Docker Compose enforces `cpus` and `mem_limit` on every container to prevent a single runaway service from starving others. The limits below are tuned for a **4-core / 8 GB RAM** server and configured in `docker-compose.yml` + `docker-compose-base.yml`.

### 2.1 Resource Allocation Table

| Service | CPU Limit | Memory Limit | Memory Reservation | Rationale |
|---------|-----------|-------------|-------------------|-----------|
| **OpenSearch** | 1.50 | 2 GB | 1.5 GB | Heaviest service: JVM heap (1 GB) + KNN vector index in off-heap memory |
| **Task Executor** | 0.75 | 2 GB | 1 GB | Document parsing loads full file content into memory; embedding batches use ~500 MB |
| **Converter** | 0.50 | 768 MB | 256 MB | LibreOffice spawns sub-processes for Office-to-PDF; each conversion uses ~200-500 MB |
| **Backend** | 0.50 | 512 MB | 256 MB | Node.js event loop is very memory-efficient; 512 MB handles thousands of connections |
| **PostgreSQL** | 0.50 | 512 MB | 256 MB | Metadata CRUD only (heavy reads go to OpenSearch); shared_buffers defaults to 128 MB |
| **Valkey** | 0.25 | 384 MB | 128 MB | Single-threaded; `maxmemory 256mb` configured in command args, 128 MB overhead for AOF |
| **RustFS** | 0.25 | 256 MB | 128 MB | Lightweight Rust-based S3 proxy; streams files without buffering |
| **Memgraph** | 0.25 | 256 MB | 128 MB | Graph DB for code knowledge graph; light usage in typical deployments |
| **Total** | **4.50** | **6.7 GB** | **3.6 GB** | ~1.3 GB headroom for host OS + Docker daemon |

### 2.2 Why CPU is Overcommitted (4.5 on 4 cores)

CPU limits are soft — Docker throttles but does not kill containers that exceed their limit. The 0.5-core overcommit is safe because:

- Valkey, RustFS, and Memgraph are mostly idle (waiting for requests)
- Backend and PostgreSQL rarely peak simultaneously
- Task Executor and Converter are the only CPU-intensive services, and they have semaphore-based internal throttling

### 2.3 Memory Limit vs Reservation

| Directive | Behavior |
|-----------|----------|
| `mem_limit` | **Hard ceiling.** Container is OOM-killed if it exceeds this. |
| `mem_reservation` | **Soft guarantee.** Docker tries to ensure at least this much is available. |

The sum of reservations (3.6 GB) is well under 8 GB, so all services can start simultaneously. The sum of limits (6.7 GB) allows burst usage without OOM under normal conditions.

### 2.4 OpenSearch JVM Sizing

OpenSearch JVM heap is set to **50% of the container memory limit**:

```
Container: mem_limit = 2 GB
JVM heap:  -Xms1g -Xmx1g  (50% = 1 GB)
```

The remaining 1 GB is used by:
- OS page cache (speeds up disk reads)
- KNN (HNSW) off-heap memory (vector index)
- Lucene segment buffers

**Rule of thumb:** JVM heap should NEVER exceed 50% of container memory. OpenSearch uses the other 50% for file caches and vector indices.

### 2.5 Scaling Profiles for Different Servers

For servers larger than 4-core / 8 GB, adjust these values in `docker-compose.override.yml`:

| Server Spec | OpenSearch | Task Executor | Backend | Notes |
|-------------|-----------|---------------|---------|-------|
| **4c / 8 GB** (default) | 1.5 cpu, 2 GB | 0.75 cpu, 2 GB | 0.5 cpu, 512 MB | Single instance of each |
| **8c / 16 GB** | 2.0 cpu, 4 GB | 1.0 cpu, 3 GB | 0.5 cpu, 512 MB | Scale workers to 2 |
| **16c / 32 GB** | 4.0 cpu, 8 GB | 1.0 cpu, 3 GB | 0.5 cpu, 512 MB | Scale workers to 4, backends to 2 |
| **32c / 64 GB** | 8.0 cpu, 16 GB | 1.5 cpu, 4 GB | 1.0 cpu, 1 GB | Scale workers to 8, backends to 4 |

Example `docker-compose.override.yml` for an 8-core / 16 GB server:

```yaml
services:
  opensearch:
    cpus: 2.0
    mem_limit: 4g
    mem_reservation: 3g
    environment:
      - OPENSEARCH_JAVA_OPTS=-Xms2g -Xmx2g

  task-executor:
    cpus: 1.0
    mem_limit: 3g
    mem_reservation: 1536m
    environment:
      MAX_CONCURRENT_TASKS: 8
      OPENSEARCH_POOL_MAXSIZE: 16

  backend:
    cpus: 0.5
    mem_limit: 512m
```

```bash
# Apply overrides and scale
docker compose up --scale task-executor=2 --scale backend=2 -d
```

---

## 3. Redis Streams — The Scaling Foundation

All worker scaling relies on **Redis Streams consumer groups**. Understanding this mechanism is critical.

### 2.1 How Consumer Groups Work

```
Producer (Node.js BE)                    Consumers (Python Workers)
        |                                 +-- Worker #1 (consumer: task_executor_host1_123)
        |   XADD rag_flow_svr_queue       +-- Worker #2 (consumer: task_executor_host2_456)
        +-------> [Stream] -------+       +-- Worker #3 (consumer: task_executor_host3_789)
                                  |
                    Consumer Group: rag_flow_svr_task_broker

  Each message is delivered to EXACTLY ONE consumer in the group.
  Once a consumer XACKs the message, it is marked as processed.
  If a consumer dies without XACKing, the message is redelivered.
```

### 2.2 Queue Names (Must Match Between BE and Python)

| Queue | Consumer Group | Producer | Consumer | Purpose |
|-------|---------------|----------|----------|---------|
| `rag_flow_svr_queue` | `rag_flow_svr_task_broker` | Node.js `rag-redis.service.ts` | Python `task_executor.py` | Document parsing, embedding, indexing |
| `rag_flow_svr_queue_1` | `rag_flow_svr_task_broker` | Node.js (priority 1) | Python `task_executor.py` | Priority tasks |
| `agent_execution_queue` | `agent_task_broker` | Node.js `agent-redis.service.ts` | Python `agent_consumer.py` | Agent workflow node execution |

### 2.3 Consumer Name Uniqueness

Each worker instance MUST have a unique consumer name within its consumer group. This is how Redis knows which instance received which message.

| Service | Consumer Name Format | Uniqueness Method |
|---------|---------------------|-------------------|
| Task Executor | `task_executor_{hostname}_{pid}` | hostname + PID (unique per container) |
| Agent Consumer | `agent_worker_{pid}` | PID (unique per container) |
| Converter | `converter_{hostname}_{pid}` | hostname + PID (unique per container) |

**Why hostname + PID:** Docker assigns unique hostnames to each container (e.g., `a1b2c3d4`). Combined with the process ID (always 1 in a container, but unique if running multiple processes), this guarantees uniqueness even when scaling with `docker-compose --scale`.

---

## 4. Scaling the Backend (Node.js)

### 3.1 Prerequisites

The backend is already stateless:
- **Sessions:** Stored in Redis (Valkey), not in memory
- **File uploads:** Go directly to S3 (RustFS), not local disk
- **Database:** All instances share the same PostgreSQL

### 3.2 Docker Compose Scaling

```bash
# Scale to 3 backend instances
docker compose up --scale backend=3
```

**Port handling:** When scaling, each instance exposes port 3001 internally. You need nginx to load-balance across them. Docker's internal DNS resolves `backend` to all instances automatically.

### 3.3 Nginx Configuration Example

```nginx
upstream backend_pool {
    # Docker Compose internal DNS resolves to all backend instances
    server backend:3001;

    # For explicit instance listing (K8s or manual):
    # server backend-1:3001;
    # server backend-2:3001;
    # server backend-3:3001;
}

server {
    listen 80;
    server_name your-domain.com;

    # SSE (Server-Sent Events) requires long timeouts
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    # WebSocket support (for real-time features)
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    location /api/ {
        proxy_pass http://backend_pool;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for SSE streaming
        proxy_buffering off;
        proxy_cache off;
    }

    location / {
        # Serve frontend static files
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

### 3.4 Session Stickiness

B-Knowledge uses **Redis-backed sessions** — no sticky sessions needed. Any backend instance can serve any user because the session is looked up from Redis on every request.

**Verify in `docker/.env`:**
```
SESSION_SECRET=change_this_to_a_long_random_string_in_production
```

All backend instances MUST share the same `SESSION_SECRET` (guaranteed when using the same `.env` file).

---

## 5. Scaling the Python Workers

### 4.1 Task Executor (Document Processing)

```bash
# Scale to 4 task executor instances
docker compose up --scale task-executor=4
```

Each instance runs independently:
- Picks tasks from Redis Streams via `XREADGROUP` (load balanced by Redis)
- Processes documents (parse, chunk, embed, index)
- Reports heartbeat to Redis (other workers detect dead instances)
- Stagger startup with random 0.5-5s jitter to prevent connection storms

### 4.2 Converter (Office-to-PDF)

```bash
# Scale to 2 converter instances
docker compose up --scale converter=2
```

Converters poll Redis for conversion jobs. Multiple instances will naturally divide work.

### 4.3 Per-Instance Concurrency Configuration

Each Python worker instance has internal concurrency controlled by asyncio semaphores. These are configured via environment variables in `docker/.env`:

| Variable | Default | Per Instance | Description |
|----------|---------|-------------|-------------|
| `MAX_CONCURRENT_TASKS` | 5 | YES | Parallel document processing tasks |
| `MAX_CONCURRENT_CHUNK_BUILDERS` | 1 | YES | Parallel chunk building operations (CPU-bound) |
| `MAX_CONCURRENT_MINIO` | 10 | YES | Parallel S3/MinIO file operations |
| `MAX_CONCURRENT_CHATS` | 10 | YES | Parallel LLM API calls (keyword/question generation) |
| `OPENSEARCH_POOL_MAXSIZE` | 10 | YES | OpenSearch HTTP connection pool size |
| `EMBEDDING_BATCH_SIZE` | 16 | YES | Texts per embedding API call |
| `DOC_BULK_SIZE` | 4 | YES | Chunks per OpenSearch bulk insert |
| `TASK_MAX_RETRIES` | 3 | YES | Max retry attempts per failed task |
| `WORKER_HEARTBEAT_TIMEOUT` | 120 | YES | Seconds before a worker is considered dead |

**Important:** These are **per instance**. 4 workers with `MAX_CONCURRENT_TASKS=5` means 20 concurrent tasks total.

### 4.4 Semaphore Architecture

```
Per Worker Instance:
  +-- task_limiter (MAX_CONCURRENT_TASKS=5)
  |     Controls total parallel tasks
  |
  +-- chunk_limiter (MAX_CONCURRENT_CHUNK_BUILDERS=1)
  |     Controls CPU-bound chunking operations
  |
  +-- embed_limiter (same as chunk_limiter)
  |     Controls embedding generation
  |
  +-- minio_limiter (MAX_CONCURRENT_MINIO=10)
  |     Controls S3 file operations
  |
  +-- kg_limiter (hardcoded=2)
  |     Controls knowledge graph operations
  |
  +-- chat_limiter (MAX_CONCURRENT_CHATS=10)
        Controls LLM API calls during chunk enrichment
```

### 4.5 Tuning Guidelines

| Scenario | Recommended Settings | Why |
|----------|---------------------|-----|
| **CPU-constrained** (small VMs) | `MAX_CONCURRENT_TASKS=3`, `MAX_CONCURRENT_CHUNK_BUILDERS=1` | Chunk building is CPU-intensive (parsing, tokenization) |
| **Memory-constrained** (< 4GB RAM) | `MAX_CONCURRENT_TASKS=2`, `EMBEDDING_BATCH_SIZE=8` | Each task holds document content in memory |
| **GPU available** (local embedding) | `MAX_CONCURRENT_CHUNK_BUILDERS=2`, `EMBEDDING_BATCH_SIZE=32` | GPU can parallelize embedding |
| **Remote embedding API** (OpenAI) | `MAX_CONCURRENT_TASKS=8`, `EMBEDDING_BATCH_SIZE=16` | Network-bound, not CPU-bound |
| **High document throughput** | Scale to 4+ workers, `MAX_CONCURRENT_TASKS=5` each | Horizontal scaling more effective than per-instance tuning |

---

## 6. Scaling OpenSearch

### 5.1 Current Index Settings

```json
{
  "number_of_shards": 2,
  "number_of_replicas": 0,
  "refresh_interval": "1000ms"
}
```

**Problem:** `number_of_replicas: 0` means no fault tolerance and no read scaling.

### 5.2 Production Recommendations

| Setting | Dev (current) | Production | High-Scale |
|---------|--------------|------------|------------|
| `number_of_shards` | 2 | 2-5 | 5-10 (per tenant index) |
| `number_of_replicas` | 0 | 1 | 2 |
| `refresh_interval` | 1000ms | 5000ms | 10000ms |
| Data nodes | 1 | 2-3 | 3-5 |

**How replicas help CCU:** Each replica can serve read queries independently. With 2 replicas on 3 data nodes, you get 3x the read throughput.

### 5.3 Changing Replicas (No Downtime)

```bash
# Increase replicas on all knowledge_ indices
curl -X PUT "http://opensearch:9201/knowledge_*/_settings" -H 'Content-Type: application/json' -d '{
  "index": {
    "number_of_replicas": 1
  }
}'
```

### 5.4 Monitoring OpenSearch Under Load

| Metric | Warning Threshold | Action |
|--------|------------------|--------|
| Cluster health | Yellow | Add replicas or data nodes |
| Search latency P95 | > 500ms | Add replicas, reduce RERANK_LIMIT |
| CPU utilization | > 80% | Add data nodes |
| JVM heap usage | > 75% | Increase heap or add nodes |
| Pending tasks | > 0 sustained | Cluster overloaded, add capacity |

---

## 7. Scaling PostgreSQL

### 6.1 Current Setup

Single PostgreSQL 17 instance with connection pool via Knex:

```typescript
// be/src/shared/db/connection.ts
pool: { min: 2, max: 10 }
```

### 6.2 When to Scale

PostgreSQL is rarely the bottleneck for B-Knowledge because:
- Heavy read traffic goes to OpenSearch (retrieval) and Redis (sessions/cache)
- PostgreSQL handles metadata CRUD only (users, teams, datasets, chat history)
- Connection pooling prevents connection exhaustion

### 6.3 If Needed: PgBouncer

For 10k+ CCU, add PgBouncer as a connection pooler:

```
Backend #1 --+
Backend #2 --+--> PgBouncer (pool: 100) --> PostgreSQL
Backend #3 --+
```

This prevents N backend instances from opening N * max_pool connections to PostgreSQL.

---

## 8. Scaling Redis (Valkey)

### 7.1 Current Setup

Single Valkey 8 instance handling:
- Session storage
- Task queues (Redis Streams)
- Pub/sub (progress events, agent results)
- Cache (LLM results, tags)

### 7.2 Capacity

A single Valkey instance can handle:
- 100,000+ operations/second
- 100,000+ pub/sub messages/second
- 10,000+ active connections

**Redis is unlikely to be a bottleneck at 10k CCU.** Monitor with `INFO stats` and `INFO clients`.

### 7.3 If Needed: Redis Sentinel

For high availability (not throughput), add Redis Sentinel:

```
Sentinel #1 --+
Sentinel #2 --+--> Monitors Primary + Replica
Sentinel #3 --+

Primary (read/write) --> Replica (read-only failover)
```

---

## 9. Capacity Planning

### 8.1 Resource Estimates Per Instance

| Service | CPU | Memory | Disk | Notes |
|---------|-----|--------|------|-------|
| Backend (Node.js) | 0.5-1 core | 256-512 MB | Minimal | Event-loop bound, not CPU-bound |
| Task Executor (Python) | 1-2 cores | 1-4 GB | Minimal | CPU for parsing, memory for document content |
| Converter (Python) | 1-2 cores | 512 MB-2 GB | 1 GB temp | LibreOffice uses significant CPU for conversion |
| OpenSearch | 2-4 cores | 4-8 GB | 10+ GB | JVM heap = 50% of memory, SSD recommended |
| PostgreSQL | 1-2 cores | 1-2 GB | 10+ GB | Depends on chat history volume |
| Valkey | 0.5 core | 256-512 MB | Minimal | Single-threaded, very efficient |

### 8.2 CCU Scaling Matrix

| Target CCU | Backend | Task Executor | Converter | OpenSearch | Notes |
|------------|---------|---------------|-----------|------------|-------|
| 500 (dev) | 1 | 1 | 1 | 1 node, 0 replicas | Default config |
| 2,000 | 2 | 2 | 1 | 1 node, 1 replica | First scaling step |
| 5,000 | 4 | 4 | 2 | 2 nodes, 1 replica | Medium deployment |
| 10,000 | 8 | 4 | 2 | 3 nodes, 2 replicas | High-scale deployment |
| 20,000+ | 12+ | 8 | 4 | 5+ nodes, 2 replicas | Requires K8s, PgBouncer |

### 8.3 Concurrent Task Capacity

| Workers | MAX_CONCURRENT_TASKS | Total Parsing Capacity | Total Agent Capacity |
|---------|---------------------|----------------------|---------------------|
| 1 | 5 | 5 concurrent doc tasks | ~10 agent tasks |
| 2 | 5 | 10 concurrent doc tasks | ~20 agent tasks |
| 4 | 5 | 20 concurrent doc tasks | ~40 agent tasks |
| 4 | 8 (tuned) | 32 concurrent doc tasks | ~40 agent tasks |
| 8 | 5 | 40 concurrent doc tasks | ~80 agent tasks |

---

## 10. Docker Compose Scaling Commands

### 9.1 Basic Scaling

```bash
cd docker

# Scale workers (no backend change needed if using nginx)
docker compose up --scale task-executor=4 --scale converter=2 -d

# Scale everything
docker compose up --scale backend=4 --scale task-executor=4 --scale converter=2 -d

# Check running instances
docker compose ps

# View logs for a specific instance
docker compose logs task-executor --tail=50

# Scale down
docker compose up --scale task-executor=2 -d
```

### 9.2 Override Configuration Per Scale Level

Create `docker-compose.override.yml` for production scaling:

```yaml
services:
  task-executor:
    environment:
      MAX_CONCURRENT_TASKS: 8
      OPENSEARCH_POOL_MAXSIZE: 16
      EMBEDDING_BATCH_SIZE: 32

  backend:
    environment:
      NODE_ENV: production
```

```bash
# Uses docker-compose.yml + docker-compose.override.yml automatically
docker compose up --scale backend=4 --scale task-executor=4 -d
```

### 9.3 Health Monitoring During Scale-Up

```bash
# Watch worker heartbeats
docker compose logs task-executor -f --tail=5 | grep -i "heartbeat\|ready\|startup"

# Check Redis Streams consumer info
docker compose exec valkey valkey-cli XINFO GROUPS rag_flow_svr_queue
docker compose exec valkey valkey-cli XINFO GROUPS agent_execution_queue

# Check OpenSearch cluster health
curl -s http://localhost:9201/_cluster/health | python3 -m json.tool
```

---

## 11. Environment Variable Reference

### 10.1 Worker Scaling (`docker/.env`)

| Variable | Default | Valid Range | Impact |
|----------|---------|-------------|--------|
| `MAX_CONCURRENT_TASKS` | 5 | 1-20 | Higher = more throughput, more memory |
| `MAX_CONCURRENT_CHUNK_BUILDERS` | 1 | 1-4 | Higher = more CPU usage during parsing |
| `MAX_CONCURRENT_MINIO` | 10 | 1-50 | Higher = faster file I/O |
| `MAX_CONCURRENT_CHATS` | 10 | 1-50 | Higher = more parallel LLM API calls |
| `TASK_MAX_RETRIES` | 3 | 1-10 | Higher = more resilient but slower failure detection |
| `OPENSEARCH_POOL_MAXSIZE` | 10 | 5-50 | Should be >= `MAX_CONCURRENT_TASKS` |
| `EMBEDDING_BATCH_SIZE` | 16 | 1-96 | 16 for OpenAI, up to 96 for Cohere |
| `DOC_BULK_SIZE` | 4 | 1-50 | Higher = fewer OpenSearch requests, more memory |
| `WORKER_HEARTBEAT_TIMEOUT` | 120 | 30-600 | Lower = faster dead worker detection |
| `CONVERTER_POLL_INTERVAL` | 30 | 5-120 | Lower = faster conversion pickup |

### 10.2 Backend Scaling (`docker/.env`)

| Variable | Default | Notes |
|----------|---------|-------|
| `SESSION_SECRET` | (must change) | Must be identical across all backend instances |
| `PORT` | 3001 | Internal port; nginx handles external routing |
| `DB_PASSWORD` | (must change) | Shared across all instances |
| `REDIS_HOST` | valkey | Shared Redis for sessions and queues |

### 10.3 OpenSearch Scaling

| Setting | Location | Default | Production |
|---------|----------|---------|------------|
| `number_of_shards` | `advance-rag/conf/os_mapping.json` | 2 | 2-5 per index |
| `number_of_replicas` | `advance-rag/conf/os_mapping.json` | 0 | 1-2 |
| `refresh_interval` | `advance-rag/conf/os_mapping.json` | 1000ms | 5000-10000ms |

---

## 12. Troubleshooting Scaling Issues

### 11.1 "Tasks stuck in pending"

**Symptom:** Documents uploaded but never processed.

| Check | Command | Fix |
|-------|---------|-----|
| Workers alive? | `docker compose ps task-executor` | Restart workers |
| Consumer group exists? | `valkey-cli XINFO GROUPS rag_flow_svr_queue` | Workers create on startup |
| Pending messages? | `valkey-cli XPENDING rag_flow_svr_queue rag_flow_svr_task_broker` | Dead consumer holding messages |
| Consumer dead? | Check `WORKER_HEARTBEAT_TIMEOUT` | Reduce timeout, restart worker |

### 11.2 "Duplicate task processing"

**Symptom:** Same document processed twice.

**Cause:** Two workers with the same `CONSUMER_NAME` in the same consumer group.

**Fix:** Verify each container has a unique hostname. Check with:
```bash
docker compose exec task-executor hostname
```

### 11.3 "OpenSearch connection pool exhausted"

**Symptom:** `ConnectionError: Connection pool is full` in worker logs.

**Fix:** Increase `OPENSEARCH_POOL_MAXSIZE` to be >= `MAX_CONCURRENT_TASKS`:
```env
MAX_CONCURRENT_TASKS=8
OPENSEARCH_POOL_MAXSIZE=16
```

### 11.4 "Backend instances not receiving traffic"

**Symptom:** Some backend instances idle while others are overloaded.

**Fix:** Ensure nginx uses `upstream` with proper load balancing (default round-robin). Check that all instances are healthy:
```bash
for i in $(docker compose ps -q backend); do
  docker inspect --format='{{.NetworkSettings.Networks}}' $i
done
```

### 11.5 "Agent results lost after scaling"

**Symptom:** Agent workflow nodes complete in Python but Node.js never receives the result.

**Cause:** The Node.js orchestrator subscribes to Redis pub/sub channel `agent:run:{run_id}:node:{node_id}:result`. If the backend instance that subscribed dies or is replaced, the subscription is lost.

**Fix:** The orchestrator re-subscribes on reconnect. Ensure Redis pub/sub is working:
```bash
# In one terminal, subscribe:
valkey-cli SUBSCRIBE "agent:run:test:node:test:result"

# In another terminal, publish:
valkey-cli PUBLISH "agent:run:test:node:test:result" "test"
```
