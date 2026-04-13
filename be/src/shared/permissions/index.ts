/**
 * @description Public barrel for the permission registry.
 *
 * Two responsibilities:
 *   1. Re-export the registry helper types/functions so callers have a single
 *      import path: `import { getAllPermissions } from '@/shared/permissions'`.
 *   2. Eagerly import every `<feature>.permissions.ts` file in the codebase so
 *      their `definePermissions` side effects fire and `ALL_PERMISSIONS` is
 *      populated by the time anyone calls `getAllPermissions()`. The 21 lines
 *      below are intentionally explicit (no glob, no dynamic require) — see
 *      `1-RESEARCH.md` §13 pitfall 7.
 *
 * Auth has no permissions (login/logout/session) so it has no file here.
 */

// ── Registry helper re-exports ─────────────────────────────────────

export {
  definePermissions,
  getAllPermissions,
  type Permission,
  type PermissionSpec,
  type PermissionMap,
} from './registry.js'

// ── Eager module imports (side effects register permissions) ───────

import '@/modules/agents/agents.permissions.js'
import '@/modules/audit/audit.permissions.js'
import '@/modules/broadcast/broadcast.permissions.js'
import '@/modules/chat/chat.permissions.js'
import '@/modules/code-graph/code-graph.permissions.js'
import '@/modules/dashboard/dashboard.permissions.js'
import '@/modules/external/external.permissions.js'
import '@/modules/feedback/feedback.permissions.js'
import '@/modules/glossary/glossary.permissions.js'
import '@/modules/knowledge-base/knowledge-base.permissions.js'
import '@/modules/llm-provider/llm-provider.permissions.js'
import '@/modules/memory/memory.permissions.js'
import '@/modules/permissions/permissions.permissions.js'
import '@/modules/preview/preview.permissions.js'
import '@/modules/rag/rag.permissions.js'
import '@/modules/search/search.permissions.js'
import '@/modules/sync/sync.permissions.js'
import '@/modules/system/system.permissions.js'
import '@/modules/system-tools/system-tools.permissions.js'
import '@/modules/teams/teams.permissions.js'
import '@/modules/user-history/user-history.permissions.js'
import '@/modules/users/users.permissions.js'

// ── Named re-exports of each module's primary permission map ───────

export { AGENTS_PERMISSIONS } from '@/modules/agents/agents.permissions.js'
export { AUDIT_PERMISSIONS } from '@/modules/audit/audit.permissions.js'
export { BROADCAST_PERMISSIONS } from '@/modules/broadcast/broadcast.permissions.js'
export { CHAT_PERMISSIONS } from '@/modules/chat/chat.permissions.js'
export { CODE_GRAPH_PERMISSIONS } from '@/modules/code-graph/code-graph.permissions.js'
export { DASHBOARD_PERMISSIONS } from '@/modules/dashboard/dashboard.permissions.js'
export { EXTERNAL_PERMISSIONS } from '@/modules/external/external.permissions.js'
export { FEEDBACK_PERMISSIONS } from '@/modules/feedback/feedback.permissions.js'
export { GLOSSARY_PERMISSIONS } from '@/modules/glossary/glossary.permissions.js'
export {
  KNOWLEDGE_BASE_PERMISSIONS,
  DOCUMENT_CATEGORIES_PERMISSIONS,
  KNOWLEDGE_BASE_DOCUMENTS_PERMISSIONS,
} from '@/modules/knowledge-base/knowledge-base.permissions.js'
export { LLM_PROVIDER_PERMISSIONS } from '@/modules/llm-provider/llm-provider.permissions.js'
export { MEMORY_PERMISSIONS } from '@/modules/memory/memory.permissions.js'
export { PERMISSIONS_PERMISSIONS } from '@/modules/permissions/permissions.permissions.js'
export { PREVIEW_PERMISSIONS } from '@/modules/preview/preview.permissions.js'
export {
  RAG_PERMISSIONS,
  RAG_DOCUMENTS_PERMISSIONS,
  RAG_CHUNKS_PERMISSIONS,
} from '@/modules/rag/rag.permissions.js'
export { SEARCH_PERMISSIONS } from '@/modules/search/search.permissions.js'
export { SYNC_PERMISSIONS } from '@/modules/sync/sync.permissions.js'
export {
  SYSTEM_PERMISSIONS,
  SYSTEM_HISTORY_PERMISSIONS,
} from '@/modules/system/system.permissions.js'
export { SYSTEM_TOOLS_PERMISSIONS } from '@/modules/system-tools/system-tools.permissions.js'
export { TEAMS_PERMISSIONS } from '@/modules/teams/teams.permissions.js'
export { USER_HISTORY_PERMISSIONS } from '@/modules/user-history/user-history.permissions.js'
export { USERS_PERMISSIONS } from '@/modules/users/users.permissions.js'

// ── Boot sync service (P1.4) ───────────────────────────────────────

export { syncPermissionsCatalog, type SyncResult } from './sync.js'
