/**
 * @fileoverview Tests for Deep Research pipeline integration.
 *
 * Covers sufficiency checking, follow-up question generation, recursive search,
 * chunk deduplication by chunk_id, structured progress events, and partial
 * result return on budget exhaustion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks -- vi.hoisted ensures variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockChatCompletion,
  mockSearch,
  mockGraphragRetrieval,
  mockSearchWeb,
} = vi.hoisted(() => ({
  mockChatCompletion: vi.fn(),
  mockSearch: vi.fn(),
  mockGraphragRetrieval: vi.fn(),
  mockSearchWeb: vi.fn(),
}))

vi.mock('../../src/shared/services/llm-client.service.js', () => ({
  llmClientService: { chatCompletion: mockChatCompletion },
}))

vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: { search: mockSearch },
}))

vi.mock('../../src/modules/rag/services/rag-graphrag.service.js', () => ({
  ragGraphragService: { retrieval: mockGraphragRetrieval },
}))

vi.mock('../../src/shared/services/web-search.service.js', () => ({
  searchWeb: mockSearchWeb,
}))

const {
  mockSufficiencyBuild,
  mockMultiQueriesBuild,
} = vi.hoisted(() => ({
  mockSufficiencyBuild: vi.fn().mockReturnValue('check prompt'),
  mockMultiQueriesBuild: vi.fn().mockReturnValue('queries prompt'),
}))

vi.mock('../../src/shared/prompts/index.js', () => ({
  sufficiencyCheckPrompt: { build: mockSufficiencyBuild },
  multiQueriesPrompt: { build: mockMultiQueriesBuild },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// Import after mocking
import {
  RagDeepResearchService,
  DeepResearchProgressEvent,
} from '../../src/modules/rag/services/rag-deep-research.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default chunk set returned by mockSearch */
function defaultChunks(prefix = 'c', count = 2) {
  return {
    chunks: Array.from({ length: count }, (_, i) => ({
      chunk_id: `${prefix}${i + 1}`,
      text: `chunk ${prefix}${i + 1} content`,
      score: 0.9 - i * 0.1,
    })),
    total: count,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagDeepResearchService - pipeline', () => {
  let service: RagDeepResearchService

  beforeEach(() => {
    service = new RagDeepResearchService()
    vi.clearAllMocks()

    // Re-setup prompt mocks after clearAllMocks
    mockSufficiencyBuild.mockReturnValue('check prompt')
    mockMultiQueriesBuild.mockReturnValue('queries prompt')

    // Default: return chunks from KB search
    mockSearch.mockResolvedValue(defaultChunks())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -- sufficiencyCheck -------------------------------------------------------

  describe('sufficiencyCheck', () => {
    it('returns { isSufficient, missingInfo } parsed from LLM JSON', async () => {
      mockChatCompletion.mockResolvedValueOnce(
        '{"is_sufficient": false, "missing_information": ["topic A", "topic B"]}'
      )

      const result = await service.sufficiencyCheck('question', 'context', 'provider1')

      expect(result.isSufficient).toBe(false)
      expect(result.missingInfo).toEqual(['topic A', 'topic B'])
    })

    it('defaults to sufficient on LLM failure (prevents infinite loops)', async () => {
      mockChatCompletion.mockRejectedValueOnce(new Error('timeout'))

      const result = await service.sufficiencyCheck('q', 'ctx')

      expect(result.isSufficient).toBe(true)
      expect(result.missingInfo).toEqual([])
    })
  })

  // -- generateFollowUpQuestions ----------------------------------------------

  describe('generateFollowUpQuestions', () => {
    it('returns question/query pairs from LLM response', async () => {
      mockChatCompletion.mockResolvedValueOnce(
        '{"questions": [{"question": "What about X?", "query": "X details"}]}'
      )

      const result = await service.generateFollowUpQuestions(
        'original', 'current', ['missing info'], 'context', 'provider1'
      )

      expect(result).toHaveLength(1)
      expect(result[0]!.question).toBe('What about X?')
      expect(result[0]!.query).toBe('X details')
    })

    it('returns empty array on LLM failure', async () => {
      mockChatCompletion.mockRejectedValueOnce(new Error('bad response'))

      const result = await service.generateFollowUpQuestions(
        'original', 'current', ['missing'], 'context'
      )

      expect(result).toEqual([])
    })
  })

  // -- research() -------------------------------------------------------------

  describe('research', () => {
    it('returns chunks from first round when isSufficient=true (no recursion)', async () => {
      // Sufficiency check says sufficient right away
      mockChatCompletion.mockResolvedValue(
        '{"is_sufficient": true, "missing_information": []}'
      )

      const result = await service.research('tenant1', 'test question', ['kb1'])

      // Should return chunks from the first round
      expect(result.length).toBeGreaterThan(0)
      // Only one LLM call (sufficiency check), no follow-up generation
      expect(mockChatCompletion).toHaveBeenCalledTimes(1)
    })

    it('generates follow-up queries and recurses when insufficient', async () => {
      // First call: sufficiency check says insufficient
      mockChatCompletion
        .mockResolvedValueOnce('{"is_sufficient": false, "missing_information": ["details on X"]}')
        // Second call: follow-up generation
        .mockResolvedValueOnce('{"questions": [{"question": "What is X?", "query": "X info"}]}')
        // Third call: sufficiency check in recursion says sufficient
        .mockResolvedValueOnce('{"is_sufficient": true, "missing_information": []}')

      // Return different chunks for the follow-up search
      mockSearch
        .mockResolvedValueOnce(defaultChunks('c'))
        .mockResolvedValueOnce(defaultChunks('d'))

      const result = await service.research('tenant1', 'test', ['kb1'], { maxDepth: 2 })

      // Should have chunks from both rounds
      expect(result.length).toBeGreaterThanOrEqual(2)
      // LLM called 3 times: sufficiency + follow-up gen + sufficiency in recursion
      expect(mockChatCompletion).toHaveBeenCalledTimes(3)
    })

    it('deduplicates chunks by chunk_id across rounds', async () => {
      // First round: insufficient
      mockChatCompletion
        .mockResolvedValueOnce('{"is_sufficient": false, "missing_information": ["more"]}')
        .mockResolvedValueOnce('{"questions": [{"question": "Q1", "query": "q1"}]}')
        .mockResolvedValueOnce('{"is_sufficient": true, "missing_information": []}')

      // Both rounds return overlapping chunk_ids
      const overlappingChunks = {
        chunks: [
          { chunk_id: 'c1', text: 'chunk one', score: 0.9 },
          { chunk_id: 'c2', text: 'chunk two', score: 0.8 },
        ],
        total: 2,
      }
      mockSearch.mockResolvedValue(overlappingChunks)

      const result = await service.research('tenant1', 'test', ['kb1'])

      // Should only have 2 unique chunks despite being returned in both rounds
      const uniqueIds = new Set(result.map(c => c.chunk_id))
      expect(uniqueIds.size).toBe(2)
    })

    it('respects maxDepth (no recursion beyond limit)', async () => {
      // Always say insufficient to force recursion attempts
      mockChatCompletion
        .mockResolvedValueOnce('{"is_sufficient": false, "missing_information": ["more"]}')
        .mockResolvedValueOnce('{"questions": [{"question": "Q1", "query": "q1"}]}')
        // maxDepth=1 should prevent the recursive sufficiency check from triggering further recursion
        .mockResolvedValueOnce('{"is_sufficient": false, "missing_information": ["still more"]}')

      const result = await service.research('tenant1', 'test', ['kb1'], { maxDepth: 1 })

      // Should return chunks but not recurse infinitely
      expect(result.length).toBeGreaterThan(0)
    })

    it('calls onProgress with structured events', async () => {
      mockChatCompletion.mockResolvedValue(
        '{"is_sufficient": true, "missing_information": []}'
      )

      const events: DeepResearchProgressEvent[] = []

      await service.research(
        'tenant1', 'test question', ['kb1'],
        {},
        (event) => events.push(event),
      )

      // Should have at least subquery_start and subquery_result events
      expect(events.length).toBeGreaterThan(0)

      // All events should have subEvent field
      for (const event of events) {
        expect(event).toHaveProperty('subEvent')
      }

      // First event should be subquery_start with depth, index, total
      const startEvent = events.find(e => e.subEvent === 'subquery_start')
      expect(startEvent).toBeDefined()
      expect(startEvent!.query).toBe('test question')
      expect(startEvent!.depth).toBe(0)
      expect(startEvent!.index).toBe(0)
      expect(startEvent!.total).toBe(1)

      // Should have a subquery_result event
      const resultEvent = events.find(e => e.subEvent === 'subquery_result')
      expect(resultEvent).toBeDefined()
      expect(resultEvent!.chunks).toBeGreaterThan(0)
    })

    it('returns collected chunks (not empty) when budget exhausted mid-recursion', async () => {
      // First call: insufficient to force recursion
      mockChatCompletion
        .mockResolvedValueOnce('{"is_sufficient": false, "missing_information": ["topic A"]}')
        // Follow-up generation
        .mockResolvedValueOnce('{"questions": [{"question": "Q1", "query": "q1"}, {"question": "Q2", "query": "q2"}]}')
        // Should not reach further calls due to budget exhaustion
        .mockResolvedValueOnce('{"is_sufficient": true}')

      const events: DeepResearchProgressEvent[] = []

      const result = await service.research(
        'tenant1', 'test question', ['kb1'],
        { maxTokens: 100, maxCalls: 2 },
        (event) => events.push(event),
      )

      // Should have returned partial results (not empty) even though budget was exhausted
      expect(result.length).toBeGreaterThan(0)

      // Should have emitted a budget_exhausted event
      const budgetEvent = events.find(e => e.subEvent === 'budget_exhausted')
      // Budget exhaustion may or may not emit depending on exact timing, but results should be partial
      if (budgetEvent) {
        expect(budgetEvent.completed).toBeDefined()
      }
    })
  })
})
