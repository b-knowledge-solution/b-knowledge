/**
 * @fileoverview Unit tests for the parity-matrix iterator.
 *
 * Verifies cardinality, class-level handling, uniqueness, and field population
 * against the live permission registry.
 *
 * @module tests/permissions/iterateMatrix.test
 */

import { describe, it, expect } from 'vitest'
import { getAllPermissions } from '@/shared/permissions/index.js'
import { iterateMatrix, type MatrixTuple } from './__fixtures__/iterate-matrix.js'
import { ALL_FIXTURES } from './__fixtures__/user-fixtures.js'
import { resourcesBySubject } from './__fixtures__/resources-by-subject.js'

describe('iterateMatrix', () => {
  it('yields tuples for the full fixtures × permissions × resources cartesian product', () => {
    const tuples = Array.from(iterateMatrix(ALL_FIXTURES, resourcesBySubject))

    // Compute expected count: per permission, max(1, ids.length) tuples per fixture.
    const permissions = getAllPermissions()
    let perFixture = 0
    for (const p of permissions) {
      const ids = resourcesBySubject[p.subject] ?? []
      perFixture += Math.max(1, ids.length)
    }
    const expected = ALL_FIXTURES.length * perFixture

    expect(tuples.length).toBe(expected)
  })

  it('yields exactly one tuple with resourceId === null for class-level subjects', () => {
    // Build a tiny custom map: one subject with ids, one without.
    // We pick a real registry permission for each so the iterator finds them.
    const permissions = getAllPermissions()
    const classLevel = permissions.find((p) => (resourcesBySubject[p.subject] ?? []).length === 0)
    expect(classLevel, 'expected at least one class-level subject in the registry').toBeDefined()

    const tuples = Array.from(iterateMatrix([ALL_FIXTURES[0]!], resourcesBySubject))
    const matching = tuples.filter(
      (t) => t.permissionKey === classLevel!.key && t.resourceId === null,
    )
    expect(matching.length).toBe(1)
  })

  it('produces no duplicate tuples', () => {
    const tuples = Array.from(iterateMatrix(ALL_FIXTURES, resourcesBySubject))
    const keys = new Set<string>()
    for (const t of tuples) {
      const k = `${t.fixture.id}|${t.permissionKey}|${t.resourceId ?? '<null>'}`
      expect(keys.has(k), `duplicate tuple: ${k}`).toBe(false)
      keys.add(k)
    }
    expect(keys.size).toBe(tuples.length)
  })

  it('populates every required field on every yielded tuple', () => {
    const registryKeys = new Set(getAllPermissions().map((p) => p.key))
    const fixtureIds = new Set(ALL_FIXTURES.map((f) => f.id))

    for (const t of iterateMatrix(ALL_FIXTURES, resourcesBySubject) as Generator<MatrixTuple>) {
      expect(fixtureIds.has(t.fixture.id)).toBe(true)
      expect(typeof t.action).toBe('string')
      expect(t.action.length).toBeGreaterThan(0)
      expect(typeof t.subject).toBe('string')
      expect(t.subject.length).toBeGreaterThan(0)
      // resourceId is either a non-empty string or null.
      if (t.resourceId !== null) {
        expect(typeof t.resourceId).toBe('string')
        expect(t.resourceId.length).toBeGreaterThan(0)
      }
      // permissionKey must be a real registered key.
      expect(registryKeys.has(t.permissionKey)).toBe(true)
    }
  })

  it('every registry subject is represented in the resourcesBySubject map (exhaustiveness gate)', () => {
    // Hard requirement: if a registry subject is missing from the map, the parity
    // matrix in P2.4 would silently skip those tuples. Fail loudly here.
    const missing: string[] = []
    for (const p of getAllPermissions()) {
      if (!(p.subject in resourcesBySubject)) {
        missing.push(`${p.key} -> ${p.subject}`)
      }
    }
    expect(missing, `subjects missing from resourcesBySubject: ${missing.join(', ')}`).toEqual([])
  })
})
