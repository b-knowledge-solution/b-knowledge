/**
 * @fileoverview Dialog for managing dataset access control (RBAC).
 * Provides a public toggle and tabbed interface for assigning team/user access.
 * @module features/datasets/components/DatasetAccessDialog
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Lock, Search, X, Users, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { datasetApi } from '../api/datasetApi'
import { globalMessage } from '@/app/App'
import type { Dataset } from '../types'

// ============================================================================
// Types
// ============================================================================

/** @description Minimal user shape returned by the access endpoint */
interface AccessUser {
  id: string
  display_name: string
  email?: string
}

/** @description Minimal team shape returned by the access endpoint */
interface AccessTeam {
  id: string
  name: string
}

// ============================================================================
// Props
// ============================================================================

interface DatasetAccessDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** The dataset to manage access for */
  dataset: Dataset | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal dialog for managing dataset access control.
 * Shows a public/private toggle, and when private, displays tabbed
 * searchable checkbox lists for teams and users.
 *
 * @param {DatasetAccessDialogProps} props - Component properties
 * @returns {JSX.Element} The rendered access management dialog
 */
export default function DatasetAccessDialog({
  open,
  onClose,
  dataset,
}: DatasetAccessDialogProps) {
  const { t } = useTranslation()

  // Whether the dataset is publicly accessible
  const [isPublic, setIsPublic] = useState(true)

  // All available users and teams fetched from API
  const [allUsers, setAllUsers] = useState<AccessUser[]>([])
  const [allTeams, setAllTeams] = useState<AccessTeam[]>([])

  // Selected entity IDs (local working copy)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())

  // Search filters per tab
  const [userSearch, setUserSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')

  // Loading and saving state
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /**
   * @description Fetch current access settings and available users/teams.
   */
  const loadData = async () => {
    if (!dataset) return
    setLoading(true)
    try {
      // Fetch current access control for this dataset
      const access = await datasetApi.getDatasetAccess(dataset.id)

      // Set local state from the response
      setIsPublic(access.public)
      setSelectedTeamIds(new Set(access.teams.map((t) => t.id)))
      setSelectedUserIds(new Set(access.users.map((u) => u.id)))

      // Fetch all users and teams for selection lists
      const [users, teams] = await Promise.all([
        api.get<AccessUser[]>('/api/users'),
        api.get<AccessTeam[]>('/api/teams'),
      ])
      setAllUsers(users)
      setAllTeams(teams)
    } catch (error) {
      console.error('[DatasetAccessDialog] Failed to load access data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Load data when dialog opens; reset search when it closes
  useEffect(() => {
    if (open && dataset) {
      loadData()
    }
    if (!open) {
      setUserSearch('')
      setTeamSearch('')
    }
  }, [open, dataset])

  /**
   * @description Toggle a user in the selected set.
   * @param {string} userId - User ID to toggle
   */
  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  /**
   * @description Toggle a team in the selected set.
   * @param {string} teamId - Team ID to toggle
   */
  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) {
        next.delete(teamId)
      } else {
        next.add(teamId)
      }
      return next
    })
  }

  /**
   * @description Save the updated access control to the API.
   */
  const handleSave = async () => {
    if (!dataset) return
    setSaving(true)
    try {
      await datasetApi.setDatasetAccess(dataset.id, {
        public: isPublic,
        // Only send IDs when not public
        team_ids: isPublic ? [] : [...selectedTeamIds],
        user_ids: isPublic ? [] : [...selectedUserIds],
      })
      globalMessage.success(t('datasetAccess.saveSuccess'))
      onClose()
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  // Filter users and teams by search input
  const filteredUsers = allUsers.filter(
    (u) =>
      u.display_name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email?.toLowerCase().includes(userSearch.toLowerCase()),
  )
  const filteredTeams = allTeams.filter((team) =>
    team.name.toLowerCase().includes(teamSearch.toLowerCase()),
  )

  return (
    <Dialog open={open && !!dataset} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('datasetAccess.title')} - {dataset?.name}
          </DialogTitle>
        </DialogHeader>

        {/* Loading spinner while fetching data */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={32} />
          </div>
        ) : (
          <>
            {/* Public/Private Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600">
              <div className="flex items-center gap-3">
                {isPublic ? (
                  <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                )}
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {t('datasetAccess.isPublic')}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('datasetAccess.publicDesc')}
                  </p>
                </div>
              </div>
              <Switch
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>

            {/* Teams/Users tabs — shown only when not public */}
            {!isPublic && (
              <Tabs defaultValue="teams" className="w-full animate-in fade-in slide-in-from-top-1 duration-200">
                <TabsList className="w-full">
                  <TabsTrigger value="teams" className="flex-1">
                    <Users size={14} className="mr-1.5" />
                    {t('datasetAccess.teams')}
                    {/* Badge showing selected team count */}
                    {selectedTeamIds.size > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {selectedTeamIds.size}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="users" className="flex-1">
                    <User size={14} className="mr-1.5" />
                    {t('datasetAccess.users')}
                    {/* Badge showing selected user count */}
                    {selectedUserIds.size > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {selectedUserIds.size}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* Teams tab */}
                <TabsContent value="teams" className="mt-4">
                  {/* Team search input */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      placeholder={t('common.searchPlaceholder')}
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                      className="pl-9 h-9"
                    />
                    {teamSearch && (
                      <button
                        onClick={() => setTeamSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Team checkbox list */}
                  <div className="border rounded-lg max-h-60 overflow-y-auto">
                    {filteredTeams.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {t('datasetAccess.noTeams')}
                      </p>
                    ) : (
                      filteredTeams.map((team) => (
                        <label
                          key={team.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted cursor-pointer border-b last:border-b-0 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTeamIds.has(team.id)}
                            onChange={() => toggleTeam(team.id)}
                            className="rounded border-input"
                          />
                          <span className="font-medium text-slate-900 dark:text-white">
                            {team.name}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </TabsContent>

                {/* Users tab */}
                <TabsContent value="users" className="mt-4">
                  {/* User search input */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      placeholder={t('common.searchPlaceholder')}
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-9 h-9"
                    />
                    {userSearch && (
                      <button
                        onClick={() => setUserSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* User checkbox list */}
                  <div className="border rounded-lg max-h-60 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {t('datasetAccess.noUsers')}
                      </p>
                    ) : (
                      filteredUsers.map((user) => (
                        <label
                          key={user.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted cursor-pointer border-b last:border-b-0 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(user.id)}
                            onChange={() => toggleUser(user.id)}
                            className="rounded border-input"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 dark:text-white truncate">
                              {user.display_name}
                            </div>
                            {user.email && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {user.email}
                              </div>
                            )}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
