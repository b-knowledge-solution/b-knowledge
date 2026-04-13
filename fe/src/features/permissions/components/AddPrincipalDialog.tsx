/**
 * @fileoverview Dialog for adding a user or team to the PrincipalPermissionMatrix.
 *
 * Shows two tabs (Users / Teams), each with a search input and a list of
 * available principals. Clicking a row calls the onAdd callback and closes
 * the dialog. Already-added principals are filtered out.
 *
 * @module features/permissions/components/AddPrincipalDialog
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { PrincipalEntry } from './PrincipalPermissionMatrix'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Minimal shape for a user row rendered in the dialog
 */
export interface DialogUser {
  id: string
  displayName?: string
  display_name?: string
  email: string
  role: string
}

/**
 * @description Minimal shape for a team row rendered in the dialog
 */
export interface DialogTeam {
  id: string
  name: string
}

/**
 * @description Props accepted by AddPrincipalDialog
 */
export interface AddPrincipalDialogProps {
  /** Whether the dialog is visible */
  open: boolean
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void
  /** Full user list (filtered to leader/user roles externally or here) */
  users: DialogUser[]
  /** Full team list */
  teams: DialogTeam[]
  /** Set of principal keys already added — used to disable/hide rows */
  alreadyAdded: Set<string>
  /** Called when the user selects a principal to add */
  onAdd: (principal: PrincipalEntry) => void
}

// ============================================================================
// Tab constants (avoid bare string comparisons)
// ============================================================================

/** Tab identifier for the users tab */
const TAB_USERS = 'users' as const
/** Tab identifier for the teams tab */
const TAB_TEAMS = 'teams' as const

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal dialog allowing the admin to add a user or team to the
 *   principal permission matrix. Provides separate filtered lists for users
 *   and teams, with search inputs and "already added" badges.
 * @param {AddPrincipalDialogProps} props - Dialog configuration props
 * @returns {JSX.Element} Rendered dialog
 */
export function AddPrincipalDialog({
  open,
  onOpenChange,
  users,
  teams,
  alreadyAdded,
  onAdd,
}: AddPrincipalDialogProps) {
  const { t } = useTranslation()
  const [userSearch, setUserSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')

  /**
   * @description Derive the display name for a user from available fields.
   * @param {DialogUser} user - User object
   * @returns {string} Display name or fallback to email
   */
  function getUserDisplayName(user: DialogUser): string {
    return user.displayName || user.display_name || user.email
  }

  // Filter users to leader/user roles and apply search
  const filteredUsers = users
    .filter((u) => u.role === 'user' || u.role === 'leader')
    .filter((u) => {
      const name = getUserDisplayName(u).toLowerCase()
      const search = userSearch.toLowerCase()
      // Match against display name or email
      return name.includes(search) || u.email.toLowerCase().includes(search)
    })

  // Filter teams by search term
  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(teamSearch.toLowerCase()),
  )

  /**
   * @description Handle user row click — build a PrincipalEntry and notify parent.
   * @param {DialogUser} user - Selected user
   */
  function handleAddUser(user: DialogUser) {
    // Skip already-added users
    if (alreadyAdded.has(`user:${user.id}`)) return
    onAdd({
      type: 'user',
      id: user.id,
      name: getUserDisplayName(user),
      permissions: [],
    })
    // Close dialog after selection
    onOpenChange(false)
    setUserSearch('')
  }

  /**
   * @description Handle team row click — build a PrincipalEntry and notify parent.
   * @param {DialogTeam} team - Selected team
   */
  function handleAddTeam(team: DialogTeam) {
    // Skip already-added teams
    if (alreadyAdded.has(`team:${team.id}`)) return
    onAdd({
      type: 'team',
      id: team.id,
      name: team.name,
      permissions: [],
    })
    // Close dialog after selection
    onOpenChange(false)
    setTeamSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg dark:bg-slate-800 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            {t('permissions.admin.addPrincipalDialog.title')}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={TAB_USERS}>
          <TabsList className="w-full dark:bg-slate-900">
            <TabsTrigger value={TAB_USERS} className="flex-1">
              {t('permissions.admin.addPrincipalDialog.usersTab')}
            </TabsTrigger>
            <TabsTrigger value={TAB_TEAMS} className="flex-1">
              {t('permissions.admin.addPrincipalDialog.teamsTab')}
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value={TAB_USERS} className="mt-3">
            <Input
              placeholder={t('permissions.admin.addPrincipalDialog.searchUsers')}
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="mb-3 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                  {t('permissions.admin.addPrincipalDialog.noUsers')}
                </p>
              ) : (
                filteredUsers.map((user) => {
                  const key = `user:${user.id}`
                  const isAdded = alreadyAdded.has(key)
                  return (
                    <button
                      key={user.id}
                      type="button"
                      disabled={isAdded}
                      onClick={() => handleAddUser(user)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md text-left hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {getUserDisplayName(user)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {user.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        {/* Role badge */}
                        <Badge variant="outline" className="text-xs capitalize">
                          {user.role}
                        </Badge>
                        {/* Already-added indicator */}
                        {isAdded && (
                          <Badge variant="secondary" className="text-xs">
                            {t('permissions.admin.addPrincipalDialog.alreadyAdded')}
                          </Badge>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value={TAB_TEAMS} className="mt-3">
            <Input
              placeholder={t('permissions.admin.addPrincipalDialog.searchTeams')}
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              className="mb-3 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredTeams.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                  {t('permissions.admin.addPrincipalDialog.noTeams')}
                </p>
              ) : (
                filteredTeams.map((team) => {
                  const key = `team:${team.id}`
                  const isAdded = alreadyAdded.has(key)
                  return (
                    <button
                      key={team.id}
                      type="button"
                      disabled={isAdded}
                      onClick={() => handleAddTeam(team)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md text-left hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {team.name}
                      </span>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        {/* Team type badge */}
                        <Badge variant="outline" className="text-xs">
                          {t('permissions.admin.principalMatrix.principalType.team')}
                        </Badge>
                        {/* Already-added indicator */}
                        {isAdded && (
                          <Badge variant="secondary" className="text-xs">
                            {t('permissions.admin.addPrincipalDialog.alreadyAdded')}
                          </Badge>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
