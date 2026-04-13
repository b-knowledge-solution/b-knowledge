/**
 * @fileoverview Unified agent list page with card grid, tabs, search, and creation dialog.
 *
 * Merges agents, chat assistants, and search apps into a single view.
 * Data is fetched from 3 separate APIs and unified into AgentCardItem objects.
 *
 * Features:
 * - Card grid listing all agents/chat/search in responsive 3/2/1 column layout
 * - Tabs: All | My Agents | Templates
 * - Search bar and mode filter dropdown (agent, pipeline, chat, search)
 * - Create dialog: agent/pipeline → canvas, chat → ChatAssistantConfig, search → SearchAppConfig
 * - Mode-specific actions per card (edit, duplicate, delete, export, access, embed)
 * - Dark/light theme support
 * - Full i18n support
 *
 * @module features/agents/pages/AgentListPage
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigateWithLoader } from '@/components/NavigationLoader'
import { useConfirm } from '@/components/ConfirmDialog'
import { Plus, Search, Workflow } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { globalMessage } from '@/lib/globalMessage'
import { buildAdminAgentCanvasPath } from '@/app/adminRoutes'
import { queryKeys } from '@/lib/queryKeys'

// Agent feature imports
import { useAgents, useCreateAgent, useDeleteAgent, useDuplicateAgent } from '../api/agentQueries'
import { agentApi } from '../api/agentApi'
import { AgentCard } from '../components/AgentCard'
import type { AgentCardItem } from '../components/AgentCard'
import { TemplateGallery } from '../components/TemplateGallery'
import type { Agent, AgentMode, AgentTemplate } from '../types/agent.types'

// Chat feature imports (via barrel)
import {
  ChatAssistantConfig,
  ChatAssistantAccessDialog,
  chatApi,
  useChatAssistantsAdmin,
} from '@/features/chat'
import type { ChatAssistant, CreateAssistantPayload } from '@/features/chat'

// Search feature imports (via barrel)
import {
  SearchAppConfig,
  SearchAppAccessDialog,
  SearchAppEmbedDialog,
  searchApi,
  useSearchApps,
} from '@/features/search'
import type { SearchApp, CreateSearchAppPayload } from '@/features/search'

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Convert an Agent record to a unified AgentCardItem.
 * @param {Agent} agent - Agent from the agent API
 * @returns {AgentCardItem} Unified card item
 */
function agentToCardItem(agent: Agent): AgentCardItem {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description ?? undefined,
    mode: agent.mode,
    status: agent.status,
    updated_at: agent.updated_at,
  }
}

/**
 * @description Convert a ChatAssistant record to a unified AgentCardItem.
 * @param {ChatAssistant} assistant - Chat assistant from the chat API
 * @returns {AgentCardItem} Unified card item with mode='chat'
 */
function chatToCardItem(assistant: ChatAssistant): AgentCardItem {
  return {
    id: assistant.id,
    name: assistant.name,
    description: assistant.description ?? undefined,
    mode: 'chat',
    updated_at: assistant.updated_at,
  }
}

/**
 * @description Convert a SearchApp record to a unified AgentCardItem.
 * @param {SearchApp} app - Search app from the search API
 * @returns {AgentCardItem} Unified card item with mode='search'
 */
function searchToCardItem(app: SearchApp): AgentCardItem {
  return {
    id: app.id,
    name: app.name,
    description: app.description ?? undefined,
    mode: 'search',
    updated_at: app.updated_at,
  }
}

// ============================================================================
// Skeleton Loading Grid
// ============================================================================

/**
 * @description Skeleton loading state for the agent card grid
 * @returns {JSX.Element} Grid of animated skeleton cards
 */
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-36 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
        />
      ))}
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Unified agent list page merging agents, chat assistants, and search apps.
 * Uses URL state for filters and pagination. Supports create/edit/delete for all modes.
 * @returns {JSX.Element} Rendered agent list page
 */
export default function AgentListPage() {
  const { t } = useTranslation()
  const navigateWithLoader = useNavigateWithLoader()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()

  // Read filter state from URL
  const searchTerm = searchParams.get('search') || ''
  const modeFilter = searchParams.get('mode') || ''
  const activeTab = searchParams.get('tab') || 'all'

  // Create dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', description: '', mode: 'agent' as AgentMode })

  // Chat config dialog state
  const [isChatConfigOpen, setIsChatConfigOpen] = useState(false)
  const [editingChat, setEditingChat] = useState<ChatAssistant | null>(null)

  // Search config dialog state
  const [isSearchConfigOpen, setIsSearchConfigOpen] = useState(false)
  const [editingSearch, setEditingSearch] = useState<SearchApp | null>(null)

  // Chat access dialog state
  const [isChatAccessOpen, setIsChatAccessOpen] = useState(false)
  const [accessChat, setAccessChat] = useState<ChatAssistant | null>(null)

  // Search access dialog state
  const [isSearchAccessOpen, setIsSearchAccessOpen] = useState(false)
  const [accessSearch, setAccessSearch] = useState<SearchApp | null>(null)

  // Search embed dialog state
  const [isEmbedOpen, setIsEmbedOpen] = useState(false)
  const [embedSearch, setEmbedSearch] = useState<SearchApp | null>(null)

  // Agent mutations
  const createAgent = useCreateAgent()
  const deleteAgent = useDeleteAgent()
  const duplicateAgent = useDuplicateAgent()

  // --------------------------------------------------------------------------
  // Data fetching — all 3 data sources
  // --------------------------------------------------------------------------

  // Only pass mode filter to agents API if it's an agent/pipeline mode
  const agentFilters: Record<string, unknown> = {}
  if (searchTerm) agentFilters.search = searchTerm
  if (modeFilter && (modeFilter === 'agent' || modeFilter === 'pipeline')) {
    agentFilters.mode = modeFilter
  }

  // Fetch agents (always, unless mode filter is exclusively chat or search)
  const shouldFetchAgents = !modeFilter || modeFilter === 'agent' || modeFilter === 'pipeline'
  const { data: agentData, isLoading: agentsLoading } = useAgents(
    shouldFetchAgents ? agentFilters : { __skip: true },
  )
  const agents = shouldFetchAgents ? (agentData?.data ?? []) : []

  // Fetch chat assistants (unless mode filter excludes them)
  const shouldFetchChat = !modeFilter || modeFilter === 'chat'
  const { assistants: chatAssistants, isLoading: chatLoading } = useChatAssistantsAdmin(
    shouldFetchChat ? { search: searchTerm || undefined } : { search: '__skip_query__' },
  )

  // Fetch search apps (unless mode filter excludes them)
  const shouldFetchSearch = !modeFilter || modeFilter === 'search'
  const { apps: searchApps, isLoading: searchLoading } = useSearchApps(
    shouldFetchSearch ? { search: searchTerm || undefined } : { search: '__skip_query__' },
  )

  // Merge all items into a unified list
  const allItems: AgentCardItem[] = [
    ...agents.map(agentToCardItem),
    ...(shouldFetchChat ? chatAssistants.map(chatToCardItem) : []),
    ...(shouldFetchSearch ? searchApps.map(searchToCardItem) : []),
  ]

  // Sort by updated_at descending (most recent first)
  allItems.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const isLoading = agentsLoading || chatLoading || searchLoading

  // --------------------------------------------------------------------------
  // Lookup helpers to find original records for config dialogs
  // --------------------------------------------------------------------------

  /**
   * @description Find the original ChatAssistant record by ID.
   * @param {string} id - Chat assistant ID
   * @returns {ChatAssistant | undefined} Original record
   */
  const findChat = (id: string): ChatAssistant | undefined =>
    chatAssistants.find((a) => a.id === id)

  /**
   * @description Find the original SearchApp record by ID.
   * @param {string} id - Search app ID
   * @returns {SearchApp | undefined} Original record
   */
  const findSearch = (id: string): SearchApp | undefined =>
    searchApps.find((a) => a.id === id)

  // --------------------------------------------------------------------------
  // URL state helpers
  // --------------------------------------------------------------------------

  /**
   * @description Update the search term in URL, resetting to first page
   * @param {string} value - New search term
   */
  const handleSearchChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set('search', value)
    } else {
      next.delete('search')
    }
    setSearchParams(next, { replace: true })
  }

  /**
   * @description Update the mode filter in URL state
   * @param {string} value - Mode filter value ('all', 'agent', 'pipeline', 'chat', 'search')
   */
  const handleModeChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value && value !== 'all') {
      next.set('mode', value)
    } else {
      next.delete('mode')
    }
    setSearchParams(next, { replace: true })
  }

  /**
   * @description Switch the active tab
   * @param {string} value - Tab identifier
   */
  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value !== 'all') {
      next.set('tab', value)
    } else {
      next.delete('tab')
    }
    setSearchParams(next, { replace: true })
  }

  // --------------------------------------------------------------------------
  // Agent/Pipeline actions
  // --------------------------------------------------------------------------

  /**
   * @description Handle create form submission.
   * Agent/pipeline → create via agent API and navigate to canvas.
   * Chat → open ChatAssistantConfig dialog.
   * Search → open SearchAppConfig dialog.
   */
  const handleCreate = async () => {
    if (!createForm.name.trim()) return

    // For chat mode, close create dialog and open chat config
    if (createForm.mode === 'chat') {
      setIsCreateOpen(false)
      setEditingChat(null)
      setIsChatConfigOpen(true)
      return
    }

    // For search mode, close create dialog and open search config
    if (createForm.mode === 'search') {
      setIsCreateOpen(false)
      setEditingSearch(null)
      setIsSearchConfigOpen(true)
      return
    }

    // For agent/pipeline modes, create via agent API
    try {
      const desc = createForm.description.trim()
      const newAgent = await createAgent.mutateAsync({
        name: createForm.name.trim(),
        mode: createForm.mode,
        ...(desc ? { description: desc } : {}),
      })
      setIsCreateOpen(false)
      setCreateForm({ name: '', description: '', mode: 'agent' })
      globalMessage.success(t('agents.agentCreated'))
      // Navigate to the new agent's canvas
      navigateWithLoader(buildAdminAgentCanvasPath(newAgent.id))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Duplicate an agent and show success message (agent/pipeline only)
   * @param {AgentCardItem} item - Card item to duplicate
   */
  const handleDuplicate = async (item: AgentCardItem) => {
    try {
      await duplicateAgent.mutateAsync(item.id)
      globalMessage.success(t('agents.agentDuplicated'))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Delete an item with confirmation.
   * Dispatches to the correct API based on mode.
   * @param {AgentCardItem} item - Card item to delete
   */
  const handleDelete = async (item: AgentCardItem) => {
    const confirmed = await confirm({
      title: t('agents.deleteAgent'),
      message: t('agents.deleteConfirmation', { name: item.name }),
      variant: 'danger',
    })
    if (!confirmed) return

    try {
      // Route delete to the correct API based on mode
      if (item.mode === 'chat') {
        await chatApi.deleteAssistant(item.id)
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.all })
      } else if (item.mode === 'search') {
        await searchApi.deleteSearchApp(item.id)
        queryClient.invalidateQueries({ queryKey: queryKeys.search.all })
      } else {
        await deleteAgent.mutateAsync(item.id)
      }
      globalMessage.success(t('agents.agentDeleted'))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Export agent definition as JSON download (agent/pipeline only)
   * @param {AgentCardItem} item - Card item to export
   */
  const handleExport = async (item: AgentCardItem) => {
    try {
      const data = await agentApi.exportJson(item.id)
      // Trigger JSON file download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${item.name.replace(/\s+/g, '-').toLowerCase()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Handle edit action by mode.
   * Agent/pipeline → handled by AgentCard (navigates to canvas).
   * Chat → open ChatAssistantConfig with existing data.
   * Search → open SearchAppConfig with existing data.
   * @param {AgentCardItem} item - Card item to edit
   */
  const handleEdit = (item: AgentCardItem) => {
    if (item.mode === 'chat') {
      const chat = findChat(item.id)
      if (chat) {
        setEditingChat(chat)
        setIsChatConfigOpen(true)
      }
    } else if (item.mode === 'search') {
      const search = findSearch(item.id)
      if (search) {
        setEditingSearch(search)
        setIsSearchConfigOpen(true)
      }
    }
  }

  /**
   * @description Open access dialog based on mode.
   * @param {AgentCardItem} item - Card item to manage access for
   */
  const handleAccess = (item: AgentCardItem) => {
    if (item.mode === 'chat') {
      const chat = findChat(item.id)
      if (chat) {
        setAccessChat(chat)
        setIsChatAccessOpen(true)
      }
    } else if (item.mode === 'search') {
      const search = findSearch(item.id)
      if (search) {
        setAccessSearch(search)
        setIsSearchAccessOpen(true)
      }
    }
  }

  /**
   * @description Open embed dialog for search apps.
   * @param {AgentCardItem} item - Search app card item
   */
  const handleEmbed = (item: AgentCardItem) => {
    const search = findSearch(item.id)
    if (search) {
      setEmbedSearch(search)
      setIsEmbedOpen(true)
    }
  }

  /**
   * @description Open search app page in user-facing view.
   * @param {AgentCardItem} item - Search app card item
   */
  const handleOpenSearchApp = (item: AgentCardItem) => {
    navigate(`/search?appId=${item.id}`)
  }

  // --------------------------------------------------------------------------
  // Chat config save handler
  // --------------------------------------------------------------------------

  /**
   * @description Handle save from ChatAssistantConfig dialog (create or update).
   * @param {CreateAssistantPayload} data - The assistant payload
   */
  const handleChatSave = async (data: CreateAssistantPayload) => {
    try {
      if (editingChat) {
        await chatApi.updateAssistant(editingChat.id, data)
        globalMessage.success(t('common.updateSuccess'))
      } else {
        await chatApi.createAssistant(data)
        globalMessage.success(t('common.createSuccess'))
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.all })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  // --------------------------------------------------------------------------
  // Search config save handler
  // --------------------------------------------------------------------------

  /**
   * @description Handle save from SearchAppConfig dialog (create or update).
   * @param {CreateSearchAppPayload} data - The search app payload
   */
  const handleSearchSave = async (data: CreateSearchAppPayload) => {
    try {
      if (editingSearch) {
        await searchApi.updateSearchApp(editingSearch.id, data)
        globalMessage.success(t('common.updateSuccess'))
      } else {
        await searchApi.createSearchApp(data)
        globalMessage.success(t('common.createSuccess'))
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.search.all })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Create a new agent from a template
   * @param {AgentTemplate} template - Template to use
   */
  const handleUseTemplate = async (template: AgentTemplate) => {
    try {
      const newAgent = await createAgent.mutateAsync({
        name: template.name,
        mode: template.mode,
        template_id: template.id,
        ...(template.description ? { description: template.description } : {}),
      })
      globalMessage.success(t('agents.agentCreated'))
      navigateWithLoader(buildAdminAgentCanvasPath(newAgent.id))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  // --------------------------------------------------------------------------
  // Empty state
  // --------------------------------------------------------------------------

  /**
   * @description Empty state component shown when no items exist
   * @returns {JSX.Element} Empty state with CTAs
   */
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Workflow size={48} className="text-slate-300 dark:text-slate-600 mb-4" />
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
        {t('agents.noAgentsYet')}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
        {t('agents.emptyDescription')}
      </p>
      <div className="flex gap-3">
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus size={16} className="mr-1" />
          {t('agents.createAgent')}
        </Button>
        <Button
          variant="outline"
          onClick={() => handleTabChange('templates')}
        >
          {t('agents.browseTemplates')}
        </Button>
      </div>
    </div>
  )

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t('agents.pageTitle')}
        </h1>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus size={16} className="mr-1" />
          {t('agents.createAgent')}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="all">{t('agents.all')}</TabsTrigger>
            <TabsTrigger value="my">{t('agents.myAgents')}</TabsTrigger>
            <TabsTrigger value="templates">{t('agents.templates')}</TabsTrigger>
          </TabsList>

          {/* Search and mode filter — only for agent tabs (not templates) */}
          {activeTab !== 'templates' && (
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  placeholder={t('agents.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9 h-9 dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <Select value={modeFilter || 'all'} onValueChange={handleModeChange}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue placeholder={t('agents.modeFilter')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('agents.all')}</SelectItem>
                  <SelectItem value="agent">{t('agents.agent')}</SelectItem>
                  <SelectItem value="pipeline">{t('agents.pipeline')}</SelectItem>
                  <SelectItem value="chat">{t('agents.chat')}</SelectItem>
                  <SelectItem value="search">{t('agents.search')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* All agents tab */}
        <TabsContent value="all" className="flex-1">
          {isLoading ? (
            <SkeletonGrid />
          ) : allItems.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {allItems.map((item) => (
                <AgentCard
                  key={`${item.mode}-${item.id}`}
                  item={item}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onExport={handleExport}
                  onEdit={handleEdit}
                  onAccess={handleAccess}
                  onEmbed={handleEmbed}
                  onOpen={handleOpenSearchApp}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* My Agents tab — same grid with user filter (TODO: pass created_by filter) */}
        <TabsContent value="my" className="flex-1">
          {isLoading ? (
            <SkeletonGrid />
          ) : allItems.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {allItems.map((item) => (
                <AgentCard
                  key={`${item.mode}-${item.id}`}
                  item={item}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onExport={handleExport}
                  onEdit={handleEdit}
                  onAccess={handleAccess}
                  onEmbed={handleEmbed}
                  onOpen={handleOpenSearchApp}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Templates tab */}
        <TabsContent value="templates" className="flex-1">
          <TemplateGallery onUseTemplate={handleUseTemplate} />
        </TabsContent>
      </Tabs>

      {/* Create Agent Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>{t('agents.createAgent')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Name field */}
            <div className="space-y-2">
              <Label>{t('common.name')}</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('agents.createAgent')}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>

            {/* Description field */}
            <div className="space-y-2">
              <Label>{t('common.description')}</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>

            {/* Mode selector — now includes chat and search */}
            <div className="space-y-2">
              <Label>{t('agents.modeFilter')}</Label>
              <Select
                value={createForm.mode}
                onValueChange={(value: string) => setCreateForm((prev) => ({ ...prev, mode: value as AgentMode }))}
              >
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">{t('agents.agent')}</SelectItem>
                  <SelectItem value="pipeline">{t('agents.pipeline')}</SelectItem>
                  <SelectItem value="chat">{t('agents.chat')}</SelectItem>
                  <SelectItem value="search">{t('agents.search')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!createForm.name.trim() || createAgent.isPending}
            >
              {t('agents.createAgent')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat Assistant Config Dialog */}
      <ChatAssistantConfig
        open={isChatConfigOpen}
        onClose={() => setIsChatConfigOpen(false)}
        onSave={handleChatSave}
        dialog={editingChat}
      />

      {/* Search App Config Dialog */}
      <SearchAppConfig
        open={isSearchConfigOpen}
        onClose={() => setIsSearchConfigOpen(false)}
        onSave={handleSearchSave}
        app={editingSearch}
      />

      {/* Chat Access Dialog */}
      <ChatAssistantAccessDialog
        open={isChatAccessOpen}
        onClose={() => setIsChatAccessOpen(false)}
        dialog={accessChat}
        onSave={() => queryClient.invalidateQueries({ queryKey: queryKeys.chat.all })}
      />

      {/* Search Access Dialog */}
      <SearchAppAccessDialog
        open={isSearchAccessOpen}
        onClose={() => setIsSearchAccessOpen(false)}
        app={accessSearch}
        onSave={() => queryClient.invalidateQueries({ queryKey: queryKeys.search.all })}
      />

      {/* Search Embed Dialog */}
      <SearchAppEmbedDialog
        open={isEmbedOpen}
        onClose={() => setIsEmbedOpen(false)}
        app={embedSearch}
      />
    </div>
  )
}
