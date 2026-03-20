/**
 * @fileoverview Unit tests for Projects module Zod validation schemas.
 * @description Covers all param schemas, project CRUD schemas, permission schemas,
 *   category schemas, chat schemas, search schemas, sync config schemas,
 *   entity permission schemas, member schemas, dataset binding schemas, and activity query schemas.
 */

import { describe, it, expect } from 'vitest'

import {
  projectIdParamSchema,
  permissionParamSchema,
  projectDatasetParamSchema,
  categoryParamSchema,
  versionParamSchema,
  chatParamSchema,
  searchParamSchema,
  syncConfigParamSchema,
  entityPermParamSchema,
  createProjectSchema,
  updateProjectSchema,
  setPermissionSchema,
  linkDatasetSchema,
  createCategorySchema,
  updateCategorySchema,
  createCategoryVersionSchema,
  updateCategoryVersionSchema,
  createChatSchema,
  updateChatSchema,
  createSearchSchema,
  updateSearchSchema,
  createSyncConfigSchema,
  updateSyncConfigSchema,
  createEntityPermissionSchema,
  addMemberSchema,
  memberParamSchema,
  bindDatasetsSchema,
  activityQuerySchema,
} from '../../src/modules/projects/schemas/projects.schemas'

// ---------------------------------------------------------------------------
// Param Schemas
// ---------------------------------------------------------------------------

describe('Param Schemas', () => {
  describe('projectIdParamSchema', () => {
    /** @description Should accept valid project ID */
    it('should accept non-empty string ID', () => {
      expect(projectIdParamSchema.parse({ id: 'project-123' }).id).toBe('project-123')
    })

    /** @description Should reject empty project ID */
    it('should reject empty ID', () => {
      expect(() => projectIdParamSchema.parse({ id: '' })).toThrow('Project ID is required')
    })
  })

  describe('permissionParamSchema', () => {
    /** @description Should accept valid project and permission IDs */
    it('should accept valid IDs', () => {
      const result = permissionParamSchema.parse({ id: 'p1', permId: 'perm-1' })
      expect(result.id).toBe('p1')
      expect(result.permId).toBe('perm-1')
    })

    /** @description Should reject missing permission ID */
    it('should reject empty permId', () => {
      expect(() => permissionParamSchema.parse({ id: 'p1', permId: '' })).toThrow()
    })
  })

  describe('projectDatasetParamSchema', () => {
    /** @description Should validate dataset UUID format */
    it('should accept valid UUID datasetId', () => {
      const result = projectDatasetParamSchema.parse({
        id: 'p1',
        datasetId: '550e8400-e29b-41d4-a716-446655440000',
      })
      expect(result.datasetId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })

    /** @description Should reject invalid UUID datasetId */
    it('should reject non-UUID datasetId', () => {
      expect(() => projectDatasetParamSchema.parse({ id: 'p1', datasetId: 'bad' })).toThrow('Invalid dataset UUID')
    })
  })

  describe('versionParamSchema', () => {
    /** @description Should require all three IDs */
    it('should accept project, category, and version IDs', () => {
      const result = versionParamSchema.parse({ id: 'p1', catId: 'c1', verId: 'v1' })
      expect(result.verId).toBe('v1')
    })

    /** @description Should reject missing version ID */
    it('should reject empty verId', () => {
      expect(() => versionParamSchema.parse({ id: 'p1', catId: 'c1', verId: '' })).toThrow()
    })
  })

  describe('memberParamSchema', () => {
    /** @description Should validate user UUID format */
    it('should accept valid UUID userId', () => {
      const result = memberParamSchema.parse({
        id: 'p1',
        userId: '550e8400-e29b-41d4-a716-446655440000',
      })
      expect(result.userId).toBeDefined()
    })

    /** @description Should reject invalid UUID userId */
    it('should reject non-UUID userId', () => {
      expect(() => memberParamSchema.parse({ id: 'p1', userId: 'bad' })).toThrow('Invalid user UUID')
    })
  })
})

// ---------------------------------------------------------------------------
// Project CRUD Schemas
// ---------------------------------------------------------------------------

describe('createProjectSchema', () => {
  /** @description Should accept valid complete payload */
  it('should accept full valid payload', () => {
    const result = createProjectSchema.parse({
      name: 'My Project',
      description: 'A test project',
      avatar: 'https://img.com/avatar.png',
      default_embedding_model: 'text-embedding-3',
      default_chunk_method: 'recursive',
      default_parser_config: { chunk_size: 500 },
      is_private: true,
    })
    expect(result.name).toBe('My Project')
    expect(result.is_private).toBe(true)
  })

  /** @description Should require project name */
  it('should reject empty name', () => {
    expect(() => createProjectSchema.parse({ name: '' })).toThrow('Project name is required')
  })

  /** @description Should reject name exceeding 255 characters */
  it('should reject name > 255 chars', () => {
    expect(() => createProjectSchema.parse({ name: 'x'.repeat(256) })).toThrow()
  })

  /** @description Should accept minimal payload (name only) */
  it('should accept name-only payload', () => {
    const result = createProjectSchema.parse({ name: 'Minimal' })
    expect(result.name).toBe('Minimal')
    expect(result.description).toBeUndefined()
    expect(result.is_private).toBeUndefined()
  })
})

describe('updateProjectSchema', () => {
  /** @description Should accept partial updates */
  it('should accept partial updates', () => {
    const result = updateProjectSchema.parse({ name: 'Updated', status: 'archived' })
    expect(result.name).toBe('Updated')
    expect(result.status).toBe('archived')
  })

  /** @description Should accept empty object for no-op update */
  it('should accept empty object', () => {
    expect(updateProjectSchema.parse({})).toEqual({})
  })

  /** @description Should reject invalid status values */
  it('should reject invalid status', () => {
    expect(() => updateProjectSchema.parse({ status: 'deleted' })).toThrow()
  })

  /** @description Should accept nullable fields */
  it('should accept null for nullable fields', () => {
    const result = updateProjectSchema.parse({ description: null, avatar: null })
    expect(result.description).toBeNull()
    expect(result.avatar).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Permission Schema
// ---------------------------------------------------------------------------

describe('setPermissionSchema', () => {
  /** @description Should accept valid permission payload with defaults */
  it('should accept valid payload and apply defaults', () => {
    const result = setPermissionSchema.parse({
      grantee_type: 'user',
      grantee_id: 'user-123',
    })
    // Verify defaults are applied
    expect(result.tab_documents).toBe('none')
    expect(result.tab_chat).toBe('none')
    expect(result.tab_settings).toBe('none')
  })

  /** @description Should accept team grantee type */
  it('should accept team as grantee_type', () => {
    const result = setPermissionSchema.parse({
      grantee_type: 'team',
      grantee_id: 'team-1',
      tab_documents: 'manage',
    })
    expect(result.grantee_type).toBe('team')
    expect(result.tab_documents).toBe('manage')
  })

  /** @description Should reject invalid grantee_type */
  it('should reject invalid grantee_type', () => {
    expect(() => setPermissionSchema.parse({
      grantee_type: 'group',
      grantee_id: 'g-1',
    })).toThrow()
  })

  /** @description Should reject invalid tab access levels */
  it('should reject invalid tab access level', () => {
    expect(() => setPermissionSchema.parse({
      grantee_type: 'user',
      grantee_id: 'u-1',
      tab_documents: 'admin',
    })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Category Schemas
// ---------------------------------------------------------------------------

describe('createCategorySchema', () => {
  /** @description Should accept valid category payload */
  it('should accept valid category', () => {
    const result = createCategorySchema.parse({
      name: 'Technical Docs',
      description: 'Technical documentation',
      sort_order: 1,
      dataset_config: { parser: 'naive' },
    })
    expect(result.name).toBe('Technical Docs')
    expect(result.sort_order).toBe(1)
  })

  /** @description Should reject empty category name */
  it('should reject empty name', () => {
    expect(() => createCategorySchema.parse({ name: '' })).toThrow('Category name is required')
  })

  /** @description Should reject negative sort_order */
  it('should reject negative sort_order', () => {
    expect(() => createCategorySchema.parse({ name: 'Test', sort_order: -1 })).toThrow()
  })
})

describe('updateCategorySchema', () => {
  /** @description Should accept partial updates */
  it('should accept partial category updates', () => {
    const result = updateCategorySchema.parse({ sort_order: 5 })
    expect(result.sort_order).toBe(5)
  })

  /** @description Should accept empty object */
  it('should accept empty update', () => {
    expect(updateCategorySchema.parse({})).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// Version Schemas
// ---------------------------------------------------------------------------

describe('createCategoryVersionSchema', () => {
  /** @description Should accept valid version label */
  it('should accept valid version', () => {
    const result = createCategoryVersionSchema.parse({
      version_label: 'v1.0',
      metadata: { notes: 'Initial' },
    })
    expect(result.version_label).toBe('v1.0')
  })

  /** @description Should reject empty version label */
  it('should reject empty version_label', () => {
    expect(() => createCategoryVersionSchema.parse({ version_label: '' })).toThrow('Version label is required')
  })

  /** @description Should reject version label exceeding 128 characters */
  it('should reject version_label > 128 chars', () => {
    expect(() => createCategoryVersionSchema.parse({ version_label: 'x'.repeat(129) })).toThrow()
  })
})

describe('updateCategoryVersionSchema', () => {
  /** @description Should accept valid status values */
  it('should accept valid status', () => {
    const result = updateCategoryVersionSchema.parse({ status: 'archived' })
    expect(result.status).toBe('archived')
  })

  /** @description Should reject invalid status */
  it('should reject invalid status', () => {
    expect(() => updateCategoryVersionSchema.parse({ status: 'deleted' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Chat Schemas
// ---------------------------------------------------------------------------

describe('createChatSchema', () => {
  /** @description Should accept valid chat payload */
  it('should accept valid chat', () => {
    const result = createChatSchema.parse({
      name: 'Support Bot',
      dataset_ids: ['ds-1'],
      llm_config: { model: 'gpt-4' },
    })
    expect(result.name).toBe('Support Bot')
    expect(result.dataset_ids).toEqual(['ds-1'])
  })

  /** @description Should reject empty chat name */
  it('should reject empty name', () => {
    expect(() => createChatSchema.parse({ name: '' })).toThrow('Chat name is required')
  })
})

describe('updateChatSchema', () => {
  /** @description Should accept valid status values */
  it('should accept valid status update', () => {
    const result = updateChatSchema.parse({ status: 'inactive' })
    expect(result.status).toBe('inactive')
  })

  /** @description Should reject invalid status */
  it('should reject invalid status', () => {
    expect(() => updateChatSchema.parse({ status: 'deleted' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Search Schemas
// ---------------------------------------------------------------------------

describe('createSearchSchema', () => {
  /** @description Should accept valid search payload */
  it('should accept valid search', () => {
    const result = createSearchSchema.parse({
      name: 'Knowledge Search',
      description: 'Search app',
      search_config: { top_k: 10 },
    })
    expect(result.name).toBe('Knowledge Search')
  })

  /** @description Should reject empty name */
  it('should reject empty name', () => {
    expect(() => createSearchSchema.parse({ name: '' })).toThrow('Search name is required')
  })
})

describe('updateSearchSchema', () => {
  /** @description Should accept partial update */
  it('should accept partial update', () => {
    const result = updateSearchSchema.parse({ status: 'inactive', name: 'Updated' })
    expect(result.status).toBe('inactive')
  })
})

// ---------------------------------------------------------------------------
// Sync Config Schemas
// ---------------------------------------------------------------------------

describe('createSyncConfigSchema', () => {
  /** @description Should accept valid sync config payload */
  it('should accept valid sync config', () => {
    const result = createSyncConfigSchema.parse({
      source_type: 'github',
      connection_config: 'ghp_token123',
      sync_schedule: '0 0 * * *',
      filter_rules: { include: ['*.md'] },
    })
    expect(result.source_type).toBe('github')
    expect(result.connection_config).toBe('ghp_token123')
  })

  /** @description Should reject invalid source types */
  it('should reject unsupported source_type', () => {
    expect(() => createSyncConfigSchema.parse({
      source_type: 'ftp',
      connection_config: 'config',
    })).toThrow()
  })

  /** @description Should reject empty connection_config */
  it('should reject empty connection_config', () => {
    expect(() => createSyncConfigSchema.parse({
      source_type: 'github',
      connection_config: '',
    })).toThrow('Connection config is required')
  })

  /** @description Should accept all valid source types */
  it.each(['sharepoint', 'jira', 'confluence', 'gitlab', 'github'])('should accept source type "%s"', (type) => {
    const result = createSyncConfigSchema.parse({
      source_type: type,
      connection_config: 'config-value',
    })
    expect(result.source_type).toBe(type)
  })
})

describe('updateSyncConfigSchema', () => {
  /** @description Should accept partial sync config update */
  it('should accept partial update', () => {
    const result = updateSyncConfigSchema.parse({ status: 'paused' })
    expect(result.status).toBe('paused')
  })

  /** @description Should accept nullable sync_schedule */
  it('should accept null sync_schedule', () => {
    const result = updateSyncConfigSchema.parse({ sync_schedule: null })
    expect(result.sync_schedule).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Entity Permission Schema
// ---------------------------------------------------------------------------

describe('createEntityPermissionSchema', () => {
  /** @description Should accept valid entity permission with default level */
  it('should accept valid payload with default permission_level', () => {
    const result = createEntityPermissionSchema.parse({
      entity_type: 'chat',
      entity_id: 'chat-1',
      grantee_type: 'user',
      grantee_id: 'user-1',
    })
    // Default permission level is 'view'
    expect(result.permission_level).toBe('view')
    expect(result.entity_type).toBe('chat')
  })

  /** @description Should accept all valid entity types */
  it.each(['category', 'chat', 'search'])('should accept entity_type "%s"', (type) => {
    const result = createEntityPermissionSchema.parse({
      entity_type: type,
      entity_id: 'e-1',
      grantee_type: 'team',
      grantee_id: 't-1',
    })
    expect(result.entity_type).toBe(type)
  })

  /** @description Should accept all valid permission levels */
  it.each(['none', 'view', 'create', 'edit', 'delete'])('should accept permission_level "%s"', (level) => {
    const result = createEntityPermissionSchema.parse({
      entity_type: 'chat',
      entity_id: 'e-1',
      grantee_type: 'user',
      grantee_id: 'u-1',
      permission_level: level,
    })
    expect(result.permission_level).toBe(level)
  })

  /** @description Should reject invalid entity type */
  it('should reject invalid entity_type', () => {
    expect(() => createEntityPermissionSchema.parse({
      entity_type: 'document',
      entity_id: 'e-1',
      grantee_type: 'user',
      grantee_id: 'u-1',
    })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Member & Dataset Binding Schemas
// ---------------------------------------------------------------------------

describe('addMemberSchema', () => {
  /** @description Should accept valid UUID */
  it('should accept valid user UUID', () => {
    const result = addMemberSchema.parse({ user_id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result.user_id).toBeDefined()
  })

  /** @description Should reject invalid UUID */
  it('should reject non-UUID user_id', () => {
    expect(() => addMemberSchema.parse({ user_id: 'not-uuid' })).toThrow('Invalid user UUID')
  })
})

describe('bindDatasetsSchema', () => {
  /** @description Should accept array of valid UUIDs */
  it('should accept valid dataset UUIDs', () => {
    const result = bindDatasetsSchema.parse({
      dataset_ids: ['550e8400-e29b-41d4-a716-446655440000'],
    })
    expect(result.dataset_ids).toHaveLength(1)
  })

  /** @description Should require at least one dataset */
  it('should reject empty array', () => {
    expect(() => bindDatasetsSchema.parse({ dataset_ids: [] })).toThrow('At least one dataset required')
  })

  /** @description Should reject more than 50 datasets */
  it('should reject more than 50 datasets', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`)
    expect(() => bindDatasetsSchema.parse({ dataset_ids: ids })).toThrow('Maximum 50 datasets')
  })

  /** @description Should reject non-UUID values in array */
  it('should reject non-UUID values in dataset_ids', () => {
    expect(() => bindDatasetsSchema.parse({ dataset_ids: ['not-a-uuid'] })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Activity Query Schema
// ---------------------------------------------------------------------------

describe('activityQuerySchema', () => {
  /** @description Should apply defaults for empty query */
  it('should use default limit=20 and offset=0', () => {
    const result = activityQuerySchema.parse({})
    expect(result.limit).toBe(20)
    expect(result.offset).toBe(0)
  })

  /** @description Should coerce string numbers */
  it('should coerce string numbers to integers', () => {
    const result = activityQuerySchema.parse({ limit: '50', offset: '10' })
    expect(result.limit).toBe(50)
    expect(result.offset).toBe(10)
  })

  /** @description Should reject limit > 100 */
  it('should reject limit > 100', () => {
    expect(() => activityQuerySchema.parse({ limit: '101' })).toThrow()
  })

  /** @description Should reject negative offset */
  it('should reject negative offset', () => {
    expect(() => activityQuerySchema.parse({ offset: '-1' })).toThrow()
  })
})
