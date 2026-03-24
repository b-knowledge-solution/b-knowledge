/**
 * @fileoverview Barrel exports for the audit module.
 * Exposes audit routes, service singleton, action/resource constants, and related types.
 * @module modules/audit
 */
export { default as auditRoutes } from './routes/audit.routes.js'
export { auditService, AuditAction, AuditResourceType } from './services/audit.service.js'
export type { AuditLogParams, AuditLogQueryParams, AuditLogResponse, AuditActionType, AuditResourceTypeValue } from './services/audit.service.js'
