/**
 * @fileoverview Unit tests for the Memory API layer.
 *
 * Verifies correct HTTP methods, URLs, query string construction,
 * and payload shapes for all memory pool CRUD, message operations,
 * search, forget, delete, and import operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}))

import { memoryApi } from '@/features/memory/api/memoryApi'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('memoryApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================================================
  // getMemories (list)
  // ========================================================================

  describe('getMemories', () => {
    it('calls GET /api/memory', async () => {
      const mockData = [{ id: 'mem-1', name: 'Pool A' }]
      mockGet.mockResolvedValue(mockData)

      const result = await memoryApi.getMemories()

      expect(mockGet).toHaveBeenCalledWith('/api/memory')
      expect(result).toBe(mockData)
    })
  })

  // ========================================================================
  // getMemory (detail)
  // ========================================================================

  describe('getMemory', () => {
    it('calls GET /api/memory/:id', async () => {
      const mockMemory = { id: 'mem-1', name: 'Pool A' }
      mockGet.mockResolvedValue(mockMemory)

      const result = await memoryApi.getMemory('mem-1')

      expect(mockGet).toHaveBeenCalledWith('/api/memory/mem-1')
      expect(result).toBe(mockMemory)
    })
  })

  // ========================================================================
  // createMemory
  // ========================================================================

  describe('createMemory', () => {
    it('calls POST /api/memory with correct payload', async () => {
      const createData = { name: 'New Pool', memory_type: 15 }
      const mockResponse = { id: 'mem-new', name: 'New Pool' }
      mockPost.mockResolvedValue(mockResponse)

      const result = await memoryApi.createMemory(createData)

      expect(mockPost).toHaveBeenCalledWith('/api/memory', createData)
      expect(result).toBe(mockResponse)
    })

    it('passes optional fields in the payload', async () => {
      const createData = {
        name: 'Full Pool',
        description: 'With all options',
        memory_type: 3,
        storage_type: 'graph' as const,
        extraction_mode: 'realtime' as const,
        permission: 'team' as const,
        scope_type: 'agent' as const,
      }
      mockPost.mockResolvedValue({ id: 'mem-full' })

      await memoryApi.createMemory(createData)

      expect(mockPost).toHaveBeenCalledWith('/api/memory', createData)
    })
  })

  // ========================================================================
  // updateMemory
  // ========================================================================

  describe('updateMemory', () => {
    it('calls PUT /api/memory/:id with update payload', async () => {
      const updateData = { name: 'Renamed Pool' }
      mockPut.mockResolvedValue({ id: 'mem-1', name: 'Renamed Pool' })

      const result = await memoryApi.updateMemory('mem-1', updateData)

      expect(mockPut).toHaveBeenCalledWith('/api/memory/mem-1', updateData)
      expect(result).toEqual({ id: 'mem-1', name: 'Renamed Pool' })
    })
  })

  // ========================================================================
  // deleteMemory
  // ========================================================================

  describe('deleteMemory', () => {
    it('calls DELETE /api/memory/:id', async () => {
      mockDelete.mockResolvedValue(undefined)

      await memoryApi.deleteMemory('mem-1')

      expect(mockDelete).toHaveBeenCalledWith('/api/memory/mem-1')
    })
  })

  // ========================================================================
  // getMemoryMessages (list messages)
  // ========================================================================

  describe('getMemoryMessages', () => {
    it('calls GET /api/memory/:id/messages with no params', async () => {
      const mockData = { items: [], total: 0 }
      mockGet.mockResolvedValue(mockData)

      const result = await memoryApi.getMemoryMessages('mem-1')

      expect(mockGet).toHaveBeenCalledWith('/api/memory/mem-1/messages')
      expect(result).toBe(mockData)
    })

    it('builds query string from pagination params', async () => {
      mockGet.mockResolvedValue({ items: [], total: 0 })

      await memoryApi.getMemoryMessages('mem-1', { page: 2, page_size: 50 })

      const url = mockGet.mock.calls[0]![0] as string
      expect(url).toContain('/api/memory/mem-1/messages?')
      expect(url).toContain('page=2')
      expect(url).toContain('page_size=50')
    })

    it('includes keyword filter in query string', async () => {
      mockGet.mockResolvedValue({ items: [], total: 0 })

      await memoryApi.getMemoryMessages('mem-1', { keyword: 'test search' })

      const url = mockGet.mock.calls[0]![0] as string
      expect(url).toContain('keyword=test+search')
    })

    it('includes message_type filter in query string', async () => {
      mockGet.mockResolvedValue({ items: [], total: 0 })

      await memoryApi.getMemoryMessages('mem-1', { message_type: 2 })

      const url = mockGet.mock.calls[0]![0] as string
      expect(url).toContain('message_type=2')
    })

    it('omits undefined params from query string', async () => {
      mockGet.mockResolvedValue({ items: [], total: 0 })

      await memoryApi.getMemoryMessages('mem-1', { page: 1 })

      const url = mockGet.mock.calls[0]![0] as string
      expect(url).toContain('page=1')
      expect(url).not.toContain('keyword')
      expect(url).not.toContain('message_type')
    })
  })

  // ========================================================================
  // searchMemoryMessages
  // ========================================================================

  describe('searchMemoryMessages', () => {
    it('calls POST /api/memory/:id/search with query', async () => {
      const mockResults = [{ message_id: 'msg-1', score: 0.95 }]
      mockPost.mockResolvedValue(mockResults)

      const result = await memoryApi.searchMemoryMessages('mem-1', 'find something')

      expect(mockPost).toHaveBeenCalledWith('/api/memory/mem-1/search', {
        query: 'find something',
      })
      expect(result).toBe(mockResults)
    })

    it('includes top_k when provided', async () => {
      mockPost.mockResolvedValue([])

      await memoryApi.searchMemoryMessages('mem-1', 'test', 5)

      expect(mockPost).toHaveBeenCalledWith('/api/memory/mem-1/search', {
        query: 'test',
        top_k: 5,
      })
    })

    it('omits top_k when undefined', async () => {
      mockPost.mockResolvedValue([])

      await memoryApi.searchMemoryMessages('mem-1', 'test')

      const payload = mockPost.mock.calls[0]![1] as Record<string, unknown>
      expect(payload).not.toHaveProperty('top_k')
    })
  })

  // ========================================================================
  // forgetMemoryMessage
  // ========================================================================

  describe('forgetMemoryMessage', () => {
    it('calls PUT /api/memory/:id/messages/:messageId/forget', async () => {
      mockPut.mockResolvedValue(undefined)

      await memoryApi.forgetMemoryMessage('mem-1', 'msg-42')

      expect(mockPut).toHaveBeenCalledWith('/api/memory/mem-1/messages/msg-42/forget')
    })
  })

  // ========================================================================
  // deleteMemoryMessage
  // ========================================================================

  describe('deleteMemoryMessage', () => {
    it('calls DELETE /api/memory/:id/messages/:messageId', async () => {
      mockDelete.mockResolvedValue(undefined)

      await memoryApi.deleteMemoryMessage('mem-1', 'msg-42')

      expect(mockDelete).toHaveBeenCalledWith('/api/memory/mem-1/messages/msg-42')
    })
  })

  // ========================================================================
  // importChatHistory
  // ========================================================================

  describe('importChatHistory', () => {
    it('calls POST /api/memory/:memoryId/import with session_id', async () => {
      const mockResponse = { imported: 12 }
      mockPost.mockResolvedValue(mockResponse)

      const result = await memoryApi.importChatHistory('mem-1', 'session-abc')

      expect(mockPost).toHaveBeenCalledWith('/api/memory/mem-1/import', {
        session_id: 'session-abc',
      })
      expect(result).toEqual({ imported: 12 })
    })
  })

  // ========================================================================
  // getChatSessions
  // ========================================================================

  describe('getChatSessions', () => {
    it('calls GET /api/chat/conversations', async () => {
      const mockSessions = [{ id: 's-1', name: 'Chat A', created_at: '2026-01-01' }]
      mockGet.mockResolvedValue(mockSessions)

      const result = await memoryApi.getChatSessions()

      expect(mockGet).toHaveBeenCalledWith('/api/chat/conversations')
      expect(result).toBe(mockSessions)
    })
  })

  // ========================================================================
  // Error handling
  // ========================================================================

  describe('error handling', () => {
    it('propagates API errors from getMemories()', async () => {
      mockGet.mockRejectedValue(new Error('Network error'))

      await expect(memoryApi.getMemories()).rejects.toThrow('Network error')
    })

    it('propagates API errors from createMemory()', async () => {
      mockPost.mockRejectedValue(new Error('Validation failed'))

      await expect(memoryApi.createMemory({ name: '' })).rejects.toThrow('Validation failed')
    })

    it('propagates API errors from deleteMemory()', async () => {
      mockDelete.mockRejectedValue(new Error('Not found'))

      await expect(memoryApi.deleteMemory('nonexistent')).rejects.toThrow('Not found')
    })

    it('propagates API errors from searchMemoryMessages()', async () => {
      mockPost.mockRejectedValue(new Error('Search error'))

      await expect(memoryApi.searchMemoryMessages('mem-1', 'q')).rejects.toThrow('Search error')
    })

    it('propagates API errors from importChatHistory()', async () => {
      mockPost.mockRejectedValue(new Error('Import failed'))

      await expect(memoryApi.importChatHistory('mem-1', 's-1')).rejects.toThrow('Import failed')
    })
  })
})
