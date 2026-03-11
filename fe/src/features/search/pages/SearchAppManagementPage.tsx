/**
 * @fileoverview Admin page for managing search app configurations.
 * Provides CRUD operations, search filtering, and RBAC access control per search app.
 * @module features/ai/pages/SearchAppManagementPage
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Pencil, Trash2, Shield, Globe, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { HeaderActions } from '@/components/HeaderActions'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'
import { searchApi } from '../api/searchApi'
import SearchAppConfig from '../components/SearchAppConfig'
import SearchAppAccessDialog from '../components/SearchAppAccessDialog'
import type { SearchApp, CreateSearchAppPayload } from '../types/search.types'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Admin management page for search apps.
 * Lists all search apps in a table with search, CRUD actions, and access control.
 * @returns {JSX.Element} The rendered page
 */
export default function SearchAppManagementPage() {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // Search apps state
  const [apps, setApps] = useState<SearchApp[]>([])
  const [loading, setLoading] = useState(false)

  // Search filter state
  const [searchTerm, setSearchTerm] = useState('')

  // Config dialog state
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<SearchApp | null>(null)

  // Access dialog state
  const [isAccessOpen, setIsAccessOpen] = useState(false)
  const [accessApp, setAccessApp] = useState<SearchApp | null>(null)

  /**
   * Fetch all search apps from the API.
   */
  const fetchApps = useCallback(async () => {
    setLoading(true)
    try {
      const data = await searchApi.listSearchApps()
      setApps(data)
    } catch (error) {
      console.error('Error fetching search apps:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch apps on mount
  useEffect(() => {
    fetchApps()
  }, [fetchApps])

  // Filter apps by search term
  const filteredApps = apps.filter((a) =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  /**
   * Open the config dialog in create mode.
   */
  const openCreate = () => {
    setEditingApp(null)
    setIsConfigOpen(true)
  }

  /**
   * Open the config dialog in edit mode.
   * @param app - The search app to edit
   */
  const openEdit = (app: SearchApp) => {
    setEditingApp(app)
    setIsConfigOpen(true)
  }

  /**
   * Handle save from config dialog (create or update).
   * @param data - The search app payload
   */
  const handleSave = async (data: CreateSearchAppPayload) => {
    try {
      if (editingApp) {
        // Update existing search app
        await searchApi.updateSearchApp(editingApp.id, data)
        globalMessage.success(t('common.updateSuccess'))
      } else {
        // Create new search app
        await searchApi.createSearchApp(data)
        globalMessage.success(t('common.createSuccess'))
      }
      fetchApps()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }

  /**
   * Confirm and delete a search app.
   * @param app - The search app to delete
   */
  const handleDelete = async (app: SearchApp) => {
    const confirmed = await confirm({
      title: t('searchAdmin.deleteApp'),
      message: t('searchAdmin.confirmDelete'),
      variant: 'danger',
    })
    if (confirmed) {
      try {
        await searchApi.deleteSearchApp(app.id)
        setApps((prev) => prev.filter((a) => a.id !== app.id))
        globalMessage.success(t('common.deleteSuccess'))
      } catch (error: any) {
        globalMessage.error(error?.message || t('common.error'))
      }
    }
  }

  /**
   * Open the access control dialog for a specific search app.
   * @param app - The search app to manage access for
   */
  const openAccess = (app: SearchApp) => {
    setAccessApp(app)
    setIsAccessOpen(true)
  }

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto">
      {/* Search input */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 shrink-0">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <Input
            placeholder={t('searchAdmin.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-10 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          />
        </div>
      </div>

      {/* Search apps table */}
      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="flex-1 flex justify-center items-center text-slate-500 dark:text-slate-400">
          {t('searchAdmin.noApps')}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('common.description')}</TableHead>
                <TableHead>{t('searchAdmin.datasets')}</TableHead>
                <TableHead>{t('searchAdmin.searchMethod')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApps.map((app) => (
                <TableRow key={app.id}>
                  {/* Name */}
                  <TableCell className="font-medium text-slate-900 dark:text-white">
                    {app.name}
                  </TableCell>

                  {/* Description */}
                  <TableCell className="text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                    {app.description || '-'}
                  </TableCell>

                  {/* Dataset count */}
                  <TableCell>
                    <Badge variant="secondary">{app.dataset_ids.length}</Badge>
                  </TableCell>

                  {/* Search method */}
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {app.search_config?.search_method || 'hybrid'}
                  </TableCell>

                  {/* Public / Private badge */}
                  <TableCell>
                    {app.is_public ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        <Globe size={12} className="mr-1" />
                        {t('searchAdmin.isPublic')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Lock size={12} className="mr-1" />
                        {t('searchAdmin.isPrivate')}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Action buttons */}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* Edit button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(app)}
                        title={t('searchAdmin.editApp')}
                      >
                        <Pencil size={16} />
                      </Button>

                      {/* Manage access button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAccess(app)}
                        title={t('searchAdmin.manageAccess')}
                      >
                        <Shield size={16} />
                      </Button>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => handleDelete(app)}
                        title={t('searchAdmin.deleteApp')}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create button in header actions */}
      <HeaderActions>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={20} />
          {t('searchAdmin.createApp')}
        </Button>
      </HeaderActions>

      {/* Create / Edit config dialog */}
      <SearchAppConfig
        open={isConfigOpen}
        onClose={() => { setIsConfigOpen(false); setEditingApp(null) }}
        onSave={handleSave}
        app={editingApp}
      />

      {/* Access control dialog */}
      <SearchAppAccessDialog
        open={isAccessOpen}
        onClose={() => { setIsAccessOpen(false); setAccessApp(null) }}
        app={accessApp}
      />
    </div>
  )
}
