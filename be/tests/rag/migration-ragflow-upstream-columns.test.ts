/**
 * @fileoverview Tests for the 20260323140000_add_ragflow_upstream_columns migration.
 *
 * Verifies that the up migration adds the expected columns and the down
 * migration removes them, using a mock Knex schema builder.
 */

import { describe, it, expect, vi } from 'vitest'

import { up, down } from '../../src/shared/db/migrations/20260323140000_add_ragflow_upstream_columns'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Create a fresh mock Knex instance that tracks all schema operations
 */
function createMockKnex() {
  const operations: Array<{ table: string; op: string; column: string; args?: unknown[] }> = []
  const existingColumns = new Map<string, Set<string>>()

  function makeColumnBuilder(tableName: string, columnName: string): any {
    const builder: any = {}
    const record = (op: string, ...args: unknown[]) => {
      operations.push({ table: tableName, op, column: columnName, args })
      return builder
    }
    builder.notNullable = () => record('notNullable')
    builder.nullable = () => record('nullable')
    builder.defaultTo = (val: unknown) => record('defaultTo', val)
    builder.index = () => record('index')
    return builder
  }

  const knex = {
    schema: {
      hasColumn: vi.fn().mockImplementation(async (tableName: string, columnName: string) => {
        return existingColumns.get(tableName)?.has(columnName) ?? false
      }),
      alterTable: vi.fn().mockImplementation(async (tableName: string, callback: (table: any) => void) => {
        const tableBuilder: any = {
          boolean: (col: string) => {
            operations.push({ table: tableName, op: 'boolean', column: col })
            return makeColumnBuilder(tableName, col)
          },
          string: (col: string, length?: number) => {
            operations.push({ table: tableName, op: 'string', column: col, args: [length] })
            return makeColumnBuilder(tableName, col)
          },
          dropColumn: (col: string) => {
            operations.push({ table: tableName, op: 'dropColumn', column: col })
          },
        }
        callback(tableBuilder)
      }),
    },
  }

  return { knex, operations }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Migration: 20260323140000_add_ragflow_upstream_columns', () => {
  describe('up', () => {
    it('adds release boolean column to user_canvas_version with correct modifiers', async () => {
      const { knex, operations } = createMockKnex()

      await up(knex as any)

      // Find all operations for the release column
      const releaseOps = operations.filter(
        op => op.table === 'user_canvas_version' && op.column === 'release',
      )

      expect(releaseOps.some(op => op.op === 'boolean')).toBe(true)
      expect(releaseOps.some(op => op.op === 'notNullable')).toBe(true)
      expect(releaseOps.some(op => op.op === 'defaultTo' && op.args?.[0] === false)).toBe(true)
      expect(releaseOps.some(op => op.op === 'index')).toBe(true)
    })

    it('adds version_title string column to api_4_conversation', async () => {
      const { knex, operations } = createMockKnex()

      await up(knex as any)

      // Find all operations for the version_title column
      const vtOps = operations.filter(
        op => op.table === 'api_4_conversation' && op.column === 'version_title',
      )

      expect(vtOps.some(op => op.op === 'string' && op.args?.[0] === 255)).toBe(true)
      expect(vtOps.some(op => op.op === 'nullable')).toBe(true)
    })

    it('calls alterTable for both tables', async () => {
      const { knex } = createMockKnex()

      await up(knex as any)

      expect(knex.schema.alterTable).toHaveBeenCalledTimes(2)
      expect(knex.schema.alterTable).toHaveBeenCalledWith(
        'user_canvas_version',
        expect.any(Function),
      )
      expect(knex.schema.alterTable).toHaveBeenCalledWith(
        'api_4_conversation',
        expect.any(Function),
      )
    })
  })

  describe('down', () => {
    it('drops release column from user_canvas_version', async () => {
      const { knex, operations } = createMockKnex()

      await down(knex as any)

      const dropOps = operations.filter(
        op => op.table === 'user_canvas_version' && op.op === 'dropColumn',
      )
      expect(dropOps).toHaveLength(1)
      expect(dropOps[0]!.column).toBe('release')
    })

    it('drops version_title column from api_4_conversation', async () => {
      const { knex, operations } = createMockKnex()

      await down(knex as any)

      const dropOps = operations.filter(
        op => op.table === 'api_4_conversation' && op.op === 'dropColumn',
      )
      expect(dropOps).toHaveLength(1)
      expect(dropOps[0]!.column).toBe('version_title')
    })

    it('calls alterTable for both tables', async () => {
      const { knex } = createMockKnex()

      await down(knex as any)

      expect(knex.schema.alterTable).toHaveBeenCalledTimes(2)
    })
  })
})
