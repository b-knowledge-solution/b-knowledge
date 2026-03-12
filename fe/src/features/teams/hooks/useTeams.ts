/**
 * @fileoverview Hook for team list management, CRUD, filtering, and pagination.
 * Uses TanStack Query for data fetching and mutations.
 * @module features/teams/hooks/useTeams
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { globalMessage } from '@/app/App'
import { useConfirm } from '@/components/ConfirmDialog'
import { teamApi } from '../api/teamApi'
import type { Team, CreateTeamDTO, UpdateTeamDTO } from '../types/team.types'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Return Type
// ============================================================================

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

// ============================================================================
// Hook
// ============================================================================

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
