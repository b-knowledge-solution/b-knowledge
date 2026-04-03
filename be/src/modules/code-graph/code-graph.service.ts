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
   * @description Get graph schema (node labels + relationship types) for a KB.
   * Used internally for NL query prompt context and externally for schema UI.
   * @param kbId - Knowledge base ID
   * @returns Object with labels array and relationshipTypes array
   */
  async getSchema(kbId: string) {
    const [labels, relTypes] = await Promise.all([
      this.query(
        `MATCH (n {kb_id: $kbId})
         UNWIND labels(n) AS label
         RETURN DISTINCT label ORDER BY label`,
        { kbId },
      ),
      this.query(
        `MATCH (n {kb_id: $kbId})-[r]->(m {kb_id: $kbId})
         RETURN DISTINCT type(r) AS type ORDER BY type`,
        { kbId },
      ),
    ])
    return {
      labels: labels.map(r => r['label'] as string),
      relationshipTypes: relTypes.map(r => r['type'] as string),
      nodeProperties: [
        'qualified_name', 'name', 'source_code', 'path', 'language',
        'start_line', 'end_line', 'parameters', 'return_type', 'kb_id',
      ],
    }
  }

  /**
   * @description Natural language query: converts question to Cypher via LLM,
   * then executes the generated Cypher against Memgraph.
   * @param kbId - Knowledge base ID
   * @param question - Natural language question about the codebase
   * @param providerId - Optional LLM provider ID (uses default chat model if omitted)
   * @returns Object with generated cypher, raw results, and result count
   */
  async nlQuery(kbId: string, question: string, providerId?: string) {
    // Lazy import to avoid circular dependency at module level
    const { llmClientService } = await import('@/shared/services/llm-client.service.js')

    // Get current graph schema for prompt context
    const schema = await this.getSchema(kbId)

    // Build system prompt with graph schema context
    const systemPrompt = `You are a Cypher query generator for a code knowledge graph stored in Memgraph.

GRAPH SCHEMA:
- Node labels: ${schema.labels.join(', ') || 'Function, Method, Class, Interface, Module, File'}
- Relationship types: ${schema.relationshipTypes.join(', ') || 'CALLS, IMPORTS, INHERITS, CONTAINS'}
- Node properties: ${schema.nodeProperties.join(', ')}

RULES:
1. Generate ONLY a valid Cypher query. No explanation, no markdown, no code fences.
2. ALWAYS filter nodes by kb_id: WHERE n.kb_id = $kbId
3. Use LIMIT 20 unless the user specifies a different count.
4. Use case-insensitive matching with toLower() for name searches.
5. Return useful properties: name, qualified_name, path, source_code, parameters, return_type.
6. For pattern matching use CONTAINS or regex with =~ operator.
7. Do NOT use CREATE, DELETE, SET, MERGE, or any write operations.`

    // Call LLM to generate Cypher from the question
    const cypher = await llmClientService.chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      {
        providerId,
        temperature: 0.1,
        max_tokens: 1024,
      },
    )

    // Clean up LLM response (strip markdown fences if present)
    const cleanCypher = cypher
      .replace(/^```(?:cypher|sql)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()

    // Safety check: block write operations
    const writeOps = /\b(CREATE|DELETE|SET|MERGE|REMOVE|DROP|DETACH)\b/i
    if (writeOps.test(cleanCypher)) {
      return {
        cypher: cleanCypher,
        results: [],
        count: 0,
        error: 'Generated query contains write operations which are blocked for safety.',
      }
    }

    // Execute the generated Cypher
    try {
      const results = await this.query(cleanCypher, { kbId })
      return {
        cypher: cleanCypher,
        results,
        count: results.length,
      }
    } catch (error) {
      return {
        cypher: cleanCypher,
        results: [],
        count: 0,
        error: `Cypher execution failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  /**
   * @description Search for code entities by name pattern.
   * Supports substring matching across all node types.
   * @param kbId - Knowledge base ID
   * @param searchQuery - Search term (case-insensitive substring match)
   * @param limit - Maximum results to return
   * @returns Array of matching nodes with name, type, path, and source code
   */
  async searchCode(kbId: string, searchQuery: string, limit = 50) {
    const lowerQuery = searchQuery.toLowerCase()
    return this.query(
      `MATCH (n {kb_id: $kbId})
       WHERE toLower(n.name) CONTAINS $query
          OR toLower(n.qualified_name) CONTAINS $query
       RETURN labels(n) AS labels, n.name AS name, n.qualified_name AS qualified_name,
              n.path AS path, n.language AS language, n.source_code AS source_code,
              n.parameters AS parameters, n.return_type AS return_type,
              n.start_line AS start_line, n.end_line AS end_line
       ORDER BY n.name
       LIMIT $limit`,
      { kbId, query: lowerQuery, limit: neo4j.int(limit) },
    )
  }

  /**
   * @description Analyze import dependencies for a knowledge base.
   * When name is provided, shows imports for that specific entity.
   * Otherwise returns all import relationships.
   * @param kbId - Knowledge base ID
   * @param name - Optional function/module name to filter by
   * @param limit - Maximum results
   * @returns Array of import relationship records
   */
  async getDependencies(kbId: string, name?: string, limit = 100) {
    // Specific entity dependencies
    if (name) {
      return this.query(
        `MATCH (source {kb_id: $kbId})-[:IMPORTS]->(target)
         WHERE source.name = $name OR source.qualified_name ENDS WITH $dotName
         RETURN source.qualified_name AS source, source.path AS source_path,
                target.qualified_name AS dependency, target.path AS dep_path
         LIMIT $limit`,
        { kbId, name, dotName: `.${name}`, limit: neo4j.int(limit) },
      )
    }

    // All dependencies across the KB
    return this.query(
      `MATCH (source {kb_id: $kbId})-[:IMPORTS]->(target {kb_id: $kbId})
       RETURN source.qualified_name AS source, source.path AS source_path,
              target.qualified_name AS dependency, target.path AS dep_path
       ORDER BY source.qualified_name
       LIMIT $limit`,
      { kbId, limit: neo4j.int(limit) },
    )
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
