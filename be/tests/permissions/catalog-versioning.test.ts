/**
 * @fileoverview Phase 7 SH1 backend harness for catalog versioning work.
 *
 * This file is intentionally narrow and green against the current Phase 4
 * behavior. It establishes the controller/service/mutation seams that 7.1 will
 * extend with deterministic version hashing and mutation-event assertions.
 *
 * Current coverage:
 *   1. The service returns the live registry catalog unchanged.
 *   2. The controller exposes the existing `{ permissions }` HTTP payload.
 *   3. Role mutations still trigger the cache-refresh + ability-invalidation
 *      side effects that 7.1's catalog-update event emitter will hook into.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Knex } from 'knex'
import { withScratchDb } from './_helpers.js'
import {
  PERMISSIONS_TABLE,
  PermissionSubjects,
} from '../../src/shared/constants/permissions.js'

vi.mock('../../src/shared/services/ability.service.js', () => ({
  abilityService: {
    invalidateAllAbilities: vi.fn(async () => {}),
  },
}))
vi.mock('../../src/shared/services/role-permission-cache.service.js', () => ({
  rolePermissionCacheService: {
    refresh: vi.fn(async () => {}),
  },
}))
vi.mock('../../src/modules/audit/services/audit.service.js', () => ({
  auditService: {
    logPermissionMutation: vi.fn(async () => {}),
  },
  AuditAction: {},
  AuditResourceType: { PERMISSION: 'permission' },
}))
vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

const { abilityService } = await import(
  '../../src/shared/services/ability.service.js'
)
const { rolePermissionCacheService } = await import(
  '../../src/shared/services/role-permission-cache.service.js'
)
const { auditService } = await import(
  '../../src/modules/audit/services/audit.service.js'
)
const { permissionsService } = await import(
  '../../src/modules/permissions/services/permissions.service.js'
)
const { PermissionsController } = await import(
  '../../src/modules/permissions/controllers/permissions.controller.js'
)
const { getAllPermissions } = await import(
  '../../src/shared/permissions/index.js'
)
const { ModelFactory } = await import('../../src/shared/models/factory.js')

/**
 * @description Temporarily repoint the singleton role-permission model at the
 * scratch schema so service-level mutation tests stay inside the isolated DB.
 * @param {Knex} scratch - Scratch Knex handle from `withScratchDb`.
 * @returns {() => void} Restore callback that must run in `finally`.
 */
function pinRolePermissionModelTo(scratch: Knex): () => void {
  const model = ModelFactory.rolePermission as unknown as { knex: Knex }
  const original = model.knex
  model.knex = scratch
  return () => {
    model.knex = original
  }
}

/**
 * @description Seed the minimal catalog rows required by
 * `replaceRolePermissions` so the FK from `role_permissions.permission_key`
 * resolves inside the scratch schema.
 * @param {Knex} scratch - Scratch Knex handle.
 * @returns {Promise<void>} Resolves once the catalog rows exist.
 */
async function seedCatalogRows(scratch: Knex): Promise<void> {
  await scratch(PERMISSIONS_TABLE).insert([
    {
      key: 'knowledge_base.view',
      feature: 'knowledge_base',
      action: 'read',
      subject: PermissionSubjects.KnowledgeBase,
      label: 'View knowledge base',
      description: null,
    },
    {
      key: 'knowledge_base.create',
      feature: 'knowledge_base',
      action: 'create',
      subject: PermissionSubjects.KnowledgeBase,
      label: 'Create knowledge base',
      description: null,
    },
  ])
}

beforeEach(() => {
  vi.mocked(abilityService.invalidateAllAbilities).mockClear()
  vi.mocked(rolePermissionCacheService.refresh).mockClear()
  vi.mocked(auditService.logPermissionMutation).mockReset()
  vi.mocked(auditService.logPermissionMutation).mockResolvedValue(undefined)
})

describe('catalog-versioning harness — current catalog contract', () => {
  it('returns the same registry payload from the service seam', () => {
    const catalog = permissionsService.getCatalog()

    // The live registry remains the single source of truth for the catalog.
    expect(catalog).toEqual(getAllPermissions())
    expect(catalog.length).toBeGreaterThan(0)
    expect(catalog[0]).toHaveProperty('key')
    expect(catalog[0]).toHaveProperty('action')
    expect(catalog[0]).toHaveProperty('subject')
  })

  it('returns the current controller payload shape without a version field', async () => {
    const controller = new PermissionsController()
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as const

    await controller.getCatalog({} as never, res as never)

    expect(res.json).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalledWith({
      permissions: permissionsService.getCatalog(),
    })
  })
})

describe('catalog-versioning harness — deterministic version seam', () => {
  it('keeps repeated service reads stable for identical registry contents', () => {
    const first = permissionsService.getCatalog()
    const second = permissionsService.getCatalog()

    // Phase 7.1 will replace this identity-level smoke check with an explicit
    // version hash assertion without having to create a new test file.
    expect(second).toEqual(first)
  })
})

describe('catalog-versioning harness — mutation event seam', () => {
  it('refreshes caches after role-permission replacement', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinRolePermissionModelTo(scratch)
      try {
        await seedCatalogRows(scratch)

        await permissionsService.replaceRolePermissions(
          'admin',
          ['knowledge_base.view', 'knowledge_base.create'],
          null,
          'actor-1',
        )

        // These side effects are the current mutation seam that 7.1 will
        // extend with catalog-update event emission assertions.
        expect(rolePermissionCacheService.refresh).toHaveBeenCalledTimes(1)
        expect(abilityService.invalidateAllAbilities).toHaveBeenCalledTimes(1)
        expect(await ModelFactory.rolePermission.findByRole('admin', null)).toEqual([
          'knowledge_base.view',
          'knowledge_base.create',
        ])
      } finally {
        restore()
      }
    })
  })
})
