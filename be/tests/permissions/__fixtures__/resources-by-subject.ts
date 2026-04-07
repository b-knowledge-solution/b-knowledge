/**
 * @fileoverview Representative resource-id map per CASL subject.
 *
 * This map exists ONLY to drive the Phase 2 parity-matrix iteration in
 * `iterateMatrix`. The values are NOT real database rows — they are stable,
 * arbitrary strings that get passed to `ability.can(action, subject, { id })`
 * so the V1 vs V2 regression tests can verify rule conditions match for
 * instance-level checks.
 *
 * Every subject mentioned anywhere in `getAllPermissions()` MUST appear here.
 * Subjects with an empty array represent CASL class-level checks only
 * (no instance-level conditions to verify).
 *
 * @module tests/permissions/__fixtures__/resources-by-subject
 */

import { PermissionSubjects } from '@/shared/constants/permissions.js'

/**
 * @description Map of CASL subject name -> representative resource ids.
 *
 * Sourced exhaustively from the 21 module `<feature>.permissions.ts` files
 * via the `PermissionSubjects` constant union. Empty arrays mean class-level
 * CASL checks only (no instance ids to test against).
 */
export const resourcesBySubject: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // Resource-bearing subjects: at least one fixture id so instance-level rules are exercised.
  [PermissionSubjects.KnowledgeBase]: ['fixture-kb-1', 'fixture-kb-2'],
  [PermissionSubjects.DocumentCategory]: ['fixture-cat-1'],
  [PermissionSubjects.Document]: ['fixture-doc-1'],
  [PermissionSubjects.Dataset]: ['fixture-ds-1'],
  [PermissionSubjects.Chunk]: ['fixture-chunk-1'],
  [PermissionSubjects.ChatAssistant]: ['fixture-chat-1'],
  [PermissionSubjects.SearchApp]: ['fixture-search-1'],
  [PermissionSubjects.User]: ['fixture-user-1'],
  [PermissionSubjects.Team]: ['fixture-team-1'],
  [PermissionSubjects.Agent]: ['fixture-agent-1'],
  [PermissionSubjects.Memory]: ['fixture-memory-1'],
  [PermissionSubjects.LlmProvider]: ['fixture-llm-1'],
  [PermissionSubjects.Glossary]: ['fixture-gloss-1'],
  [PermissionSubjects.Broadcast]: ['fixture-broadcast-1'],
  [PermissionSubjects.SystemTool]: ['fixture-tool-1'],
  [PermissionSubjects.ApiKey]: ['fixture-apikey-1'],
  [PermissionSubjects.Feedback]: ['fixture-feedback-1'],
  [PermissionSubjects.SyncConnector]: ['fixture-sync-1'],

  // Class-level only subjects: no per-row resource ids — CASL checks at the type level.
  [PermissionSubjects.AuditLog]: [],
  [PermissionSubjects.System]: [],
  [PermissionSubjects.SystemHistory]: [],
  [PermissionSubjects.Dashboard]: [],
  [PermissionSubjects.CodeGraph]: [],
  [PermissionSubjects.Preview]: [],
  [PermissionSubjects.UserHistory]: [],
  // P3.0a — permissions catalog management is admin-only class-level; no per-row checks.
  [PermissionSubjects.PermissionCatalog]: [],
})
