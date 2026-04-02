/**
 * @fileoverview Knowledge base member list with add/remove functionality.
 * Displays a table of project members with role badges and removal actions.
 * @module features/knowledge-base/components/KnowledgeBaseMemberList
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, Trash2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { globalMessage } from '@/app/App'
import { useConfirm } from '@/components/ConfirmDialog'
import { userApi } from '@/features/users'
import type { User } from '@/features/auth'

import { useKnowledgeBaseMembers, useAddMember, useRemoveMember } from '../api/knowledgeBaseQueries'

// ============================================================================
// Types
// ============================================================================

interface KnowledgeBaseMemberListProps {
  /** Knowledge Base UUID to manage members for */
  knowledgeBaseId: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Table of project members with role badges, add member dialog, and remove member confirmation.
 * Uses TanStack Query hooks for data fetching and mutation with automatic cache invalidation.
 * @param {KnowledgeBaseMemberListProps} props - Component props
 * @returns {JSX.Element} Rendered member list with management actions
 */
export default function KnowledgeBaseMemberList({ knowledgeBaseId }: KnowledgeBaseMemberListProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // Data hooks
  const { data: members = [], isLoading } = useKnowledgeBaseMembers(knowledgeBaseId)
  const addMember = useAddMember(knowledgeBaseId)
  const removeMember = useRemoveMember(knowledgeBaseId)

  // Add member dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [orgUsers, setOrgUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  /**
   * Open the add member dialog and fetch org users.
   */
  const handleOpenDialog = async () => {
    setDialogOpen(true)
    setSearchQuery('')
    setUsersLoading(true)
    try {
      const users = await userApi.getUsers()
      setOrgUsers(users)
    } catch {
      globalMessage.error(t('projects.error.removeMember'))
    } finally {
      setUsersLoading(false)
    }
  }

  /**
   * Add a user to the project and close dialog on success.
   */
  const handleAddMember = async (userId: string) => {
    try {
      await addMember.mutateAsync(userId)
      globalMessage.success(t('common.saveSuccess'))
      setDialogOpen(false)
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  /**
   * Remove a member after confirmation dialog.
   */
  const handleRemoveMember = async (userId: string, name: string) => {
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('projectManagement.removeMemberConfirm', { name }),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await removeMember.mutateAsync(userId)
      globalMessage.success(t('common.deleteSuccess'))
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  // Filter org users: exclude already-added members and match search query
  const existingUserIds = new Set(members.map((m) => m.user_id))
  const filteredUsers = orgUsers.filter((u) => {
    // Exclude users already in the project
    if (existingUserIds.has(u.id)) return false
    // Match search query against name or email
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    )
  })

  // Map role string to badge variant for visual distinction
  const getRoleBadgeVariant = (role: string): 'default' | 'secondary' | 'outline' => {
    switch (role) {
      case 'super-admin':
      case 'admin':
        return 'default'
      case 'leader':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  // ── Loading ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {t('projectManagement.tabs.members')}
        </h3>
        <Button size="sm" onClick={handleOpenDialog}>
          <UserPlus size={16} className="mr-2" />
          {t('projectManagement.addMember')}
        </Button>
      </div>

      {/* Member table or empty state */}
      {members.length === 0 ? (
        <EmptyState
          title={t('projectManagement.members.empty')}
          description={t('projectManagement.members.emptyDescription')}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('common.email')}</TableHead>
                <TableHead>{t('projectManagement.role')}</TableHead>
                <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(member.role)}>
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemoveMember(member.user_id, member.name)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Member Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('projectManagement.addMember')}</DialogTitle>
          </DialogHeader>

          {/* Search input to filter org users */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('common.searchPlaceholder')}
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* User list */}
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size={20} />
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('common.noData')}
              </p>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
                  onClick={() => handleAddMember(user.id)}
                >
                  <div>
                    <div className="text-sm font-medium">{user.displayName}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {user.role}
                  </Badge>
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
