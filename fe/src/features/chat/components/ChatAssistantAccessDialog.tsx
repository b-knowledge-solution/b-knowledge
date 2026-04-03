/**
 * @fileoverview Dialog for managing user and team access to a chat assistant.
 * Provides tabbed interface with searchable checkboxes for assigning access.
 * @module features/ai/components/ChatAssistantAccessDialog
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { chatApi } from '../api/chatApi'
import { globalMessage } from '@/app/App'
import type { ChatAssistant, ChatAssistantAccessEntry } from '../types/chat.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Minimal user shape for the access list display.
 */
interface AccessUser {
  id: string
  display_name: string
  email?: string
}

/**
 * @description Minimal team shape for the access list display.
 */
interface AccessTeam {
  id: string
  name: string
}

// ============================================================================
// Props
// ============================================================================

interface ChatAssistantAccessDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** The chat dialog to manage access for */
  dialog: ChatAssistant | null
  /** Callback fired after successful save */
  onSave?: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal dialog for managing user and team access to a chat assistant.
 * Displays tabs for Users and Teams with searchable checkbox lists.
 *
 * @param {ChatAssistantAccessDialogProps} props - Component properties
 * @returns {JSX.Element} The rendered access management dialog
 */
export default function ChatAssistantAccessDialog({
  open,
  onClose,
  dialog,
  onSave,
}: ChatAssistantAccessDialogProps) {
  const { t } = useTranslation()

  // Current access entries from the API (used to initialize selected sets)
  const [, setAccessEntries] = useState<ChatAssistantAccessEntry[]>([])

  // All available users and teams
  const [allUsers, setAllUsers] = useState<AccessUser[]>([])
  const [allTeams, setAllTeams] = useState<AccessTeam[]>([])

  // Selected entity IDs (local working copy)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())

  // Search filters per tab
  const [userSearch, setUserSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')

  // Public toggle state
  const [isPublic, setIsPublic] = useState(false)

  // Loading state
  const [saving, setSaving] = useState(false)

  /**
   * @description Fetch access entries, users, and teams when dialog opens.
   */
  const loadData = async () => {
    if (!dialog) return
    try {
      // Fetch current access entries
      const entries = await chatApi.getAssistantAccess(dialog.id)
      setAccessEntries(entries)

      // Build selected sets from existing entries
      const userIds = new Set(entries.filter((e) => e.entity_type === 'user').map((e) => e.entity_id))
      const teamIds = new Set(entries.filter((e) => e.entity_type === 'team').map((e) => e.entity_id))
      setSelectedUserIds(userIds)
      setSelectedTeamIds(teamIds)

      // Fetch all users and teams for selection
      const [users, teams] = await Promise.all([
        api.get<AccessUser[]>('/api/users'),
        api.get<AccessTeam[]>('/api/teams'),
      ])
      setAllUsers(users)
      setAllTeams(teams)
    } catch (error) {
      console.error('Failed to load access data:', error)
    }
  }

  // Load data when opened
  useEffect(() => {
    if (open && dialog) {
      setIsPublic(dialog.is_public ?? false)
      loadData()
    }
    // Reset search filters when dialog closes
    if (!open) {
      setUserSearch('')
      setTeamSearch('')
    }
  }, [open, dialog])

  /**
   * @description Toggle a user in the selected set.
   * @param userId - User ID to toggle
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
   * @param teamId - Team ID to toggle
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
   * @description Save the updated access entries to the API.
   */
  const handleSave = async () => {
    if (!dialog) return
    setSaving(true)
    try {
      // Build the entries array from selected IDs
      // If public, we clear explicit grants to keep DB clean
      const entries: ChatAssistantAccessEntry[] = isPublic ? [] : [
        ...[...selectedUserIds].map((id) => ({
          entity_type: 'user' as const,
          entity_id: id,
        })),
        ...[...selectedTeamIds].map((id) => ({
          entity_type: 'team' as const,
          entity_id: id,
        })),
      ]

      await Promise.all([
        chatApi.setAssistantAccess(dialog.id, entries),
        isPublic !== dialog.is_public ? chatApi.updateAssistant(dialog.id, { is_public: isPublic }) : Promise.resolve(),
      ])

      globalMessage.success(t('common.saveSuccess'))
      onSave?.()
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
    <Dialog open={open && !!dialog} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader className="mb-2">
          <DialogTitle>
            {t('chatAdmin.manageAccess')} - {dialog?.name}
          </DialogTitle>
        </DialogHeader>

        {/* Public toggle */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b">
          <div>
            <p className="text-sm font-medium">{t('chatAdmin.isPublic')}</p>
            <p className="text-xs text-muted-foreground">{t('chatAdmin.publicDesc')}</p>
          </div>
          <Switch checked={isPublic} onCheckedChange={setIsPublic} />
        </div>

        {!isPublic && (
          <Tabs defaultValue="users" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="users" className="flex-1">
                {t('chatAdmin.accessUsers')}
                {/* Show count of selected users */}
                {selectedUserIds.size > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {selectedUserIds.size}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="teams" className="flex-1">
                {t('chatAdmin.accessTeams')}
                {/* Show count of selected teams */}
                {selectedTeamIds.size > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {selectedTeamIds.size}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

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
                    {t('common.noData')}
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
                    {t('common.noData')}
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
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
