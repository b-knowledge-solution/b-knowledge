import type { Knex } from 'knex'
import { describe, expect, it } from 'vitest'

import { withScratchDb } from './_helpers.js'
import { ModelFactory } from '../../src/shared/models/factory.js'
import { resolveGrantedDatasetsForUser } from '../../src/shared/services/ability.service.js'
import { ResourceType } from '../../src/shared/constants/resource-grants.js'

const TENANT_A = 'tenant-grant-a'
const TENANT_B = 'tenant-grant-b'
const USER_A = 'grant-user-a'

/**
 * @description Temporarily bind a singleton model to the scratch Knex handle.
 * @param {unknown} model - Model singleton from ModelFactory.
 * @param {Knex} scratch - Scratch Knex handle from withScratchDb.
 * @returns {() => void} Restore callback that reverts the model binding.
 */
function pinModelTo(model: unknown, scratch: Knex): () => void {
  const typedModel = model as { knex: Knex }
  const original = typedModel.knex
  typedModel.knex = scratch
  return () => {
    typedModel.knex = original
  }
}

/**
 * @description Insert the minimal user fixture needed for grant-resolution tests.
 * @param {Knex} knex - Scratch Knex handle.
 * @param {string} id - User ID to insert.
 * @param {string} email - User email to insert.
 * @returns {Promise<void>}
 */
async function seedUser(knex: Knex, id: string, email: string): Promise<void> {
  await knex('users').insert({
    id,
    email,
    display_name: id,
    role: 'user',
  })
}

/**
 * @description Insert a minimal knowledge base row for the supplied tenant.
 * @param {Knex} knex - Scratch Knex handle.
 * @param {string} id - Knowledge base ID.
 * @param {string} tenantId - Tenant scope for the KB.
 * @returns {Promise<void>}
 */
async function seedKnowledgeBase(knex: Knex, id: string, tenantId: string): Promise<void> {
  await knex('knowledge_base').insert({
    id,
    name: `kb-${id}`,
    tenant_id: tenantId,
  })
}

/**
 * @description Insert the minimal dataset row required by direct category fixtures.
 * @param {Knex} knex - Scratch Knex handle.
 * @param {object} input - Dataset fixture data.
 * @returns {Promise<void>}
 */
async function seedDataset(
  knex: Knex,
  input: { id: string; tenantId?: string | null; createdBy?: string | null },
): Promise<void> {
  await knex('datasets').insert({
    id: input.id,
    name: `dataset-${input.id}`,
    tenant_id: input.tenantId ?? null,
    created_by: input.createdBy ?? null,
  })
}

/**
 * @description Insert a direct-dataset category under a knowledge base.
 * @param {Knex} knex - Scratch Knex handle.
 * @param {object} input - Category fixture data.
 * @returns {Promise<void>}
 */
async function seedDirectCategory(
  knex: Knex,
  input: {
    id: string
    knowledgeBaseId: string
    datasetId: string
    tenantId?: string | null
    createdBy?: string | null
    name?: string
  },
): Promise<void> {
  await seedDataset(knex, {
    id: input.datasetId,
    tenantId: input.tenantId ?? null,
    createdBy: input.createdBy ?? null,
  })

  await knex('document_categories').insert({
    id: input.id,
    knowledge_base_id: input.knowledgeBaseId,
    name: input.name ?? `cat-${input.id}`,
    category_type: 'standard',
    dataset_id: input.datasetId,
  })
}

/**
 * @description Insert a version-backed category under a knowledge base.
 * @param {Knex} knex - Scratch Knex handle.
 * @param {object} input - Category fixture data.
 * @returns {Promise<void>}
 */
async function seedVersionedCategory(
  knex: Knex,
  input: { id: string; knowledgeBaseId: string; name?: string },
): Promise<void> {
  await knex('document_categories').insert({
    id: input.id,
    knowledge_base_id: input.knowledgeBaseId,
    name: input.name ?? `cat-${input.id}`,
    category_type: 'documents',
    dataset_id: null,
  })
}

/**
 * @description Insert a document category version row with a dataset mapping.
 * @param {Knex} knex - Scratch Knex handle.
 * @param {object} input - Version fixture data.
 * @returns {Promise<void>}
 */
async function seedCategoryVersion(
  knex: Knex,
  input: { id: string; categoryId: string; datasetId: string; status?: string; versionLabel?: string },
): Promise<void> {
  await knex('document_category_versions').insert({
    id: input.id,
    category_id: input.categoryId,
    version_label: input.versionLabel ?? `v-${input.id}`,
    ragflow_dataset_id: input.datasetId,
    status: input.status ?? 'active',
  })
}

/**
 * @description Insert a resource grant fixture for the supplied grantee and tenant.
 * @param {Knex} knex - Scratch Knex handle.
 * @param {object} input - Grant fixture data.
 * @returns {Promise<void>}
 */
async function seedGrant(
  knex: Knex,
  input: {
    id: string
    knowledgeBaseId: string | null
    resourceType: string
    resourceId: string
    tenantId: string
    granteeId: string
    expiresAt?: string | null
  },
): Promise<void> {
  await knex('resource_grants').insert({
    id: input.id,
    knowledge_base_id: input.knowledgeBaseId,
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    grantee_type: 'user',
    grantee_id: input.granteeId,
    permission_level: 'view',
    actions: ['view'],
    tenant_id: input.tenantId,
    expires_at: input.expiresAt ?? null,
  })
}

describe('resolveGrantedDatasetsForUser (scratch-DB integration)', () => {
  it('returns [] for a user with zero grants', () =>
    withScratchDb(async (knex) => {
      const restores = [
        pinModelTo(ModelFactory.resourceGrant, knex),
        pinModelTo(ModelFactory.documentCategory, knex),
      ]

      try {
        await seedUser(knex, USER_A, 'grant-user-a@test.local')

        const result = await resolveGrantedDatasetsForUser(USER_A, TENANT_A)

        expect(result).toEqual([])
      } finally {
        restores.reverse().forEach((restore) => restore())
      }
    }))

  it('returns KB dataset IDs for a live KB grant (direct dataset path)', () =>
    withScratchDb(async (knex) => {
      const restores = [
        pinModelTo(ModelFactory.resourceGrant, knex),
        pinModelTo(ModelFactory.documentCategory, knex),
      ]

      try {
        await seedUser(knex, USER_A, 'grant-user-a@test.local')
        await seedKnowledgeBase(knex, 'kb-live', TENANT_A)
        await seedDirectCategory(knex, {
          id: 'cat-direct',
          knowledgeBaseId: 'kb-live',
          datasetId: 'ds-kb-1',
          tenantId: TENANT_A,
          createdBy: USER_A,
        })
        await seedGrant(knex, {
          id: 'grant-live-kb',
          knowledgeBaseId: 'kb-live',
          resourceType: ResourceType.KNOWLEDGE_BASE,
          resourceId: 'kb-live',
          tenantId: TENANT_A,
          granteeId: USER_A,
        })

        const result = await resolveGrantedDatasetsForUser(USER_A, TENANT_A)

        expect(result).toEqual(['ds-kb-1'])
      } finally {
        restores.reverse().forEach((restore) => restore())
      }
    }))

  it('returns versioned dataset IDs for a live category grant', () =>
    withScratchDb(async (knex) => {
      const restores = [
        pinModelTo(ModelFactory.resourceGrant, knex),
        pinModelTo(ModelFactory.documentCategory, knex),
      ]

      try {
        await seedUser(knex, USER_A, 'grant-user-a@test.local')
        await seedKnowledgeBase(knex, 'kb-versioned', TENANT_A)
        await seedVersionedCategory(knex, {
          id: 'cat-versioned',
          knowledgeBaseId: 'kb-versioned',
        })
        await seedCategoryVersion(knex, {
          id: 'ver-1',
          categoryId: 'cat-versioned',
          datasetId: 'ds-v-1',
          status: 'active',
        })
        await seedCategoryVersion(knex, {
          id: 'ver-2',
          categoryId: 'cat-versioned',
          datasetId: 'ds-v-2',
          status: 'syncing',
        })
        await seedGrant(knex, {
          id: 'grant-live-category',
          knowledgeBaseId: 'kb-versioned',
          resourceType: ResourceType.DOCUMENT_CATEGORY,
          resourceId: 'cat-versioned',
          tenantId: TENANT_A,
          granteeId: USER_A,
        })

        const result = await resolveGrantedDatasetsForUser(USER_A, TENANT_A)

        expect(result.sort()).toEqual(['ds-v-1', 'ds-v-2'])
      } finally {
        restores.reverse().forEach((restore) => restore())
      }
    }))

  it('excludes expired grants (D-09 SQL expiry enforcement)', () =>
    withScratchDb(async (knex) => {
      const restores = [
        pinModelTo(ModelFactory.resourceGrant, knex),
        pinModelTo(ModelFactory.documentCategory, knex),
      ]

      try {
        await seedUser(knex, USER_A, 'grant-user-a@test.local')
        await seedKnowledgeBase(knex, 'kb-expired', TENANT_A)
        await seedDirectCategory(knex, {
          id: 'cat-expired',
          knowledgeBaseId: 'kb-expired',
          datasetId: 'ds-expired',
          tenantId: TENANT_A,
          createdBy: USER_A,
        })
        await seedGrant(knex, {
          id: 'grant-expired',
          knowledgeBaseId: 'kb-expired',
          resourceType: ResourceType.KNOWLEDGE_BASE,
          resourceId: 'kb-expired',
          tenantId: TENANT_A,
          granteeId: USER_A,
          expiresAt: '2020-01-01T00:00:00Z',
        })

        const result = await resolveGrantedDatasetsForUser(USER_A, TENANT_A)

        expect(result).toEqual([])
      } finally {
        restores.reverse().forEach((restore) => restore())
      }
    }))

  it('excludes archived versions from category grant resolution', () =>
    withScratchDb(async (knex) => {
      const restores = [
        pinModelTo(ModelFactory.resourceGrant, knex),
        pinModelTo(ModelFactory.documentCategory, knex),
      ]

      try {
        await seedUser(knex, USER_A, 'grant-user-a@test.local')
        await seedKnowledgeBase(knex, 'kb-archived', TENANT_A)
        await seedVersionedCategory(knex, {
          id: 'cat-archived',
          knowledgeBaseId: 'kb-archived',
        })
        await seedCategoryVersion(knex, {
          id: 'ver-active',
          categoryId: 'cat-archived',
          datasetId: 'ds-active',
          status: 'active',
        })
        await seedCategoryVersion(knex, {
          id: 'ver-archived',
          categoryId: 'cat-archived',
          datasetId: 'ds-archived',
          status: 'archived',
        })
        await seedGrant(knex, {
          id: 'grant-archived-filter',
          knowledgeBaseId: 'kb-archived',
          resourceType: ResourceType.DOCUMENT_CATEGORY,
          resourceId: 'cat-archived',
          tenantId: TENANT_A,
          granteeId: USER_A,
        })

        const result = await resolveGrantedDatasetsForUser(USER_A, TENANT_A)

        expect(result).toEqual(['ds-active'])
      } finally {
        restores.reverse().forEach((restore) => restore())
      }
    }))

  it('dedupes overlapping KB and category grants on the same KB', () =>
    withScratchDb(async (knex) => {
      const restores = [
        pinModelTo(ModelFactory.resourceGrant, knex),
        pinModelTo(ModelFactory.documentCategory, knex),
      ]

      try {
        await seedUser(knex, USER_A, 'grant-user-a@test.local')
        await seedKnowledgeBase(knex, 'kb-overlap', TENANT_A)
        await seedDirectCategory(knex, {
          id: 'cat-shared-direct',
          knowledgeBaseId: 'kb-overlap',
          datasetId: 'ds-shared',
          tenantId: TENANT_A,
          createdBy: USER_A,
        })
        await seedVersionedCategory(knex, {
          id: 'cat-overlap-versioned',
          knowledgeBaseId: 'kb-overlap',
        })
        await seedCategoryVersion(knex, {
          id: 'ver-shared',
          categoryId: 'cat-overlap-versioned',
          datasetId: 'ds-shared',
          status: 'active',
        })
        await seedCategoryVersion(knex, {
          id: 'ver-unique',
          categoryId: 'cat-overlap-versioned',
          datasetId: 'ds-unique',
          status: 'active',
        })
        await seedGrant(knex, {
          id: 'grant-kb-overlap',
          knowledgeBaseId: 'kb-overlap',
          resourceType: ResourceType.KNOWLEDGE_BASE,
          resourceId: 'kb-overlap',
          tenantId: TENANT_A,
          granteeId: USER_A,
        })
        await seedGrant(knex, {
          id: 'grant-cat-overlap',
          knowledgeBaseId: 'kb-overlap',
          resourceType: ResourceType.DOCUMENT_CATEGORY,
          resourceId: 'cat-overlap-versioned',
          tenantId: TENANT_A,
          granteeId: USER_A,
        })

        const result = await resolveGrantedDatasetsForUser(USER_A, TENANT_A)

        expect(result.sort()).toEqual(['ds-shared', 'ds-unique'])
      } finally {
        restores.reverse().forEach((restore) => restore())
      }
    }))

  it('cross-tenant grant is invisible outside its tenant', () =>
    withScratchDb(async (knex) => {
      const restores = [
        pinModelTo(ModelFactory.resourceGrant, knex),
        pinModelTo(ModelFactory.documentCategory, knex),
      ]

      try {
        await seedUser(knex, USER_A, 'grant-user-a@test.local')
        await seedKnowledgeBase(knex, 'kb-tenant-a', TENANT_A)
        await seedKnowledgeBase(knex, 'kb-tenant-b', TENANT_B)
        await seedDirectCategory(knex, {
          id: 'cat-tenant-b',
          knowledgeBaseId: 'kb-tenant-b',
          datasetId: 'ds-tenant-b',
          tenantId: TENANT_B,
          createdBy: USER_A,
        })
        await seedGrant(knex, {
          id: 'grant-tenant-b',
          knowledgeBaseId: 'kb-tenant-b',
          resourceType: ResourceType.KNOWLEDGE_BASE,
          resourceId: 'kb-tenant-b',
          tenantId: TENANT_B,
          granteeId: USER_A,
        })

        const tenantAResult = await resolveGrantedDatasetsForUser(USER_A, TENANT_A)
        const tenantBResult = await resolveGrantedDatasetsForUser(USER_A, TENANT_B)

        expect(tenantAResult).toEqual([])
        expect(tenantBResult).toEqual(['ds-tenant-b'])
      } finally {
        restores.reverse().forEach((restore) => restore())
      }
    }))
})
