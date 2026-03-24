/**
 * Team controller: CRUD for teams and membership management.
 * Ensures audit context (user/email/ip) is passed into service layer for logging.
 */
import { Request, Response } from 'express'
import { teamService } from '@/modules/teams/services/team.service.js'
import { log } from '@/shared/services/logger.service.js'
import { getClientIp } from '@/shared/utils/ip.js'

/**
 * @description CRUD controller for teams and membership management with audit context propagation
 */
export class TeamController {
  /**
   * @description Retrieve all teams with member count and leader information
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  async getTeams(req: Request, res: Response): Promise<void> {
    try {
      // Fetch all teams from service
      const teams = await teamService.getAllTeams()
      res.json(teams)
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to fetch teams', { error: String(error) })
      res.status(500).json({ error: 'Failed to fetch teams' })
    }
  }

  /**
   * @description Create a new team with optional metadata and audit logging
   * @param {Request} req - Express request object with team data in body (name, project_name, description)
   * @param {Response} res - Express response object (201 Created)
   * @returns {Promise<void>}
   */
  async createTeam(req: Request, res: Response): Promise<void> {
    try {
      // Capture user context for audit
      const user = req.user ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) } : undefined
      // Create team via service
      const team = await teamService.createTeam(req.body, user)
      res.status(201).json(team)
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to create team', { error: String(error) })
      res.status(500).json({ error: 'Failed to create team' })
    }
  }

  /**
   * @description Update an existing team's name, project, or description with audit logging
   * @param {Request} req - Express request object with team id in params and update fields in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  async updateTeam(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    // Validate team ID
    if (!id) {
      res.status(400).json({ error: 'Team ID is required' })
      return
    }
    try {
      // Capture user context for audit
      const user = req.user ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) } : undefined
      // Update team via service
      const team = await teamService.updateTeam(id, req.body, user)
      // Handle not found
      if (!team) {
        res.status(404).json({ error: 'Team not found' })
        return
      }
      res.json(team)
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to update team', { error: String(error) })
      res.status(500).json({ error: 'Failed to update team' })
    }
  }

  /**
   * @description Delete a team and cascade member cleanup with audit logging
   * @param {Request} req - Express request object with team id in params
   * @param {Response} res - Express response object (204 No Content)
   * @returns {Promise<void>}
   */
  async deleteTeam(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    // Validate team ID
    if (!id) {
      res.status(400).json({ error: 'Team ID is required' })
      return
    }
    try {
      // Capture user context for audit
      const user = req.user ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) } : undefined
      // Delete team via service
      await teamService.deleteTeam(id, user)
      res.status(204).send()
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to delete team', { error: String(error) })
      res.status(500).json({ error: 'Failed to delete team' })
    }
  }

  /**
   * @description Retrieve all members of a specific team with user details and membership roles
   * @param {Request} req - Express request object with team id in params
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  async getTeamMembers(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    // Validate team ID
    if (!id) {
      res.status(400).json({ error: 'Team ID is required' })
      return
    }
    try {
      // Fetch members from service
      const members = await teamService.getTeamMembers(id)
      res.json(members)
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to fetch team members', { error: String(error) })
      res.status(500).json({ error: 'Failed to fetch team members' })
    }
  }

  /**
   * @description Add one or more members to a team with automatic role assignment based on their global role
   * @param {Request} req - Express request object with team id in params and userId/userIds in body
   * @param {Response} res - Express response object (201 Created)
   * @returns {Promise<any>}
   */
  async addMembers(req: Request, res: Response): Promise<any> {
    try {
      const teamId = req.params.id
      // Validate team ID
      if (!teamId) {
        return res.status(400).json({ error: 'Team ID is required' })
      }

      const { userId, userIds } = req.body
      // Support both single userId and batch userIds for flexibility
      const idsToAdd = userIds || (userId ? [userId] : [])

      if (idsToAdd.length === 0) {
        return res.status(400).json({ error: 'User ID(s) are required' })
      }

      // Capture user context for audit
      const user = req.user ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) } : undefined
      // Add members via service
      await teamService.addMembersWithAutoRole(teamId, idsToAdd, user)
      return res.status(201).json({ message: 'Member(s) added successfully' })
    } catch (error: any) {
      const message = String(error.message || error)
      log.error('Error adding team member:', { error: message })

      // Handle specific business errors
      if (message.includes('Administrators cannot be added')) {
        return res.status(400).json({ error: 'Administrators cannot be added to teams' })
      }
      if (message.includes('No valid users found') || message.includes('User not found')) {
        return res.status(404).json({ error: message })
      }
      return res.status(500).json({ error: 'Failed to add team member' })
    }
  }

  /**
   * @description Remove a specific member from a team with audit logging
   * @param {Request} req - Express request object with team id and userId in params
   * @param {Response} res - Express response object (204 No Content)
   * @returns {Promise<void>}
   */
  async removeMember(req: Request, res: Response): Promise<void> {
    const { id, userId } = req.params
    // Validate parameters
    if (!id || !userId) {
      res.status(400).json({ error: 'Team ID and User ID are required' })
      return
    }
    try {
      // Capture user context for audit
      const user = req.user ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) } : undefined
      // Remove member via service
      await teamService.removeUserFromTeam(id, userId, user)
      res.status(204).send()
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to remove member from team', { error: String(error) })
      res.status(500).json({ error: 'Failed to remove member from team' })
    }
  }

  /**
   * @description Grant permissions to all members of a team by merging into their user profiles
   * @param {Request} req - Express request object with team id in params and permissions array in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  async grantPermissions(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const { permissions } = req.body

    // Validate parameters
    if (!id) {
      res.status(400).json({ error: 'Team ID is required' })
      return
    }
    if (!permissions || !Array.isArray(permissions)) {
      res.status(400).json({ error: 'Permissions array is required' })
      return
    }

    try {
      // Capture user context for audit
      const user = req.user ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) } : undefined
      // Grant permissions via service
      await teamService.grantPermissionsToTeam(id, permissions, user)
      res.json({ message: 'Permissions granted successfully' })
    } catch (error) {
      // Log error and return 500 status
      log.error('Failed to grant permissions to team', { error: String(error) })
      res.status(500).json({ error: 'Failed to grant permissions' })
    }
  }
}
