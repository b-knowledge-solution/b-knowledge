/**
 * @fileoverview Unit tests for SyncSchedulerService.
 * @description Covers cron job registration, unregistration, update, and init
 *   with all external dependencies mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSchedule = vi.fn()
const mockStop = vi.fn()
const mockValidate = vi.fn()

vi.mock('node-cron', () => {
  const obj = {
    schedule: (...args: any[]) => {
      mockSchedule(...args)
      return { stop: mockStop }
    },
    validate: (...args: any[]) => mockValidate(...args),
  }
  return { default: obj, ...obj }
})

const mockConnectorFindAll = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    connector: {
      findAll: (...args: any[]) => mockConnectorFindAll(...args),
    },
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock syncService to avoid circular dependency
vi.mock('../../src/modules/sync/services/sync.service.js', () => ({
  syncService: {
    triggerSync: vi.fn().mockResolvedValue({ id: 'sl-1' }),
  },
}))

// Import after mocks
import { SyncSchedulerService } from '../../src/modules/sync/services/sync-scheduler.service'

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('SyncSchedulerService', () => {
  let scheduler: SyncSchedulerService

  beforeEach(() => {
    vi.clearAllMocks()
    scheduler = new SyncSchedulerService()
    // Default: cron expressions are valid
    mockValidate.mockReturnValue(true)
  })

  afterEach(() => {
    // Ensure cron jobs are stopped after each test
    scheduler.stopAll()
  })

  // -------------------------------------------------------------------------
  // registerTask
  // -------------------------------------------------------------------------

  describe('registerTask', () => {
    /** @description Should register a cron task with valid schedule */
    it('should register a cron task with valid schedule', () => {
      scheduler.registerTask('conn-1', '0 2 * * *')

      // Verify cron.schedule was called with the correct schedule
      expect(mockSchedule).toHaveBeenCalledWith(
        '0 2 * * *',
        expect.any(Function),
      )
    })

    /** @description Should skip registration for invalid cron expression */
    it('should skip registration for invalid cron expression', () => {
      mockValidate.mockReturnValue(false)

      scheduler.registerTask('conn-1', 'invalid-cron')

      // Should not schedule anything
      expect(mockSchedule).not.toHaveBeenCalled()
    })

    /** @description Should unregister existing task before re-registering */
    it('should unregister existing task before re-registering', () => {
      scheduler.registerTask('conn-1', '0 2 * * *')
      scheduler.registerTask('conn-1', '0 3 * * *')

      // First task should be stopped before second is registered
      expect(mockStop).toHaveBeenCalledTimes(1)
      expect(mockSchedule).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  // unregisterTask
  // -------------------------------------------------------------------------

  describe('unregisterTask', () => {
    /** @description Should stop and remove a registered task */
    it('should stop and remove a registered task', () => {
      scheduler.registerTask('conn-1', '0 2 * * *')
      scheduler.unregisterTask('conn-1')

      expect(mockStop).toHaveBeenCalled()
    })

    /** @description Should not throw when unregistering non-existent task */
    it('should not throw when unregistering non-existent task', () => {
      expect(() => scheduler.unregisterTask('missing-id')).not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // updateTask
  // -------------------------------------------------------------------------

  describe('updateTask', () => {
    /** @description Should register task when schedule is provided */
    it('should register task when schedule is provided', () => {
      scheduler.updateTask('conn-1', '0 2 * * *')

      expect(mockSchedule).toHaveBeenCalled()
    })

    /** @description Should unregister task when schedule is null */
    it('should unregister task when schedule is null', () => {
      scheduler.registerTask('conn-1', '0 2 * * *')
      scheduler.updateTask('conn-1', null)

      expect(mockStop).toHaveBeenCalled()
    })

    /** @description Should unregister task when schedule is empty string */
    it('should unregister task when schedule is empty string', () => {
      scheduler.registerTask('conn-1', '0 2 * * *')
      scheduler.updateTask('conn-1', '')

      expect(mockStop).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // init
  // -------------------------------------------------------------------------

  describe('init', () => {
    /** @description Should load active connectors with schedules on init */
    it('should load active connectors with schedules on init', async () => {
      mockConnectorFindAll.mockResolvedValue([
        { id: 'conn-1', schedule: '0 2 * * *', status: 'active' },
        { id: 'conn-2', schedule: '0 3 * * *', status: 'active' },
      ])

      await scheduler.init()

      // Both connectors should be registered
      expect(mockSchedule).toHaveBeenCalledTimes(2)
    })

    /** @description Should skip connectors without schedule */
    it('should skip connectors without schedule', async () => {
      mockConnectorFindAll.mockResolvedValue([
        { id: 'conn-1', schedule: '0 2 * * *', status: 'active' },
        { id: 'conn-2', schedule: null, status: 'active' },
        { id: 'conn-3', schedule: '', status: 'active' },
      ])

      await scheduler.init()

      // Only conn-1 should be registered
      expect(mockSchedule).toHaveBeenCalledTimes(1)
    })

    /** @description Should handle empty connector list gracefully */
    it('should handle empty connector list gracefully', async () => {
      mockConnectorFindAll.mockResolvedValue([])

      await scheduler.init()

      expect(mockSchedule).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // stopAll
  // -------------------------------------------------------------------------

  describe('stopAll', () => {
    /** @description Should stop all registered tasks */
    it('should stop all registered tasks', () => {
      scheduler.registerTask('conn-1', '0 2 * * *')
      scheduler.registerTask('conn-2', '0 3 * * *')

      scheduler.stopAll()

      expect(mockStop).toHaveBeenCalledTimes(2)
    })
  })
})
