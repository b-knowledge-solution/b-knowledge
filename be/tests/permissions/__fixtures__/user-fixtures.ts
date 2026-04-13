/**
 * @fileoverview Canonical user-context fixtures for Phase 2 ability regression tests.
 *
 * These four `AbilityUserContext` objects feed every parity-matrix test in the
 * Phase 2 V1↔V2 ability builder regression suite (P2.1, P2.4). Their `id`,
 * `current_org_id`, and role values are FROZEN — changing them would invalidate
 * every captured V1 snapshot and force a re-baseline.
 *
 * Test-only: never imported by production code.
 *
 * @module tests/permissions/__fixtures__/user-fixtures
 */

import type { AbilityUserContext } from '@/shared/services/ability.service.js'
import { UserRole } from '@/shared/constants/index.js'

/** Fixed org id shared by every fixture so tenant-scoped rule conditions are deterministic. */
const FIXTURE_ORG_ID = 'org-fixture-1'

/**
 * @description Super-admin fixture — `is_superuser=true` exercises the unconditional `manage all` branch.
 */
export const superAdminFixture: AbilityUserContext = Object.freeze({
  // Stable identifier so snapshots never flap on a regenerated UUID.
  id: 'fixture-super',
  role: UserRole.SUPER_ADMIN,
  is_superuser: true,
  current_org_id: FIXTURE_ORG_ID,
})

/**
 * @description Admin fixture — exercises the org-scoped `manage` branch (User, Dataset, Document, etc.).
 */
export const adminFixture: AbilityUserContext = Object.freeze({
  id: 'fixture-admin',
  role: UserRole.ADMIN,
  is_superuser: false,
  current_org_id: FIXTURE_ORG_ID,
})

/**
 * @description Leader fixture — exercises the leader CRUD branch (create/update/delete Dataset etc.).
 */
export const leaderFixture: AbilityUserContext = Object.freeze({
  id: 'fixture-leader',
  role: UserRole.LEADER,
  is_superuser: false,
  current_org_id: FIXTURE_ORG_ID,
})

/**
 * @description Plain user fixture — exercises the read-only base branch (Dataset/Document read).
 */
export const userFixture: AbilityUserContext = Object.freeze({
  id: 'fixture-user',
  role: UserRole.USER,
  is_superuser: false,
  current_org_id: FIXTURE_ORG_ID,
})

/**
 * @description Ordered tuple of all four canonical fixtures. Used by the parity-matrix
 * iterator so every regression test runs against the same role coverage in the same order.
 */
export const ALL_FIXTURES = [
  superAdminFixture,
  adminFixture,
  leaderFixture,
  userFixture,
] as const
