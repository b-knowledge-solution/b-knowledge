/**
 * @fileoverview Team members management dialog component.
 * @module features/teams/components/TeamMembersDialog
 */
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import UserMultiSelect from '@/features/users/components/UserMultiSelect'
import { UserRole } from '@/constants'
import type { Team, TeamMember } from '../types/team.types'
import type { User } from '@/features/auth'

interface TeamMembersDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Close the dialog */
    onClose: () => void
    /** The team being managed */
    team: Team | null
    /** Current team members */
    members: TeamMember[]
    /** Users available to add */
    availableUsers: User[]
    /** Currently selected user IDs */
    selectedUserIds: string[]
    /** Update selected user IDs */
    onSelectedUserIdsChange: (ids: string[]) => void
    /** Add selected users as members */
    onAddMembers: () => void
    /** Remove a member */
    onRemoveMember: (userId: string) => void
    /** Error message from add operation */
    addMemberError: string | null
}

/**
 * @description Dialog for managing team members: adding and removing users.
 * @param props - Dialog state, member data, and action handlers.
 * @returns Dialog element.
 */
export function TeamMembersDialog({
    open,
    onClose,
    team,
    members,
    availableUsers,
    selectedUserIds,
    onSelectedUserIdsChange,
    onAddMembers,
    onRemoveMember,
    addMemberError,
}: TeamMembersDialogProps) {
    const { t } = useTranslation()

    return (
        <Dialog open={open && !!team} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{`${t('iam.teams.members')} - ${team?.name}`}</DialogTitle>
                </DialogHeader>
            <div className="h-full flex flex-col min-h-[400px]">
                {/* Add member controls */}
                <div className="mb-6 flex gap-2 items-start shrink-0">
                    <div className="flex-1">
                        <UserMultiSelect
                            users={availableUsers}
                            selectedUserIds={selectedUserIds}
                            onChange={onSelectedUserIdsChange}
                            placeholder={t('iam.teams.selectUser')}
                        />
                    </div>
                    <Button
                        onClick={onAddMembers}
                        disabled={selectedUserIds.length === 0}
                        className="h-[42px] mt-1"
                    >
                        <Plus size={18} className="mr-1" />
                        {t('common.add')}
                    </Button>
                </div>

                {/* Error message */}
                {addMemberError && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm shrink-0">
                        {addMemberError}
                    </div>
                )}

                {/* Members table */}
                <div className="flex-1 overflow-auto">
                    {members.length === 0 ? (
                        <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                            {t('common.noData')}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('userManagement.user')}</TableHead>
                                    <TableHead>{t('iam.teams.role')}</TableHead>
                                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {members.map((member) => (
                                    <TableRow key={member.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarFallback className="bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 text-sm">
                                                        {(member.display_name || member.email || '?').charAt(0).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="font-medium text-slate-900 dark:text-white">{member.display_name}</div>
                                                    <div className="text-xs text-slate-500">{member.email}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={member.role === UserRole.LEADER ? 'default' : 'secondary'}
                                                className={`capitalize ${member.role === UserRole.LEADER ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : ''}`}
                                            >
                                                {t(`iam.teams.${member.role}`)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                                onClick={() => onRemoveMember(member.id)}
                                            >
                                                {t('common.delete')}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </div>
            </DialogContent>
        </Dialog>
    )
}
