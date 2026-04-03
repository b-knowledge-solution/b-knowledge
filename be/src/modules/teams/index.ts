/**
 * @fileoverview Barrel exports for the teams module.
 * Exposes team routes, service singleton, and service class as the module's public API.
 * @module modules/teams
 */
export { default as teamRoutes } from './routes/teams.routes.js'
export { teamService, TeamService } from './services/team.service.js'
