/**
 * @fileoverview TanStack Query hooks for team management.
 * Provides query and mutation hooks for teams and team members.
 * @module features/teams/api/teamQueries
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { globalMessage } from '@/lib/globalMessage'
import { useConfirm } from '@/components/ConfirmDialog'
import { teamApi } from './teamApi'
import { userApi } from '@/features/users'
import { queryKeys } from '@/lib/queryKeys'
import type { Team, TeamMember, CreateTeamDTO, UpdateTeamDTO } from '../types/team.types'
import type { User } from '@/features/auth'

// ============================================================================
// useTeams
// ============================================================================

/**
 * @description Return type for the useTeams hook.
 */
export interface UseTeamsReturn {
    /** All teams */
    teams: Team[]
    /** Whether data is loading */
    loading: boolean
    /** Current search term */
    searchTerm: string
    /** Handle search input */
    handleSearch: (value: string) => void
    /** Current project filter value */
    projectFilter: string
    /** Handle project filter change */
    handleProjectFilter: (value: string) => void
    /** Unique project names for filter dropdown */
    uniqueProjects: string[]
    /** Filtered + paginated teams for display */
    paginatedTeams: Team[]
    /** Total count of filtered teams */
    filteredCount: number
    /** Current page */
    currentPage: number
    /** Page size */
    pageSize: number
    /** Handle pagination change */
    handlePaginationChange: (page: number, size: number) => void
    /** Create a new team */
    createTeam: (data: CreateTeamDTO) => Promise<boolean>
    /** Update an existing team */
    updateTeam: (id: string, data: UpdateTeamDTO) => Promise<boolean>
    /** Delete a team with confirmation */
    deleteTeam: (id: string) => Promise<void>
    /** Reload teams list */
    refresh: () => void
}

/**
 * @description Hook for managing the teams list with CRUD, filtering, and pagination.
 * @returns {UseTeamsReturn} Teams state and handlers.
 */
export const useTeams = (): UseTeamsReturn => {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const queryClient = useQueryClient()

    // Local UI state for filters and pagination
    const [searchTerm, setSearchTerm] = useState('')
    const [projectFilter, setProjectFilter] = useState('ALL')
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    // Fetch all teams via TanStack Query
    const teamsQuery = useQuery({
        queryKey: queryKeys.teams.list(),
        queryFn: () => teamApi.getTeams(),
    })

    // Resolved teams list
    const teams = teamsQuery.data ?? []

    /** @description Handle search input, reset to page 1. */
    const handleSearch = (value: string) => {
        setSearchTerm(value)
        setCurrentPage(1)
    }

    /** @description Handle project filter change, reset to page 1. */
    const handleProjectFilter = (value: string) => {
        setProjectFilter(value)
        setCurrentPage(1)
    }

    /** @description Handle pagination controls. */
    const handlePaginationChange = (page: number, size: number) => {
        setCurrentPage(page)
        setPageSize(size)
    }

    /** @description Unique project names for filter dropdown. */
    const uniqueProjects = Array.from(new Set(teams.map(t => t.project_name).filter(Boolean))) as string[]

    /** @description Filtered teams by search + project. */
    const filteredTeams = teams.filter(team => {
        // Match name or project name against search term
        const matchesSearch = team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            team.project_name?.toLowerCase().includes(searchTerm.toLowerCase())
        // Match project filter
        const matchesProject = projectFilter === 'ALL' || team.project_name === projectFilter
        return matchesSearch && matchesProject
    })

    /** @description Paginated slice of filtered teams. */
    const paginatedTeams = filteredTeams.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    // Create team mutation
    const createMutation = useMutation({
        mutationKey: ['create', 'team'],
        mutationFn: (data: CreateTeamDTO) => teamApi.createTeam(data),
        onSuccess: () => {
            globalMessage.success(t('common.createSuccess'))
            // Refetch teams list after creation
            queryClient.invalidateQueries({ queryKey: queryKeys.teams.list() })
        },
    })

    // Update team mutation
    const updateMutation = useMutation({
        mutationKey: ['update', 'team'],
        mutationFn: ({ id, data }: { id: string; data: UpdateTeamDTO }) => teamApi.updateTeam(id, data),
        onSuccess: () => {
            globalMessage.success(t('common.updateSuccess'))
            // Refetch teams list after update
            queryClient.invalidateQueries({ queryKey: queryKeys.teams.list() })
        },
    })

    // Delete team mutation
    const deleteMutation = useMutation({
        mutationKey: ['delete', 'team'],
        mutationFn: (id: string) => teamApi.deleteTeam(id),
        onSuccess: () => {
            globalMessage.success(t('common.deleteSuccess'))
            // Refetch teams list after deletion
            queryClient.invalidateQueries({ queryKey: queryKeys.teams.list() })
        },
    })

    /**
     * @description Create a team, returns true on success.
     * @param data - Team creation payload.
     * @returns Whether the creation succeeded.
     */
    const createTeam = async (data: CreateTeamDTO): Promise<boolean> => {
        try {
            await createMutation.mutateAsync(data)
            return true
        } catch (error: any) {
            const message = error?.response?.data?.error || error?.message || t('common.error')
            globalMessage.error(message)
            return false
        }
    }

    /**
     * @description Update a team, returns true on success.
     * @param id - Team ID.
     * @param data - Update payload.
     * @returns Whether the update succeeded.
     */
    const updateTeam = async (id: string, data: UpdateTeamDTO): Promise<boolean> => {
        try {
            await updateMutation.mutateAsync({ id, data })
            return true
        } catch (error: any) {
            const message = error?.response?.data?.error || error?.message || t('common.error')
            globalMessage.error(message)
            return false
        }
    }

    /**
     * @description Delete a team with confirm dialog.
     * @param id - Team ID to delete.
     */
    const deleteTeam = async (id: string) => {
        // Show confirmation dialog before deleting
        const confirmed = await confirm({ message: t('common.confirmDelete'), variant: 'danger' })
        if (!confirmed) return
        try {
            await deleteMutation.mutateAsync(id)
        } catch (error) {
            console.error('Failed to delete team:', error)
        }
    }

    /** @description Manually refresh the teams list. */
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.teams.list() })
    }

    return {
        teams,
        loading: teamsQuery.isLoading,
        searchTerm,
        handleSearch,
        projectFilter,
        handleProjectFilter,
        uniqueProjects,
        paginatedTeams,
        filteredCount: filteredTeams.length,
        currentPage,
        pageSize,
        handlePaginationChange,
        createTeam,
        updateTeam,
        deleteTeam,
        refresh,
    }
}

// ============================================================================
// useTeamMembers
// ============================================================================

/**
 * @description Return type for the useTeamMembers hook.
 */
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

// ============================================================================
// useTeamPermissions
// ============================================================================

/**
 * @description Fetch the stored permission keys for a specific team.
 * @param {string} teamId - The team ID to fetch permissions for.
 * @param {boolean} [enabled=true] - Whether the query is enabled.
 * @returns Query result with { permissions: string[] } payload.
 */
export function useTeamPermissions(teamId: string, enabled = true) {
    return useQuery({
        queryKey: queryKeys.teams.permissions(teamId),
        queryFn: () => teamApi.getTeamPermissions(teamId),
        enabled: !!teamId && enabled,
    })
}

/**
 * @description Mutation hook to replace a team's stored permission keys.
 *   Invalidates the team permissions cache on success.
 * @returns Mutation hook for setting team permissions.
 */
export function useSetTeamPermissions() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ teamId, permissions }: { teamId: string; permissions: string[] }) =>
            teamApi.setTeamPermissions(teamId, permissions),
        onSuccess: (_data, variables) => {
            // Invalidate the permissions cache for this specific team
            queryClient.invalidateQueries({ queryKey: queryKeys.teams.permissions(variables.teamId) })
        },
    })
}
