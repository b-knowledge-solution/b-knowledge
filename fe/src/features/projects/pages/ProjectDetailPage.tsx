/**
 * @fileoverview Project detail page with tabbed interface.
 *
 * Features:
 * - Header with project name, server badge, and back button
 * - Four tabs: Documents, Chat, Search, Settings
 * - Pre-fetches category versions for the Chat tab
 * - Dark/light theme support
 * - Full i18n support
 *
 * @module features/projects/pages/ProjectDetailPage
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { Tabs, Button, Tag, Spin, Empty, message } from 'antd'
import { ArrowLeft, FolderOpen, MessageSquare, Search, Settings, RefreshCw } from 'lucide-react'
import {
  getProjectById,
  getDocumentCategories,
  getCategoryVersions,
  getProjectChats,
  getProjectSearches,
  getProjectPermissions,
  type Project,
  type DocumentCategory,
  type DocumentCategoryVersion,
  type ProjectChat,
  type ProjectSearch,
  type ProjectPermission,
} from '../api/projectService'
import DocumentsTab from '../components/DocumentsTab'
import ChatTab from '../components/ChatTab'
import SearchTab from '../components/SearchTab'
import SettingsTab from '../components/SettingsTab'
import SyncTab from '../components/SyncTab'

// ============================================================================
// Component
// ============================================================================

/**
 * Project detail page with tabs for Documents, Chat, and Settings.
 *
 * Loaded via /projects/:projectId route.
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

      // Permissions may not be accessible to all roles — load separately
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
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  /** Effect: Load project on mount */
  useEffect(() => {
    fetchProject()
  }, [projectId])

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Empty description="Project not found" />
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div>
          {/* Back + title */}
          <div className="mb-6">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => navigate('/knowledge-base/projects')}
              className="mb-2"
            >
              {t('projectManagement.title')}
            </Button>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
                <Tag color={project.status === 'active' ? 'green' : 'default'}>{project.status}</Tag>
              </div>
              {project.description && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">{project.description}</p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs
            defaultActiveKey="documents"
            items={[
              {
                key: 'documents',
                label: (
                  <span className="flex items-center gap-2">
                    <FolderOpen size={16} />
                    {t('projectManagement.tabs.documents')}
                  </span>
                ),
                children: (
                  <DocumentsTab
                    projectId={projectId!}
                    initialCategories={categories}
                    embeddingModels={embeddingModels}
                  />
                ),
              },
              {
                key: 'chat',
                label: (
                  <span className="flex items-center gap-2">
                    <MessageSquare size={16} />
                    {t('projectManagement.tabs.chat')}
                  </span>
                ),
                children: (
                  <ChatTab
                    projectId={projectId!}
                    initialChats={chats}
                    categories={categories}
                    categoryVersions={categoryVersions}
                    chatModels={chatModels}
                  />
                ),
              },
              {
                key: 'search',
                label: (
                  <span className="flex items-center gap-2">
                    <Search size={16} />
                    {t('projectManagement.tabs.search', 'Search')}
                  </span>
                ),
                children: (
                  <SearchTab
                    projectId={projectId!}
                    initialSearches={searches}
                    categories={categories}
                    categoryVersions={categoryVersions}
                    chatModels={chatModels}
                  />
                ),
              },
              {
                key: 'settings',
                label: (
                  <span className="flex items-center gap-2">
                    <Settings size={16} />
                    {t('projectManagement.tabs.settings')}
                  </span>
                ),
                children: (
                  <SettingsTab
                    projectId={projectId!}
                    permissions={permissions}
                    onPermissionRemoved={fetchProject}
                  />
                ),
              },
              // Sync tab only for datasync projects
              ...(project.category === 'datasync'
                ? [
                    {
                      key: 'sync',
                      label: (
                        <span className="flex items-center gap-2">
                          <RefreshCw size={16} />
                          {t('projectManagement.tabs.sync')}
                        </span>
                      ),
                      children: <SyncTab projectId={projectId!} />,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>
    </div>
  )
}

export default ProjectDetailPage
