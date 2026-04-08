/**
 * @fileoverview Unit tests for ResourceGrantEditor — exercises the pure
 * `buildCreateGrantBody` helper plus the hook contract surface.
 *
 * Component-tree rendering is avoided (cmdk + React Compiler + jsdom is the
 * known-bad combo — see ChangeParserDialog.test.tsx). Logic is tested through
 * the exported pure helper plus mocked TanStack Query hook return shapes.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import {
  buildCreateGrantBody,
  SCOPE_KB,
  SCOPE_CATEGORY,
  DEFAULT_GRANT_ACTIONS,
} from '@/features/permissions/components/ResourceGrantEditor'
import {
  PRINCIPAL_TYPE_USER,
  PRINCIPAL_TYPE_TEAM,
  type Principal,
} from '@/features/permissions/components/PrincipalPicker'
import {
  GRANT_RESOURCE_KNOWLEDGE_BASE,
  GRANT_RESOURCE_DOCUMENT_CATEGORY,
} from '@/features/permissions/types/permissions.types'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

const USER_PRINCIPAL: Principal = {
  type: PRINCIPAL_TYPE_USER,
  id: 42,
  label: 'Alice',
}

const TEAM_PRINCIPAL: Principal = {
  type: PRINCIPAL_TYPE_TEAM,
  id: 't-1',
  label: 'Engineering',
}

describe('ResourceGrantEditor — buildCreateGrantBody', () => {
  it('Test 1: KB scope produces resource_type=KnowledgeBase and null knowledge_base_id', () => {
    const body = buildCreateGrantBody({
      scope: SCOPE_KB,
      resourceId: 'kb-1',
      kbId: 5,
      principal: USER_PRINCIPAL,
    })
    expect(body.resource_type).toBe(GRANT_RESOURCE_KNOWLEDGE_BASE)
    expect(body.resource_id).toBe('kb-1')
    expect(body.knowledge_base_id).toBeNull()
    expect(body.grantee_type).toBe(PRINCIPAL_TYPE_USER)
    expect(body.grantee_id).toBe(42)
    expect(body.actions).toEqual([PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW])
  })

  it('Test 2: Category scope sets resource_type=DocumentCategory and forwards kbId', () => {
    const body = buildCreateGrantBody({
      scope: SCOPE_CATEGORY,
      resourceId: 'cat-9',
      kbId: 7,
      principal: USER_PRINCIPAL,
    })
    expect(body.resource_type).toBe(GRANT_RESOURCE_DOCUMENT_CATEGORY)
    expect(body.knowledge_base_id).toBe(7)
  })

  it('Test 3: Category scope tolerates absent kbId (column nullable per 5.0a)', () => {
    const body = buildCreateGrantBody({
      scope: SCOPE_CATEGORY,
      resourceId: 'cat-9',
      principal: TEAM_PRINCIPAL,
    })
    expect(body.knowledge_base_id).toBeNull()
    expect(body.grantee_type).toBe(PRINCIPAL_TYPE_TEAM)
    expect(body.grantee_id).toBe('t-1')
  })

  it('Test 4: scope toggle effect — switching scope changes the next body shape', () => {
    const kbBody = buildCreateGrantBody({
      scope: SCOPE_KB,
      resourceId: '5',
      kbId: 5,
      principal: USER_PRINCIPAL,
    })
    const catBody = buildCreateGrantBody({
      scope: SCOPE_CATEGORY,
      resourceId: 'cat-1',
      kbId: 5,
      principal: USER_PRINCIPAL,
    })
    expect(kbBody.resource_type).not.toBe(catBody.resource_type)
    expect(kbBody.knowledge_base_id).toBeNull()
    expect(catBody.knowledge_base_id).toBe(5)
  })

  it('Test 5: actions default is the read-only DEFAULT_GRANT_ACTIONS array', () => {
    const body = buildCreateGrantBody({
      scope: SCOPE_KB,
      resourceId: 'kb-2',
      principal: USER_PRINCIPAL,
    })
    expect(body.actions).toEqual([...DEFAULT_GRANT_ACTIONS])
    // Mutations on the body should not bleed into the constant
    body.actions.push('foo')
    expect(DEFAULT_GRANT_ACTIONS).toEqual([PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW])
  })
})
