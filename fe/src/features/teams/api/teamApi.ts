/**
 * @fileoverview API service for team management.
 * Migrated from raw fetch to shared apiFetch utility.
 * @module features/teams/api/teamApi
 */
import { api } from '@/lib/api'
import type { Team, TeamMember, CreateTeamDTO, UpdateTeamDTO } from '../types/team.types'

const BASE_URL = '/api/teams'

export const teamApi = {
    /**
     * Fetch all teams the current user has access to.
     * @returns List of teams.
     */
    getTeams: (): Promise<Team[]> =>
        api.get<Team[]>(BASE_URL),

    /**
     * Create a new team.
     * @param data - Team creation payload.
     * @returns The created team.
     */
    createTeam: (data: CreateTeamDTO): Promise<Team> =>
        api.post<Team>(BASE_URL, data),

    /**
     * Update an existing team.
     * @param id - Team ID.
     * @param data - Update payload.
     * @returns Updated team.
     */
    updateTeam: (id: string, data: UpdateTeamDTO): Promise<Team> =>
        api.put<Team>(`${BASE_URL}/${id}`, data),

    /**
     * Delete a team.
     * @param id - Team ID.
     */
    deleteTeam: (id: string): Promise<void> =>
        api.delete<void>(`${BASE_URL}/${id}`),

    /**
     * Get members of a team.
     * @param teamId - Team ID.
     * @returns List of team members.
     */
    getTeamMembers: (teamId: string): Promise<TeamMember[]> =>
        api.get<TeamMember[]>(`${BASE_URL}/${teamId}/members`),

    /**
     * Add members to a team.
     * @param teamId - Team ID.
     * @param userIds - Array of user IDs to add.
     */
    addMembers: (teamId: string, userIds: string[]): Promise<void> =>
        api.post<void>(`${BASE_URL}/${teamId}/members`, { userIds }),

    /**
     * Remove a member from a team.
     * @param teamId - Team ID.
     * @param userId - User ID to remove.
     */
    removeMember: (teamId: string, userId: string): Promise<void> =>
        api.delete<void>(`${BASE_URL}/${teamId}/members/${userId}`),

    /**
     * Grant permissions to a team.
     * @param teamId - Team ID.
     * @param permissions - List of permission strings.
     */
    grantPermissions: (teamId: string, permissions: string[]): Promise<void> =>
        api.post<void>(`${BASE_URL}/${teamId}/permissions`, { permissions }),

    /**
     * @description Fetch the stored permission keys for a specific team record.
     *   Calls GET /api/teams/:teamId/permissions.
     * @param {string} teamId - Team ID to fetch permissions for.
     * @returns {Promise<{permissions: string[]}>} Object containing the array of permission key strings.
     */
    getTeamPermissions: (teamId: string): Promise<{ permissions: string[] }> =>
        api.get<{ permissions: string[] }>(`${BASE_URL}/${teamId}/permissions`),

    /**
     * @description Replace the stored permission keys for a team with the provided array.
     *   Calls POST /api/teams/:teamId/permissions — uses existing endpoint with full replacement semantics.
     *   Keep `grantPermissions` as-is for backward compatibility; this method is the canonical
     *   PrincipalPermissionMatrix save path.
     * @param {string} teamId - Team ID to update permissions for.
     * @param {string[]} permissions - Complete new set of permission key strings.
     * @returns {Promise<void>}
     */
    setTeamPermissions: (teamId: string, permissions: string[]): Promise<void> =>
        api.post<void>(`${BASE_URL}/${teamId}/permissions`, { permissions }),
}
