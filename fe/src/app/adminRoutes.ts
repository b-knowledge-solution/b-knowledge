/**
 * @fileoverview Canonical admin route contracts and path builders.
 *
 * Keeps `/admin/...` path registration centralized so routing, metadata,
 * navigation, and deep-link builders all share the same contract.
 *
 * @module app/adminRoutes
 */

/**
 * @description Pseudo-id used for the agent canvas create flow under the admin shell
 */
export const ADMIN_AGENT_NEW_ID = 'new'

/**
 * @description Default landing path for the admin shell
 */
export const ADMIN_HOME_PATH = '/admin/data-studio/knowledge-base'

/**
 * @description Admin route contract for the knowledge-base list page
 */
export const ADMIN_KNOWLEDGE_BASE_ROUTE = '/admin/data-studio/knowledge-base'

/**
 * @description Admin route contract for the datasets list page
 */
export const ADMIN_DATASETS_ROUTE = '/admin/data-studio/datasets'

/**
 * @description Admin route contract for the datasets detail page
 */
export const ADMIN_DATASET_DETAIL_ROUTE = '/admin/data-studio/datasets/:id'

/**
 * @description Admin route contract for dataset document review pages
 */
export const ADMIN_DOCUMENT_REVIEW_ROUTE = '/admin/data-studio/datasets/:id/documents/:docId'

/**
 * @description Admin route contract for dataset chunk detail pages
 */
export const ADMIN_DATASET_CHUNK_DETAIL_ROUTE =
  '/admin/data-studio/datasets/:id/documents/:docId/chunks'

/**
 * @description Hidden admin route contract for the knowledge-base code graph page
 */
export const ADMIN_CODE_GRAPH_ROUTE = '/admin/code-graph/:kbId'

/**
 * @description Admin route contract for the agent list page
 */
export const ADMIN_AGENTS_ROUTE = '/admin/agent-studio/agents'

/**
 * @description Admin route contract for agent canvas pages
 */
export const ADMIN_AGENT_CANVAS_ROUTE = '/admin/agent-studio/agents/:id'

/**
 * @description Admin route contract for memory list pages
 */
export const ADMIN_MEMORY_ROUTE = '/admin/agent-studio/memory'

/**
 * @description Admin route contract for memory detail pages
 */
export const ADMIN_MEMORY_DETAIL_ROUTE = '/admin/agent-studio/memory/:id'

/**
 * @description Admin route contract for chat assistant management
 */
export const ADMIN_CHAT_ASSISTANTS_ROUTE = '/admin/agent-studio/chat-assistants'

/**
 * @description Admin route contract for search app management
 */
export const ADMIN_SEARCH_APPS_ROUTE = '/admin/agent-studio/search-apps'

/**
 * @description Admin route contract for history pages
 */
export const ADMIN_HISTORIES_ROUTE = '/admin/agent-studio/histories'

/**
 * @description Admin route contract for IAM user management
 */
export const ADMIN_USERS_ROUTE = '/admin/iam/users'

/**
 * @description Admin route contract for IAM user detail pages
 */
export const ADMIN_USER_DETAIL_ROUTE = '/admin/iam/users/:id'

/**
 * @description Admin route contract for IAM team management
 */
export const ADMIN_TEAMS_ROUTE = '/admin/iam/teams'

/**
 * @description Admin route contract for IAM permission management
 */
export const ADMIN_PERMISSIONS_ROUTE = '/admin/iam/permissions'

/**
 * @description Admin route contract for IAM effective access pages
 */
export const ADMIN_EFFECTIVE_ACCESS_ROUTE = '/admin/iam/effective-access'

/**
 * @description Admin route contract for the system dashboard
 */
export const ADMIN_DASHBOARD_ROUTE = '/admin/system/dashboard'

/**
 * @description Admin route contract for audit log pages
 */
export const ADMIN_AUDIT_LOG_ROUTE = '/admin/system/audit-log'

/**
 * @description Admin route contract for system tools
 */
export const ADMIN_SYSTEM_TOOLS_ROUTE = '/admin/system/system-tools'

/**
 * @description Admin route contract for system monitor pages
 */
export const ADMIN_SYSTEM_MONITOR_ROUTE = '/admin/system/system-monitor'

/**
 * @description Admin route contract for tokenizer pages
 */
export const ADMIN_TOKENIZER_ROUTE = '/admin/system/tokenizer'

/**
 * @description Admin route contract for broadcast message pages
 */
export const ADMIN_BROADCAST_MESSAGES_ROUTE = '/admin/system/broadcast-messages'

/**
 * @description Admin route contract for LLM provider pages
 */
export const ADMIN_LLM_PROVIDERS_ROUTE = '/admin/system/llm-providers'

/**
 * @description Builds the admin knowledge-base detail path for a specific knowledge base
 * @param {string} knowledgeBaseId - Knowledge-base identifier
 * @returns {string} Concrete admin knowledge-base detail URL
 */
export function buildAdminKnowledgeBasePath(knowledgeBaseId: string): string {
  return `${ADMIN_KNOWLEDGE_BASE_ROUTE}/${knowledgeBaseId}`
}

/**
 * @description Builds the hidden admin code-graph path for a knowledge base
 * @param {string} kbId - Knowledge-base identifier
 * @returns {string} Concrete admin code-graph URL
 */
export function buildAdminCodeGraphPath(kbId: string): string {
  return ADMIN_CODE_GRAPH_ROUTE.replace(':kbId', kbId)
}

/**
 * @description Builds the admin agent canvas path for an existing or new agent
 * @param {string} agentId - Agent identifier or the `new` pseudo-id
 * @returns {string} Concrete admin agent canvas URL
 */
export function buildAdminAgentCanvasPath(agentId: string): string {
  return ADMIN_AGENT_CANVAS_ROUTE.replace(':id', agentId)
}
