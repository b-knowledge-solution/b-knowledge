/**
 * KnowledgeBasePermissionModal: Modal for managing project-level private access.
 * Toggle between public/private, and assign teams for private access.
 *
 * @description Follows the same design as EntityPermissionModal:
 * - Private Access toggle with lock icon
 * - Team multi-select dropdown
 * - Table of granted teams with delete buttons
 * - Cancel/Save footer with batch save
 */
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Globe, Users, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { globalMessage } from '@/app/App'
import { teamApi, type Team } from '@/features/teams'
import {
  type KnowledgeBasePermission,
  getKnowledgeBasePermissions,
  setKnowledgeBasePermission,
  removeKnowledgeBasePermission,
  updateKnowledgeBase,
  type KnowledgeBase,
} from '../api/knowledgeBaseApi'

// ============================================================================
// Types
// ============================================================================

/** Props for KnowledgeBasePermissionModal */
interface KnowledgeBasePermissionModalProps {
  /** Whether modal is visible */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** The project to configure */
  knowledgeBase: KnowledgeBase
  /** Callback after saving */
  onSaved?: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal for managing project-level public/private access with team-based permissions.
 * Supports toggling between public and private access, and assigning teams for private access.
 * @param {KnowledgeBasePermissionModalProps} props - Modal configuration including project and save callback
 * @returns {JSX.Element} Rendered project permission modal
 */
export const KnowledgeBasePermissionModal: React.FC<KnowledgeBasePermissionModalProps> = ({
  open,
  onClose,
  knowledgeBase,
  onSaved,
}) => {
  const { t } = useTranslation()

  // Data state
  const [permissions, setPermissions] = useState<KnowledgeBasePermission[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [isPrivate, setIsPrivate] = useState(false)

  /**
   * Fetch permissions and teams when modal opens.
   */
  const loadData = async () => {
    if (!open || !knowledgeBase.id) return
    setLoading(true)
    try {
      const [perms, teamsList] = await Promise.all([
        getKnowledgeBasePermissions(knowledgeBase.id),
        teamApi.getTeams(),
      ])
      setPermissions(perms)
      setTeams(teamsList)

      // Sync local state from server
      const teamIds = perms
        .filter((p) => p.grantee_type === 'team')
        .map((p) => p.grantee_id)
      setSelectedTeamIds(teamIds)
      setIsPrivate(knowledgeBase.is_private || false)
    } catch (err) {
      console.error('[KnowledgeBasePermissionModal] Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load data when modal opens
  useEffect(() => {
    loadData()
  }, [open, knowledgeBase.id, knowledgeBase.is_private])

  /**
   * Build table data from selected team IDs.
   */
  const selectedTeams = teams.filter((team) => selectedTeamIds.includes(team.id))

  /**
   * Toggle a team ID in the selected list.
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
   * Save all permission changes to server.
   * Updates is_private flag and syncs team permissions.
   */
  const handleSave = async () => {
    setSaving(true)
    try {
      // Step 1: Update project is_private flag
      await updateKnowledgeBase(knowledgeBase.id, { is_private: isPrivate } as Partial<KnowledgeBase>)

      // Step 2: If public, remove all team permissions
      if (!isPrivate) {
        for (const perm of permissions.filter((p) => p.grantee_type === 'team')) {
          await removeKnowledgeBasePermission(knowledgeBase.id, perm.id)
        }
        globalMessage.success(t('knowledgeBase.permissionsSaved', 'Permissions saved'))
        onSaved?.()
        onClose()
        return
      }

      // Step 3: Diff team permissions
      const existingTeamIds = new Set(
        permissions.filter((p) => p.grantee_type === 'team').map((p) => p.grantee_id),
      )

      // Teams to add
      const teamsToAdd = selectedTeamIds.filter((id) => !existingTeamIds.has(id))
      // Teams to remove
      const teamsToRemove = permissions.filter(
        (p) => p.grantee_type === 'team' && !selectedTeamIds.includes(p.grantee_id),
      )

      // Apply removals
      for (const perm of teamsToRemove) {
        await removeKnowledgeBasePermission(knowledgeBase.id, perm.id)
      }

      // Apply additions with default tab permissions
      for (const teamId of teamsToAdd) {
        await setKnowledgeBasePermission(knowledgeBase.id, {
          grantee_type: 'team',
          grantee_id: teamId,
          tab_documents: 'view',
          tab_chat: 'view',
          tab_settings: 'none',
        })
      }

      globalMessage.success(t('knowledgeBase.permissionsSaved', 'Permissions saved'))
      onSaved?.()
      onClose()
    } catch (err) {
      console.error('[KnowledgeBasePermissionModal] Failed to save:', err)
      globalMessage.error(t('knowledgeBase.permissionsSaveError', 'Failed to save permissions'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-[580px]">
        <DialogHeader>
          <DialogTitle>{t('knowledgeBase.editPermissions', 'Edit Permissions')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Knowledge base info banner */}
          <div className="p-3 bg-gray-100 dark:bg-slate-800 rounded-lg">
            <p className="font-medium text-gray-900 dark:text-gray-100">{knowledgeBase.name}</p>
            {knowledgeBase.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {knowledgeBase.description}
              </p>
            )}
          </div>

          {/* Permissions section header */}
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('common.permissions', 'Permissions')}
            </h4>
          </div>

          {/* Public/Private Toggle — dynamic icon, label, and Switch color */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600">
            <div className="flex items-center gap-3">
              {!isPrivate ? (
                <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              )}
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {!isPrivate
                    ? (t('knowledgeBase.publicAccess', 'Public Access'))
                    : (t('knowledgeBase.privateAccess', 'Private Access'))
                  }
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {!isPrivate
                    ? (t('knowledgeBase.publicAccessDesc', 'All authenticated users can access this project'))
                    : (t('knowledgeBase.privateAccessDesc', 'Only selected teams can access this project'))
                  }
                </p>
              </div>
            </div>
            <Switch
              checked={!isPrivate}
              onCheckedChange={(checked: boolean) => setIsPrivate(!checked)}
            />
          </div>

          {/* Team selection — only shown when Private Access is enabled, with slide-in animation */}
          {isPrivate && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* Team Select (multi-select as checkbox list) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Users size={14} />
                  {t('knowledgeBase.selectTeams', 'Select Teams')}
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

              {/* Selected Teams Table */}
              {selectedTeams.length > 0 && (
                <div className="w-full overflow-x-auto">
                  <div className="border border-gray-100 dark:border-slate-700 rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t('common.name', 'Name')}</TableHead>
                          <TableHead className="w-[50px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTeams.map((team) => (
                          <TableRow key={team.id}>
                            <TableCell className="text-xs">{team.name}</TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                onClick={() =>
                                  setSelectedTeamIds(selectedTeamIds.filter((id) => id !== team.id))
                                }
                              >
                                <Trash2 size={14} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700 w-full">
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
