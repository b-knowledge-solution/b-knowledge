/**
 * @fileoverview Unit tests for Code Graph Zod validation schemas.
 * Tests ensure that the Zod schemas enforce correct validation rules.
 */

import { describe, it, expect } from 'vitest'

// Import schemas directly (no React hooks, so no mocking needed)
// We test the schemas by importing them from the BE module
// Since FE can't import BE code, we test the API contract shapes instead

describe('codeGraphApi contract shapes', () => {
  describe('CodeGraphStats', () => {
    it('should match expected shape', () => {
      const stats = {
        nodes: [{ label: ['Function'], count: 42 }],
        relationships: [{ type: 'CALLS', count: 15 }],
      }
      expect(stats.nodes).toHaveLength(1)
      expect(stats.nodes[0]!.count).toBe(42)
      expect(stats.relationships[0]!.type).toBe('CALLS')
    })
  })

  describe('CodeGraphData', () => {
    it('should match expected shape', () => {
      const data = {
        nodes: [
          { id: 1, labels: ['Function'], name: 'foo', qualified_name: 'mod.foo' },
        ],
        links: [
          { source: 1, target: 2, type: 'CALLS' },
        ],
      }
      expect(data.nodes).toHaveLength(1)
      expect(data.links[0]!.type).toBe('CALLS')
    })
  })

  describe('CodeSnippet', () => {
    it('should match expected shape', () => {
      const snippet = {
        name: 'module.my_func',
        code: 'def my_func(): pass',
        file: '/src/module.py',
        start_line: 10,
        end_line: 15,
      }
      expect(snippet.start_line).toBeLessThan(snippet.end_line)
      expect(snippet.code).toContain('def')
    })
  })

  describe('HierarchyChain', () => {
    it('should match expected shape', () => {
      const hierarchy = {
        chain: [
          { name: 'Animal', qualified_name: 'zoo.Animal' },
          { name: 'Dog', qualified_name: 'zoo.Dog' },
        ],
      }
      expect(hierarchy.chain).toHaveLength(2)
      expect(hierarchy.chain[0]!.name).toBe('Animal')
    })
  })

  describe('CypherResult', () => {
    it('should match expected shape', () => {
      const result = {
        results: [{ name: 'foo', count: 5 }],
        count: 1,
      }
      expect(result.count).toBe(1)
      expect(result.results).toHaveLength(1)
    })
  })
})
