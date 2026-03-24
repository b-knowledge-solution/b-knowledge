/**
 * @fileoverview Memgraph Bolt service for code knowledge graph queries.
 * @description Wraps neo4j-driver to execute Cypher queries against Memgraph.
 * Uses the centralized config for Bolt URL.
 * @module code-graph/code-graph.service
 */

import neo4j from 'neo4j-driver'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Service for querying the code knowledge graph stored in Memgraph.
 * Provides methods for graph stats, callers/callees, hierarchy, snippets,
 * and raw Cypher execution.
 */
class CodeGraphService {
  private driver: ReturnType<typeof neo4j.driver> | null = null

  /**
   * @description Get or create the neo4j Bolt driver (lazy singleton).
   * @returns neo4j Driver instance
   */
  private getDriver() {
    if (!this.driver) {
      this.driver = neo4j.driver(config.memgraph.boltUrl)
      log.info(`Memgraph driver connected: ${config.memgraph.boltUrl}`)
    }
    return this.driver
  }

  /**
   * @description Execute a Cypher query against Memgraph.
   * @param cypher - Cypher query string
   * @param params - Query parameters
   * @returns Array of result records as plain objects
   */
  async query(cypher: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    const driver = this.getDriver()
    const session = driver.session()
    try {
      const result = await session.run(cypher, params)
      return result.records.map((record) => {
        const obj: Record<string, unknown> = {}
        record.keys.forEach((key) => {
          const k = String(key)
          const value = record.get(k)
          // Convert neo4j integers to JS numbers
          obj[k] = neo4j.isInt(value) ? value.toNumber() : value
        })
        return obj
      })
    } finally {
      await session.close()
    }
  }

  /**
   * @description Get graph statistics for a knowledge base.
   * @param kbId - Knowledge base ID
   * @returns Node and relationship counts grouped by label/type
   */
  async getStats(kbId: string) {
    const [nodes, rels] = await Promise.all([
      this.query(
        'MATCH (n {kb_id: $kbId}) RETURN labels(n) AS label, count(n) AS count',
        { kbId },
      ),
      this.query(
        'MATCH (n {kb_id: $kbId})-[r]->(m {kb_id: $kbId}) RETURN type(r) AS type, count(r) AS count',
        { kbId },
      ),
    ])
    return { nodes, relationships: rels }
  }

  /**
   * @description Find all callers of a function/method.
   * @param kbId - Knowledge base ID
   * @param name - Function/method name to search for
   * @returns Array of caller records with qualified names and file paths
   */
  async getCallers(kbId: string, name: string) {
    return this.query(
      `MATCH (caller {kb_id: $kbId})-[:CALLS]->(target {kb_id: $kbId})
       WHERE target.name = $name OR target.qualified_name ENDS WITH $dotName
       RETURN caller.qualified_name AS caller, caller.path AS file,
              target.qualified_name AS target`,
      { kbId, name, dotName: `.${name}` },
    )
  }

  /**
   * @description Find all functions/methods called by a given function.
   * @param kbId - Knowledge base ID
   * @param name - Function/method name to search from
   * @returns Array of callee records with qualified names and file paths
   */
  async getCallees(kbId: string, name: string) {
    return this.query(
      `MATCH (source {kb_id: $kbId})-[:CALLS]->(callee {kb_id: $kbId})
       WHERE source.name = $name OR source.qualified_name ENDS WITH $dotName
       RETURN callee.qualified_name AS callee, callee.path AS file,
              source.qualified_name AS source`,
      { kbId, name, dotName: `.${name}` },
    )
  }

  /**
   * @description Retrieve source code snippet for a function/method.
   * @param kbId - Knowledge base ID
   * @param name - Function/method name
   * @returns Snippet records with code, file path, and line numbers
   */
  async getSnippet(kbId: string, name: string) {
    return this.query(
      `MATCH (n {kb_id: $kbId})
       WHERE (n:Function OR n:Method) AND
             (n.name = $name OR n.qualified_name ENDS WITH $dotName)
       RETURN n.qualified_name AS name, n.source_code AS code,
              n.path AS file, n.start_line AS start_line, n.end_line AS end_line`,
      { kbId, name, dotName: `.${name}` },
    )
  }

  /**
   * @description Get class inheritance hierarchy.
   * @param kbId - Knowledge base ID
   * @param name - Class name to trace hierarchy for
   * @returns Hierarchy chain records
   */
  async getHierarchy(kbId: string, name: string) {
    return this.query(
      `MATCH path = (child {kb_id: $kbId})-[:INHERITS*1..5]->(parent {kb_id: $kbId})
       WHERE child.name = $name OR parent.name = $name
       RETURN [n IN nodes(path) | {name: n.name, qualified_name: n.qualified_name}] AS chain`,
      { kbId, name },
    )
  }

  /**
   * @description Get full graph data for visualization (with limit).
   * @param kbId - Knowledge base ID
   * @param limit - Max number of nodes to return (default 500)
   * @returns Nodes and relationships for graph rendering
   */
  async getGraphData(kbId: string, limit = 500) {
    const nodesResult = await this.query(
      `MATCH (n {kb_id: $kbId})
       RETURN id(n) AS id, labels(n) AS labels, n.name AS name,
              n.qualified_name AS qualified_name, n.path AS path,
              n.language AS language
       LIMIT $limit`,
      { kbId, limit: neo4j.int(limit) },
    )

    const relsResult = await this.query(
      `MATCH (n {kb_id: $kbId})-[r]->(m {kb_id: $kbId})
       RETURN id(n) AS source, id(m) AS target, type(r) AS type
       LIMIT $limit`,
      { kbId, limit: neo4j.int(limit) },
    )

    return { nodes: nodesResult, links: relsResult }
  }

  /**
   * @description Close the Bolt driver. Called on app shutdown.
   */
  async close() {
    if (this.driver) {
      await this.driver.close()
      this.driver = null
    }
  }
}

/** Singleton instance of CodeGraphService */
export const codeGraphService = new CodeGraphService()
