
/**
 * Team Routes
 * Manages team lifecycle and membership.
 */
import { Router } from 'express'
import { TeamController } from '../controllers/teams.controller.js'
import { requirePermission } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import { createTeamSchema, updateTeamSchema, addMembersSchema, grantPermissionsSchema, uuidParamSchema, memberParamSchema } from '../schemas/teams.schemas.js'

const router = Router()
const controller = new TeamController()

/**
 * @route GET /api/teams
 * @description List all teams.
 * @access Private (Teams View)
 */
// List all teams for administration
router.get('/', requirePermission('teams.view'), controller.getTeams.bind(controller))

/**
 * @route POST /api/teams
 * @description Create a new team shell with optional metadata.
 * @access Private (Teams Create)
 */
// Create new team group
router.post('/', requirePermission('teams.create'), validate(createTeamSchema), controller.createTeam.bind(controller))

/**
 * @route PUT /api/teams/:id
 * @description Update team name/metadata.
 * @access Private (Teams Edit)
 */
// Update team details
router.put('/:id', requirePermission('teams.edit'), validate({ params: uuidParamSchema, body: updateTeamSchema }), controller.updateTeam.bind(controller))

/**
 * @route DELETE /api/teams/:id
 * @description Delete a team (cascades member cleanup in service layer).
 * @access Private (Teams Delete)
 */
// Delete team and clean up memberships
router.delete('/:id', requirePermission('teams.delete'), validate({ params: uuidParamSchema }), controller.deleteTeam.bind(controller))

/**
 * @route GET /api/teams/:id/members
 * @description Retrieve current team members.
 * @access Private (Teams View)
 */
// List users belonging to a team
router.get('/:id/members', requirePermission('teams.view'), controller.getTeamMembers.bind(controller))

/**
 * @route POST /api/teams/:id/members
 * @description Add members to a team.
 * @access Private (Teams Members)
 */
// Assign users to a team
router.post('/:id/members', requirePermission('teams.members'), validate({ params: uuidParamSchema, body: addMembersSchema }), controller.addMembers.bind(controller))

/**
 * @route DELETE /api/teams/:id/members/:userId
 * @description Remove a member from a team.
 * @access Private (Teams Members)
 */
// Remove user from team
router.delete('/:id/members/:userId', requirePermission('teams.members'), validate({ params: memberParamSchema }), controller.removeMember.bind(controller))

/**
 * @route GET /api/teams/:id/permissions
 * @description Retrieve team-level permission keys stored on the team record.
 * @access Private (Teams View)
 */
// Fetch stored permission keys for a team
router.get('/:id/permissions', requirePermission('teams.view'), validate({ params: uuidParamSchema }), controller.getPermissions.bind(controller))

/**
 * @route POST /api/teams/:id/permissions
 * @description Grant team-level permissions (stored per-team).
 * @access Private (Teams Permissions)
 */
// Update team capability flags
router.post('/:id/permissions', requirePermission('teams.permissions'), validate({ params: uuidParamSchema, body: grantPermissionsSchema }), controller.grantPermissions.bind(controller))

export default router
