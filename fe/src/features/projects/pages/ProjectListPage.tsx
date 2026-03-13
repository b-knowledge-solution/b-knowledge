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
  Button,
  Card,
  Modal,
  Input,
  Space,
  Tag,
  Tooltip,
  Popconfirm,
  message,
  Spin,
  Empty,
  Divider,
} from 'antd'
import {
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  Lock,
  Globe,
} from 'lucide-react'
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
import { PermissionsSelector } from '@/features/knowledge-base/components/SourcePermissionsModal'
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
      message.error(String(err))
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
      message.success(t('projectManagement.createSuccess'))
      setCreateModalOpen(false)
      fetchData()
    } catch (err) {
      message.error(String(err))
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

        message.success(t('projectManagement.updateSuccess'))
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

        message.success(t('projectManagement.createSuccess'))
      }

      setModalOpen(false)
      setEditForm({ name: '', description: '' })
      fetchData()
    } catch (err) {
      console.error('Failed to save project:', err)
      message.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Delete a project.
   *
   * @param id - Project ID
   * @param e - Mouse event (stopped to prevent card click)
   */
  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await deleteProject(id)
      message.success(t('projectManagement.deleteSuccess'))
      fetchData()
    } catch (err) {
      console.error('Failed to delete project:', err)
      message.error(String(err))
    }
  }



  /**
   * Map project status to display color.
   *
   * @param status - Project status string
   * @returns Ant Design tag color
   */
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'green'
      case 'archived': return 'default'
      default: return 'blue'
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div>
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <FolderOpen className="w-7 h-7 text-primary-600 dark:text-primary-400" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {t('projectManagement.title')}
                </h1>
              </div>
              <p className="text-gray-600 dark:text-gray-400 ml-10">
                {t('projectManagement.description')}
              </p>
            </div>
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setCreateModalOpen(true)}>
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
              <Empty
                description={
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">
                      {t('projectManagement.noProjects')}
                    </p>
                    <p className="text-gray-400 dark:text-gray-500 text-sm">
                      {t('projectManagement.noProjectsHint')}
                    </p>
                  </div>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProjects.map((project) => (
                // @ts-expect-error antd v6 Card type mismatch with React 19
                <Card
                  key={project.id}
                  hoverable
                  onClick={() => navigate(`/knowledge-base/projects/${project.id}`)}
                  className="dark:bg-slate-800 dark:border-slate-700 shadow-sm cursor-pointer"
                  title={
                    <div className="flex justify-between items-center w-full">
                      <div className="flex flex-col min-w-0">
                        <span className="text-lg font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                          {project.name}
                        </span>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Tag color="purple">
                            {t(`projectManagement.categories.${project.category || 'office'}`)}
                          </Tag>
                          <Tag color={getStatusColor(project.status)}>
                            {project.status}
                          </Tag>
                          {typeof project.dataset_count === 'number' && (
                            <Tag>{project.dataset_count} {t('projectManagement.datasetCount')}</Tag>
                          )}
                        </div>
                      </div>
                      <Space>
                        <Tooltip title={t('projectManagement.editPermissions', 'Edit Permissions')}>
                          <Button
                            type="text"
                            icon={
                              project.is_private
                                ? <Lock size={18} className="text-amber-500" />
                                : <Globe size={18} className="text-green-500" />
                            }
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation()
                              setPermProject(project)
                              setPermModalOpen(true)
                            }}
                          />
                        </Tooltip>
                        <Tooltip title={t('projectManagement.editProject')}>
                          <Button
                            type="text"
                            icon={<Pencil size={18} className="text-slate-400" />}
                            onClick={(e: React.MouseEvent) => handleEdit(project, e)}
                          />
                        </Tooltip>
                        <Popconfirm
                          title={t('projectManagement.deleteConfirm')}
                          description={t('projectManagement.deleteWarning')}
                          onConfirm={() => handleDelete(project.id)}
                          okText={t('common.delete')}
                          cancelText={t('common.cancel')}
                        >
                          <Tooltip title={t('common.delete')}>
                            <Button
                              type="text"
                              danger
                              icon={<Trash2 size={18} />}
                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            />
                          </Tooltip>
                        </Popconfirm>
                      </Space>
                    </div>
                  }
                >
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {project.description || t('projectManagement.noDescription', { defaultValue: '—' })}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        title={editingProject ? t('projectManagement.editProject') : t('projectManagement.addProject')}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        destroyOnHidden
        width={560}
      >
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
              status={nameError ? 'error' : undefined}
            />
            {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('projectManagement.descriptionLabel')}
            </label>
            <Input.TextArea
              rows={2}
              placeholder={t('projectManagement.descriptionPlaceholder')}
              value={editForm.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setEditForm((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </div>


        </div>

        <Divider className="my-2" />

        {/* Inline Permissions Selector — teams only, no users, no public note */}
        <PermissionsSelector
          isPublic={isPublic}
          setIsPublic={setIsPublic}
          selectedTeamIds={selectedTeamIds}
          setSelectedTeamIds={setSelectedTeamIds}
          teams={allTeams}
          isLoading={teamsLoading}
        />
      </Modal>

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
