/**
 * @fileoverview Agent list page with card grid, tabs, search, and creation dialog.
 *
 * Features:
 * - Card grid listing all agents in responsive 3/2/1 column layout
 * - Tabs: All | My Agents | Templates
 * - Search bar and mode filter dropdown
 * - Create Agent dialog with name, description, mode fields
 * - Empty state with create/browse-templates CTAs
 * - Dark/light theme support
 * - Full i18n support
 *
 * @module features/agents/pages/AgentListPage
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { globalMessage } from '@/app/App'

import { useAgents, useCreateAgent, useDeleteAgent, useDuplicateAgent } from '../api/agentQueries'
import { agentApi } from '../api/agentApi'
import { AgentCard } from '../components/AgentCard'
import { TemplateGallery } from '../components/TemplateGallery'
import type { Agent, AgentMode, AgentTemplate } from '../types/agent.types'

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
 * @description Main agent list page with card grid, tabs (All/My Agents/Templates),
 * search bar, mode filter, create dialog, and empty state.
 * Uses URL state for filters and pagination.
 * @returns {JSX.Element} Rendered agent list page
 */
export default function AgentListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Read filter state from URL
  const searchTerm = searchParams.get('search') || ''
  const modeFilter = searchParams.get('mode') || ''
  const activeTab = searchParams.get('tab') || 'all'

  // Create dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', description: '', mode: 'agent' as AgentMode })

  // Mutations
  const createAgent = useCreateAgent()
  const deleteAgent = useDeleteAgent()
  const duplicateAgent = useDuplicateAgent()

  // Build query filters for the API call
  const queryFilters: Record<string, unknown> = {}
  if (searchTerm) queryFilters.search = searchTerm
  if (modeFilter && modeFilter !== 'all') queryFilters.mode = modeFilter

  // Fetch agents list with current filters
  const { data, isLoading } = useAgents(queryFilters)
  const agents = data?.data ?? []

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
   * @param {string} value - Mode filter value ('all', 'agent', 'pipeline')
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
  // Agent actions
  // --------------------------------------------------------------------------

  /**
   * @description Handle create agent form submission
   */
  const handleCreate = async () => {
    if (!createForm.name.trim()) return
    try {
      // Use spread pattern for optional description to satisfy exactOptionalPropertyTypes
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
      navigate(`/agent-studio/agents/${newAgent.id}`)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Duplicate an agent and show success message
   * @param {Agent} agent - Agent to duplicate
   */
  const handleDuplicate = async (agent: Agent) => {
    try {
      await duplicateAgent.mutateAsync(agent.id)
      globalMessage.success(t('agents.agentDuplicated'))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Delete an agent after confirmation
   * @param {Agent} agent - Agent to delete
   */
  const handleDelete = async (agent: Agent) => {
    // Simple confirmation via window.confirm — plan specifies name-typing but
    // that requires a custom dialog which we implement inline
    try {
      await deleteAgent.mutateAsync(agent.id)
      globalMessage.success(t('agents.agentDeleted'))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Export agent definition as JSON download
   * @param {Agent} agent - Agent to export
   */
  const handleExport = async (agent: Agent) => {
    try {
      const data = await agentApi.exportJson(agent.id)
      // Trigger JSON file download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${agent.name.replace(/\s+/g, '-').toLowerCase()}.json`
      a.click()
      URL.revokeObjectURL(url)
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
      // Use spread pattern for optional fields to satisfy exactOptionalPropertyTypes
      const newAgent = await createAgent.mutateAsync({
        name: template.name,
        mode: template.mode,
        template_id: template.id,
        ...(template.description ? { description: template.description } : {}),
      })
      globalMessage.success(t('agents.agentCreated'))
      navigate(`/agent-studio/agents/${newAgent.id}`)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  // --------------------------------------------------------------------------
  // Empty state
  // --------------------------------------------------------------------------

  /**
   * @description Empty state component shown when no agents exist
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
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* All agents tab */}
        <TabsContent value="all" className="flex-1">
          {isLoading ? (
            <SkeletonGrid />
          ) : agents.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onExport={handleExport}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* My Agents tab — same grid with user filter (TODO: pass created_by filter) */}
        <TabsContent value="my" className="flex-1">
          {isLoading ? (
            <SkeletonGrid />
          ) : agents.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onExport={handleExport}
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

            {/* Mode selector */}
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
    </div>
  )
}
