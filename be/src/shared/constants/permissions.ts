/**
 * @description Shared constants for the permission registry and persistence layer.
 * Centralizes table names, log codes, and reusable label/subject defaults so that
 * no string literal is duplicated across the registry helper, models, services,
 * and module-level `<feature>.permissions.ts` files.
 *
 * Cross-language note: these values are TypeScript-only — Python workers do not
 * touch the permission catalog. If that changes, mirror them in a Python module
 * and add a sync comment here.
 */

// ── Persistence (table names) ──────────────────────────────────────

/** Catalog table that stores every permission key registered at boot. */
export const PERMISSIONS_TABLE = 'permissions'

/** Join table mapping legacy roles to permission keys (day-one seed). */
export const ROLE_PERMISSIONS_TABLE = 'role_permissions'

/** Per-user grant/revoke overrides on top of role defaults. */
export const USER_PERMISSION_OVERRIDES_TABLE = 'user_permission_overrides'

/** Resource-scoped grants (e.g. KB/category/dataset row-level access). */
export const RESOURCE_GRANTS_TABLE = 'resource_grants'

// ── Boot sync log codes ────────────────────────────────────────────

/**
 * @description Structured log codes emitted by `syncPermissionRegistry` so that
 * dashboards and audit pipelines can filter on stable identifiers rather than
 * grepping free-form messages.
 */
export enum SyncLogCode {
  Inserted = 'permissions.sync.inserted',
  Updated = 'permissions.sync.updated',
  Removed = 'permissions.sync.removed',
  NoOp = 'permissions.sync.noop',
  /**
   * Raised when `getAllPermissions()` returns an empty array at sync time.
   * This is always a developer error (the eager imports in
   * `shared/permissions/index.ts` failed to fire) — never a legitimate runtime state.
   */
  EMPTY_REGISTRY = 'permissions.sync.empty_registry',
}

// ── Registry key shape ─────────────────────────────────────────────

/**
 * Separator between the feature slug and the action slug in a permission key.
 * Example: `knowledge_base` + `.` + `view` => `knowledge_base.view`.
 */
export const PERMISSION_KEY_SEPARATOR = '.'

/**
 * Regex describing the canonical shape of a permission key:
 * `<lowercase_snake_feature>.<lowercase_snake_action>`. Used by both the
 * registry helper and the unit tests to enforce the convention.
 */
export const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

// ── Common CASL subjects (used across multiple modules) ───────────

/**
 * @description Canonical CASL subject names used by the Phase 2 ability builder.
 * Centralized here so that feature files reference a single source of truth and
 * a future rename only touches this file. New subjects MAY be introduced inline
 * in module files when they are not shared, but anything reused SHOULD live here.
 */
export const PermissionSubjects = {
  KnowledgeBase: 'KnowledgeBase',
  DocumentCategory: 'DocumentCategory',
  Document: 'Document',
  Dataset: 'Dataset',
  Chunk: 'Chunk',
  ChatAssistant: 'ChatAssistant',
  SearchApp: 'SearchApp',
  User: 'User',
  Team: 'Team',
  Agent: 'Agent',
  Memory: 'Memory',
  AuditLog: 'AuditLog',
  System: 'System',
  SystemTool: 'SystemTool',
  SystemHistory: 'SystemHistory',
  LlmProvider: 'LlmProvider',
  Glossary: 'Glossary',
  Broadcast: 'Broadcast',
  Dashboard: 'Dashboard',
  CodeGraph: 'CodeGraph',
  ApiKey: 'ApiKey',
  Feedback: 'Feedback',
  Preview: 'Preview',
  UserHistory: 'UserHistory',
  SyncConnector: 'SyncConnector',
} as const

export type PermissionSubject =
  (typeof PermissionSubjects)[keyof typeof PermissionSubjects]

// ── Ability cache ──────────────────────────────────────────────────

/**
 * @description Redis key prefix for cached CASL ability rules.
 * Bumped from `'ability:'` to `'ability:v2:'` in Phase 2 so that any cached
 * V1-shaped rules from before the cutover naturally fall out of the cache
 * (the new prefix means lookups never find the old keys). This is the R-2
 * cache flush mitigation — instead of explicitly invalidating millions of
 * keys at deploy time, we let them expire on their natural TTL while the
 * new code path writes to a fresh namespace. The new prefix is a strict
 * extension of the old key namespace (old keys under `ability:<sessionId>`
 * are not readable by the new code path, which looks under
 * `ability:v2:<sessionId>`), so the same R-2 outcome holds even though the
 * pre-bump literal was `'ability:'` rather than `'ability:v1:'` as the
 * original plan wording suggested.
 * @see Phase 2 PLAN.md P2.5, RISKS.md R-2
 */
export const ABILITY_CACHE_PREFIX = 'ability:v2:'
