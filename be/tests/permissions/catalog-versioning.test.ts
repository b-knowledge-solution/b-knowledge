/**
 * @fileoverview Phase 7 SH1 backend harness for catalog versioning work.
 *
 * This file is intentionally narrow and green against the current Phase 4
 * behavior. It establishes the controller/service/mutation seams that 7.1 will
 * extend with deterministic version hashing and mutation-event assertions.
 *
 * Current coverage:
 *   1. The service exposes a deterministic `{ version, permissions }` catalog contract.
 *   2. The controller returns the same versioned payload from `GET /catalog`.
 *   3. Task 2 extends the same harness with mutation-driven socket emits.
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
const permissionsRegistry = await import('../../src/shared/permissions/index.js')
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

describe('catalog-versioning harness — versioned catalog contract', () => {
  it('returns the live registry payload alongside a stable version token', () => {
    const catalog = permissionsService.getVersionedCatalog()

    // The live registry remains the single source of truth for the catalog.
    expect(catalog.permissions).toEqual(getAllPermissions())
    expect(catalog.permissions.length).toBeGreaterThan(0)
    expect(catalog.permissions[0]).toHaveProperty('key')
    expect(catalog.permissions[0]).toHaveProperty('action')
    expect(catalog.permissions[0]).toHaveProperty('subject')
    expect(catalog.version).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns the versioned controller payload shape', async () => {
    const controller = new PermissionsController()
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as const

    await controller.getCatalog({} as never, res as never)

    expect(res.json).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalledWith(permissionsService.getVersionedCatalog())
  })
})

describe('catalog-versioning harness — deterministic version seam', () => {
  it('keeps repeated service reads stable for identical registry contents', () => {
    const first = permissionsService.getVersionedCatalog()
    const second = permissionsService.getVersionedCatalog()

    // Unchanged registry contents must produce an unchanged version token.
    expect(second.version).toBe(first.version)
    expect(second.permissions).toEqual(first.permissions)
  })

  it('changes the version token when registry contents change', () => {
    const first = permissionsService.getVersionedCatalog()
    const registrySpy = vi
      .spyOn(permissionsRegistry, 'getAllPermissions')
      .mockReturnValue([
        ...getAllPermissions(),
        {
          key: 'zzz.synthetic.permission',
          feature: 'zzz',
          action: 'read',
          subject: 'Synthetic',
          label: 'Synthetic permission',
          description: null,
        },
      ])

    try {
      const second = permissionsService.getVersionedCatalog()
      expect(second.version).not.toBe(first.version)
      expect(second.permissions).toHaveLength(first.permissions.length + 1)
    } finally {
      registrySpy.mockRestore()
    }
  })
})
