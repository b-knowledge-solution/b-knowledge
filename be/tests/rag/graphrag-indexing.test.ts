/**
 * @fileoverview Tests for GraphRAG indexing — getGraphMetrics method.
 *
 * Mocks OpenSearch client to verify aggregation queries return correct
 * entity, relation, and community counts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockOsCount, mockOsSearch } = vi.hoisted(() => ({
  mockOsCount: vi.fn(),
  mockOsSearch: vi.fn(),
}))

vi.mock('@opensearch-project/opensearch', () => ({
  Client: vi.fn().mockImplementation(() => ({
    count: mockOsCount,
    search: mockOsSearch,
  })),
}))

vi.mock('../../src/shared/services/llm-client.service.js', () => ({
  llmClientService: { chatCompletion: vi.fn() },
  LlmMessage: {},
}))

vi.mock('../../src/shared/prompts/index.js', () => ({
  graphragPrompt: { system: 'mock prompt' },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    opensearch: {
      systemTenantId: 'test-tenant',
      host: 'http://localhost:9200',
      password: '',
    },
  },
}))

import { RagGraphragService } from '../../src/modules/rag/services/rag-graphrag.service'

describe('RagGraphragService.getGraphMetrics', () => {
  let service: RagGraphragService

  beforeEach(() => {
    service = new RagGraphragService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns counts from OpenSearch count queries', async () => {
    // Mock count responses for entity, relation, community_report
    mockOsCount
      .mockResolvedValueOnce({ body: { count: 42 } })   // entity
      .mockResolvedValueOnce({ body: { count: 15 } })   // relation
      .mockResolvedValueOnce({ body: { count: 3 } })    // community_report

    // Mock search for lastBuiltAt
    mockOsSearch.mockResolvedValueOnce({
      body: {
        hits: { hits: [{ _source: { create_time: '2026-03-19T00:00:00Z' } }] },
      },
    })

    const result = await service.getGraphMetrics(['kb1', 'kb2'])

    expect(result.entityCount).toBe(42)
    expect(result.relationCount).toBe(15)
    expect(result.communityCount).toBe(3)
    expect(result.lastBuiltAt).toBe('2026-03-19T00:00:00Z')

    // Verify count was called three times (entity, relation, community_report)
    expect(mockOsCount).toHaveBeenCalledTimes(3)
  })

  it('returns zeros for empty kbIds', async () => {
    const result = await service.getGraphMetrics([])

    expect(result.entityCount).toBe(0)
    expect(result.relationCount).toBe(0)
    expect(result.communityCount).toBe(0)
    expect(result.lastBuiltAt).toBeNull()

    // Should not call OpenSearch at all
    expect(mockOsCount).not.toHaveBeenCalled()
  })

  it('handles OpenSearch errors gracefully', async () => {
    mockOsCount.mockRejectedValue(new Error('Connection refused'))

    const result = await service.getGraphMetrics(['kb1'])

    expect(result.entityCount).toBe(0)
    expect(result.relationCount).toBe(0)
    expect(result.communityCount).toBe(0)
    expect(result.lastBuiltAt).toBeNull()
  })
})
