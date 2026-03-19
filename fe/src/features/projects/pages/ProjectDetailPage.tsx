/**
 * @fileoverview Project detail page with tabbed interface.
 *
 * Features:
 * - Header with project name, status badge, and back button
 * - Seven tabs: Documents, Chat, Search, Members, Datasets, Activity, Settings
 * - Pre-fetches category versions for the Chat tab
 * - Delete project with name confirmation
 * - Dark/light theme support
 * - Full i18n support
 *
 * @module features/projects/pages/ProjectDetailPage
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  FolderOpen,
  MessageSquare,
  Search,
  Settings,
  RefreshCw,
  Users,
  Database,
  Activity,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { globalMessage } from '@/app/App'

import {
  getProjectById,
  getDocumentCategories,
  getCategoryVersions,
  getProjectChats,
  getProjectSearches,
  getProjectPermissions,
  deleteProject,
  type Project,
  type DocumentCategory,
  type DocumentCategoryVersion,
  type ProjectChat,
  type ProjectSearch,
  type ProjectPermission,
} from '../api/projectApi'
import DocumentsTab from '../components/DocumentsTab'
import ChatTab from '../components/ChatTab'
import SearchTab from '../components/SearchTab'
import SettingsTab from '../components/SettingsTab'
import SyncTab from '../components/SyncTab'
import ProjectMemberList from '../components/ProjectMemberList'
import ProjectDatasetPicker from '../components/ProjectDatasetPicker'
import ProjectActivityFeed from '../components/ProjectActivityFeed'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Project detail page with tabs for Documents, Chat, Search, Members, Datasets, Activity, Settings, and Sync (datasync only).
 * Pre-fetches category versions needed by Chat and Search tabs for dataset resolution.
 * Includes destructive delete action requiring name confirmation.
 * Loaded via /data-studio/projects/:projectId route.
 * @returns {JSX.Element} Rendered project detail page
 */
const ProjectDetailPage = () => {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  // Project data
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  // Sub-resource data passed to tab components
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [categoryVersions, setCategoryVersions] = useState<Record<string, DocumentCategoryVersion[]>>({})
  const [chats, setChats] = useState<ProjectChat[]>([])
  const [searches, setSearches] = useState<ProjectSearch[]>([])
  const [permissions, setPermissions] = useState<ProjectPermission[]>([])
  // Server-level model config (populated externally if needed)
  const [embeddingModels, _setEmbeddingModels] = useState<string[]>([])
  const [chatModels, _setChatModels] = useState<string[]>([])

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  /**
   * Fetch the project and its sub-resources.
   * Also pre-fetches all category versions for the Chat tab.
   */
  const fetchProject = async () => {
    if (!projectId) return
    try {
      setLoading(true)
      const [projectData, categoryData, chatData, searchData] = await Promise.all([
        getProjectById(projectId),
        getDocumentCategories(projectId),
        getProjectChats(projectId),
        getProjectSearches(projectId),
      ])
      setProject(projectData)
      setCategories(categoryData)
      setChats(chatData)
      setSearches(searchData)

      // Permissions may not be accessible to all roles -- load separately
      try {
        const permData = await getProjectPermissions(projectId)
        setPermissions(permData)
      } catch {
        // Non-critical: user may not have permission to view project permissions
        setPermissions([])
      }

      // Pre-fetch versions for all categories (needed by ChatTab for dataset resolution)
      const versionsMap: Record<string, DocumentCategoryVersion[]> = {}
      await Promise.all(
        categoryData.map(async (cat) => {
          try {
            const versions = await getCategoryVersions(projectId, cat.id)
            versionsMap[cat.id] = versions
          } catch {
            versionsMap[cat.id] = []
          }
        }),
      )
      setCategoryVersions(versionsMap)

    } catch (err) {
      console.error('Failed to load project:', err)
      globalMessage.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  /** Effect: Load project on mount */
  useEffect(() => {
    fetchProject()
  }, [projectId])

  /**
   * Delete the project after confirming the name matches.
   * Redirects to project list on success.
   */
  const handleDeleteProject = async () => {
    if (!project || deleteConfirmName !== project.name) return
    setDeleting(true)
    try {
      await deleteProject(project.id)
      globalMessage.success(t('projectManagement.deleteSuccess'))
      navigate('/data-studio/projects')
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div>
          {/* Back + title + actions */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate('/data-studio/projects')}
              className="mb-2"
            >
              <ArrowLeft size={16} className="mr-2" />
              {t('projectManagement.title')}
            </Button>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
                <Badge variant={project.status === 'active' ? 'success' : 'secondary'}>
                  {project.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {project.description && (
                  <p className="text-gray-500 dark:text-gray-400 text-sm mr-4">{project.description}</p>
                )}
                {/* Delete action in dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {t('common.actions')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setDeleteConfirmName('')
                        setDeleteDialogOpen(true)
                      }}
                    >
                      <Trash2 size={14} className="mr-2" />
                      {t('common.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="documents">
            <TabsList>
              <TabsTrigger value="documents">
                <span className="flex items-center gap-2">
                  <FolderOpen size={16} />
                  {t('projectManagement.tabs.documents')}
                </span>
              </TabsTrigger>
              <TabsTrigger value="chat">
                <span className="flex items-center gap-2">
                  <MessageSquare size={16} />
                  {t('projectManagement.tabs.chat')}
                </span>
              </TabsTrigger>
              <TabsTrigger value="search">
                <span className="flex items-center gap-2">
                  <Search size={16} />
                  {t('projectManagement.tabs.search', 'Search')}
                </span>
              </TabsTrigger>
              <TabsTrigger value="members">
                <span className="flex items-center gap-2">
                  <Users size={16} />
                  {t('projectManagement.tabs.members')}
                </span>
              </TabsTrigger>
              <TabsTrigger value="datasets">
                <span className="flex items-center gap-2">
                  <Database size={16} />
                  {t('projectManagement.tabs.datasets')}
                </span>
              </TabsTrigger>
              <TabsTrigger value="activity">
                <span className="flex items-center gap-2">
                  <Activity size={16} />
                  {t('projectManagement.tabs.activity')}
                </span>
              </TabsTrigger>
              <TabsTrigger value="settings">
                <span className="flex items-center gap-2">
                  <Settings size={16} />
                  {t('projectManagement.tabs.settings')}
                </span>
              </TabsTrigger>
              {/* Sync tab only for datasync projects */}
              {project.category === 'datasync' && (
                <TabsTrigger value="sync">
                  <span className="flex items-center gap-2">
                    <RefreshCw size={16} />
                    {t('projectManagement.tabs.sync')}
                  </span>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="documents">
              <DocumentsTab
                projectId={projectId!}
                initialCategories={categories}
                embeddingModels={embeddingModels}
              />
            </TabsContent>
            <TabsContent value="chat">
              <ChatTab
                projectId={projectId!}
                initialChats={chats}
                categories={categories}
                categoryVersions={categoryVersions}
                chatModels={chatModels}
              />
            </TabsContent>
            <TabsContent value="search">
              <SearchTab
                projectId={projectId!}
                initialSearches={searches}
                categories={categories}
                categoryVersions={categoryVersions}
                chatModels={chatModels}
              />
            </TabsContent>
            <TabsContent value="members">
              <ProjectMemberList projectId={projectId!} />
            </TabsContent>
            <TabsContent value="datasets">
              <ProjectDatasetPicker projectId={projectId!} />
            </TabsContent>
            <TabsContent value="activity">
              <ProjectActivityFeed projectId={projectId!} />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsTab
                projectId={projectId!}
                permissions={permissions}
                onPermissionRemoved={fetchProject}
              />
            </TabsContent>
            {/* Sync tab only for datasync projects */}
            {project.category === 'datasync' && (
              <TabsContent value="sync">
                <SyncTab projectId={projectId!} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* Delete Project Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('projectManagement.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('projectManagement.deleteConfirmBody', { name: project.name })}
            </p>
            <Input
              placeholder={project.name}
              value={deleteConfirmName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeleteConfirmName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProject}
              disabled={deleteConfirmName !== project.name || deleting}
            >
              {deleting && <Spinner size={16} className="mr-2" />}
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ProjectDetailPage
