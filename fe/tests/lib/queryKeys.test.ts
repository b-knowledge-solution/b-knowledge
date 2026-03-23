/**
 * @fileoverview Tests for centralized query key factory.
 *
 * Tests:
 * - Each feature domain has correct base key structure
 * - Dynamic key factories produce correctly shaped arrays
 * - Keys are unique across domains
 * - Keys include parameters for cache granularity
 *
 * No external mocks needed — queryKeys is a pure data module.
 */

import { describe, it, expect } from 'vitest'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Tests
// ============================================================================

describe('queryKeys', () => {
  // --------------------------------------------------------------------------
  // Base keys (all)
  // --------------------------------------------------------------------------

  describe('base keys (all)', () => {
    /** @description Each domain should have a unique single-element base key */
    it('each domain has a distinct base key', () => {
      // Collect all "all" keys to check for uniqueness
      const baseKeys = [
        queryKeys.auth.all,
        queryKeys.datasets.all,
        queryKeys.audit.all,
        queryKeys.users.all,
        queryKeys.teams.all,
        queryKeys.dashboard.all,
        queryKeys.glossary.all,
        queryKeys.search.all,
        queryKeys.broadcast.all,
        queryKeys.converter.all,
        queryKeys.systemTools.all,
        queryKeys.histories.all,
        queryKeys.chat.all,
        queryKeys.sharedUser.all,
        queryKeys.projects.all,
        queryKeys.llmProvider.all,
        queryKeys.parsingScheduler.all,
      ]

      // Extract first element of each base key
      const baseStrings = baseKeys.map((k) => k[0])

      // All base keys should be unique
      const uniqueSet = new Set(baseStrings)
      expect(uniqueSet.size).toBe(baseStrings.length)
    })

    /** @description Base keys should be readonly arrays (as const) */
    it('base keys are arrays', () => {
      expect(Array.isArray(queryKeys.auth.all)).toBe(true)
      expect(Array.isArray(queryKeys.datasets.all)).toBe(true)
      expect(Array.isArray(queryKeys.dashboard.all)).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // Auth keys
  // --------------------------------------------------------------------------

  describe('auth', () => {
    /** @description auth.all should be ["auth"] */
    it('has correct base key', () => {
      expect(queryKeys.auth.all).toEqual(['auth'])
    })

    /** @description auth.me() should extend the base key */
    it('me() extends the base key', () => {
      expect(queryKeys.auth.me()).toEqual(['auth', 'me'])
    })
  })

  // --------------------------------------------------------------------------
  // Datasets keys
  // --------------------------------------------------------------------------

  describe('datasets', () => {
    /** @description datasets.detail should include the dataset ID */
    it('detail() includes dataset ID', () => {
      expect(queryKeys.datasets.detail('ds-1')).toEqual(['datasets', 'detail', 'ds-1'])
    })

    /** @description datasets.documents should include the dataset ID */
    it('documents() includes dataset ID', () => {
      expect(queryKeys.datasets.documents('ds-1')).toEqual(['datasets', 'ds-1', 'documents'])
    })

    /** @description datasets.chunks should include params for cache granularity */
    it('chunks() includes dataset ID and params', () => {
      const params = { page: 1, limit: 10 }
      expect(queryKeys.datasets.chunks('ds-1', params)).toEqual([
        'datasets', 'ds-1', 'chunks', params,
      ])
    })

    /** @description datasets.versionFiles should include both dataset and version IDs */
    it('versionFiles() includes dataset and version IDs', () => {
      expect(queryKeys.datasets.versionFiles('ds-1', 'v-1')).toEqual([
        'datasets', 'ds-1', 'versions', 'v-1', 'files',
      ])
    })

    /** @description datasets.graphMetrics should nest under detail */
    it('graphMetrics() nests under detail key', () => {
      expect(queryKeys.datasets.graphMetrics('ds-1')).toEqual([
        'datasets', 'detail', 'ds-1', 'graphMetrics',
      ])
    })
  })

  // --------------------------------------------------------------------------
  // Dashboard keys
  // --------------------------------------------------------------------------

  describe('dashboard', () => {
    /** @description dashboard.stats should include date range params */
    it('stats() includes date range params', () => {
      const key = queryKeys.dashboard.stats('2024-01-01', '2024-12-31')
      expect(key).toEqual(['dashboard', 'stats', { startDate: '2024-01-01', endDate: '2024-12-31' }])
    })

    /** @description dashboard.analytics should handle undefined dates */
    it('analytics() handles undefined dates', () => {
      const key = queryKeys.dashboard.analytics()
      expect(key).toEqual(['dashboard', 'analytics', { startDate: undefined, endDate: undefined }])
    })

    /** @description dashboard.feedback should include date range params */
    it('feedback() includes date range params', () => {
      const key = queryKeys.dashboard.feedback('2024-06-01', '2024-06-30')
      expect(key).toEqual(['dashboard', 'feedback', { startDate: '2024-06-01', endDate: '2024-06-30' }])
    })
  })

  // --------------------------------------------------------------------------
  // Teams keys
  // --------------------------------------------------------------------------

  describe('teams', () => {
    /** @description teams.detail should include team ID */
    it('detail() includes team ID', () => {
      expect(queryKeys.teams.detail('t-1')).toEqual(['teams', 'detail', 't-1'])
    })

    /** @description teams.members should include team ID */
    it('members() includes team ID', () => {
      expect(queryKeys.teams.members('t-1')).toEqual(['teams', 't-1', 'members'])
    })
  })

  // --------------------------------------------------------------------------
  // Users keys
  // --------------------------------------------------------------------------

  describe('users', () => {
    /** @description users.list should include optional roles filter */
    it('list() includes roles filter', () => {
      expect(queryKeys.users.list(['admin', 'user'])).toEqual([
        'users', 'list', { roles: ['admin', 'user'] },
      ])
    })

    /** @description users.list should handle undefined roles */
    it('list() handles no roles', () => {
      expect(queryKeys.users.list()).toEqual(['users', 'list', { roles: undefined }])
    })
  })

  // --------------------------------------------------------------------------
  // Chat keys
  // --------------------------------------------------------------------------

  describe('chat', () => {
    /** @description chat.conversations should include dialog ID */
    it('conversations() includes dialog ID', () => {
      expect(queryKeys.chat.conversations('d-1')).toEqual([
        'chat', 'dialogs', 'd-1', 'conversations',
      ])
    })

    /** @description chat.embedTokens should include dialog ID */
    it('embedTokens() includes dialog ID', () => {
      expect(queryKeys.chat.embedTokens('d-1')).toEqual([
        'chat', 'dialogs', 'd-1', 'embed-tokens',
      ])
    })
  })

  // --------------------------------------------------------------------------
  // LLM Provider keys
  // --------------------------------------------------------------------------

  describe('llmProvider', () => {
    /** @description llmProvider.detail should include provider ID */
    it('detail() includes provider ID', () => {
      expect(queryKeys.llmProvider.detail('p-1')).toEqual([
        'llm-provider', 'detail', 'p-1',
      ])
    })

    /** @description llmProvider.defaults should extend base key */
    it('defaults() extends base key', () => {
      expect(queryKeys.llmProvider.defaults()).toEqual(['llm-provider', 'defaults'])
    })

    /** @description llmProvider.presets should extend base key */
    it('presets() extends base key', () => {
      expect(queryKeys.llmProvider.presets()).toEqual(['llm-provider', 'presets'])
    })
  })

  // --------------------------------------------------------------------------
  // Projects keys
  // --------------------------------------------------------------------------

  describe('projects', () => {
    /** @description projects.members should include project ID */
    it('members() includes project ID', () => {
      expect(queryKeys.projects.members('proj-1')).toEqual([
        'projects', 'proj-1', 'members',
      ])
    })

    /** @description projects.datasets should include project ID */
    it('datasets() includes project ID', () => {
      expect(queryKeys.projects.datasets('proj-1')).toEqual([
        'projects', 'proj-1', 'datasets',
      ])
    })

    /** @description projects.activity should include project ID */
    it('activity() includes project ID', () => {
      expect(queryKeys.projects.activity('proj-1')).toEqual([
        'projects', 'proj-1', 'activity',
      ])
    })
  })

  // --------------------------------------------------------------------------
  // Histories keys
  // --------------------------------------------------------------------------

  describe('histories', () => {
    /** @description histories.chat should include search, filters, and page */
    it('chat() includes search, filters, and page', () => {
      const key = queryKeys.histories.chat('test query', { appId: 'a1' }, 2)
      expect(key).toEqual([
        'histories', 'chat', { search: 'test query', appId: 'a1', page: 2 },
      ])
    })

    /** @description histories.chatSession should include session ID */
    it('chatSession() includes session ID', () => {
      expect(queryKeys.histories.chatSession('ses-1')).toEqual([
        'histories', 'chat', 'ses-1',
      ])
    })
  })

  // --------------------------------------------------------------------------
  // Audit keys
  // --------------------------------------------------------------------------

  describe('audit', () => {
    /** @description audit.logs should include pagination and filters */
    it('logs() includes page, limit, and filters', () => {
      const key = queryKeys.audit.logs(1, 50, { userId: 'u-1' })
      expect(key).toEqual([
        'audit', 'logs', { page: 1, limit: 50, userId: 'u-1' },
      ])
    })

    /** @description audit.actions should extend base key */
    it('actions() extends base key', () => {
      expect(queryKeys.audit.actions()).toEqual(['audit', 'actions'])
    })
  })

  // --------------------------------------------------------------------------
  // Search keys
  // --------------------------------------------------------------------------

  describe('search', () => {
    /** @description search.results should include dataset ID, query, and filters */
    it('results() includes dataset, query, and filters', () => {
      const key = queryKeys.search.results('ds-1', 'test', { type: 'doc' })
      expect(key).toEqual(['search', 'results', 'ds-1', 'test', { type: 'doc' }])
    })

    /** @description search.apps should include optional params */
    it('apps() includes params', () => {
      expect(queryKeys.search.apps({ status: 'active' })).toEqual([
        'search', 'apps', { status: 'active' },
      ])
    })
  })

  // --------------------------------------------------------------------------
  // Glossary keys
  // --------------------------------------------------------------------------

  describe('glossary', () => {
    /** @description glossary.task should include task ID */
    it('task() includes task ID', () => {
      expect(queryKeys.glossary.task('gt-1')).toEqual(['glossary', 'tasks', 'gt-1'])
    })

    /** @description glossary.search should include query */
    it('search() includes query string', () => {
      expect(queryKeys.glossary.search('react')).toEqual(['glossary', 'search', 'react'])
    })
  })

  // --------------------------------------------------------------------------
  // Converter keys
  // --------------------------------------------------------------------------

  describe('converter', () => {
    /** @description converter.jobs should include optional filters */
    it('jobs() includes filters', () => {
      expect(queryKeys.converter.jobs({ status: 'done' })).toEqual([
        'converter', 'jobs', { status: 'done' },
      ])
    })

    /** @description converter.jobDetail should include job ID */
    it('jobDetail() includes job ID', () => {
      expect(queryKeys.converter.jobDetail('j-1')).toEqual(['converter', 'jobs', 'j-1'])
    })
  })
})
