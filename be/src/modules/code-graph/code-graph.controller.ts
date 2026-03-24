/**
 * @fileoverview Controller for code knowledge graph HTTP endpoints.
 * @description Handles request/response for graph queries, delegates to CodeGraphService.
 * @module code-graph/code-graph.controller
 */

import type { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { codeGraphService } from './code-graph.service.js'

/**
 * @description Controller for code knowledge graph endpoints.
 * Routes validated requests to the Memgraph-backed service.
 */
export class CodeGraphController {
  /**
   * @description Get graph statistics for a knowledge base.
   * @param req - Express request with kbId param
   * @param res - Express response
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const stats = await codeGraphService.getStats(kbId!)
      res.json(stats)
    } catch (error) {
      log.error('Error fetching code graph stats', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to fetch graph statistics' })
    }
  }

  /**
   * @description Find callers of a function/method.
   * @param req - Express request with kbId param and name query
   * @param res - Express response
   */
  async getCallers(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const { name } = req.query as { name: string }
      const results = await codeGraphService.getCallers(kbId!, name)
      res.json(results)
    } catch (error) {
      log.error('Error fetching callers', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to fetch callers' })
    }
  }

  /**
   * @description Find callees of a function/method.
   * @param req - Express request with kbId param and name query
   * @param res - Express response
   */
  async getCallees(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const { name } = req.query as { name: string }
      const results = await codeGraphService.getCallees(kbId!, name)
      res.json(results)
    } catch (error) {
      log.error('Error fetching callees', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to fetch callees' })
    }
  }

  /**
   * @description Get source code snippet for a function/method.
   * @param req - Express request with kbId param and name query
   * @param res - Express response
   */
  async getSnippet(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const { name } = req.query as { name: string }
      const results = await codeGraphService.getSnippet(kbId!, name)
      res.json(results)
    } catch (error) {
      log.error('Error fetching snippet', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to fetch code snippet' })
    }
  }

  /**
   * @description Get class inheritance hierarchy.
   * @param req - Express request with kbId param and name query
   * @param res - Express response
   */
  async getHierarchy(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const { name } = req.query as { name: string }
      const results = await codeGraphService.getHierarchy(kbId!, name)
      res.json(results)
    } catch (error) {
      log.error('Error fetching hierarchy', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to fetch class hierarchy' })
    }
  }

  /**
   * @description Get graph data for visualization.
   * @param req - Express request with kbId param and optional limit query
   * @param res - Express response with nodes and links
   */
  async getGraphData(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const limit = parseInt(req.query['limit'] as string, 10) || 500
      const data = await codeGraphService.getGraphData(kbId!, limit)
      res.json(data)
    } catch (error) {
      log.error('Error fetching graph data', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to fetch graph data' })
    }
  }

  /**
   * @description Execute a raw Cypher query (admin-only).
   * @param req - Express request with validated body
   * @param res - Express response
   */
  async executeCypher(req: Request, res: Response): Promise<void> {
    try {
      const { cypher, params } = req.body as { cypher: string; params?: Record<string, unknown> }
      const results = await codeGraphService.query(cypher, params)
      res.json({ results, count: results.length })
    } catch (error) {
      log.error('Error executing Cypher query', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to execute Cypher query' })
    }
  }

  /**
   * @description Natural language query with AI-powered Cypher generation.
   * Takes a plain English question, generates Cypher via LLM, executes it.
   * @param req - Express request with kbId param and question body
   * @param res - Express response with cypher, results, and count
   */
  async nlQuery(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const { question, providerId } = req.body as { question: string; providerId?: string }
      const result = await codeGraphService.nlQuery(kbId!, question, providerId)
      res.json(result)
    } catch (error) {
      log.error('Error executing NL query', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to execute natural language query' })
    }
  }

  /**
   * @description Search for code entities by name pattern.
   * @param req - Express request with kbId param and query/limit params
   * @param res - Express response with matching code entities
   */
  async searchCode(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const { query, limit } = req.query as { query: string; limit?: string }
      const results = await codeGraphService.searchCode(kbId!, query, limit ? parseInt(limit, 10) : undefined)
      res.json({ results, count: results.length })
    } catch (error) {
      log.error('Error searching code', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to search code entities' })
    }
  }

  /**
   * @description Get import/dependency relationships for a KB or specific entity.
   * @param req - Express request with kbId param and optional name query
   * @param res - Express response with dependency records
   */
  async getDependencies(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const { name, limit } = req.query as { name?: string; limit?: string }
      const results = await codeGraphService.getDependencies(kbId!, name, limit ? parseInt(limit, 10) : undefined)
      res.json({ results, count: results.length })
    } catch (error) {
      log.error('Error fetching dependencies', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to fetch dependencies' })
    }
  }

  /**
   * @description Get graph schema (node labels + relationship types) for a KB.
   * @param req - Express request with kbId param
   * @param res - Express response with schema
   */
  async getSchema(req: Request, res: Response): Promise<void> {
    try {
      const { kbId } = req.params
      const schema = await codeGraphService.getSchema(kbId!)
      res.json(schema)
    } catch (error) {
      log.error('Error fetching schema', error as Record<string, unknown>)
      res.status(500).json({ error: 'Failed to fetch graph schema' })
    }
  }
}
