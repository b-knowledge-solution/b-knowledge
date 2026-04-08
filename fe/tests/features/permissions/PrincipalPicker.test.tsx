/**
 * @fileoverview Unit tests for PrincipalPicker pure helpers + constants.
 *
 * NOTE: Component-tree rendering is avoided here because cmdk + Radix
 * primitives interact poorly with babel-plugin-react-compiler under jsdom
 * (see fe/tests/features/datasets/ChangeParserDialog.test.tsx for the same
 * pattern). Logic is exercised through the exported pure helpers
 * `buildPrincipalList` and `filterPrincipals` which mirror the in-component
 * filter chain 1:1.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  PRINCIPAL_TYPE_USER,
  PRINCIPAL_TYPE_TEAM,
  PRINCIPAL_TYPE_ROLE,
  FILTER_ALL,
  ROLE_PRINCIPALS,
  buildPrincipalList,
  filterPrincipals,
  type Principal,
  type PickerUser,
  type PickerTeam,
} from '@/features/permissions/components/PrincipalPicker'
import { UserRole } from '@/constants/roles'

const USERS: PickerUser[] = [
  { id: 'u1', displayName: 'Alice', email: 'alice@example.com' },
  { id: 'u2', displayName: 'Bob', email: 'bob@example.com' },
]

const TEAMS: PickerTeam[] = [
  { id: 't1', name: 'Engineering' },
  { id: 't2', name: 'Marketing' },
]

describe('PrincipalPicker — buildPrincipalList', () => {
  it('Test 1: merges users, teams, and roles into a tagged list', () => {
    const merged = buildPrincipalList(USERS, TEAMS)
    // 2 users + 2 teams + 4 roles
    expect(merged).toHaveLength(2 + 2 + ROLE_PRINCIPALS.length)
    expect(merged.filter((p) => p.type === PRINCIPAL_TYPE_USER)).toHaveLength(2)
    expect(merged.filter((p) => p.type === PRINCIPAL_TYPE_TEAM)).toHaveLength(2)
    expect(merged.filter((p) => p.type === PRINCIPAL_TYPE_ROLE)).toHaveLength(
      ROLE_PRINCIPALS.length
    )
  })
})

describe('PrincipalPicker — filterPrincipals', () => {
  const merged = buildPrincipalList(USERS, TEAMS)
  const empty = new Set<string>()

  it('Test 2: case-insensitive substring filter on label', () => {
    const out = filterPrincipals(merged, { excluded: empty, filter: FILTER_ALL, query: 'ALI' })
    expect(out.map((p) => p.label)).toEqual(['Alice'])
  })

  it('Test 3a: chip=Users restricts to users only', () => {
    const out = filterPrincipals(merged, {
      excluded: empty,
      filter: PRINCIPAL_TYPE_USER,
      query: '',
    })
    expect(out.every((p) => p.type === PRINCIPAL_TYPE_USER)).toBe(true)
    expect(out).toHaveLength(2)
  })

  it('Test 3b: chip=All restores the full list', () => {
    const out = filterPrincipals(merged, { excluded: empty, filter: FILTER_ALL, query: '' })
    expect(out).toHaveLength(merged.length)
  })

  it('Test 4: onSelect contract — selecting a row yields { type, id, label }', () => {
    // Simulate a click handler that delegates to the consumer's onSelect.
    const onSelect = vi.fn<(p: Principal) => void>()
    const target = merged.find((p) => p.label === 'Engineering')!
    onSelect(target)
    expect(onSelect).toHaveBeenCalledWith({
      type: PRINCIPAL_TYPE_TEAM,
      id: 't1',
      label: 'Engineering',
    })
  })

  it('Test 5: ROLE_PRINCIPALS sources from @/constants/roles, not bare strings', () => {
    const ids = ROLE_PRINCIPALS.map((r) => r.id)
    expect(ids).toContain(UserRole.SUPER_ADMIN)
    expect(ids).toContain(UserRole.ADMIN)
    expect(ids).toContain(UserRole.LEADER)
    expect(ids).toContain(UserRole.MEMBER)
  })
})
