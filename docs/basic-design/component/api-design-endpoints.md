# API Endpoint Reference

## Overview

Complete endpoint reference for the B-Knowledge REST API, grouped by module. All endpoints are prefixed with `/api`.

## Auth (11 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Local email/password login |
| POST | `/api/auth/register` | No | Register new user account |
| POST | `/api/auth/logout` | Yes | Destroy session |
| GET | `/api/auth/me` | Yes | Get current user profile |
| POST | `/api/auth/forgot-password` | No | Send password reset email |
| POST | `/api/auth/reset-password` | No | Reset password with token |
| POST | `/api/auth/change-password` | Yes | Change current password |
| GET | `/api/auth/azure/login` | No | Initiate Azure AD OAuth |
| GET | `/api/auth/azure/callback` | No | Azure AD OAuth callback |
| POST | `/api/auth/refresh` | Yes | Refresh session |
| GET | `/api/auth/settings` | No | Get public auth settings |

## Users (8 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Yes | List users (paginated) |
| GET | `/api/users/:id` | Yes | Get user by ID |
| POST | `/api/users` | Yes | Create user (admin) |
| PUT | `/api/users/:id` | Yes | Update user |
| DELETE | `/api/users/:id` | Yes | Delete user |
| PUT | `/api/users/:id/role` | Yes | Update user role |
| PUT | `/api/users/:id/status` | Yes | Activate/deactivate user |
| GET | `/api/users/search` | Yes | Search users by name/email |

## Teams (8 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/teams` | Yes | List teams |
| GET | `/api/teams/:id` | Yes | Get team by ID |
| POST | `/api/teams` | Yes | Create team |
| PUT | `/api/teams/:id` | Yes | Update team |
| DELETE | `/api/teams/:id` | Yes | Delete team |
| GET | `/api/teams/:id/members` | Yes | List team members |
| POST | `/api/teams/:id/members` | Yes | Add members to team |
| DELETE | `/api/teams/:id/members/:uid` | Yes | Remove member from team |

## Chat (~20 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/chat/conversations` | Yes | List conversations |
| POST | `/api/chat/conversations` | Yes | Create conversation |
| GET | `/api/chat/conversations/:id` | Yes | Get conversation |
| PUT | `/api/chat/conversations/:id` | Yes | Update conversation |
| DELETE | `/api/chat/conversations/:id` | Yes | Delete conversation |
| POST | `/api/chat/conversations/:id/messages` | Yes | Send message (SSE stream) |
| GET | `/api/chat/conversations/:id/messages` | Yes | List messages |
| DELETE | `/api/chat/conversations/:id/messages/:mid` | Yes | Delete message |
| POST | `/api/chat/conversations/:id/stop` | Yes | Stop streaming response |
| GET | `/api/chat/assistants` | Yes | List assistants |
| POST | `/api/chat/assistants` | Yes | Create assistant |
| PUT | `/api/chat/assistants/:id` | Yes | Update assistant |
| DELETE | `/api/chat/assistants/:id` | Yes | Delete assistant |
| GET | `/api/chat/assistants/:id` | Yes | Get assistant details |
| POST | `/api/chat/embed` | No | Embedded chat widget endpoint |
| POST | `/api/chat/files/upload` | Yes | Upload file for chat context |
| GET | `/api/chat/files/:id` | Yes | Get uploaded file |
| DELETE | `/api/chat/files/:id` | Yes | Delete uploaded file |
| POST | `/api/v1/chat/completions` | Yes | OpenAI-compatible chat API |
| GET | `/api/chat/shared/:token` | No | Access shared conversation |

## Search (~15 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/search/apps` | Yes | List search apps |
| POST | `/api/search/apps` | Yes | Create search app |
| GET | `/api/search/apps/:id` | Yes | Get search app |
| PUT | `/api/search/apps/:id` | Yes | Update search app |
| DELETE | `/api/search/apps/:id` | Yes | Delete search app |
| POST | `/api/search/apps/:id/query` | Yes | Execute search query (SSE) |
| POST | `/api/search/apps/:id/test` | Yes | Test search configuration |
| GET | `/api/search/apps/:id/history` | Yes | Get search history |
| POST | `/api/search/embed` | No | Embedded search widget |
| GET | `/api/search/embed/:token` | No | Embedded search page |
| POST | `/api/v1/search/completions` | Yes | OpenAI-compatible search API |
| GET | `/api/search/apps/:id/analytics` | Yes | Search analytics |
| PUT | `/api/search/apps/:id/datasets` | Yes | Link datasets to search app |
| GET | `/api/search/apps/:id/datasets` | Yes | List linked datasets |
| POST | `/api/search/apps/:id/feedback` | Yes | Submit search feedback |

## RAG (~30 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rag/datasets` | Yes | List datasets |
| POST | `/api/rag/datasets` | Yes | Create dataset |
| GET | `/api/rag/datasets/:id` | Yes | Get dataset |
| PUT | `/api/rag/datasets/:id` | Yes | Update dataset settings |
| DELETE | `/api/rag/datasets/:id` | Yes | Delete dataset |
| GET | `/api/rag/datasets/:id/documents` | Yes | List documents |
| POST | `/api/rag/datasets/:id/documents` | Yes | Upload documents (multipart) |
| GET | `/api/rag/datasets/:id/documents/:did` | Yes | Get document |
| PUT | `/api/rag/datasets/:id/documents/:did` | Yes | Update document |
| DELETE | `/api/rag/datasets/:id/documents/:did` | Yes | Delete document |
| POST | `/api/rag/datasets/:id/documents/:did/parse` | Yes | Trigger document parsing |
| POST | `/api/rag/datasets/:id/documents/:did/cancel` | Yes | Cancel parsing task |
| POST | `/api/rag/datasets/:id/documents/web-crawl` | Yes | Crawl web page as document |
| POST | `/api/rag/datasets/:id/documents/bulk-parse` | Yes | Bulk parse documents |
| POST | `/api/rag/datasets/:id/documents/bulk-toggle` | Yes | Bulk enable/disable |
| POST | `/api/rag/datasets/:id/documents/bulk-delete` | Yes | Bulk delete documents |
| GET | `/api/rag/datasets/:id/documents/:did/chunks` | Yes | List chunks |
| POST | `/api/rag/datasets/:id/documents/:did/chunks` | Yes | Create manual chunk |
| PUT | `/api/rag/datasets/:id/chunks/:cid` | Yes | Update chunk |
| DELETE | `/api/rag/datasets/:id/chunks/:cid` | Yes | Delete chunk |
| POST | `/api/rag/datasets/:id/retrieval-test` | Yes | Test retrieval |
| GET | `/api/rag/datasets/:id/graph` | Yes | Get knowledge graph |
| POST | `/api/rag/datasets/:id/graph/build` | Yes | Trigger graph build |
| DELETE | `/api/rag/datasets/:id/graph` | Yes | Delete graph |
| GET | `/api/rag/datasets/:id/metadata` | Yes | Get dataset metadata |
| PUT | `/api/rag/datasets/:id/metadata` | Yes | Update metadata |
| GET | `/api/rag/tasks` | Yes | List processing tasks |
| GET | `/api/rag/tasks/:id` | Yes | Get task status |
| DELETE | `/api/rag/tasks/:id` | Yes | Cancel task |
| GET | `/api/rag/datasets/:id/stats` | Yes | Dataset statistics |

## Sync (6 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sync/connectors` | Yes | List connectors |
| POST | `/api/sync/connectors` | Yes | Create connector |
| PUT | `/api/sync/connectors/:id` | Yes | Update connector |
| DELETE | `/api/sync/connectors/:id` | Yes | Delete connector |
| POST | `/api/sync/connectors/:id/run` | Yes | Trigger sync |
| GET | `/api/sync/connectors/:id/logs` | Yes | Get sync logs |

## Projects (~25 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects` | Yes | List projects |
| POST | `/api/projects` | Yes | Create project |
| GET | `/api/projects/:id` | Yes | Get project |
| PUT | `/api/projects/:id` | Yes | Update project |
| DELETE | `/api/projects/:id` | Yes | Delete project |
| GET | `/api/projects/:id/categories` | Yes | List categories |
| POST | `/api/projects/:id/categories` | Yes | Create category |
| PUT | `/api/projects/:id/categories/:cid` | Yes | Update category |
| DELETE | `/api/projects/:id/categories/:cid` | Yes | Delete category |
| GET | `/api/projects/:id/versions` | Yes | List versions |
| POST | `/api/projects/:id/versions` | Yes | Create version |
| PUT | `/api/projects/:id/versions/:vid` | Yes | Update version |
| DELETE | `/api/projects/:id/versions/:vid` | Yes | Delete version |
| GET | `/api/projects/:id/chats` | Yes | List project chats |
| POST | `/api/projects/:id/chats` | Yes | Create project chat |
| GET | `/api/projects/:id/searches` | Yes | List project searches |
| POST | `/api/projects/:id/searches` | Yes | Create project search |
| GET | `/api/projects/:id/members` | Yes | List project members |
| POST | `/api/projects/:id/members` | Yes | Add project member |
| DELETE | `/api/projects/:id/members/:uid` | Yes | Remove project member |
| PUT | `/api/projects/:id/members/:uid` | Yes | Update member role |
| GET | `/api/projects/:id/permissions` | Yes | Get project permissions |
| PUT | `/api/projects/:id/permissions` | Yes | Update permissions |
| GET | `/api/projects/:id/datasets` | Yes | List linked datasets |
| PUT | `/api/projects/:id/datasets` | Yes | Link datasets |

## Glossary (~10 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/glossary/tasks` | Yes | List glossary tasks |
| POST | `/api/glossary/tasks` | Yes | Create glossary task |
| GET | `/api/glossary/tasks/:id` | Yes | Get glossary task |
| PUT | `/api/glossary/tasks/:id` | Yes | Update glossary task |
| DELETE | `/api/glossary/tasks/:id` | Yes | Delete glossary task |
| POST | `/api/glossary/tasks/:id/run` | Yes | Execute glossary task |
| GET | `/api/glossary/keywords` | Yes | List keywords |
| POST | `/api/glossary/keywords` | Yes | Create keyword |
| PUT | `/api/glossary/keywords/:id` | Yes | Update keyword |
| DELETE | `/api/glossary/keywords/:id` | Yes | Delete keyword |

## LLM Provider (8 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/llm-provider/factories` | Yes | List LLM factories |
| GET | `/api/llm-provider/models` | Yes | List available models |
| GET | `/api/llm-provider/tenant-models` | Yes | List tenant model configs |
| POST | `/api/llm-provider/tenant-models` | Yes | Add tenant model config |
| PUT | `/api/llm-provider/tenant-models/:id` | Yes | Update model config |
| DELETE | `/api/llm-provider/tenant-models/:id` | Yes | Delete model config |
| POST | `/api/llm-provider/test` | Yes | Test model connection |
| PUT | `/api/llm-provider/tenant-models/:id/default` | Yes | Set as default model |

## Admin / Dashboard (5 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/stats` | Yes | System-wide statistics |
| GET | `/api/admin/health` | No | Health check |
| GET | `/api/dashboard/overview` | Yes | Dashboard overview data |
| GET | `/api/dashboard/usage` | Yes | Usage analytics |
| GET | `/api/dashboard/trends` | Yes | Usage trends |

## Audit (3 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/audit/logs` | Yes | List audit logs (paginated) |
| GET | `/api/audit/logs/:id` | Yes | Get audit log detail |
| GET | `/api/audit/logs/export` | Yes | Export audit logs (CSV) |

## Broadcast (5 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/broadcast` | Yes | List broadcasts |
| POST | `/api/broadcast` | Yes | Create broadcast |
| PUT | `/api/broadcast/:id` | Yes | Update broadcast |
| DELETE | `/api/broadcast/:id` | Yes | Delete broadcast |
| POST | `/api/broadcast/:id/send` | Yes | Send broadcast |

## User History (4 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/user-history` | Yes | List user activity |
| GET | `/api/user-history/recent` | Yes | Recent activity |
| GET | `/api/user-history/stats` | Yes | Activity statistics |
| DELETE | `/api/user-history` | Yes | Clear history |

## System Tools (3 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/system-tools/info` | Yes | System information |
| POST | `/api/system-tools/cache/clear` | Yes | Clear cache |
| GET | `/api/system-tools/config` | Yes | Get system config |

## Agents (~30 endpoints)

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
| GET | `/api/feedback` | Yes | List feedback records (paginated) |
| GET | `/api/feedback/stats` | Yes | Get aggregated feedback statistics |
| GET | `/api/feedback/export` | Yes | Export feedback records (JSON) |
| POST | `/api/feedback` | Yes | Submit answer feedback |
