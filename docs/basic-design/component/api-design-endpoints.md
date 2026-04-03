# API Endpoint Reference

## Overview

Complete endpoint reference for the B-Knowledge REST API, grouped by module. All endpoints are prefixed with `/api` unless otherwise noted.

## Auth (12 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/config` | No | Get public auth configuration (client IDs, flags) |
| GET | `/api/auth/me` | No | Get current authenticated user (session-backed) |
| GET | `/api/auth/login` | No | Initiate Azure AD OAuth login flow |
| GET | `/api/auth/callback` | No | OAuth callback handler, completes session |
| POST | `/api/auth/logout` | Yes | Destroy session |
| POST | `/api/auth/reauth` | Yes | Re-authenticate (refresh auth timestamps) |
| POST | `/api/auth/refresh-token` | Yes | Refresh access token using stored refresh token |
| GET | `/api/auth/token-status` | Yes | Report token freshness/expiry |
| POST | `/api/auth/login/root` | No | Root user (local) login for bootstrap/admin |
| GET | `/api/auth/abilities` | Yes | Get serialized CASL rules for current session |
| GET | `/api/auth/orgs` | Yes | List user's organization memberships with roles |
| POST | `/api/auth/switch-org` | Yes | Switch active organization, recompute CASL |

## Users (9 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Yes | List all users (admin) |
| POST | `/api/users` | Yes | Create local user (with optional password) |
| PUT | `/api/users/:id` | Yes | Update user profile fields |
| DELETE | `/api/users/:id` | Yes | Delete user (requires recent auth) |
| PUT | `/api/users/:id/role` | Yes | Update user role (requires recent auth) |
| PUT | `/api/users/:id/permissions` | Yes | Update user permissions |
| GET | `/api/users/ip-history` | Yes | Get IP access history for all users |
| GET | `/api/users/:id/ip-history` | Yes | Get IP access history for a specific user |
| GET | `/api/users/:id/sessions` | Yes | Get active sessions for a user |

## Teams (8 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/teams` | Yes | List teams |
| POST | `/api/teams` | Yes | Create team |
| PUT | `/api/teams/:id` | Yes | Update team |
| DELETE | `/api/teams/:id` | Yes | Delete team |
| GET | `/api/teams/:id/members` | Yes | List team members |
| POST | `/api/teams/:id/members` | Yes | Add members to team |
| DELETE | `/api/teams/:id/members/:userId` | Yes | Remove member from team |
| POST | `/api/teams/:id/permissions` | Yes | Grant team-level permissions |

## Chat (26 endpoints)

### Conversations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/chat/conversations` | Yes | List conversations for a dialog |
| POST | `/api/chat/conversations` | Yes | Create conversation |
| GET | `/api/chat/conversations/:id` | Yes | Get conversation by ID |
| PATCH | `/api/chat/conversations/:id` | Yes | Rename conversation |
| DELETE | `/api/chat/conversations` | Yes | Bulk delete conversations |
| DELETE | `/api/chat/conversations/:id/messages/:msgId` | Yes | Delete a specific message |
| POST | `/api/chat/conversations/:id/completion` | Yes | Stream chat completion (SSE) |
| POST | `/api/chat/conversations/:id/feedback` | Yes | Submit thumbs up/down feedback |
| POST | `/api/chat/tts` | Yes | Convert text to speech audio stream |

### Assistants

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/chat/assistants` | Yes | List accessible assistants (RBAC-filtered) |
| POST | `/api/chat/assistants` | Admin | Create assistant |
| GET | `/api/chat/assistants/:id` | Yes | Get assistant by ID |
| PUT | `/api/chat/assistants/:id` | Admin | Update assistant |
| DELETE | `/api/chat/assistants/:id` | Admin | Delete assistant |
| GET | `/api/chat/assistants/:id/access` | Admin | Get assistant access control entries |
| PUT | `/api/chat/assistants/:id/access` | Admin | Set assistant access control entries |

### Files

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/chat/conversations/:id/files` | Yes | Upload files to conversation (max 5) |
| GET | `/api/chat/files/:fileId/content` | Yes | Stream file content |

### Embed Tokens

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/chat/dialogs/:id/embed-tokens` | Admin | Create embed token for dialog |
| GET | `/api/chat/dialogs/:id/embed-tokens` | Admin | List embed tokens for dialog |
| DELETE | `/api/chat/embed-tokens/:tokenId` | Admin | Revoke embed token |
| GET | `/api/chat/embed/:token/info` | No | Get dialog info for embed widget |
| POST | `/api/chat/embed/:token/sessions` | No | Create anonymous embed session |
| POST | `/api/chat/embed/:token/completions` | No | Stream chat completion for embed (SSE) |

### OpenAI-Compatible

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/chat/completions` | Bearer | OpenAI-compatible chat completion |
| GET | `/api/v1/models` | No | List available models (OpenAI format) |

## Search (23 endpoints)

### Search Apps

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/search/apps` | Yes | List search apps |
| POST | `/api/search/apps` | Admin | Create search app |
| GET | `/api/search/apps/:id` | Yes | Get search app by ID |
| PUT | `/api/search/apps/:id` | Admin | Update search app |
| DELETE | `/api/search/apps/:id` | Admin | Delete search app |
| GET | `/api/search/apps/:id/access` | Admin | Get access control entries |
| PUT | `/api/search/apps/:id/access` | Admin | Set access control entries |
| POST | `/api/search/apps/:id/search` | Yes | Execute search query |
| POST | `/api/search/apps/:id/ask` | Yes | Stream AI summary answer (SSE) |
| POST | `/api/search/apps/:id/related-questions` | Yes | Generate related questions |
| POST | `/api/search/apps/:id/mindmap` | Yes | Generate mind map from results |
| POST | `/api/search/apps/:id/retrieval-test` | Yes | Dry-run retrieval test (no LLM) |
| POST | `/api/search/apps/:id/feedback` | Yes | Submit search answer feedback |

### Search Embed Tokens

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/search/apps/:id/embed-tokens` | Admin | Create embed token |
| GET | `/api/search/apps/:id/embed-tokens` | Admin | List embed tokens |
| DELETE | `/api/search/embed-tokens/:tokenId` | Admin | Revoke embed token |
| GET | `/api/search/embed/:token/info` | No | Get search app info for embed |
| GET | `/api/search/embed/:token/config` | No | Get search app config for embed |
| POST | `/api/search/embed/:token/search` | No | Execute search via embed token |
| POST | `/api/search/embed/:token/ask` | No | Stream AI answer via embed (SSE) |
| POST | `/api/search/embed/:token/related-questions` | No | Related questions via embed |
| POST | `/api/search/embed/:token/mindmap` | No | Mind map via embed |

### OpenAI-Compatible

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/search/completions` | Bearer | OpenAI-compatible search completion |

## RAG (45 endpoints)

### Datasets — CRUD

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/datasets` | Yes | List accessible datasets |
| POST | `/api/rag/datasets` | Yes | Create dataset (returns 409 if duplicate name) |
| GET | `/api/rag/datasets/:id` | Yes | Get dataset by ID |
| PUT | `/api/rag/datasets/:id` | Yes | Update dataset properties |
| DELETE | `/api/rag/datasets/:id` | Yes | Soft-delete dataset |
| POST | `/api/rag/datasets/bulk-metadata` | Yes | Bulk update metadata tags on datasets |
| GET | `/api/rag/tags/aggregations` | Yes | Get unique tag keys and top values |

### Dataset Versioning

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/datasets/:id/versions` | Yes | List version datasets |
| POST | `/api/rag/datasets/:id/versions` | Yes | Create version dataset with optional files |

### Dataset Access Control

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/datasets/:id/access` | Yes | Get dataset access control |
| PUT | `/api/rag/datasets/:id/access` | Yes | Update dataset access control |

### Dataset Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/datasets/:id/settings` | Yes | Get dataset settings |
| PUT | `/api/rag/datasets/:id/settings` | Yes | Update dataset settings |
| POST | `/api/rag/datasets/:id/generate-field-map` | Yes | Auto-detect field map from OpenSearch |

### Dataset Overview & Logs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/datasets/:id/overview` | Yes | Dataset statistics |
| GET | `/api/rag/datasets/:id/logs` | Yes | Paginated processing logs |
| GET | `/api/rag/datasets/:id/graph` | Yes | Graph entities and relations |

### Documents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/datasets/:id/documents` | Yes | List documents in dataset |
| POST | `/api/rag/datasets/:id/documents` | Yes | Upload files to dataset |
| GET | `/api/rag/datasets/:id/documents/:docId/download` | Yes | Download document file from S3 |
| DELETE | `/api/rag/datasets/:id/documents/:docId` | Yes | Delete document and all data |
| PATCH | `/api/rag/datasets/:id/documents/:docId/toggle` | Yes | Toggle document chunk availability |
| GET | `/api/rag/datasets/:id/documents/:docId/logs` | Yes | Get RAG worker logs for document |

### Document Parsing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rag/datasets/:id/documents/:docId/parse` | Yes | Trigger document parsing |
| GET | `/api/rag/datasets/:id/documents/:docId/status` | Yes | Stream parsing progress (SSE) |
| PUT | `/api/rag/datasets/:id/documents/:docId/parser` | Yes | Change document parser method |

### Bulk Document Operations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rag/datasets/:id/documents/bulk-parse` | Yes | Bulk start/cancel parsing |
| POST | `/api/rag/datasets/:id/documents/bulk-toggle` | Yes | Bulk enable/disable documents |
| POST | `/api/rag/datasets/:id/documents/bulk-delete` | Yes | Bulk delete documents |
| POST | `/api/rag/datasets/:id/documents/web-crawl` | Yes | Create document from web URL |

### Document Enrichment

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rag/datasets/:id/documents/:docId/:enrichType` | Yes | Run enrichment (keywords/questions/tags/metadata) |

### Chunks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/datasets/:id/chunks` | Yes | List chunks (optional doc_id filter) |
| POST | `/api/rag/datasets/:id/chunks` | Yes | Create manual chunk |
| PUT | `/api/rag/datasets/:id/chunks/:chunkId` | Yes | Update chunk |
| DELETE | `/api/rag/datasets/:id/chunks/:chunkId` | Yes | Delete chunk |
| POST | `/api/rag/datasets/:id/chunks/bulk-switch` | Yes | Bulk enable/disable chunks |

### Search & Retrieval

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rag/datasets/:id/search` | Yes | Search chunks within dataset |
| POST | `/api/rag/datasets/:id/retrieval-test` | Yes | Test retrieval against dataset |

### Advanced Tasks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rag/datasets/:id/:taskType` | Yes | Start advanced task (graphrag/raptor/mindmap) |
| GET | `/api/rag/datasets/:id/:taskType/status` | Yes | Get advanced task status |
| GET | `/api/rag/datasets/:datasetId/graph/metrics` | Yes | GraphRAG entity/relation/community counts |
| POST | `/api/rag/datasets/:datasetId/graph/run` | Yes | Trigger GraphRAG indexing |

### Metadata & Images

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/datasets/:id/metadata` | Yes | Get metadata schema |
| PUT | `/api/rag/datasets/:id/metadata` | Yes | Update metadata schema |
| GET | `/api/rag/images/:imageId` | Yes | Serve chunk image from S3 |

### Tasks & System Config

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/tasks/:taskId/status` | Yes | Get task status |
| GET | `/api/rag/system/config/parsing_scheduler` | Yes | Get parsing scheduler settings |
| PUT | `/api/rag/system/config/parsing_scheduler` | Yes | Update parsing scheduler settings |

## Agents (28 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agents` | Yes | List agents |
| POST | `/api/agents` | Yes | Create agent |
| GET | `/api/agents/:id` | Yes | Get agent by ID |
| PUT | `/api/agents/:id` | Yes | Update agent |
| DELETE | `/api/agents/:id` | Yes | Delete agent |
| POST | `/api/agents/:id/duplicate` | Yes | Duplicate agent |
| GET | `/api/agents/:id/export` | Yes | Export agent definition |
| POST | `/api/agents/:id/run` | Yes | Start agent run (SSE) |
| GET | `/api/agents/:id/run/:runId/stream` | Yes | Stream agent run output |
| POST | `/api/agents/:id/run/:runId/cancel` | Yes | Cancel running agent |
| GET | `/api/agents/:id/runs` | Yes | List agent run history |
| POST | `/api/agents/:id/debug` | Yes | Start debug session |
| POST | `/api/agents/:id/debug/:runId/step` | Yes | Step to next node |
| POST | `/api/agents/:id/debug/:runId/continue` | Yes | Continue debug execution |
| POST | `/api/agents/:id/debug/:runId/breakpoint` | Yes | Set debug breakpoint |
| DELETE | `/api/agents/:id/debug/:runId/breakpoint/:nodeId` | Yes | Remove breakpoint |
| GET | `/api/agents/:id/debug/:runId/steps/:nodeId` | Yes | Get step details |
| GET | `/api/agents/:id/versions` | Yes | List agent versions |
| POST | `/api/agents/:id/versions` | Yes | Save agent version |
| POST | `/api/agents/:id/versions/:versionId/restore` | Yes | Restore version |
| DELETE | `/api/agents/:id/versions/:versionId` | Yes | Delete version |
| GET | `/api/agents/tools/credentials` | Yes | List tool credentials |
| POST | `/api/agents/tools/credentials` | Yes | Create tool credential |
| PUT | `/api/agents/tools/credentials/:id` | Yes | Update tool credential |
| DELETE | `/api/agents/tools/credentials/:id` | Yes | Delete tool credential |
| GET | `/api/agents/embed/:token/:agentId/config` | No | Get agent embed config |
| POST | `/api/agents/embed/:token/:agentId/run` | No | Run agent via embed widget (SSE) |
| POST | `/api/agents/webhook/:agentId` | No | Trigger agent via webhook |

## Memory (11 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/memory` | Yes | List memory pools |
| POST | `/api/memory` | Yes | Create memory pool |
| GET | `/api/memory/:id` | Yes | Get memory pool by ID |
| PUT | `/api/memory/:id` | Yes | Update memory pool |
| DELETE | `/api/memory/:id` | Yes | Delete memory pool |
| GET | `/api/memory/:id/messages` | Yes | List memory messages |
| POST | `/api/memory/:id/messages` | Yes | Add memory message |
| DELETE | `/api/memory/:id/messages/:messageId` | Yes | Delete memory message |
| POST | `/api/memory/:id/search` | Yes | Search memory messages |
| PUT | `/api/memory/:id/messages/:messageId/forget` | Yes | Mark message as forgotten |
| POST | `/api/memory/:id/import` | Yes | Import chat history into memory |

## Sync (8 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sync/connectors` | Yes | List connectors |
| GET | `/api/sync/connectors/:id` | Yes | Get connector by ID |
| POST | `/api/sync/connectors` | Yes | Create connector |
| PUT | `/api/sync/connectors/:id` | Yes | Update connector |
| DELETE | `/api/sync/connectors/:id` | Yes | Delete connector |
| POST | `/api/sync/connectors/:id/sync` | Yes | Trigger manual sync |
| GET | `/api/sync/connectors/:id/logs` | Yes | Get sync logs (paginated) |
| GET | `/api/sync/connectors/:id/progress` | Yes | Stream sync progress (SSE) |

## Projects (44 endpoints)

### Core CRUD

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects` | Yes | List projects |
| POST | `/api/projects` | Yes | Create project |
| GET | `/api/projects/:id` | Yes | Get project by ID |
| PUT | `/api/projects/:id` | Yes | Update project |
| DELETE | `/api/projects/:id` | Yes | Delete project |
| GET | `/api/projects/cross-project-datasets` | Yes | Get cross-project datasets |

### Permissions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/permissions` | Yes | List project permissions |
| POST | `/api/projects/:id/permissions` | Yes | Set project permission |
| DELETE | `/api/projects/:id/permissions/:permId` | Yes | Delete permission |

### Datasets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/datasets` | Yes | List project datasets |
| POST | `/api/projects/:id/datasets` | Yes | Link dataset to project |
| DELETE | `/api/projects/:id/datasets/:datasetId` | Yes | Unlink dataset |
| POST | `/api/projects/:id/datasets/bind` | Yes | Bind datasets to project |
| DELETE | `/api/projects/:id/datasets/:datasetId/unbind` | Yes | Unbind dataset |

### Categories & Versions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/categories` | Yes | List categories |
| GET | `/api/projects/:id/categories/:catId` | Yes | Get category |
| POST | `/api/projects/:id/categories` | Yes | Create category |
| PUT | `/api/projects/:id/categories/:catId` | Yes | Update category |
| DELETE | `/api/projects/:id/categories/:catId` | Yes | Delete category |
| GET | `/api/projects/:id/categories/:catId/versions` | Yes | List versions |
| POST | `/api/projects/:id/categories/:catId/versions` | Yes | Create version |
| PUT | `/api/projects/:id/categories/:catId/versions/:verId` | Yes | Update version |
| DELETE | `/api/projects/:id/categories/:catId/versions/:verId` | Yes | Delete version |
| GET | `/api/projects/:id/categories/:catId/versions/:verId/documents` | Yes | List version documents |

### Chats & Searches

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/chats` | Yes | List project chats |
| GET | `/api/projects/:id/chats/:chatId` | Yes | Get project chat |
| POST | `/api/projects/:id/chats` | Yes | Create project chat |
| PUT | `/api/projects/:id/chats/:chatId` | Yes | Update project chat |
| DELETE | `/api/projects/:id/chats/:chatId` | Yes | Delete project chat |
| GET | `/api/projects/:id/searches` | Yes | List project searches |
| GET | `/api/projects/:id/searches/:searchId` | Yes | Get project search |
| POST | `/api/projects/:id/searches` | Yes | Create project search |
| PUT | `/api/projects/:id/searches/:searchId` | Yes | Update project search |
| DELETE | `/api/projects/:id/searches/:searchId` | Yes | Delete project search |

### Members

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/members` | Yes | List project members |
| POST | `/api/projects/:id/members` | Yes | Add project member |
| DELETE | `/api/projects/:id/members/:userId` | Yes | Remove project member |

### Sync Configs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/sync-configs` | Yes | List sync configurations |
| POST | `/api/projects/:id/sync-configs` | Yes | Create sync configuration |
| PUT | `/api/projects/:id/sync-configs/:configId` | Yes | Update sync configuration |
| DELETE | `/api/projects/:id/sync-configs/:configId` | Yes | Delete sync configuration |

### Entity Permissions & Activity

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/entity-permissions` | Yes | List entity permissions |
| POST | `/api/projects/:id/entity-permissions` | Yes | Create entity permission |
| DELETE | `/api/projects/:id/entity-permissions/:permId` | Yes | Delete entity permission |
| GET | `/api/projects/:id/activity` | Yes | Get project activity feed |

## Glossary (14 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/glossary/search` | Yes | Search tasks and keywords |
| POST | `/api/glossary/generate-prompt` | Yes | Generate prompt from task + keyword selections |
| GET | `/api/glossary/tasks` | Yes | List all tasks |
| GET | `/api/glossary/tasks/:id` | Yes | Get single task |
| POST | `/api/glossary/tasks` | Admin | Create task |
| PUT | `/api/glossary/tasks/:id` | Admin | Update task |
| DELETE | `/api/glossary/tasks/:id` | Admin | Delete task |
| GET | `/api/glossary/keywords/search` | Yes | Search keywords (paginated) |
| GET | `/api/glossary/keywords` | Yes | List all keywords |
| POST | `/api/glossary/keywords` | Admin | Create keyword |
| PUT | `/api/glossary/keywords/:id` | Admin | Update keyword |
| DELETE | `/api/glossary/keywords/:id` | Admin | Delete keyword |
| POST | `/api/glossary/bulk-import` | Admin | Bulk import tasks from Excel |
| POST | `/api/glossary/keywords/bulk-import` | Admin | Bulk import keywords from Excel |

## LLM Provider (9 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/llm-providers` | Yes | List all active providers |
| GET | `/api/llm-providers/defaults` | Yes | Get default providers per model type |
| GET | `/api/llm-providers/presets` | Yes | Get factory preset configurations |
| GET | `/api/llm-providers/:id` | Yes | Get provider by ID |
| POST | `/api/llm-providers` | Yes | Create provider |
| PUT | `/api/llm-providers/:id` | Yes | Update provider |
| DELETE | `/api/llm-providers/:id` | Yes | Soft-delete provider |
| POST | `/api/llm-providers/:id/test-connection` | Yes | Test provider connectivity |
| GET | `/api/models` | Yes | List active models by type (public) |

## Admin (8 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/dashboard` | Admin | System statistics overview |
| GET | `/api/admin/history/chat` | Admin | List all chat sessions |
| GET | `/api/admin/history/chat/:sessionId` | Admin | Get chat session details |
| GET | `/api/admin/history/search` | Admin | List all search history |
| GET | `/api/admin/history/search/:sessionId` | Admin | Get search session details |
| GET | `/api/admin/history/agent-runs` | Admin | List all agent runs |
| GET | `/api/admin/history/agent-runs/:runId` | Admin | Get agent run details |
| GET | `/api/admin/history/system-chat` | Admin | List system-level chat history |

## Dashboard (3 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/dashboard/stats` | Admin | Aggregated dashboard statistics |
| GET | `/api/admin/dashboard/analytics/queries` | Admin | Query analytics (volume, latency, trends) |
| GET | `/api/admin/dashboard/analytics/feedback` | Admin | Feedback analytics (satisfaction, worst datasets) |

## Audit (3 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/audit` | Admin | List audit logs (paginated, filterable) |
| GET | `/api/audit/actions` | Admin | List distinct action types |
| GET | `/api/audit/resource-types` | Admin | List distinct resource types |

## Broadcast (6 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/broadcast-messages/active` | No | Get active broadcasts (filtered by dismissal) |
| POST | `/api/broadcast-messages/:id/dismiss` | Yes | Dismiss a broadcast |
| GET | `/api/broadcast-messages` | Admin | List all broadcast messages |
| POST | `/api/broadcast-messages` | Admin | Create broadcast message |
| PUT | `/api/broadcast-messages/:id` | Admin | Update broadcast message |
| DELETE | `/api/broadcast-messages/:id` | Admin | Delete broadcast message |

## User History (4 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/user/history/chat` | Yes | List user's chat sessions |
| GET | `/api/user/history/chat/:sessionId` | Yes | Get chat session details |
| GET | `/api/user/history/search` | Yes | List user's search sessions |
| GET | `/api/user/history/search/:sessionId` | Yes | Get search session details |

## System Tools (3 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/system-tools` | Yes | List available system tools |
| GET | `/api/system-tools/health` | Yes | Get system health status |
| POST | `/api/system-tools/:id/run` | Admin | Execute a system tool |

## Code Graph (11 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/code-graph/:kbId/stats` | Yes | Get code graph statistics |
| GET | `/api/code-graph/:kbId/callers` | Yes | Find callers of a function |
| GET | `/api/code-graph/:kbId/callees` | Yes | Find callees of a function |
| GET | `/api/code-graph/:kbId/snippet` | Yes | Get source code snippet |
| GET | `/api/code-graph/:kbId/hierarchy` | Yes | Get class inheritance hierarchy |
| GET | `/api/code-graph/:kbId/graph` | Yes | Get full graph data for visualization |
| GET | `/api/code-graph/:kbId/schema` | Yes | Get graph schema (labels + types) |
| GET | `/api/code-graph/:kbId/search` | Yes | Search code entities by name |
| GET | `/api/code-graph/:kbId/dependencies` | Yes | Get import/dependency relationships |
| POST | `/api/code-graph/:kbId/nl-query` | Yes | Natural language graph query |
| POST | `/api/code-graph/:kbId/cypher` | Admin | Execute raw Cypher query |

## External API (3 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/external/chat` | API Key | RAG chat with structured response |
| POST | `/api/v1/external/search` | API Key | Search with AI summary |
| POST | `/api/v1/external/retrieval` | API Key | Retrieval-only (no LLM generation) |

## API Keys (4 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/external/api-keys` | Yes | List user's API keys |
| POST | `/api/external/api-keys` | Yes | Create API key |
| PATCH | `/api/external/api-keys/:id` | Yes | Update API key (name, scopes, status) |
| DELETE | `/api/external/api-keys/:id` | Yes | Delete API key |

## Preview (1 endpoint)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/preview/:bucketName/*` | Yes | Preview file from S3 storage |

## Feedback (4 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/feedback` | Admin | List feedback records (paginated) |
| GET | `/api/feedback/stats` | Admin | Get aggregated feedback statistics |
| GET | `/api/feedback/export` | Admin | Export feedback records (JSON) |
| POST | `/api/feedback` | Yes | Submit answer feedback |
