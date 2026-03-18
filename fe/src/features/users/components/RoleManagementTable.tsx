/**
 * @fileoverview Role management table for admin users to view and assign roles.
 * Displays org members with name, email, current role badge, and a role select dropdown.
 * Includes confirmation dialogs for role changes and loading/empty states.
 *
 * @module features/users/components/RoleManagementTable
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Users } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RoleBadge } from '@/components/ui/role-badge'
import { useConfirm } from '@/components/ConfirmDialog'
import { useAuth } from '@/features/auth'
import type { User } from '@/features/auth'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the RoleManagementTable component
 */
interface RoleManagementTableProps {
  /** Array of org members to display */
  members: User[]
  /** Whether the member list is loading */
  isLoading: boolean
  /** Callback when a role change is confirmed */
  onRoleChange: (userId: string, newRole: string) => void
  /** ID of the user currently being updated (shows spinner) */
  updatingUserId?: string
}

/** @description Available role options for the select dropdown */
const ROLE_OPTIONS = ['admin', 'leader', 'user'] as const

// ============================================================================
// Component
// ============================================================================

/**
 * @description Table displaying org members with role assignment dropdowns.
 * Each row shows user name, email, current role as a colored badge,
 * and a Select to change their role with confirmation dialogs.
 *
 * @param {RoleManagementTableProps} props - Members data, loading state, and role change callback
 * @returns {JSX.Element} Rendered role management table with loading/empty/data states
 */
export function RoleManagementTable({
  members,
  isLoading,
  onRoleChange,
  updatingUserId,
}: RoleManagementTableProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { user: currentUser } = useAuth()

  // Track which user's role select is pending confirmation
  const [pendingChange, setPendingChange] = useState<{
    userId: string
    newRole: string
  } | null>(null)

  /**
   * @description Handle role select change with appropriate confirmation dialog.
   * Shows different confirmation messages for self-change, downgrade, and upgrade.
   * @param {User} member - The user whose role is being changed
   * @param {string} newRole - The new role to assign
   */
  const handleRoleSelect = async (member: User, newRole: string) => {
    // Skip if the role hasn't actually changed
    if (member.role === newRole) return

    const userName = member.displayName || member.email || ''
    const oldRole = member.role || 'user'
    const isSelf = member.id === currentUser?.id

    // Determine which confirmation message to show
    let confirmMessage: string
    if (isSelf) {
      // Changing own role -- warn about potential access loss
      confirmMessage = t('accessControl.roleManagement.confirmSelfChange')
    } else if (ROLE_OPTIONS.indexOf(newRole as typeof ROLE_OPTIONS[number]) > ROLE_OPTIONS.indexOf(oldRole as typeof ROLE_OPTIONS[number])) {
      // Downgrading another user's role (higher index = lower privilege)
      confirmMessage = t('accessControl.roleManagement.confirmDowngrade', {
        user: userName,
        oldRole: t(`accessControl.roles.${oldRole}`),
        newRole: t(`accessControl.roles.${newRole}`),
      })
    } else {
      // Standard role change (upgrade or lateral)
      confirmMessage = t('accessControl.roleManagement.confirmChange', {
        user: userName,
        oldRole: t(`accessControl.roles.${oldRole}`),
        newRole: t(`accessControl.roles.${newRole}`),
      })
    }

    // Show confirmation dialog before applying the role change
    const confirmed = await confirm({
      title: t('accessControl.roleManagement.changeRole'),
      message: confirmMessage,
      confirmText: t('accessControl.roleManagement.changeRole'),
      variant: isSelf ? 'danger' : 'info',
    })

    if (confirmed) {
      setPendingChange({ userId: member.id, newRole })
      onRoleChange(member.id, newRole)
      // Clear pending state after a short delay to allow mutation to start
      setTimeout(() => setPendingChange(null), 500)
    }
  }

  // Loading state: render skeleton rows
  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('userManagement.user')}</TableHead>
            <TableHead>{t('userManagement.email')}</TableHead>
            <TableHead>{t('userManagement.role')}</TableHead>
            <TableHead className="text-right">{t('userManagement.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Render 3 skeleton rows matching column layout */}
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell><div className="h-4 w-32 rounded bg-muted animate-pulse" /></TableCell>
              <TableCell><div className="h-4 w-48 rounded bg-muted animate-pulse" /></TableCell>
              <TableCell><div className="h-6 w-16 rounded bg-muted animate-pulse" /></TableCell>
              <TableCell className="text-right"><div className="h-9 w-28 ml-auto rounded bg-muted animate-pulse" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  // Empty state: no members found
  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground">
          {t('accessControl.roleManagement.noMembers')}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {t('accessControl.roleManagement.noMembersDesc')}
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('userManagement.user')}</TableHead>
          <TableHead>{t('userManagement.email')}</TableHead>
          <TableHead>{t('userManagement.role')}</TableHead>
          <TableHead className="text-right">{t('userManagement.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => {
          // Check if this specific user is being updated
          const isUpdating =
            updatingUserId === member.id ||
            (pendingChange?.userId === member.id)

          return (
            <TableRow key={member.id}>
              {/* Name column with avatar */}
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium text-sm">
                      {(member.displayName || member.email || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {member.displayName || member.email}
                  </span>
                </div>
              </TableCell>

              {/* Email column */}
              <TableCell>
                <span className="text-slate-600 dark:text-slate-300">
                  {member.email}
                </span>
              </TableCell>

              {/* Current role badge */}
              <TableCell>
                <RoleBadge role={member.role || 'user'} />
              </TableCell>

              {/* Role change select */}
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {isUpdating && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <Select
                    value={member.role || 'user'}
                    onValueChange={(value: string) => handleRoleSelect(member, value)}
                    disabled={isUpdating}
                  >
                    <SelectTrigger className="w-28 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`accessControl.roles.${role}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
