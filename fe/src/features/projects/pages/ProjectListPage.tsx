/**
 * @fileoverview Project list page with CRUD operations.
 *
 * Features:
 * - Card grid listing all projects
 * - Create/edit project modal
 * - Delete project with confirmation
 * - Server badge and status indicator
 * - Navigation to project detail
 * - Dark/light theme support
 * - Full i18n support
 *
 * @module features/projects/pages/ProjectListPage
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Pencil,
  Trash2,
  Lock,
  Globe,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'

import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getProjectPermissions,
  setProjectPermission,
  removeProjectPermission,
  type Project,
  type ProjectPermission,
  type ProjectCategory,
} from '../api/projectApi'

import { ProjectPermissionModal } from '../components/ProjectPermissionModal'
import { PermissionsSelector } from '@/components/PermissionsSelector'
import { teamApi, type Team } from '@/features/teams'
import CategoryFilterTabs from '../components/CategoryFilterTabs'
import CreateProjectModal from '../components/CreateProjectModal'

// ============================================================================
// Component
// ============================================================================

/**
 * Project list page showing all projects as cards.
 *
 * Users can create, edit, and delete projects here.
 * Clicking a project card navigates to the project detail page.
 */
const ProjectListPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()

  // Edit form state
  const [editForm, setEditForm] = useState({ name: '', description: '' })
  const [nameError, setNameError] = useState('')

  // Data state
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [saving, setSaving] = useState(false)

  // Category filter state
  const [categoryFilter, setCategoryFilter] = useState<ProjectCategory | null>(null)

  // Create project modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)

  // Permission modal state
  const [permProject, setPermProject] = useState<Project | null>(null)
  const [permModalOpen, setPermModalOpen] = useState(false)

  // Inline permission state for create/edit modal
  const [isPublic, setIsPublic] = useState(true)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [editPermissions, setEditPermissions] = useState<ProjectPermission[]>([])

  /**
   * Fetch all projects from the API.
   */
  const fetchData = async () => {
    try {
      setLoading(true)
      const projectData = await getProjects()
      setProjects(projectData)
    } catch (err) {
      console.error('Failed to fetch data:', err)
      globalMessage.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  /** Effect: Load data on mount */
  useEffect(() => {
    fetchData()
  }, [])

  /**
   * Fetch teams list when needed.
   */
  const loadTeams = async () => {
    if (allTeams.length > 0) return
    setTeamsLoading(true)
    try {
      const teamsList = await teamApi.getTeams()
      setAllTeams(teamsList)
    } catch (err) {
      console.error('Failed to fetch teams:', err)
    } finally {
      setTeamsLoading(false)
    }
  }

  /** Filter projects by selected category */
  const filteredProjects = categoryFilter
    ? projects.filter((p) => p.category === categoryFilter)
    : projects

  /**
   * Handle create project from multi-step modal.
   */
  const handleCreateProject = async (data: Parameters<typeof createProject>[0] & { sync_config?: unknown }) => {
    setCreateSaving(true)
    try {
      const { sync_config: _sync, ...projectData } = data
      await createProject(projectData)
      // TODO: if sync_config present, create sync config via separate API call
      globalMessage.success(t('projectManagement.createSuccess'))
      setCreateModalOpen(false)
      fetchData()
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setCreateSaving(false)
    }
  }

  /**
   * Open modal to edit an existing project.
   *
   * @param project - The project to edit
   * @param e - Mouse event (stopped to prevent card click)
   */
  const handleEdit = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProject(project)
    setEditForm({
      name: project.name || '',
      description: project.description || '',
    })
    setNameError('')
    setIsPublic(!project.is_private)
    setModalOpen(true)
    loadTeams()

    // Load existing team permissions
    try {
      const perms = await getProjectPermissions(project.id)
      setEditPermissions(perms)
      const teamIds = perms
        .filter((p) => p.grantee_type === 'team')
        .map((p) => p.grantee_id)
      setSelectedTeamIds(teamIds)
    } catch {
      setEditPermissions([])
      setSelectedTeamIds([])
    }
  }

  /**
   * Submit create/edit form.
   * Handles both project data and permission assignment.
   */
  const handleSubmit = async () => {
    // Inline validation
    if (!editForm.name.trim()) {
      setNameError(`${t('projectManagement.name')} is required`)
      return
    }
    setNameError('')

    try {
      setSaving(true)

      const isPrivate = !isPublic

      if (editingProject) {
        // Update project with is_private
        await updateProject(editingProject.id, {
          name: editForm.name,
          description: editForm.description,
          is_private: isPrivate,
        })

        // Diff team permissions
        const existingTeamIds = new Set(
          editPermissions.filter((p) => p.grantee_type === 'team').map((p) => p.grantee_id),
        )

        if (isPrivate) {
          // Add new teams
          for (const teamId of selectedTeamIds.filter((id) => !existingTeamIds.has(id))) {
            await setProjectPermission(editingProject.id, {
              grantee_type: 'team',
              grantee_id: teamId,
              tab_documents: 'view',
              tab_chat: 'view',
              tab_settings: 'none',
            })
          }
          // Remove teams no longer selected
          for (const perm of editPermissions.filter(
            (p) => p.grantee_type === 'team' && !selectedTeamIds.includes(p.grantee_id),
          )) {
            await removeProjectPermission(editingProject.id, perm.id)
          }
        } else {
          // Going public — remove all team permissions
          for (const perm of editPermissions.filter((p) => p.grantee_type === 'team')) {
            await removeProjectPermission(editingProject.id, perm.id)
          }
        }

        globalMessage.success(t('projectManagement.updateSuccess'))
      } else {
        // Create project with is_private flag
        const createdProject = await createProject({
          name: editForm.name,
          description: editForm.description || undefined,
          is_private: isPrivate,
        } as Parameters<typeof createProject>[0])

        // Add team permissions to newly created project
        if (isPrivate && selectedTeamIds.length > 0) {
          for (const teamId of selectedTeamIds) {
            await setProjectPermission(createdProject.id, {
              grantee_type: 'team',
              grantee_id: teamId,
              tab_documents: 'view',
              tab_chat: 'view',
              tab_settings: 'none',
            })
          }
        }

        globalMessage.success(t('projectManagement.createSuccess'))
      }

      setModalOpen(false)
      setEditForm({ name: '', description: '' })
      fetchData()
    } catch (err) {
      console.error('Failed to save project:', err)
      globalMessage.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Delete a project after confirmation.
   *
   * @param id - Project ID
   * @param e - Mouse event (stopped to prevent card click)
   */
  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()

    // Prompt user for confirmation before deleting
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('projectManagement.deleteWarning'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteProject(id)
      globalMessage.success(t('projectManagement.deleteSuccess'))
      fetchData()
    } catch (err) {
      console.error('Failed to delete project:', err)
      globalMessage.error(String(err))
    }
  }



  /**
   * Map project status to badge variant.
   *
   * @param status - Project status string
   * @returns shadcn Badge variant
   */
  const getStatusVariant = (status: string): 'success' | 'secondary' | 'info' => {
    switch (status) {
      case 'active': return 'success'
      case 'archived': return 'secondary'
      default: return 'info'
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div>
          {/* Header actions */}
          <div className="mb-6 flex items-center justify-end">
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus size={16} className="mr-2" />
              {t('projectManagement.addProject')}
            </Button>
          </div>

          {/* Category filter tabs */}
          <div className="mb-4">
            <CategoryFilterTabs selected={categoryFilter} onChange={setCategoryFilter} />
          </div>

          {/* Project Cards */}
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">
                  {t('projectManagement.noProjects')}
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-sm">
                  {t('projectManagement.noProjectsHint')}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProjects.map((project) => (
                <Card
                  key={project.id}
                  className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/data-studio/projects/${project.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center w-full">
                      <div className="flex flex-col min-w-0">
                        <span className="text-lg font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                          {project.name}
                        </span>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="default">
                            {t(`projectManagement.categories.${project.category || 'office'}`)}
                          </Badge>
                          <Badge variant={getStatusVariant(project.status)}>
                            {project.status}
                          </Badge>
                          {typeof project.dataset_count === 'number' && (
                            <Badge variant="outline">{project.dataset_count} {t('projectManagement.datasetCount')}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation()
                                  setPermProject(project)
                                  setPermModalOpen(true)
                                }}
                              >
                                {project.is_private
                                  ? <Lock size={18} className="text-amber-500" />
                                  : <Globe size={18} className="text-green-500" />
                                }
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('projectManagement.editPermissions', 'Edit Permissions')}</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e: React.MouseEvent) => handleEdit(project, e)}
                              >
                                <Pencil size={18} className="text-slate-400" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('projectManagement.editProject')}</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={(e: React.MouseEvent) => handleDelete(project.id, e)}
                              >
                                <Trash2 size={18} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('common.delete')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      {project.description || t('projectManagement.noDescription', { defaultValue: '—' })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editingProject ? t('projectManagement.editProject') : t('projectManagement.addProject')}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('projectManagement.name')} <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder={t('projectManagement.namePlaceholder')}
                value={editForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEditForm((prev) => ({ ...prev, name: e.target.value }))
                  if (nameError) setNameError('')
                }}
                className={nameError ? 'border-destructive' : undefined}
              />
              {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('projectManagement.descriptionLabel')}
              </label>
              <textarea
                rows={2}
                placeholder={t('projectManagement.descriptionPlaceholder')}
                value={editForm.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setEditForm((prev) => ({ ...prev, description: e.target.value }))
                }
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <Separator className="my-2" />

          {/* Inline Permissions Selector — teams only, no users, no public note */}
          <PermissionsSelector
            isPublic={isPublic}
            setIsPublic={setIsPublic}
            selectedTeamIds={selectedTeamIds}
            setSelectedTeamIds={setSelectedTeamIds}
            teams={allTeams}
            isLoading={teamsLoading}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Spinner size={16} /> : null}
              {editingProject ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Project Multi-Step Modal */}
      <CreateProjectModal
        open={createModalOpen}
        saving={createSaving}
        onSubmit={handleCreateProject}
        onCancel={() => setCreateModalOpen(false)}
      />

      {/* Permission Modal */}
      {permProject && (
        <ProjectPermissionModal
          open={permModalOpen}
          onClose={() => {
            setPermModalOpen(false)
            setPermProject(null)
          }}
          project={permProject}
          onSaved={fetchData}
        />
      )}
    </div>
  )
}

export default ProjectListPage
