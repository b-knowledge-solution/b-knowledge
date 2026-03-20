/**
 * @fileoverview Unit tests for ProjectChatService.
 * @description Covers CRUD operations for project chat assistant configurations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChatFindByProjectId = vi.fn()
const mockChatFindById = vi.fn()
const mockChatCreate = vi.fn()
const mockChatUpdate = vi.fn()
const mockChatDelete = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    projectChat: {
      findByProjectId: (...args: any[]) => mockChatFindByProjectId(...args),
      findById: (...args: any[]) => mockChatFindById(...args),
      create: (...args: any[]) => mockChatCreate(...args),
      update: (...args: any[]) => mockChatUpdate(...args),
      delete: (...args: any[]) => mockChatDelete(...args),
    },
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/shared/models/types.js', () => ({}))

// Import after mocks
import { ProjectChatService } from '../../src/modules/projects/services/project-chat.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @description Create a mock user context */
function createUser(overrides: Partial<any> = {}) {
  return { id: 'user-1', email: 'u@test.com', role: 'user', ...overrides }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectChatService', () => {
  let service: ProjectChatService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ProjectChatService()
  })

  // -------------------------------------------------------------------------
  // listChats
  // -------------------------------------------------------------------------

  describe('listChats', () => {
    /** @description Should list all chats for a project */
    it('should return chat configurations for a project', async () => {
      const chats = [{ id: 'ch-1', name: 'Support Bot' }]
      mockChatFindByProjectId.mockResolvedValue(chats)

      const result = await service.listChats('p1')

      expect(mockChatFindByProjectId).toHaveBeenCalledWith('p1')
      expect(result).toEqual(chats)
    })

    /** @description Should return empty array when no chats exist */
    it('should return empty array for project with no chats', async () => {
      mockChatFindByProjectId.mockResolvedValue([])

      const result = await service.listChats('p1')
      expect(result).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // getChatById
  // -------------------------------------------------------------------------

  describe('getChatById', () => {
    /** @description Should return a chat by ID */
    it('should return chat by ID', async () => {
      const chat = { id: 'ch-1', name: 'Bot' }
      mockChatFindById.mockResolvedValue(chat)

      expect(await service.getChatById('ch-1')).toEqual(chat)
    })

    /** @description Should return undefined for non-existent chat */
    it('should return undefined when not found', async () => {
      mockChatFindById.mockResolvedValue(undefined)
      expect(await service.getChatById('missing')).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // createChat
  // -------------------------------------------------------------------------

  describe('createChat', () => {
    /** @description Should create chat with JSON-serialized config fields */
    it('should create chat with serialized JSON fields', async () => {
      const created = { id: 'ch-1', name: 'New Bot' }
      mockChatCreate.mockResolvedValue(created)

      const result = await service.createChat('p1', {
        name: 'New Bot',
        dataset_ids: ['ds-1', 'ds-2'],
        llm_config: { model: 'gpt-4' },
        prompt_config: { template: 'Hello {name}' },
      }, createUser())

      // Verify all array/object fields are JSON-stringified
      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          name: 'New Bot',
          dataset_ids: JSON.stringify(['ds-1', 'ds-2']),
          ragflow_dataset_ids: JSON.stringify([]),
          llm_config: JSON.stringify({ model: 'gpt-4' }),
          prompt_config: JSON.stringify({ template: 'Hello {name}' }),
          status: 'active',
          created_by: 'user-1',
          updated_by: 'user-1',
        }),
      )
      expect(result).toEqual(created)
    })

    /** @description Should default array/object fields to empty when not provided */
    it('should default optional config fields to empty', async () => {
      mockChatCreate.mockResolvedValue({ id: 'ch-1' })

      await service.createChat('p1', { name: 'Minimal Bot' }, createUser())

      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          dataset_ids: JSON.stringify([]),
          ragflow_dataset_ids: JSON.stringify([]),
          llm_config: JSON.stringify({}),
          prompt_config: JSON.stringify({}),
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // updateChat
  // -------------------------------------------------------------------------

  describe('updateChat', () => {
    /** @description Should update only provided fields with JSON serialization */
    it('should update name and serialize config fields', async () => {
      mockChatUpdate.mockResolvedValue({ id: 'ch-1', name: 'Updated' })

      const result = await service.updateChat('ch-1', {
        name: 'Updated',
        llm_config: { model: 'gpt-3.5' },
      }, createUser())

      expect(mockChatUpdate).toHaveBeenCalledWith(
        'ch-1',
        expect.objectContaining({
          name: 'Updated',
          llm_config: JSON.stringify({ model: 'gpt-3.5' }),
          updated_by: 'user-1',
        }),
      )
      expect(result).toEqual({ id: 'ch-1', name: 'Updated' })
    })

    /** @description Should not include undefined fields in update payload */
    it('should skip undefined fields', async () => {
      mockChatUpdate.mockResolvedValue({ id: 'ch-1' })

      await service.updateChat('ch-1', { status: 'inactive' }, createUser())

      const payload = mockChatUpdate.mock.calls[0][1]
      expect(payload).toEqual({ updated_by: 'user-1', status: 'inactive' })
      expect(payload).not.toHaveProperty('name')
      expect(payload).not.toHaveProperty('llm_config')
    })

    /** @description Should return undefined when chat not found */
    it('should return undefined for non-existent chat', async () => {
      mockChatUpdate.mockResolvedValue(undefined)

      const result = await service.updateChat('missing', { name: 'x' }, createUser())
      expect(result).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // deleteChat
  // -------------------------------------------------------------------------

  describe('deleteChat', () => {
    /** @description Should delete a chat by ID */
    it('should delete chat', async () => {
      mockChatDelete.mockResolvedValue(undefined)

      await service.deleteChat('ch-1')

      expect(mockChatDelete).toHaveBeenCalledWith('ch-1')
    })
  })
})
