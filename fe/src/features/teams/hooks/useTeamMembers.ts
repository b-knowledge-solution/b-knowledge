/**
 * @fileoverview Hook for managing team member operations.
 * Uses TanStack Query for data fetching and mutations.
 * @module features/teams/hooks/useTeamMembers
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { globalMessage } from '@/app/App'
import { useConfirm } from '@/components/ConfirmDialog'
import { teamApi } from '../api/teamApi'
import { userApi } from '@/features/users'
import { queryKeys } from '@/lib/queryKeys'
import type { TeamMember } from '../types/team.types'
import type { User } from '@/features/auth'

// ============================================================================
// Return Type
// ============================================================================

export interface UseTeamMembersReturn {
    /** Current members of the selected team */
    members: TeamMember[]
    /** All users (for add member dropdown) */
    users: User[]
    /** Users available to add (not already in team, role=user|leader) */
    availableUsers: User[]
    /** Currently selected user IDs in the add member control */
    selectedUserIds: string[]
    /** Update selected user IDs */
    setSelectedUserIds: (ids: string[]) => void
    /** Error message from add member operation */
    addMemberError: string | null
    /** Load members for a specific team */
    loadMembers: (teamId: string) => Promise<void>
    /** Ensure users are loaded (lazy fetch) */
    ensureUsersLoaded: () => void
    /** Add selected users to a team */
    addMembers: (teamId: string) => Promise<void>
    /** Remove a member from a team */
    removeMember: (teamId: string, userId: string) => Promise<void>
    /** Reset member state */
    reset: () => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook for managing team member listing and add/remove operations.
 * @param onTeamsChanged - Callback to refresh team list after member changes.
 * @returns {UseTeamMembersReturn} Member state and handlers.
 */
export const useTeamMembers = (onTeamsChanged: () => void): UseTeamMembersReturn => {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const queryClient = useQueryClient()

    // Local UI state
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
    const [addMemberError, setAddMemberError] = useState<string | null>(null)
    const [usersEnabled, setUsersEnabled] = useState(false)

    // Fetch members for the selected team
    const membersQuery = useQuery({
        queryKey: queryKeys.teams.members(selectedTeamId ?? ''),
        queryFn: () => teamApi.getTeamMembers(selectedTeamId!),
        // Only fetch when a team is selected
        enabled: !!selectedTeamId,
    })

    // Lazy-fetch all users (enabled when ensureUsersLoaded is called)
    const usersQuery = useQuery({
        queryKey: queryKeys.users.list(),
        queryFn: () => userApi.getUsers(),
        enabled: usersEnabled,
    })

    // Resolved data
    const members = membersQuery.data ?? []
    const users = usersQuery.data ?? []

    /** @description Users available to add — not already members and role is user or leader. */
    const availableUsers = users.filter(user =>
        (user.role === 'user' || user.role === 'leader') &&
        !members.some(member => member.id === user.id)
    )

    /**
     * @description Load members for a specific team by updating the selected team ID.
     * @param teamId - The team ID to load members for.
     */
    const loadMembers = async (teamId: string) => {
        setSelectedTeamId(teamId)
        // If team changed, invalidate to refetch
        await queryClient.invalidateQueries({ queryKey: queryKeys.teams.members(teamId) })
    }

    /** @description Trigger lazy loading of the users list. */
    const ensureUsersLoaded = () => {
        setUsersEnabled(true)
    }

    // Add members mutation
    const addMembersMutation = useMutation({
        mutationKey: ['create', 'team-members'],
        mutationFn: ({ teamId, userIds }: { teamId: string; userIds: string[] }) =>
            teamApi.addMembers(teamId, userIds),
        onSuccess: (_data, variables) => {
            globalMessage.success(t('iam.teams.addMemberSuccess'))
            setSelectedUserIds([])
            // Refetch members for this team
            queryClient.invalidateQueries({ queryKey: queryKeys.teams.members(variables.teamId) })
            // Notify parent to refresh teams
            onTeamsChanged()
        },
    })

    // Remove member mutation
    const removeMemberMutation = useMutation({
        mutationKey: ['delete', 'team-member'],
        mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
            teamApi.removeMember(teamId, userId),
        onSuccess: (_data, variables) => {
            globalMessage.success(t('iam.teams.removeMemberSuccess'))
            // Refetch members for this team
            queryClient.invalidateQueries({ queryKey: queryKeys.teams.members(variables.teamId) })
            // Notify parent to refresh teams
            onTeamsChanged()
        },
    })

    /**
     * @description Add selected users as members to a team.
     * @param teamId - The team ID to add members to.
     */
    const addMembers = async (teamId: string) => {
        setAddMemberError(null)
        if (selectedUserIds.length === 0) return
        try {
            await addMembersMutation.mutateAsync({ teamId, userIds: selectedUserIds })
        } catch (error) {
            console.error('Failed to add member:', error)
            setAddMemberError(error instanceof Error ? error.message : t('iam.teams.addMemberError'))
        }
    }

    /**
     * @description Remove a member with confirmation dialog.
     * @param teamId - The team ID.
     * @param userId - The user ID to remove.
     */
    const removeMember = async (teamId: string, userId: string) => {
        // Show confirmation before removing
        const confirmed = await confirm({ message: t('common.confirmDelete'), variant: 'danger' })
        if (!confirmed) return
        await removeMemberMutation.mutateAsync({ teamId, userId })
    }

    /** @description Reset all member-related state. */
    const reset = () => {
        setSelectedTeamId(null)
        setSelectedUserIds([])
        setAddMemberError(null)
    }

    return {
        members,
        users,
        availableUsers,
        selectedUserIds,
        setSelectedUserIds,
        addMemberError,
        loadMembers,
        ensureUsersLoaded,
        addMembers,
        removeMember,
        reset,
    }
}
