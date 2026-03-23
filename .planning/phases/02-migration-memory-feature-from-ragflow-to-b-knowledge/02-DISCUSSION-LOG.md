# Phase 2: Migration Memory Feature from RAGFlow to B-Knowledge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 02-migration-memory-feature-from-ragflow-to-b-knowledge
**Areas discussed:** Memory types & extraction, Storage & retrieval, Agent integration, Memory management UI

---

## Memory Types & Extraction

| Option | Description | Selected |
|--------|-------------|----------|
| All 4 types | Full parity: Raw, Semantic, Episodic, Procedural with bitmask | ✓ |
| Semantic + Episodic only | Two most useful types, simpler | |
| You decide | Claude picks subset | |

**User's choice:** All 4 types (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-extract after each turn | Real-time LLM analysis, higher cost | |
| Batch extract on session end | One-time analysis, lower cost | |
| Both (configurable) | Default batch, optional real-time per pool | ✓ |

**User's choice:** Both (configurable)

| Option | Description | Selected |
|--------|-------------|----------|
| Port RAGFlow prompts | Reuse PromptAssembler as-is | |
| Redesign for B-Knowledge | New prompts for SDLC/healthcare | |
| Port then customize | RAGFlow defaults + per-pool customization | ✓ |

**User's choice:** Port then customize

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with timestamps | Full temporal validity (valid_at/invalid_at) | ✓ |
| Simple created_at only | Just creation timestamp | |

**User's choice:** Yes, with timestamps (Recommended)

---

## Storage & Retrieval

| Option | Description | Selected |
|--------|-------------|----------|
| OpenSearch (like RAGFlow) | Store in OpenSearch with vectors, reuse existing infra | ✓ |
| PostgreSQL JSONB | Store in PostgreSQL, simpler setup | |
| OpenSearch + PostgreSQL | Metadata in PG, messages/vectors in OpenSearch | |

**User's choice:** OpenSearch (like RAGFlow)

| Option | Description | Selected |
|--------|-------------|----------|
| Table only | Flat message storage, simpler | |
| Both table + graph | Full parity, uses existing GraphRAG | ✓ |
| You decide | Claude picks | |

**User's choice:** Both table + graph (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| FIFO only | Simple first-in-first-out | ✓ |
| FIFO + LRU | Add least-recently-used | |
| FIFO + relevance-based | LLM-scored relevance decay | |

**User's choice:** FIFO only (like RAGFlow)

**Additional question from user:** "I want to check is memory can use for chat feature"
**Resolution:** Confirmed RAGFlow's memory integrates with chat via save_to_memory and context injection. User chose both chat + agents integration.

| Option | Description | Selected |
|--------|-------------|----------|
| Both chat + agents | Full integration for both features | ✓ |
| Agents only | Memory scoped to agents | |
| Chat only | Memory scoped to chat | |

**User's choice:** Both chat + agents (Recommended)

---

## Agent Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Memory operator node | Explicit canvas node for read/write | |
| Auto-inject via context | Automatic context injection | |
| Both (explicit + auto) | Auto-inject default + Memory node for control | ✓ |

**User's choice:** Both (explicit + auto)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-user with sharing | User-owned pools, shareable via permissions | |
| Per-agent | Agent-scoped pools | |
| Flexible (all levels) | User, agent, or team-scoped | ✓ |

**User's choice:** Flexible (all levels)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, import option | One-click retroactive import from chat history | ✓ |
| Forward-only | New conversations only | |
| You decide | Claude picks | |

**User's choice:** Yes, import option

---

## Memory Management UI

| Option | Description | Selected |
|--------|-------------|----------|
| Top-level sidebar item | Memory as first-class nav item | |
| Under Agents section | Sub-section of Agents | |
| New 'AI' section | Group Memory + Agents under 'AI' | |

**User's choice:** Group memory + agents under a new Agents nav group (custom response)

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 views | List, message browser, settings | ✓ |
| List + settings only | Skip message browser | |
| You decide | Claude picks | |

**User's choice:** All 3 views (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-pool model selection | Each pool chooses own embedding + LLM | ✓ |
| Tenant defaults only | Use tenant defaults | |
| Defaults with override | Defaults + advanced override | |

**User's choice:** Per-pool model selection

---

## Claude's Discretion

- OpenSearch index naming strategy
- Memory search ranking algorithm
- Graph storage implementation details
- Memory extraction prompt tuning
- Import UI design
- Memory operator node form design

## Deferred Ideas

- LRU/relevance-based forgetting policies — future enhancement
- Memory analytics dashboard — future phase
- Cross-tenant memory sharing — out of scope
- External source import (Notion, Confluence) — future integration
