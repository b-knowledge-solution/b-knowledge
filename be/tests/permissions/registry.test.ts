/**
 * @description Unit tests for the code-side permission registry.
 *
 * Importing `@/shared/permissions` triggers the eager imports of every
 * `<feature>.permissions.ts` file, which in turn call `definePermissions`.
 * By the time the test body runs, `getAllPermissions()` already reflects the
 * full catalog.
 */

import { describe, it, expect } from 'vitest'
import {
  getAllPermissions,
  KNOWLEDGE_BASE_PERMISSIONS,
  USERS_PERMISSIONS,
  CHAT_PERMISSIONS,
} from '@/shared/permissions/index.js'
import { definePermissions } from '@/shared/permissions/registry.js'
import { PERMISSION_KEY_PATTERN } from '@/shared/constants/permissions.js'

describe('Permission registry', () => {
  it('populates ALL_PERMISSIONS via eager imports', () => {
    const all = getAllPermissions()
    // 21 modules contributing — at minimum we expect 60 keys total.
    expect(all.length).toBeGreaterThanOrEqual(60)
  })

  it('every key is unique', () => {
    const all = getAllPermissions()
    const seen = new Set<string>()
    for (const p of all) {
      expect(seen.has(p.key), `duplicate key: ${p.key}`).toBe(false)
      seen.add(p.key)
    }
    expect(seen.size).toBe(all.length)
  })

  it('every entry has all required fields populated', () => {
    for (const p of getAllPermissions()) {
      expect(p.key).toMatch(PERMISSION_KEY_PATTERN)
      expect(p.feature).toBeTruthy()
      expect(p.action).toBeTruthy()
      expect(p.subject).toBeTruthy()
      expect(p.label).toBeTruthy()
    }
  })

  it('rejects duplicate registration via definePermissions', () => {
    // `users.view` is already registered by users.permissions.ts at this point,
    // so re-defining it must throw immediately and synchronously.
    expect(() =>
      definePermissions('users', {
        view: {
          action: 'read',
          subject: 'User',
          label: 'duplicate',
        },
      }),
    ).toThrow(/Duplicate/)
  })

  it('getAllPermissions returns a frozen array', () => {
    const all = getAllPermissions()
    expect(Object.isFrozen(all)).toBe(true)
    // Mutating a frozen array throws in strict mode (test files run in ESM strict).
    expect(() => {
      ;(all as unknown as { push: (x: unknown) => void }).push({} as never)
    }).toThrow()
  })

  it('knowledge-base module registers expected keys', () => {
    expect(KNOWLEDGE_BASE_PERMISSIONS.view.key).toBe('knowledge_base.view')
    expect(KNOWLEDGE_BASE_PERMISSIONS.share.key).toBe('knowledge_base.share')
    expect(KNOWLEDGE_BASE_PERMISSIONS.delete.feature).toBe('knowledge_base')
  })

  it('users module registers role/perm assignment keys', () => {
    expect(USERS_PERMISSIONS.assign_role.key).toBe('users.assign_role')
    expect(USERS_PERMISSIONS.assign_perms.key).toBe('users.assign_perms')
    expect(USERS_PERMISSIONS.view_ip.key).toBe('users.view_ip')
  })

  it('chat module registers embed key', () => {
    expect(CHAT_PERMISSIONS.embed.key).toBe('chat.embed')
    expect(CHAT_PERMISSIONS.view.key).toBe('chat.view')
  })

  it('catalog includes the day-one critical keys spanning all modules', () => {
    const keys = new Set(getAllPermissions().map((p) => p.key))
    const required = [
      'agents.view',
      'agents.run',
      'agents.credentials',
      'audit.view',
      'audit.export',
      'broadcast.view',
      'chat.view',
      'chat.embed',
      'code_graph.view',
      'code_graph.manage',
      'dashboard.view',
      'dashboard.admin',
      'api_keys.view',
      'feedback.submit',
      'glossary.view',
      'glossary.import',
      'knowledge_base.view',
      'knowledge_base.share',
      'document_categories.view',
      'document_categories.import',
      'llm_providers.view',
      'llm_providers.test',
      'memory.view',
      'memory.create',
      'preview.view',
      'datasets.view',
      'documents.parse',
      'chunks.create',
      'search_apps.view',
      'search_apps.embed',
      'sync_connectors.view',
      'sync_connectors.run',
      'system.view',
      'system_history.view',
      'system_tools.view',
      'system_tools.run',
      'teams.view',
      'teams.members',
      'teams.permissions',
      'user_history.view',
      'users.view',
      'users.assign_role',
    ]
    for (const k of required) {
      expect(keys.has(k), `missing required key: ${k}`).toBe(true)
    }
  })
})
