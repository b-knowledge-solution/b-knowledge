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
 * @description Builds the admin dataset detail path for a specific dataset
 * @param {string} datasetId - Dataset identifier
 * @returns {string} Concrete admin dataset detail URL
 */
export function buildAdminDatasetPath(datasetId: string): string {
  return ADMIN_DATASET_DETAIL_ROUTE.replace(':id', datasetId)
}

/**
 * @description Builds the admin dataset chunk detail path for a specific document inside a dataset
 * @param {string} datasetId - Dataset identifier
 * @param {string} docId - Document identifier
 * @returns {string} Concrete admin dataset chunk detail URL
 */
export function buildAdminDatasetChunkPath(datasetId: string, docId: string): string {
  return ADMIN_DATASET_CHUNK_DETAIL_ROUTE.replace(':id', datasetId).replace(':docId', docId)
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

/**
 * @description Builds the admin IAM user-detail path, optionally preserving the selected tab
 * @param {string | number} userId - User identifier
 * @param {string} [tab] - Optional detail-tab query parameter
 * @returns {string} Concrete admin IAM user-detail URL
 */
export function buildAdminUserDetailPath(userId: string | number, tab?: string): string {
  const detailPath = ADMIN_USER_DETAIL_ROUTE.replace(':id', String(userId))
  if (!tab) {
    return detailPath
  }

  const params = new URLSearchParams({ tab })
  return `${detailPath}?${params.toString()}`
}

/**
 * @description Converts an absolute admin route contract into the nested child path used under the `/admin` parent route
 * @param {string} route - Absolute admin route contract
 * @returns {string} Relative child path for nested React Router configuration
 */
export function toAdminChildPath(route: string): string {
  return route.replace('/admin/', '')
}
