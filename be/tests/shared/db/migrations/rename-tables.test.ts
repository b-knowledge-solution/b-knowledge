/**
 * @fileoverview Tests for the external_* to history_* table rename migration.
 *
 * Verifies that `up` renames 4 tables and `down` reverts them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('20260312_rename_external_to_history_tables migration', () => {
  let up: any
  let down: any
  let mockKnex: any
  let renameCalls: Array<[string, string]>

  beforeEach(async () => {
    vi.clearAllMocks()
    renameCalls = []

    mockKnex = {
      schema: {
        renameTable: vi.fn().mockImplementation((from: string, to: string) => {
          renameCalls.push([from, to])
          return Promise.resolve()
        }),
      },
    }

    const migration = await import('../../../../src/shared/db/migrations/20260312_rename_external_to_history_tables.js')
    up = migration.up
    down = migration.down
  })

  it('up renames external_* tables to history_*', async () => {
    await up(mockKnex)

    expect(renameCalls).toContainEqual(['external_chat_sessions', 'history_chat_sessions'])
    expect(renameCalls).toContainEqual(['external_chat_messages', 'history_chat_messages'])
    expect(renameCalls).toContainEqual(['external_search_sessions', 'history_search_sessions'])
    expect(renameCalls).toContainEqual(['external_search_records', 'history_search_records'])
    expect(renameCalls).toHaveLength(4)
  })

  it('down reverts history_* tables back to external_*', async () => {
    await down(mockKnex)

    expect(renameCalls).toContainEqual(['history_chat_sessions', 'external_chat_sessions'])
    expect(renameCalls).toContainEqual(['history_chat_messages', 'external_chat_messages'])
    expect(renameCalls).toContainEqual(['history_search_sessions', 'external_search_sessions'])
    expect(renameCalls).toContainEqual(['history_search_records', 'external_search_records'])
    expect(renameCalls).toHaveLength(4)
  })
})
