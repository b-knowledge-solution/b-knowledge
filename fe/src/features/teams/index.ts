/**
 * @fileoverview Barrel file for the teams feature.
 * Exports page, types, and API for external consumption.
 * @module features/teams
 */

// Page
export { default as TeamManagementPage } from './pages/TeamManagementPage'

// Types
export type {
    Team,
    TeamMember,
    CreateTeamDTO,
    UpdateTeamDTO,
} from './types/team.types'

// API
export { teamApi } from './api/teamApi'

// Query Hooks
export { useTeams, useTeamMembers } from './api/teamQueries'
export type { UseTeamsReturn, UseTeamMembersReturn } from './api/teamQueries'
