/**
 * @fileoverview Tests for BudgetTracker and budget-aware Deep Research.
 *
 * Covers token exhaustion, call exhaustion, getStatus(), partial result
 * return on budget exhaustion, and structured progress events.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so variables are available inside vi.mock factories
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
  BudgetTracker,
  RagDeepResearchService,
  DeepResearchProgressEvent,
} from '../../src/modules/rag/services/rag-deep-research.service'

// ---------------------------------------------------------------------------
// BudgetTracker unit tests
// ---------------------------------------------------------------------------

describe('BudgetTracker', () => {
  it('should not be exhausted initially', () => {
    const tracker = new BudgetTracker(100, 2)
    expect(tracker.isExhausted()).toBe(false)
  })

  it('should be exhausted when token limit is reached', () => {
    const tracker = new BudgetTracker(100, 2)
    tracker.recordCall(60)
    expect(tracker.isExhausted()).toBe(false)
    tracker.recordCall(50)
    // 110 >= 100 tokens
    expect(tracker.isExhausted()).toBe(true)
  })

  it('should be exhausted when call limit is reached', () => {
    const tracker = new BudgetTracker(100, 2)
    tracker.recordCall(10)
    tracker.recordCall(10)
    // 2 calls >= maxCalls 2
    expect(tracker.isExhausted()).toBe(true)
  })

  it('should return correct status via getStatus()', () => {
    const tracker = new BudgetTracker(500, 10)
    tracker.recordCall(100)
    tracker.recordCall(50)
    const status = tracker.getStatus()
    expect(status).toEqual({
      tokensUsed: 150,
      tokensMax: 500,
      callsUsed: 2,
      callsMax: 10,
    })
  })
})

// ---------------------------------------------------------------------------
// Deep Research budget integration tests
// ---------------------------------------------------------------------------

describe('RagDeepResearchService (budget-aware)', () => {
  let service: RagDeepResearchService

  beforeEach(() => {
    service = new RagDeepResearchService()
    vi.clearAllMocks()

    // Re-setup prompt mocks after clearAllMocks (which resets mockReturnValue)
    mockSufficiencyBuild.mockReturnValue('check prompt')
    mockMultiQueriesBuild.mockReturnValue('queries prompt')

    // Default: return some chunks from KB search
    mockSearch.mockResolvedValue({
      chunks: [
        { chunk_id: 'c1', text: 'chunk one', score: 0.9 },
        { chunk_id: 'c2', text: 'chunk two', score: 0.8 },
      ],
      total: 2,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should stop after first round when budget maxTokens=1', async () => {
    // Sufficiency check would try to use LLM but budget should be exhausted first
    mockChatCompletion.mockResolvedValue('{"is_sufficient": false, "missing_information": ["more data"]}')

    const result = await service.research(
      'tenant1',
      'test question',
      ['kb1'],
      { maxTokens: 1, maxCalls: 15 },
    )

    // Should return partial results from the first round (not empty)
    expect(result.length).toBeGreaterThan(0)
    // Sufficiency check should have been attempted at most once
    expect(mockChatCompletion).toHaveBeenCalledTimes(1)
  })

  it('should return chunks from completed sub-queries when budget exhausted mid-recursion', async () => {
    // First sufficiency check says insufficient
    mockChatCompletion
      .mockResolvedValueOnce('{"is_sufficient": false, "missing_information": ["topic A"]}')
      // Follow-up generation
      .mockResolvedValueOnce('{"questions": [{"question": "Q1", "query": "q1"}]}')
      // Second sufficiency check (should not be reached with tight budget)
      .mockResolvedValueOnce('{"is_sufficient": true, "missing_information": []}')

    const result = await service.research(
      'tenant1',
      'test question',
      ['kb1'],
      { maxTokens: 100, maxCalls: 2 },
    )

    // Should have returned chunks (not empty) even though budget was exhausted
    expect(result.length).toBeGreaterThan(0)
  })

  it('should emit structured DeepResearchProgressEvent objects', async () => {
    // Make sufficiency check say sufficient right away
    mockChatCompletion.mockResolvedValue('{"is_sufficient": true, "missing_information": []}')

    const events: DeepResearchProgressEvent[] = []

    await service.research(
      'tenant1',
      'test question',
      ['kb1'],
      {},
      (event) => events.push(event),
    )

    // Should have at least a subquery_start event
    expect(events.length).toBeGreaterThan(0)

    // All events should have subEvent field
    for (const event of events) {
      expect(event).toHaveProperty('subEvent')
    }

    // First event should be subquery_start with query, depth, index, total
    const startEvent = events.find(e => e.subEvent === 'subquery_start')
    expect(startEvent).toBeDefined()
    expect(startEvent!.query).toBe('test question')
    expect(startEvent!.depth).toBe(0)
  })

  it('should not recurse when info is sufficient on first round', async () => {
    mockChatCompletion.mockResolvedValue('{"is_sufficient": true, "missing_information": []}')

    const result = await service.research(
      'tenant1',
      'test question',
      ['kb1'],
    )

    // Should return chunks from the first round
    expect(result.length).toBeGreaterThan(0)
    // Only one LLM call (sufficiency check), no follow-up generation
    expect(mockChatCompletion).toHaveBeenCalledTimes(1)
  })
})
