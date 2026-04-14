# FR: Code Knowledge Graph

| Field   | Value      |
|---------|------------|
| Parent  | [SRS Index](../index.md) |
| Version | 1.2        |
| Date    | 2026-04-14 |

> Visualize and query code structure as a knowledge graph using Memgraph, enabling developers to explore call hierarchies, dependencies, and code relationships within ingested source code datasets.

## 1. Overview

The Code Knowledge Graph feature builds a graph representation of source code stored in datasets, powered by **Memgraph** (Bolt protocol). It enables interactive exploration of functions, classes, modules, and their relationships (calls, imports, inheritance) through both visual graph views and query interfaces.

### 1.1 Goals

- Provide call graph analysis (callers/callees) for any function or method
- Visualize class inheritance hierarchies
- Enable natural language queries over code structure (AI-generated Cypher)
- Support dependency analysis across modules and packages
- Allow admin-level raw Cypher execution for advanced analysis

### 1.2 Actors

| Actor | Capabilities |
|-------|-------------|
| Authenticated User | View graph stats, query callers/callees, browse hierarchies, search code entities, run natural language queries |
| Admin | All user capabilities + execute raw Cypher queries |

## 2. Functional Requirements

### 2.1 Graph Statistics

- **FR-CG-001**: The system shall display node and relationship counts for each dataset's code graph.
- **FR-CG-002**: Statistics shall be scoped per knowledge base (dataset) via `kbId`.

### 2.2 Call Graph Analysis

- **FR-CG-010**: The system shall find all callers of a given function/method by name within a dataset.
- **FR-CG-011**: The system shall find all callees (functions called by) a given function/method.
- **FR-CG-012**: Results shall include function names, file paths, and relationship metadata.

### 2.3 Source Code Snippets

- **FR-CG-020**: The system shall retrieve source code snippets for any function or method stored in the graph.

### 2.4 Class Hierarchy

- **FR-CG-030**: The system shall display class inheritance hierarchies (parent/child relationships) for a given class name.

### 2.5 Graph Visualization

- **FR-CG-040**: The system shall return full graph data (nodes + links) suitable for frontend visualization.
- **FR-CG-041**: Graph data queries shall support pagination/limiting to prevent oversized responses.

### 2.6 Schema Inspection

- **FR-CG-050**: The system shall return the graph schema (node labels and relationship types) for a knowledge base.

### 2.7 Code Search

- **FR-CG-060**: The system shall support case-insensitive search for code entities by name pattern.

### 2.8 Dependency Analysis

- **FR-CG-070**: The system shall return import/dependency relationships between modules.
- **FR-CG-071**: Dependency queries shall support optional name filtering.

### 2.9 Natural Language Query

- **FR-CG-080**: The system shall accept natural language questions about code structure and generate Cypher queries using an LLM.
- **FR-CG-081**: Generated Cypher shall be executed against the code graph and results returned to the user.

### 2.10 Raw Cypher Execution

- **FR-CG-090**: Admin users shall be able to execute arbitrary Cypher queries against the code graph.
- **FR-CG-091**: Raw Cypher execution shall be restricted to users with the `code_graph.manage` permission.

## 3. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/code-graph/:kbId/stats` | Yes | Graph statistics |
| GET | `/api/code-graph/:kbId/callers` | Yes | Find callers |
| GET | `/api/code-graph/:kbId/callees` | Yes | Find callees |
| GET | `/api/code-graph/:kbId/snippet` | Yes | Get code snippet |
| GET | `/api/code-graph/:kbId/hierarchy` | Yes | Class hierarchy |
| GET | `/api/code-graph/:kbId/graph` | Yes | Full graph data |
| GET | `/api/code-graph/:kbId/schema` | Yes | Graph schema |
| GET | `/api/code-graph/:kbId/search` | Yes | Search entities |
| GET | `/api/code-graph/:kbId/dependencies` | Yes | Dependencies |
| POST | `/api/code-graph/:kbId/nl-query` | `code_graph.view` | NL query (AI-generated Cypher) |
| POST | `/api/code-graph/:kbId/cypher` | `code_graph.manage` | Raw Cypher execution |

## 4. Infrastructure

| Component | Technology | Notes |
|-----------|-----------|-------|
| Graph Database | Memgraph | Bolt protocol, neo4j-driver |
| Backend Service | `be/src/modules/code-graph/` | Lazy singleton driver |
| Frontend | `fe/src/features/code-graph/` | Graph visualization UI |
| Config | `MEMGRAPH_BOLT_URL` | Default: `bolt://localhost:7687` |

## 5. Non-Functional Requirements

- All 11 endpoints require authentication (session-based); all scoped to `/api/code-graph/:kbId/`
- NL query requires `code_graph.view` permission
- Raw Cypher requires `code_graph.manage` permission to prevent destructive queries
- Memgraph Bolt driver uses lazy singleton pattern (connects on first use)
- Graph data is scoped per knowledge base to enforce tenant isolation

## 6. Dependencies

- [Dataset Management](/srs/core-platform/fr-dataset-management) — Code graphs are built from parsed source code in datasets
- [Document Processing](/srs/core-platform/fr-document-processing) — Code parser extracts AST into graph nodes
- [Infrastructure](/basic-design/system-infra/infrastructure-deployment) — Memgraph service deployment
