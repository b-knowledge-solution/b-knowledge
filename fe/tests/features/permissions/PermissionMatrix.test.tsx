/**
 * @fileoverview Unit tests for PermissionMatrix pure helpers (Phase 5 P5.1).
 *
 * The component itself is a thin wrapper over four pure helpers exported
 * from `PermissionMatrix.tsx`: `groupPermissionKeys`, `isCellChecked`,
 * `toggleInDirtyMap`, and `buildUpdatePayloads`. We test the helpers in node
 * env because rendering the component in jsdom transitively triggers a
 * shadcn/Radix + React Compiler interaction that hangs vitest — the same
 * pattern 5.2 (OverrideEditor) and 5.3 (ResourceGrantEditor, PrincipalPicker)
 * independently converged on during Wave 1.
 *
 * Coverage on the four helpers exercises every decision the component makes:
 * grouping, dirty-vs-server cell resolution, immutable toggle semantics, and
 * mutation payload shape.
 */
import { describe, expect, it } from 'vitest'
import {
  buildUpdatePayloads,
  groupPermissionKeys,
  isCellChecked,
  toggleInDirtyMap,
  type DirtyMap,
} from '@/features/permissions/components/PermissionMatrix'

describe('groupPermissionKeys', () => {
  it('groups keys by dotted prefix and orders sections alphabetically', () => {
    const keys = [
      'datasets.view',
      'agents.run',
      'datasets.create',
      'agents.view',
      'users.delete',
    ]
    const grouped = groupPermissionKeys(keys)
    expect(grouped.map((g) => g.section)).toEqual(['agents', 'datasets', 'users'])
    expect(grouped.find((g) => g.section === 'datasets')?.keys).toEqual([
      'datasets.view',
      'datasets.create',
    ])
  })

  it('treats keys with no dot as their own section', () => {
    const grouped = groupPermissionKeys(['singleton', 'datasets.view'])
    const sections = grouped.map((g) => g.section)
    expect(sections).toContain('singleton')
    expect(sections).toContain('datasets')
  })

  it('returns an empty array for empty input', () => {
    expect(groupPermissionKeys([])).toEqual([])
  })
})

describe('isCellChecked', () => {
  const server: Record<string, readonly string[]> = {
    admin: ['datasets.view'],
    leader: [],
  }

  it('returns the server snapshot when the role is not dirty', () => {
    const dirty: DirtyMap = new Map()
    expect(isCellChecked(dirty, server, 'admin', 'datasets.view')).toBe(true)
    expect(isCellChecked(dirty, server, 'leader', 'datasets.view')).toBe(false)
  })

  it('returns the dirty target when the role has been edited, ignoring server', () => {
    // admin is dirty with an empty target — server says checked, dirty says not
    const dirty: DirtyMap = new Map([['admin', new Set<string>()]])
    expect(isCellChecked(dirty, server, 'admin', 'datasets.view')).toBe(false)
  })

  it('handles an unknown role with no server entry as unchecked', () => {
    const dirty: DirtyMap = new Map()
    expect(isCellChecked(dirty, server, 'ghost', 'datasets.view')).toBe(false)
  })

  it('handles empty server role snapshots without throwing', () => {
    const dirty: DirtyMap = new Map()
    expect(isCellChecked(dirty, {}, 'admin', 'datasets.view')).toBe(false)
  })
})

describe('toggleInDirtyMap', () => {
  it('adds a key when toggling a previously unchecked cell', () => {
    const prev: DirtyMap = new Map()
    const server = { admin: [] as readonly string[] }
    const next = toggleInDirtyMap(prev, server, 'admin', 'datasets.view')
    expect(next.get('admin')).toEqual(new Set(['datasets.view']))
  })

  it('removes a key when toggling a previously checked cell (from server)', () => {
    const prev: DirtyMap = new Map()
    const server = { admin: ['datasets.view'] as readonly string[] }
    const next = toggleInDirtyMap(prev, server, 'admin', 'datasets.view')
    // The baseline was server (checked) → toggle produces unchecked
    expect(next.get('admin')?.has('datasets.view')).toBe(false)
  })

  it('does not mutate the input map or set', () => {
    const prevSet = new Set<string>()
    const prev: DirtyMap = new Map([['admin', prevSet]])
    const server = { admin: [] as readonly string[] }
    toggleInDirtyMap(prev, server, 'admin', 'datasets.view')
    // Original set is untouched
    expect(prevSet.size).toBe(0)
    expect(prev.get('admin')).toBe(prevSet)
  })

  it('preserves existing dirty entries for other roles', () => {
    const prev: DirtyMap = new Map([['leader', new Set(['agents.view'])]])
    const server = { admin: [] as readonly string[], leader: [] as readonly string[] }
    const next = toggleInDirtyMap(prev, server, 'admin', 'datasets.view')
    expect(next.get('leader')).toEqual(new Set(['agents.view']))
    expect(next.get('admin')).toEqual(new Set(['datasets.view']))
  })
})

describe('buildUpdatePayloads', () => {
  it('returns one payload per dirty role with permission_keys body shape', () => {
    const dirty: DirtyMap = new Map([
      ['admin', new Set(['datasets.view', 'datasets.create'])],
      ['leader', new Set(['agents.run'])],
    ])
    const payloads = buildUpdatePayloads(dirty)
    expect(payloads).toHaveLength(2)
    expect(payloads.find((p) => p.role === 'admin')?.body.permission_keys).toEqual(
      expect.arrayContaining(['datasets.view', 'datasets.create']),
    )
    expect(payloads.find((p) => p.role === 'leader')?.body.permission_keys).toEqual([
      'agents.run',
    ])
  })

  it('returns an empty array when nothing is dirty', () => {
    expect(buildUpdatePayloads(new Map())).toEqual([])
  })

  it('emits an empty permission_keys array for a role whose target is empty (full revoke)', () => {
    const dirty: DirtyMap = new Map([['admin', new Set<string>()]])
    const payloads = buildUpdatePayloads(dirty)
    expect(payloads[0]).toEqual({ role: 'admin', body: { permission_keys: [] } })
  })
})
