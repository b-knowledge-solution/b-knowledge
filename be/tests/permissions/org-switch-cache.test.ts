/**
 * @fileoverview Phase 3 P3.0c — Org-switch ability cache invalidation regression (R-12).
 *
 * R-12 risk: when a user switches their `current_org_id` via the `switchOrg`
 * handler, the V2 CASL ability cached in Redis under that session ID was
 * built against the PREVIOUS org context. V2 ability rules embed
 * `tenant_id` conditions in the rule conditions themselves, so a stale
 * cache from org A would silently grant org A's permissions while the
 * user is operating in org B — a cross-tenant permission leak persisting
 * for up to the cache TTL (7 days by default).
 *
 * Verdict (Phase 3 P3.0c investigation): **A — already mitigated**.
 * `auth.controller.ts::switchOrg` calls `abilityService.invalidateAbility`
 * with the request's session ID immediately after verifying the new org
 * membership and before mutating session state, then rebuilds and re-caches
 * a fresh ability for the new org context.
 *
 * This test is a structural tripwire: it reads the controller source and
 * asserts the invalidation call is present in the right place, in the right
 * order. A runtime spy-based integration test would require mocking the
 * full Express/session stack plus authService and abilityService — the
 * repo has no such harness for permissions tests today (see
 * `cache-prefix.test.ts` for the same source-inspection rationale). The
 * structural assertion is sufficient because every cache read/write in
 * `ability.service.ts` derives its key from `req.sessionID`, so a missing
 * `invalidateAbility(req.sessionID)` call in the switch path is the only
 * way R-12 can re-emerge.
 *
 * @see Phase 3 PLAN.md P3.0c
 * @see Phase 1 3-RESEARCH.md §1 / Red Flag #1
 * @see be/src/modules/auth/auth.controller.ts switchOrg
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Read the controller source once. Path is resolved from the test file's
// directory so the test is invariant to the vitest cwd.
const controllerSource = readFileSync(
  resolve(__dirname, '../../src/modules/auth/auth.controller.ts'),
  'utf8',
)

/**
 * @description Extracts the body of the `switchOrg` async method from the
 * controller source so assertions are scoped to the right handler and do
 * not accidentally match invalidation calls elsewhere in the file (e.g.
 * a future logout handler).
 * @returns {string} Source text from `async switchOrg(` to the matching closing brace.
 */
function extractSwitchOrgBody(): string {
  const startIdx = controllerSource.indexOf('async switchOrg(')
  if (startIdx === -1) {
    throw new Error('switchOrg handler not found in auth.controller.ts')
  }
  // Walk forward until brace depth returns to zero — gives us the full
  // method body without depending on a specific line count.
  const openBraceIdx = controllerSource.indexOf('{', startIdx)
  let depth = 0
  for (let i = openBraceIdx; i < controllerSource.length; i++) {
    const ch = controllerSource[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return controllerSource.slice(startIdx, i + 1)
    }
  }
  throw new Error('Unbalanced braces while extracting switchOrg body')
}

describe('P3.0c org-switch ability cache invalidation (R-12 mitigation)', () => {
  const switchOrgBody = extractSwitchOrgBody()

  it('switchOrg handler exists in auth.controller.ts', () => {
    // Tripwire: if the handler is renamed or moved, this test fails loudly
    // so the rename author is forced to revisit the R-12 contract.
    expect(switchOrgBody).toContain('async switchOrg(')
  })

  it('invalidates the ability cache for the current session id', () => {
    // The exact call shape required to mitigate R-12. We require the
    // session ID to come from `req.sessionID` (the same key the cache
    // helpers in ability.service.ts use) — passing any other identifier
    // would silently miss the cached entry.
    expect(switchOrgBody).toMatch(
      /abilityService\.invalidateAbility\(\s*req\.sessionID\s*\)/,
    )
  })

  it('rebuilds and re-caches the ability after invalidation', () => {
    // Belt-and-braces: even if invalidation works, failing to re-cache
    // would force every subsequent request to rebuild the ability from
    // the DB, masking real bugs as performance regressions. Confirm both
    // build and cache calls are present in the same handler.
    expect(switchOrgBody).toMatch(/abilityService\.buildAbilityFor\(/)
    expect(switchOrgBody).toMatch(
      /abilityService\.cacheAbility\(\s*req\.sessionID\s*,/,
    )
  })

  it('invalidates BEFORE rebuilding so the new ability is never overwritten by a stale read', () => {
    // Order matters: invalidate -> build -> cache. If build/cache ran
    // before invalidate, a concurrent request on the same session could
    // observe the new entry only to have it wiped immediately after.
    const invalidateIdx = switchOrgBody.search(/invalidateAbility\(/)
    const buildIdx = switchOrgBody.search(/buildAbilityFor\(/)
    const cacheIdx = switchOrgBody.search(/cacheAbility\(/)
    expect(invalidateIdx).toBeGreaterThan(-1)
    expect(buildIdx).toBeGreaterThan(invalidateIdx)
    expect(cacheIdx).toBeGreaterThan(buildIdx)
  })

  it('uses the new orgId (not the previous session value) when rebuilding the ability', () => {
    // The rebuilt ability must be scoped to the freshly-validated `orgId`
    // from the request body. If this regresses to `req.session.currentOrgId`
    // captured before mutation, the cache would be repopulated with the
    // OLD context and R-12 would re-emerge in the very next request.
    expect(switchOrgBody).toMatch(/current_org_id:\s*orgId/)
  })
})
