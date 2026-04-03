/**
 * @fileoverview Tests for GraphRAG retrieval pipeline.
 *
 * Covers query rewrite, entity keyword search, n-hop traversal with score decay,
 * and context formatting with token budget.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks -- vi.hoisted ensures variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockOsSearch, mockChatCompletion } = vi.hoisted(() => ({
  mockOsSearch: vi.fn(),
  mockChatCompletion: vi.fn(),
}))

vi.mock('@opensearch-project/opensearch', () => ({
  Client: vi.fn().mockImplementation(() => ({
    search: mockOsSearch,
    count: vi.fn(),
  })),
}))

vi.mock('../../src/shared/services/llm-client.service.js', () => ({
  llmClientService: { chatCompletion: mockChatCompletion },
}))

vi.mock('../../src/shared/prompts/index.js', () => ({
  graphragPrompt: { system: 'Extract entity types and entities.' },
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

import { RagGraphragService, GraphEntity } from '../../src/modules/rag/services/rag-graphrag.service'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagGraphragService - retrieval pipeline', () => {
  let service: RagGraphragService

  beforeEach(() => {
    service = new RagGraphragService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -- queryRewrite -----------------------------------------------------------

  describe('queryRewrite', () => {
    it('returns parsed entity types and entities from LLM response', async () => {
      // Mock entity type samples aggregation
      mockOsSearch.mockResolvedValueOnce({
        body: {
          aggregations: {
            types: {
              buckets: [
                { key: 'Person', sample_entities: { hits: { hits: [{ _source: { entity_kwd: 'Alice' } }] } } },
              ],
            },
          },
        },
      })

      // Mock LLM returning JSON with types and entities
      mockChatCompletion.mockResolvedValueOnce('{"types": ["Person"], "entities": ["Alice", "Bob"]}')

      const result = await service.queryRewrite(['kb1'], 'Who is Alice?')

      expect(result.typeKeywords).toEqual(['Person'])
      expect(result.entities).toEqual(['Alice', 'Bob'])
    })

    it('returns empty arrays on LLM failure', async () => {
      // Mock entity type samples aggregation
      mockOsSearch.mockResolvedValueOnce({
        body: { aggregations: { types: { buckets: [] } } },
      })

      // LLM throws error
      mockChatCompletion.mockRejectedValueOnce(new Error('LLM timeout'))

      const result = await service.queryRewrite(['kb1'], 'test question')

      expect(result.typeKeywords).toEqual([])
      expect(result.entities).toEqual([])
    })
  })

  // -- getRelevantEntsByKeywords ----------------------------------------------

  describe('getRelevantEntsByKeywords', () => {
    it('returns mapped GraphEntity objects from OpenSearch hits', async () => {
      mockOsSearch.mockResolvedValueOnce({
        body: {
          hits: {
            hits: [
              {
                _id: 'e1',
                _score: 5.0,
                _source: {
                  entity_kwd: 'Alice',
                  entity_type_kwd: 'Person',
                  content_with_weight: 'A software engineer',
                  rank_flt: 0.8,
                  n_hop_with_weight: [],
                },
              },
            ],
          },
        },
      })

      const result = await service.getRelevantEntsByKeywords(['kb1'], ['Alice'])

      expect(result).toHaveLength(1)
      expect(result[0]!.entity).toBe('Alice')
      expect(result[0]!.type).toBe('Person')
      expect(result[0]!.description).toBe('A software engineer')
      expect(result[0]!.similarity).toBe(5.0)
      expect(result[0]!.pagerank).toBe(0.8)
    })
  })

  // -- nHopTraversal ----------------------------------------------------------

  describe('nHopTraversal', () => {
    it('produces relations with decayed scores (entity_sim / (2 + hop_index))', () => {
      const entities: GraphEntity[] = [
        {
          entity: 'Alice',
          type: 'Person',
          description: 'Engineer',
          similarity: 6.0,
          pagerank: 0.5,
          nHopEnts: [
            { path: ['Alice', 'Bob', 'Charlie'], weights: [1, 1] },
          ],
        },
      ]

      const relations = service.nHopTraversal(entities)

      // First hop: 6.0 / (2 + 0) * 1 = 3.0
      expect(relations[0]!.from).toBe('Alice')
      expect(relations[0]!.to).toBe('Bob')
      expect(relations[0]!.score).toBeCloseTo(3.0)

      // Second hop: 6.0 / (2 + 1) * 1 = 2.0
      expect(relations[1]!.from).toBe('Bob')
      expect(relations[1]!.to).toBe('Charlie')
      expect(relations[1]!.score).toBeCloseTo(2.0)
    })

    it('returns empty array for entities with no n-hop data', () => {
      const entities: GraphEntity[] = [
        {
          entity: 'Isolated',
          type: 'Thing',
          description: 'No connections',
          similarity: 1.0,
          pagerank: 0,
          nHopEnts: [],
        },
      ]

      const relations = service.nHopTraversal(entities)
      expect(relations).toHaveLength(0)
    })
  })

  // -- retrieval (full pipeline) ----------------------------------------------

  describe('retrieval', () => {
    it('produces formatted context string with entity and relation sections', async () => {
      // Mock queryRewrite: entity type samples aggregation
      mockOsSearch.mockResolvedValueOnce({
        body: { aggregations: { types: { buckets: [] } } },
      })
      // Mock LLM for query rewrite
      mockChatCompletion.mockResolvedValueOnce('{"types": ["Person"], "entities": ["Alice"]}')

      // Mock getRelevantEntsByKeywords
      mockOsSearch.mockResolvedValueOnce({
        body: {
          hits: {
            hits: [
              {
                _id: 'e1',
                _score: 5.0,
                _source: {
                  entity_kwd: 'Alice',
                  entity_type_kwd: 'Person',
                  content_with_weight: 'Engineer at Acme',
                  rank_flt: 0.5,
                  n_hop_with_weight: [],
                },
              },
            ],
          },
        },
      })

      // Mock getRelevantEntsByTypes
      mockOsSearch.mockResolvedValueOnce({
        body: { hits: { hits: [] } },
      })

      // Mock getRelevantRelations
      mockOsSearch.mockResolvedValueOnce({
        body: {
          hits: {
            hits: [
              {
                _id: 'r1',
                _score: 3.0,
                _source: {
                  from_entity_kwd: 'Alice',
                  to_entity_kwd: 'Acme',
                  weight_int: 1,
                  content_with_weight: 'works at',
                },
              },
            ],
          },
        },
      })

      const context = await service.retrieval(['kb1'], 'Who is Alice?', 'provider1')

      // Should include entity section
      expect(context).toContain('## Knowledge Graph Entities')
      expect(context).toContain('Alice')
      expect(context).toContain('Person')

      // Should include relation section
      expect(context).toContain('## Knowledge Graph Relations')
      expect(context).toContain('Acme')
    })

    it('respects maxTokens budget (truncates at limit)', async () => {
      // Mock queryRewrite
      mockOsSearch.mockResolvedValueOnce({
        body: { aggregations: { types: { buckets: [] } } },
      })
      mockChatCompletion.mockResolvedValueOnce('{"types": [], "entities": ["LongEntity"]}')

      // Return many entities to exceed budget
      const manyHits = Array.from({ length: 50 }, (_, i) => ({
        _id: `e${i}`,
        _score: 1.0,
        _source: {
          entity_kwd: `Entity_${i}_${'x'.repeat(100)}`,
          entity_type_kwd: 'Type',
          content_with_weight: 'A'.repeat(200),
          rank_flt: 0,
          n_hop_with_weight: [],
        },
      }))

      mockOsSearch.mockResolvedValueOnce({ body: { hits: { hits: manyHits } } })
      mockOsSearch.mockResolvedValueOnce({ body: { hits: { hits: [] } } })
      mockOsSearch.mockResolvedValueOnce({ body: { hits: { hits: [] } } })

      // Use a very small token budget (100 tokens = 400 chars)
      const context = await service.retrieval(['kb1'], 'test', 'p1', 100)

      // Context should be truncated -- not all 50 entities should appear
      const entityCount = (context.match(/Entity_/g) || []).length
      expect(entityCount).toBeLessThan(50)
    })
  })
})
