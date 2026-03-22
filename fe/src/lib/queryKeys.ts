/**
 * @fileoverview Centralized query key factory for TanStack Query.
 *
 * Every feature's query keys are defined here so that cache invalidation,
 * prefetching, and optimistic updates can reference a single source of truth.
 * Uses `as const` for full type-safety and autocomplete.
 *
 * @module lib/queryKeys
 */

// ============================================================================
// Query Key Factory
// ============================================================================

/**
 * @description Centralized query key factory for all TanStack Query cache operations across every feature domain
 */
export const queryKeys = {
  // --------------------------------------------------------------------------
  // Auth
  // --------------------------------------------------------------------------
  auth: {
    all: ['auth'] as const,
    me: () => [...queryKeys.auth.all, 'me'] as const,
  },

  // --------------------------------------------------------------------------
  // Datasets
  // --------------------------------------------------------------------------
  datasets: {
    all: ['datasets'] as const,
    list: () => [...queryKeys.datasets.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.datasets.all, 'detail', id] as const,
    documents: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'documents'] as const,
    chunks: (datasetId: string, params?: Record<string, unknown>) =>
      [...queryKeys.datasets.all, datasetId, 'chunks', params] as const,
    settings: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'settings'] as const,
    access: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'access'] as const,
    retrievalTest: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'retrieval-test'] as const,
    versions: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'versions'] as const,
    versionFiles: (datasetId: string, versionId: string) =>
      [...queryKeys.datasets.all, datasetId, 'versions', versionId, 'files'] as const,
    converterJobs: (datasetId: string, versionId: string) =>
      [...queryKeys.datasets.all, datasetId, 'versions', versionId, 'jobs'] as const,
    overview: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'overview'] as const,
    logs: (datasetId: string, params?: Record<string, unknown>) =>
      [...queryKeys.datasets.all, datasetId, 'logs', params] as const,
    documentLogs: (datasetId: string, docId: string) =>
      [...queryKeys.datasets.all, datasetId, 'documents', docId, 'logs'] as const,
    graph: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'graph'] as const,
    graphragStatus: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'graphrag-status'] as const,
    raptorStatus: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'raptor-status'] as const,
    graphMetrics: (datasetId: string) => [...queryKeys.datasets.detail(datasetId), 'graphMetrics'] as const,
    metadata: (datasetId: string) => [...queryKeys.datasets.all, datasetId, 'metadata'] as const,
    tagAggregations: (datasetIds?: string[]) =>
      [...queryKeys.datasets.all, 'tags', 'aggregations', datasetIds] as const,
  },

  // --------------------------------------------------------------------------
  // Parsing Scheduler (System Config)
  // --------------------------------------------------------------------------
  parsingScheduler: {
    all: ['parsing-scheduler'] as const,
    config: () => ['parsing-scheduler', 'config'] as const,
  },

  // --------------------------------------------------------------------------
  // Audit
  // --------------------------------------------------------------------------
  audit: {
    all: ['audit'] as const,
    logs: (page: number, limit: number, filters?: Record<string, unknown>) =>
      [...queryKeys.audit.all, 'logs', { page, limit, ...filters }] as const,
    actions: () => [...queryKeys.audit.all, 'actions'] as const,
    resourceTypes: () => [...queryKeys.audit.all, 'resource-types'] as const,
  },

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------
  users: {
    all: ['users'] as const,
    list: (roles?: string[]) => [...queryKeys.users.all, 'list', { roles }] as const,
    ipHistory: () => [...queryKeys.users.all, 'ip-history'] as const,
  },

  // --------------------------------------------------------------------------
  // Teams
  // --------------------------------------------------------------------------
  teams: {
    all: ['teams'] as const,
    list: () => [...queryKeys.teams.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.teams.all, 'detail', id] as const,
    members: (teamId: string) => [...queryKeys.teams.all, teamId, 'members'] as const,
  },

  // --------------------------------------------------------------------------
  // Dashboard
  // --------------------------------------------------------------------------
  dashboard: {
    all: ['dashboard'] as const,
    stats: (startDate?: string, endDate?: string) =>
      [...queryKeys.dashboard.all, 'stats', { startDate, endDate }] as const,
    analytics: (startDate?: string, endDate?: string) =>
      [...queryKeys.dashboard.all, 'analytics', { startDate, endDate }] as const,
    feedback: (startDate?: string, endDate?: string) =>
      [...queryKeys.dashboard.all, 'feedback', { startDate, endDate }] as const,
  },

  // --------------------------------------------------------------------------
  // Glossary
  // --------------------------------------------------------------------------
  glossary: {
    all: ['glossary'] as const,
    tasks: () => [...queryKeys.glossary.all, 'tasks'] as const,
    task: (id: string) => [...queryKeys.glossary.all, 'tasks', id] as const,
    keywords: () => [...queryKeys.glossary.all, 'keywords'] as const,
    keywordSearch: (params?: Record<string, unknown>) =>
      [...queryKeys.glossary.all, 'keywords', 'search', params] as const,
    search: (query: string) => [...queryKeys.glossary.all, 'search', query] as const,
  },

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------
  search: {
    all: ['search'] as const,
    results: (datasetId: string, query: string, filters?: Record<string, unknown>) =>
      [...queryKeys.search.all, 'results', datasetId, query, filters] as const,
    allResults: (query: string, filters?: Record<string, unknown>) =>
      [...queryKeys.search.all, 'all-results', query, filters] as const,
    apps: (params?: Record<string, unknown>) => [...queryKeys.search.all, 'apps', params] as const,
    appAccess: (appId: string) => [...queryKeys.search.all, 'apps', appId, 'access'] as const,
    relatedQuestions: (appId: string, query: string) =>
      [...queryKeys.search.all, 'related-questions', appId, query] as const,
    mindMap: (appId: string, query: string) =>
      [...queryKeys.search.all, 'mindmap', appId, query] as const,
  },

  // --------------------------------------------------------------------------
  // Broadcast
  // --------------------------------------------------------------------------
  broadcast: {
    all: ['broadcast'] as const,
    active: () => [...queryKeys.broadcast.all, 'active'] as const,
    list: () => [...queryKeys.broadcast.all, 'list'] as const,
  },

  // --------------------------------------------------------------------------
  // Converter (System)
  // --------------------------------------------------------------------------
  converter: {
    all: ['converter'] as const,
    stats: () => [...queryKeys.converter.all, 'stats'] as const,
    jobs: (filters?: Record<string, unknown>) =>
      [...queryKeys.converter.all, 'jobs', filters] as const,
    jobDetail: (jobId: string) => [...queryKeys.converter.all, 'jobs', jobId] as const,
    jobFiles: (jobId: string) => [...queryKeys.converter.all, 'jobs', jobId, 'files'] as const,
    config: () => [...queryKeys.converter.all, 'config'] as const,
  },

  // --------------------------------------------------------------------------
  // System Tools
  // --------------------------------------------------------------------------
  systemTools: {
    all: ['system-tools'] as const,
    list: () => [...queryKeys.systemTools.all, 'list'] as const,
    health: () => [...queryKeys.systemTools.all, 'health'] as const,
  },


  // --------------------------------------------------------------------------
  // Histories (Admin)
  // --------------------------------------------------------------------------
  histories: {
    all: ['histories'] as const,
    chat: (search: string, filters: Record<string, unknown>, page: number) =>
      [...queryKeys.histories.all, 'chat', { search, ...filters, page }] as const,
    chatInfinite: (search: string, filters: unknown) =>
      [...queryKeys.histories.all, 'chat', 'infinite', search, filters] as const,
    chatSession: (sessionId: string) =>
      [...queryKeys.histories.all, 'chat', sessionId] as const,
    search: (search: string, filters: Record<string, unknown>, page: number) =>
      [...queryKeys.histories.all, 'search', { search, ...filters, page }] as const,
    searchInfinite: (search: string, filters: unknown) =>
      [...queryKeys.histories.all, 'search', 'infinite', search, filters] as const,
    searchSession: (sessionId: string) =>
      [...queryKeys.histories.all, 'search', 'session', sessionId] as const,
    sessionDetails: (tab: string, sessionId: string) =>
      [...queryKeys.histories.all, 'session-details', tab, sessionId] as const,
  },

  // --------------------------------------------------------------------------
  // Chat
  // --------------------------------------------------------------------------
  chat: {
    all: ['chat'] as const,
    dialogs: (params?: Record<string, unknown>) => [...queryKeys.chat.all, 'dialogs', params] as const,
    dialog: (id: string) => [...queryKeys.chat.all, 'dialogs', id] as const,
    dialogAccess: (dialogId: string) =>
      [...queryKeys.chat.all, 'dialogs', dialogId, 'access'] as const,
    conversations: (dialogId: string) =>
      [...queryKeys.chat.all, 'dialogs', dialogId, 'conversations'] as const,
    conversation: (conversationId: string) =>
      [...queryKeys.chat.all, 'conversations', conversationId] as const,
    embedTokens: (dialogId: string) =>
      [...queryKeys.chat.all, 'dialogs', dialogId, 'embed-tokens'] as const,
  },

  // --------------------------------------------------------------------------
  // Shared User
  // --------------------------------------------------------------------------
  sharedUser: {
    all: ['shared-user'] as const,
    me: () => [...queryKeys.sharedUser.all, 'me'] as const,
  },

  // --------------------------------------------------------------------------
  // Projects (sub-resources)
  // --------------------------------------------------------------------------
  projects: {
    all: ['projects'] as const,
    members: (projectId: string) => [...queryKeys.projects.all, projectId, 'members'] as const,
    datasets: (projectId: string) => [...queryKeys.projects.all, projectId, 'datasets'] as const,
    activity: (projectId: string) => [...queryKeys.projects.all, projectId, 'activity'] as const,
  },

  // --------------------------------------------------------------------------
  // LLM Provider
  // --------------------------------------------------------------------------
  llmProvider: {
    all: ['llm-provider'] as const,
    list: () => [...queryKeys.llmProvider.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.llmProvider.all, 'detail', id] as const,
    defaults: () => [...queryKeys.llmProvider.all, 'defaults'] as const,
    presets: () => [...queryKeys.llmProvider.all, 'presets'] as const,
  },

  // --------------------------------------------------------------------------
  // API Keys
  // --------------------------------------------------------------------------
  apiKeys: {
    all: ['api-keys'] as const,
    list: () => [...queryKeys.apiKeys.all, 'list'] as const,
  },

  // --------------------------------------------------------------------------
  // Agents
  // --------------------------------------------------------------------------
  agents: {
    all: ['agents'] as const,
    lists: () => [...queryKeys.agents.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.agents.lists(), filters] as const,
    details: () => [...queryKeys.agents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.agents.details(), id] as const,
    runs: (agentId: string) => [...queryKeys.agents.detail(agentId), 'runs'] as const,
    run: (agentId: string, runId: string) => [...queryKeys.agents.runs(agentId), runId] as const,
    templates: () => ['agent-templates'] as const,
    templatesByCategory: (category: string) => ['agent-templates', category] as const,
  },
} as const
