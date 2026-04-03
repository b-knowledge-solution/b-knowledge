/**
 * @fileoverview Tests for AgentService.releaseVersion() and getReleasedVersion().
 *
 * Covers releasing a version (clearing previous release, setting new one),
 * getting the currently released version, and handling no released version.
 * Upstream port: canvas_service release version workflow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAgentModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getKnex: vi.fn(),
}))

const mockAgentTemplateModel = vi.hoisted(() => ({
  findById: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    agent: mockAgentModel,
    agentTemplate: mockAgentTemplateModel,
  },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Track db calls for releaseVersion and getReleasedVersion
const { mockDbUpdate, mockDbFirst } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockDbFirst: vi.fn(),
}))

vi.mock('../../src/shared/db/knex.js', () => {
  const dbFn = () => {
    const builder: any = {
      where: vi.fn().mockImplementation(() => builder),
      update: (...args: any[]) => mockDbUpdate(...args),
      orderBy: vi.fn().mockImplementation(() => builder),
      first: () => mockDbFirst(),
    }
    return builder
  }
  return { db: dbFn }
})

import { agentService } from '../../src/modules/agents/services/agent.service.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentService — canvas version release', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // releaseVersion
  // -----------------------------------------------------------------------

  describe('releaseVersion', () => {
    it('clears existing release flags then sets the new one', async () => {
      // Both updates should succeed
      mockDbUpdate.mockResolvedValue(1)

      await agentService.releaseVersion('canvas-1', 'version-5', 'tenant-1')

      // Should call update twice: first to clear, then to set
      expect(mockDbUpdate).toHaveBeenCalledTimes(2)
      // First call clears all release flags for this canvas
      expect(mockDbUpdate).toHaveBeenNthCalledWith(1, { release: false })
      // Second call sets release=true on the specific version
      expect(mockDbUpdate).toHaveBeenNthCalledWith(2, { release: true })
    })

    it('handles canvas with no prior released version', async () => {
      // First update affects 0 rows (no existing release), second sets the new one
      mockDbUpdate.mockResolvedValueOnce(0)
      mockDbUpdate.mockResolvedValueOnce(1)

      // Should not throw
      await agentService.releaseVersion('canvas-new', 'version-1', 'tenant-1')

      expect(mockDbUpdate).toHaveBeenCalledTimes(2)
    })
  })

  // -----------------------------------------------------------------------
  // getReleasedVersion
  // -----------------------------------------------------------------------

  describe('getReleasedVersion', () => {
    it('returns the released version row when one exists', async () => {
      const versionRow = {
        id: 'version-5',
        canvas_id: 'canvas-1',
        tenant_id: 'tenant-1',
        release: true,
        create_time: '2026-01-15T00:00:00Z',
      }
      mockDbFirst.mockResolvedValue(versionRow)

      const result = await agentService.getReleasedVersion('canvas-1', 'tenant-1')

      expect(result).toEqual(versionRow)
    })

    it('returns null when no version is released', async () => {
      // No row found
      mockDbFirst.mockResolvedValue(undefined)

      const result = await agentService.getReleasedVersion('canvas-none', 'tenant-1')

      expect(result).toBeNull()
    })
  })
})
