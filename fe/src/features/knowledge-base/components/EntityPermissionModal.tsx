/**
 * EntityPermissionModal: Modal for managing per-entity permissions.
 * Opens from a lock icon on each category/chat/search row.
 *
 * @description Design inspired by RAGFlow's "Edit Permissions" modal:
 * - Entity info banner at top
 * - Private Access toggle
 * - Separate team/user multi-select dropdowns
 * - Name/Email table of granted users with delete buttons
 * - Cancel/Save footer with batch save
 */
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Users, User, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { globalMessage } from '@/app/App'
import { teamApi, type Team } from '@/features/teams'
import { userApi } from '@/features/users'
import { User as UserType } from '@/features/auth'
import {
  type KnowledgeBaseEntityPermission,
  getEntityPermissionsByEntity,
  setEntityPermission,
  removeEntityPermission,
} from '../api/knowledgeBaseApi'

// ============================================================================
// Types
// ============================================================================

/** Props for EntityPermissionModal */
interface EntityPermissionModalProps {
  /** Whether modal is visible */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** Knowledge Base UUID */
  knowledgeBaseId: string
  /** Entity type: 'category' | 'chat' | 'search' */
  entityType: 'category' | 'chat' | 'search'
  /** Entity UUID */
  entityId: string
  /** Entity display name (for header) */
  entityName: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal for managing per-entity (category/chat/search) permissions with team and user grantees.
 * Supports private access toggle, multi-select for teams/users, and batch save with diff-based API calls.
 * @param {EntityPermissionModalProps} props - Modal configuration including entity info and project ID
 * @returns {JSX.Element} Rendered permission management modal
 */
export const EntityPermissionModal: React.FC<EntityPermissionModalProps> = ({
  open,
  onClose,
  knowledgeBaseId,
  entityType,
  entityId,
  entityName,
}) => {
  const { t } = useTranslation()

  // Data state
  const [permissions, setPermissions] = useState<KnowledgeBaseEntityPermission[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<UserType[]>([])
  const [, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state: selected team/user IDs (local until Save)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [isPrivate, setIsPrivate] = useState(false)

  /**
   * Fetch permissions and reference data (teams, users) when modal opens.
   */
  const loadData = async () => {
    if (!open || !entityId) return
    setLoading(true)
    try {
      const [perms, teamsList, usersList] = await Promise.all([
        getEntityPermissionsByEntity(knowledgeBaseId, entityType, entityId),
        teamApi.getTeams(),
        userApi.getUsers(),
      ])
      setPermissions(perms)
      setTeams(teamsList)
      setUsers(usersList)

      // Sync local state from server permissions
      const teamIds = perms
        .filter((p) => p.grantee_type === 'team')
        .map((p) => p.grantee_id)
      const userIds = perms
        .filter((p) => p.grantee_type === 'user')
        .map((p) => p.grantee_id)
      setSelectedTeamIds(teamIds)
      setSelectedUserIds(userIds)

      // If any permissions exist, entity is private
      setIsPrivate(perms.length > 0)
    } catch (err) {
      console.error('[EntityPermissionModal] Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load data when modal opens
  useEffect(() => {
    loadData()
  }, [open, knowledgeBaseId, entityType, entityId])

  /**
   * Resolve user ID to display info.
   * @param userId - User UUID
   * @returns Object with name and email
   */
  const resolveUser = (userId: string) => {
    const user = users.find((u) => u.id === userId)
    return {
      name: user?.displayName || userId,
      email: user?.email || '',
    }
  }

  /**
   * Resolve team ID to display name.
   * @param teamId - Team UUID
   * @returns Team name string
   */
  const resolveTeamName = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    return team?.name || teamId
  }

  /**
   * Build all grantees (teams + users) for the table display.
   */
  const granteeTableData = (() => {
    const teamRows = selectedTeamIds.map((id) => ({
      key: `team-${id}`,
      type: 'team' as const,
      id,
      name: resolveTeamName(id),
      email: '',
    }))
    const userRows = selectedUserIds.map((id) => {
      const info = resolveUser(id)
      return {
        key: `user-${id}`,
        type: 'user' as const,
        id,
        name: info.name,
        email: info.email,
      }
    })
    return [...teamRows, ...userRows]
  })()

  /**
   * Remove a grantee from the local selection (not yet saved to server).
   */
  const handleRemoveGrantee = (type: 'team' | 'user', id: string) => {
    if (type === 'team') {
      setSelectedTeamIds((prev) => prev.filter((tid) => tid !== id))
    } else {
      setSelectedUserIds((prev) => prev.filter((uid) => uid !== id))
    }
  }

  /**
   * Toggle a team in the selected list.
   * @param teamId - Team ID to toggle
   */
  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId],
    )
  }

  /**
   * Toggle a user in the selected list.
   * @param userId - User ID to toggle
   */
  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    )
  }

  /**
   * Save all permission changes to the server.
   * Compares current selections with server state and applies diffs.
   */
  const handleSave = async () => {
    setSaving(true)
    try {
      // If not private, remove all existing permissions
      if (!isPrivate) {
        for (const perm of permissions) {
          await removeEntityPermission(knowledgeBaseId, perm.id)
        }
        globalMessage.success(t('projectManagement.entityPermissions.saved', 'Permissions saved'))
        onClose()
        return
      }

      // Determine diffs: added and removed grantees
      const existingTeamIds = new Set(
        permissions.filter((p) => p.grantee_type === 'team').map((p) => p.grantee_id),
      )
      const existingUserIds = new Set(
        permissions.filter((p) => p.grantee_type === 'user').map((p) => p.grantee_id),
      )

      // Teams to add
      const teamsToAdd = selectedTeamIds.filter((id) => !existingTeamIds.has(id))
      // Teams to remove
      const teamsToRemove = permissions.filter(
        (p) => p.grantee_type === 'team' && !selectedTeamIds.includes(p.grantee_id),
      )
      // Users to add
      const usersToAdd = selectedUserIds.filter((id) => !existingUserIds.has(id))
      // Users to remove
      const usersToRemove = permissions.filter(
        (p) => p.grantee_type === 'user' && !selectedUserIds.includes(p.grantee_id),
      )

      // Apply removals
      for (const perm of [...teamsToRemove, ...usersToRemove]) {
        await removeEntityPermission(knowledgeBaseId, perm.id)
      }

      // Apply additions (default permission level: 'view')
      for (const teamId of teamsToAdd) {
        await setEntityPermission(knowledgeBaseId, {
          entity_type: entityType,
          entity_id: entityId,
          grantee_type: 'team',
          grantee_id: teamId,
          permission_level: 'view',
        })
      }
      for (const userId of usersToAdd) {
        await setEntityPermission(knowledgeBaseId, {
          entity_type: entityType,
          entity_id: entityId,
          grantee_type: 'user',
          grantee_id: userId,
          permission_level: 'view',
        })
      }

      globalMessage.success(t('projectManagement.entityPermissions.saved', 'Permissions saved'))
      onClose()
    } catch (err) {
      console.error('[EntityPermissionModal] Failed to save:', err)
      globalMessage.error(t('projectManagement.entityPermissions.saveError', 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  /** Localized entity type label. */
  const entityTypeLabel = t(
    `projectManagement.entityPermissions.entityTypes.${entityType}`,
    entityType,
  )

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t('projectManagement.entityPermissions.editTitle', 'Edit Permissions')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Entity info banner */}
          <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{entityName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {entityTypeLabel}
            </p>
          </div>

          {/* Permissions section */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {t('projectManagement.entityPermissions.permissions', 'Permissions')}
            </h4>

            {/* Private Access toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Lock size={18} className="text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('projectManagement.entityPermissions.privateAccess', 'Private Access')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t(
                      'projectManagement.entityPermissions.privateAccessDesc',
                      'Only selected teams or users can access this {{type}}',
                      { type: entityTypeLabel },
                    )}
                  </p>
                </div>
              </div>
              <Switch
                checked={isPrivate}
                onCheckedChange={setIsPrivate}
              />
            </div>
          </div>

          {/* Team/User selection — only shown when Private Access is enabled */}
          {isPrivate && (
            <>
              <Separator className="my-2" />

              {/* Select Teams */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Users size={14} />
                  {t('projectManagement.entityPermissions.selectTeams', 'Select Teams')}
                </label>
                <div className="border rounded-md max-h-48 overflow-auto p-2 space-y-1 dark:border-slate-700">
                  {teams.map((team) => (
                    <label key={team.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(team.id)}
                        onChange={() => toggleTeam(team.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{team.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Select Users */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <User size={14} />
                  {t('projectManagement.entityPermissions.selectUsers', 'Select Users')}
                </label>
                <div className="border rounded-md max-h-48 overflow-auto p-2 space-y-1 dark:border-slate-700">
                  {users.map((user) => (
                    <label key={user.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleUser(user.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{user.displayName} ({user.email})</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Grantee table */}
              {granteeTableData.length > 0 && (
                <div className="border rounded-lg dark:border-slate-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('projectManagement.entityPermissions.name', 'Name')}</TableHead>
                        <TableHead>{t('projectManagement.entityPermissions.email', 'Email')}</TableHead>
                        <TableHead className="w-[50px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {granteeTableData.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {row.type === 'team' ? (
                                <Users size={14} className="text-purple-500 flex-shrink-0" />
                              ) : (
                                <User size={14} className="text-blue-500 flex-shrink-0" />
                              )}
                              <span>{row.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-gray-500 dark:text-gray-400">{row.email || '\u2014'}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveGrantee(row.type, row.id)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
