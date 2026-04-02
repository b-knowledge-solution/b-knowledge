# System Architecture

> Source-aligned container view of the current monorepo as of 2026-03-25.

## C4 Container Diagram

```mermaid
C4Container
    title B-Knowledge System Architecture

    Person(user, "User", "Browser / Embedded Widget")

    Container_Boundary(edge, "Edge Layer") {
        Container(nginx, "Nginx", "Reverse Proxy", "TLS termination, routing, static assets")
    }

    Container_Boundary(app, "Application Layer") {
        Container(fe, "Frontend SPA", "React 19 / Vite 7.3 / TypeScript", "24 feature areas including chat, search, datasets, projects, agents, and memory")
        Container(be, "Backend API", "Node.js 22 / Express 4.21 / TypeScript", "22 modules mounted under /api including auth, rag, search, chat, projects, agents, memory, and external APIs")
        Container(worker, "Advance-RAG Worker", "Python 3.11 / FastAPI / Peewee", "Parsing, chunking, embedding, indexing, and agent node execution")
        Container(converter, "Converter", "Python 3 / LibreOffice", "Office-to-PDF conversion via Redis queue")
    }

    Container_Boundary(infra, "Infrastructure Layer") {
        ContainerDb(pg, "PostgreSQL 17", "Primary Database", "Users, teams, chat, projects, audit")
        ContainerDb(valkey, "Valkey 8", "Redis-compatible", "Sessions, cache, queues, pub/sub")
        ContainerDb(os, "OpenSearch 3.5", "Search Engine", "Vector + full-text search indexes")
        ContainerDb(rustfs, "RustFS", "S3-compatible", "Document files, avatars, exports")
    }

    Rel(user, nginx, "HTTPS")
    Rel(nginx, fe, "Static assets")
    Rel(nginx, be, "/api/*, WebSocket")
    Rel(be, pg, "Knex ORM / TCP 5432")
    Rel(be, valkey, "ioredis / TCP 6379")
    Rel(be, os, "REST / TCP 9201")
    Rel(be, rustfs, "S3 SDK / TCP 9000")
    Rel(worker, pg, "Peewee ORM / TCP 5432")
    Rel(worker, valkey, "Redis queue / TCP 6379")
    Rel(worker, os, "REST / TCP 9201")
    Rel(worker, rustfs, "S3 SDK / TCP 9000")
    Rel(converter, valkey, "Redis queue / TCP 6379")
    Rel(converter, rustfs, "S3 SDK / TCP 9000")
```

## Service Communication Patterns

| Pattern | Usage | Direction |
|---------|-------|-----------|
| REST (HTTP/JSON) | Frontend to Backend API, Backend to OpenSearch and external services | Synchronous request/response |
| SSE | LLM token streaming to browser | Server to Client |
| Redis Pub/Sub | Backend to Task Executor coordination | Async event broadcast |
| Redis Queue / Streams | Document conversion jobs, RAG tasks, agent dispatch | Async job processing |
| S3 Protocol | File upload/download to RustFS | Direct from BE, Worker, Converter |

## Tech Stack Rationale

| Technology | Choice | Rationale |
|------------|--------|-----------|
| Node.js 22 / Express | Backend API | Non-blocking I/O for concurrent chat/search; mature middleware ecosystem |
| React 19 / Vite 7.3 | Frontend SPA | React Compiler eliminates manual memoization; Vite for fast HMR |
| TanStack Query 5 | Server state | Automatic cache invalidation, optimistic updates, dedup requests |
| Tailwind 3.4 / shadcn/ui | UI layer | Utility-first CSS with accessible, composable components |
| Python 3.11 / FastAPI | RAG Worker | Rich ML/NLP ecosystem; FastAPI async for embedding pipelines |
| PostgreSQL 17 | Primary DB | JSONB for flexible configs; robust ACID; mature extension ecosystem |
| Valkey 8 | Cache/Queue | Redis-compatible; sessions, rate limiting, pub/sub, job queues |
| OpenSearch 3.5 | Search engine | Vector search (k-NN) + BM25 full-text in one engine |
| RustFS | Object storage | S3-compatible; lightweight self-hosted alternative to MinIO |
| Knex | DB migrations/ORM | SQL query builder with migration lifecycle management |
| Peewee | Python ORM | Lightweight ORM for worker read/write; schema owned by Knex |
| Docker Compose | Orchestration | Single-command dev/prod deployment; service isolation |

## Deployment Diagram

```mermaid
graph TB
    subgraph "Docker Host"
        subgraph "kb-network (bridge)"
            nginx["Nginx<br/>:443 → :80"]
            be["Backend API<br/>:3001"]
            fe["Frontend<br/>(built into Nginx)"]
            worker["Task Executor<br/>:9380"]
            converter["Converter<br/>(queue consumer)"]
            pg["PostgreSQL<br/>:5432"]
            valkey["Valkey<br/>:6379"]
            os["OpenSearch<br/>:9201"]
            rustfs["RustFS<br/>:9000 / :9001"]
        end
    end

    client["Browser"] -->|"HTTPS :443"| nginx
    nginx -->|"/api/*"| be
    nginx -->|"static"| fe
    be --> pg
    be --> valkey
    be --> os
    be --> rustfs
    worker --> pg
    worker --> valkey
    worker --> os
    worker --> rustfs
    converter --> valkey
    converter --> rustfs
```

## Key Architectural Decisions

1. **Monorepo with npm workspaces** -- shared tooling and coordinated BE/FE/Python changes.
2. **NX-style module boundaries** -- feature domains are isolated by module and barrel export.
3. **Session auth plus scoped public tokens** -- browser sessions for internal UX, token-based access for public chat/search/agent embeds, and API keys for external APIs.
4. **Node.js orchestration with Python workers** -- the API owns CRUD and orchestration, while Python handles ingestion-heavy and compute-heavy execution.
5. **OpenSearch-centered retrieval** -- the same search engine supports hybrid retrieval, SQL fallback, graph tasks, and memory search.
