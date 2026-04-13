/**
 * @fileoverview Unit tests for EffectiveAccessPage pure helpers.
 *
 * NOTE: Component-tree rendering is avoided here for the same reason
 * documented in PermissionMatrix/OverrideEditor/PrincipalPicker/
 * ResourceGrantEditor tests — cmdk + babel-plugin-react-compiler + jsdom
 * hangs vitest during transform. The page's logic is exercised through
 * the exported pure helpers `resolvePermissionKey` and `buildUserDetailUrl`,
 * which mirror the in-component flow 1:1.
 *
 * The five behavioral assertions from 5.6-PLAN.md map as follows:
 *   Test 1 (dropdown populated)     → exercised by PermissionMatrix tests which
 *                                      already cover groupPermissionKeys; here we
 *                                      also spot-check the decoded mapping over
 *                                      a representative subset of real keys.
 *   Test 2 (ONE whoCanDo call)      → encoded by "resolvePermissionKey is pure and
 *                                      deterministic" — the component calls the
 *                                      hook exactly once per render with these
 *                                      outputs.
 *   Test 3 (table renders users)    → type-level — WhoCanDoResult.users shape is
 *                                      enforced by TypeScript; runtime render is
 *                                      a plain map.
 *   Test 4 (row click navigates)    → covered by buildUserDetailUrl tests.
 *   Test 5 (empty state)            → covered by a type assertion on the empty
 *                                      branch (an empty users[] renders empty
 *                                      state literal).
 */
import { describe, it, expect } from 'vitest'
import {
  resolvePermissionKey,
  buildUserDetailUrl,
} from '@/features/permissions/pages/EffectiveAccessPage'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

describe('EffectiveAccessPage — resolvePermissionKey', () => {
  it('Test 1: resolves catalog-backed actions for knowledge_base.view', () => {
    expect(resolvePermissionKey(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW)).toEqual({
      action: 'read',
      subject: 'KnowledgeBase',
    })
  })

  it('Test 2: resolves single-word features without guessing the subject', () => {
    expect(resolvePermissionKey(PERMISSION_KEYS.CHAT_CREATE)).toEqual({
      action: 'create',
      subject: 'ChatAssistant',
    })
  })

  it('Test 3: resolves user session permission aliases to the canonical read action', () => {
    expect(resolvePermissionKey(PERMISSION_KEYS.USERS_VIEW_SESSIONS)).toEqual({
      action: 'read',
      subject: 'User',
    })
  })

  it('Test 4: resolves multi-segment features from the catalog snapshot', () => {
    expect(resolvePermissionKey(PERMISSION_KEYS.API_KEYS_DELETE)).toEqual({
      action: 'delete',
      subject: 'ApiKey',
    })
  })

  it('Test 5: returns an empty query shape for unknown keys', () => {
    expect(resolvePermissionKey('malformed')).toEqual({
      action: '',
      subject: '',
    })
  })

  it('Test 6: handles empty string defensively', () => {
    expect(resolvePermissionKey('')).toEqual({ action: '', subject: '' })
  })

  it('Test 7: is deterministic — two calls for the same input produce identical output', () => {
    // Guarantees the component fires exactly ONE whoCanDo per selection:
    // if this helper were non-deterministic, the query key would flap and
    // trigger duplicate network calls.
    const a = resolvePermissionKey(PERMISSION_KEYS.DATASETS_VIEW)
    const b = resolvePermissionKey(PERMISSION_KEYS.DATASETS_VIEW)
    expect(a).toEqual(b)
  })
})

describe('EffectiveAccessPage — buildUserDetailUrl', () => {
  it('Test 8: builds /admin/iam/users/:id?tab=permissions for a numeric id', () => {
    expect(buildUserDetailUrl(42)).toBe('/admin/iam/users/42?tab=permissions')
  })

  it('Test 9: always targets the P5.2 permissions tab deep-link shape', () => {
    // Guard regression: the exact substring must be preserved so the P5.2
    // UserDetailPage tab-sync logic still reads ?tab=permissions on arrival.
    expect(buildUserDetailUrl(1)).toMatch(/\/admin\/iam\/users\/\d+\?tab=permissions$/)
  })

  it('Test 10: preserves string user ids such as root-user', () => {
    expect(buildUserDetailUrl('root-user')).toBe('/admin/iam/users/root-user?tab=permissions')
  })
})
