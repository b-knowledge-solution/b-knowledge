/**
 * @fileoverview Barrel file for the audit feature.
 * Exports page component, types, API, and query hooks for external consumption.
 * @module features/audit
 */

// Page
export { default as AuditLogPage } from './pages/AuditLogPage'

// Types
export type {
    AuditLogEntry,
    AuditPagination,
    AuditLogResponse,
    AuditFilters,
} from './types/audit.types'

// API (for potential reuse in other features)
export { auditApi } from './api/auditApi'

// Query hooks
export {
    useAuditLogsQuery,
    useAuditActionsQuery,
    useAuditResourceTypesQuery,
    useAuditInvalidation,
} from './api/auditQueries'
