/**
 * @fileoverview SQL-based retrieval service for structured data questions.
 *
 * Migrates RAGFlow's `use_sql()` function. When a knowledge base has a
 * `field_map` in its parser_config, this service can generate SQL from
 * natural language, execute it against OpenSearch's SQL plugin, and return
 * formatted markdown tables.
 *
 * @module modules/rag/services/rag-sql
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { llmClientService, LlmMessage } from '@/shared/services/llm-client.service.js'
import { sqlGenerationPrompt } from '@/shared/prompts/index.js'
import { ChunkResult } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'
import { config } from '@/shared/config/index.js'

// Centralized tenant ID and OpenSearch connection from config
const SYSTEM_TENANT_ID = config.opensearch.systemTenantId
const ES_HOST = config.opensearch.host
const ES_PASSWORD = config.opensearch.password

/** Per-KB timeout for SQL generation + execution (ms) */
const SQL_TIMEOUT_MS = 15_000

/** Regex to detect dangerous DDL/DML keywords */
const DANGEROUS_SQL_RE = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE)\b/i

/** Valid KB ID format: 32 hex characters */
const KB_ID_RE = /^[0-9a-f]{32}$/i

/**
 * @description Service for SQL-based retrieval over structured data stored in OpenSearch.
 * Uses LLM to generate SQL from natural language and executes via OpenSearch SQL plugin.
 */
export class RagSqlService {
  /**
   * @description Attempt SQL-based retrieval for structured data questions.
   * 1. Check if KB has field_map (structured field mapping)
   * 2. Use LLM to generate SQL from natural language
   * 3. Validate and execute SQL against OpenSearch
   * 4. Format results as markdown table
   *
   * Includes retry logic, KB filter injection, SQL validation, and per-KB timeout.
   *
   * @param {string} question - User question
   * @param {string[]} kbIds - Knowledge base IDs
   * @param {string} [providerId] - LLM provider ID for SQL generation
   * @param {string} [tenantId] - Tenant ID for index scoping (defaults to system tenant)
   * @returns {Promise<{ answer: string; chunks: ChunkResult[] } | null>} Object with answer and chunks, or null if not applicable
   */
  async querySql(
    question: string,
    kbIds: string[],
    providerId?: string,
    tenantId?: string
  ): Promise<{ answer: string; chunks: ChunkResult[] } | null> {
    // Try each KB to find one with a field_map
    for (const kbId of kbIds) {
      const fieldMap = await this.getFieldMap(kbId)
      if (!fieldMap || Object.keys(fieldMap).length === 0) continue

      // Use per-request tenant for proper multi-tenant isolation
      const resolvedTenant = tenantId || SYSTEM_TENANT_ID
      if (!resolvedTenant || !/^[0-9a-f-]+$/i.test(resolvedTenant)) {
        log.warn('SQL retrieval skipped — invalid or empty tenantId', { tenantId })
        return null
      }
      const tableName = `knowledge_${resolvedTenant}`

      // Enforce per-KB timeout to prevent long-running queries from blocking
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), SQL_TIMEOUT_MS)

      try {
        // Generate SQL from natural language
        let sql = await this.generateSql(question, fieldMap, tableName, providerId)
        if (!sql) continue

        // Inject kb_id filter to scope results to this knowledge base
        sql = this.addKbFilter(sql, kbId)

        // Validate SQL before execution to prevent destructive operations
        if (!this.validateSql(sql)) {
          log.warn('SQL validation failed, skipping KB', { kbId, sql })
          continue
        }

        let rows: any[]
        try {
          // Execute SQL against OpenSearch
          rows = await this.executeSql(sql, controller.signal)
        } catch (firstErr) {
          // Retry once with error context appended to the prompt
          log.info('SQL execution failed, retrying with error context', { kbId, error: String(firstErr) })
          let retrySql = await this.generateSqlWithRetry(question, fieldMap, tableName, String(firstErr), providerId)
          if (!retrySql) continue

          // Inject kb_id filter on retry SQL as well
          retrySql = this.addKbFilter(retrySql, kbId)

          // Validate retry SQL
          if (!this.validateSql(retrySql)) {
            log.warn('Retry SQL validation failed, skipping KB', { kbId, sql: retrySql })
            continue
          }

          rows = await this.executeSql(retrySql, controller.signal)
        }

        if (rows.length === 0) {
          log.info('SQL query returned no results', { kbId, sql })
          continue
        }

        // Format results as markdown table with citation markers
        const answer = this.formatAsMarkdownTable(rows, fieldMap)

        // Build chunk results for reference
        const chunks: ChunkResult[] = [{
          chunk_id: `sql_${kbId}`,
          text: answer,
          doc_name: 'SQL Query Result',
          score: 1.0,
          method: 'sql',
        }]

        return { answer, chunks }
      } catch (err) {
        // AbortError indicates the per-KB timeout was hit
        if ((err as Error).name === 'AbortError') {
          log.warn('SQL retrieval timed out for KB', { kbId, timeoutMs: SQL_TIMEOUT_MS })
        } else {
          log.warn('SQL retrieval failed for KB', { kbId, error: String(err) })
        }
        continue
      } finally {
        clearTimeout(timeout)
      }
    }

    return null
  }

  /**
   * @description Get field mapping for a knowledge base.
   * Reads from knowledgebase parser_config.field_map.
   *
   * @param {string} kbId - Knowledge base ID
   * @returns {Promise<Record<string, string> | null>} Field map (field name -> type) or null
   */
  async getFieldMap(kbId: string): Promise<Record<string, string> | null> {
    const kb = await ModelFactory.knowledgebase.findById(kbId)
    if (!kb) return null

    // parser_config may be a JSON string or object
    const config = typeof kb.parser_config === 'string'
      ? JSON.parse(kb.parser_config)
      : kb.parser_config

    return (config?.field_map as Record<string, string>) || null
  }

  /**
   * @description Generate SQL from natural language using LLM.
   * Uses engine-specific prompts for OpenSearch SQL syntax.
   *
   * @param {string} question - User question
   * @param {Record<string, string>} fieldMap - Available fields with types
   * @param {string} tableName - OpenSearch index name
   * @param {string} [providerId] - LLM provider ID
   * @returns {Promise<string>} Generated SQL string
   */
  async generateSql(
    question: string,
    fieldMap: Record<string, string>,
    tableName: string,
    providerId?: string
  ): Promise<string> {
    // Build field description for the prompt
    const fieldDesc = Object.entries(fieldMap)
      .map(([name, type]) => `  ${name} (${type})`)
      .join('\n')

    // Detect if this is a count question
    const isCount = this.isRowCountQuestion(question)

    const prompt: LlmMessage[] = [
      {
        role: 'system',
        content: sqlGenerationPrompt.build(tableName, fieldDesc, isCount),
      },
      {
        role: 'user',
        content: question,
      },
    ]

    const rawSql = await llmClientService.chatCompletion(prompt, {
      providerId,
      temperature: 0,
      max_tokens: 256,
    })

    // Normalize the SQL output
    return this.normalizeSql(rawSql)
  }

  /**
   * @description Retry SQL generation with error context appended to the system prompt.
   * Called when the first SQL attempt fails execution, giving the LLM a chance
   * to fix its query based on the error message.
   *
   * @param {string} question - User question
   * @param {Record<string, string>} fieldMap - Available fields with types
   * @param {string} tableName - OpenSearch index name
   * @param {string} previousError - Error message from the failed SQL execution
   * @param {string} [providerId] - LLM provider ID
   * @returns {Promise<string>} Corrected SQL string
   */
  private async generateSqlWithRetry(
    question: string,
    fieldMap: Record<string, string>,
    tableName: string,
    previousError: string,
    providerId?: string
  ): Promise<string> {
    // Build field description for the prompt
    const fieldDesc = Object.entries(fieldMap)
      .map(([name, type]) => `  ${name} (${type})`)
      .join('\n')

    // Detect if this is a count question
    const isCount = this.isRowCountQuestion(question)

    // Append error context so the LLM can correct its previous attempt
    const systemContent = sqlGenerationPrompt.build(tableName, fieldDesc, isCount)
      + `\n\nThe previous SQL query failed with error: ${previousError}\nFix the SQL query.`

    const prompt: LlmMessage[] = [
      {
        role: 'system',
        content: systemContent,
      },
      {
        role: 'user',
        content: question,
      },
    ]

    const rawSql = await llmClientService.chatCompletion(prompt, {
      providerId,
      temperature: 0,
      max_tokens: 256,
    })

    // Normalize the SQL output
    return this.normalizeSql(rawSql)
  }

  /**
   * @description Inject a kb_id filter into the SQL WHERE clause to scope results
   * to a specific knowledge base.
   *
   * @param {string} sql - Original SQL query
   * @param {string} kbId - Knowledge base ID to filter by
   * @returns {string} SQL with kb_id filter injected
   */
  private addKbFilter(sql: string, kbId: string): string {
    // Validate kbId format to prevent SQL injection
    if (!KB_ID_RE.test(kbId)) {
      log.warn('Invalid kbId format, skipping kb_id filter injection', { kbId })
      return sql
    }

    // Skip if kb_id is already present in the query (strip string literals first
    // to avoid false matches like WHERE name LIKE '%kb_id%')
    const sqlWithoutStrings = sql.replace(/'[^']*'/g, "''")
    if (/\bkb_id\b/i.test(sqlWithoutStrings)) return sql

    const kbCondition = `kb_id = '${kbId}'`
    const upperSql = sql.toUpperCase()

    // Check if WHERE clause already exists
    const whereIndex = upperSql.indexOf('WHERE')
    if (whereIndex !== -1) {
      // Insert kb_id condition right after WHERE, before existing conditions
      const afterWhere = whereIndex + 'WHERE'.length
      return sql.slice(0, afterWhere) + ` ${kbCondition} AND` + sql.slice(afterWhere)
    }

    // No WHERE clause — insert before ORDER BY, GROUP BY, LIMIT, or at end
    const insertionKeywords = ['ORDER BY', 'GROUP BY', 'LIMIT']
    for (const keyword of insertionKeywords) {
      const keywordIndex = upperSql.indexOf(keyword)
      if (keywordIndex !== -1) {
        return sql.slice(0, keywordIndex) + `WHERE ${kbCondition} ` + sql.slice(keywordIndex)
      }
    }

    // No ORDER BY/GROUP BY/LIMIT either — append WHERE at end
    return `${sql} WHERE ${kbCondition}`
  }

  /**
   * @description Validate SQL query for security: must be SELECT-only,
   * reject DDL/DML keywords to prevent destructive operations.
   *
   * @param {string} sql - SQL query string to validate
   * @returns {boolean} True if the query is safe to execute
   */
  private validateSql(sql: string): boolean {
    const trimmed = sql.trim()

    // Must start with SELECT (case insensitive)
    if (!/^SELECT\b/i.test(trimmed)) {
      log.warn('SQL validation: query does not start with SELECT', { sql: trimmed.slice(0, 50) })
      return false
    }

    // Reject queries containing dangerous DDL/DML keywords
    if (DANGEROUS_SQL_RE.test(trimmed)) {
      log.warn('SQL validation: dangerous keyword detected', { sql: trimmed.slice(0, 100) })
      return false
    }

    return true
  }

  /**
   * @description Execute SQL against OpenSearch's SQL plugin.
   * POST /_plugins/_sql with { "query": sql }
   *
   * @param {string} sql - SQL query string
   * @param {AbortSignal} [signal] - Optional abort signal for timeout control
   * @returns {Promise<any[]>} Array of result rows
   * @throws {Error} If OpenSearch returns a non-OK response
   */
  async executeSql(sql: string, signal?: AbortSignal): Promise<any[]> {
    // Build auth headers if password is set
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (ES_PASSWORD) {
      const auth = Buffer.from(`admin:${ES_PASSWORD}`).toString('base64')
      headers['Authorization'] = `Basic ${auth}`
    }

    const response = await fetch(`${ES_HOST}/_plugins/_sql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: sql }),
      ...(signal ? { signal } : {}),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`OpenSearch SQL error: ${response.status} ${errBody}`)
    }

    const data = await response.json() as {
      schema?: Array<{ name: string; type: string }>
      datarows?: any[][]
      total?: number
    }

    // Convert columnar response to row objects
    if (!data.schema || !data.datarows) return []

    const columns = data.schema.map(s => s.name)
    return data.datarows.map(row => {
      const obj: Record<string, unknown> = {}
      for (let i = 0; i < columns.length; i++) {
        obj[columns[i]!] = row[i]
      }
      return obj
    })
  }

  /**
   * @description Format SQL results as markdown table with citation markers.
   * Each data row gets an [ID:n] marker in its first cell for citation referencing.
   *
   * @param {any[]} rows - Result rows
   * @param {Record<string, string>} fieldMap - Field names for headers
   * @returns {string} Markdown table string with citation markers
   */
  formatAsMarkdownTable(rows: any[], fieldMap: Record<string, string>): string {
    if (rows.length === 0) return 'No results found.'

    // Use the keys from the first row as column headers
    const columns = Object.keys(rows[0])

    // Build header row
    const header = `| ${columns.join(' | ')} |`
    const separator = `| ${columns.map(() => '---').join(' | ')} |`

    // Build data rows with citation markers in the first cell
    const dataRows = rows.map((row, rowIndex) => {
      const cells = columns.map((col, colIndex) => {
        const value = String(row[col] ?? '')
        // Append citation marker to the first cell of each row
        return colIndex === 0 ? `${value} [ID:${rowIndex}]` : value
      })
      return `| ${cells.join(' | ')} |`
    })

    return [header, separator, ...dataRows].join('\n')
  }

  /**
   * @description Detect row count questions (e.g. "how many rows", "total number of records").
   *
   * @param {string} question - User question
   * @returns {boolean} True if this is a count query
   */
  isRowCountQuestion(question: string): boolean {
    const lower = question.toLowerCase()
    return /\b(how many|count|number of|total)\b.*\b(rows?|records?|entries|items?|documents?)\b/.test(lower)
      || /\b(rows?|records?|entries|items?|documents?)\b.*\b(how many|count|number of|total)\b/.test(lower)
  }

  /**
   * @description Normalize SQL output from LLM: strip code fences, trailing semicolons, think blocks.
   *
   * @param {string} raw - Raw SQL string from LLM
   * @returns {string} Cleaned SQL string
   */
  private normalizeSql(raw: string): string {
    let sql = raw.trim()

    // Remove <think>...</think> blocks
    sql = sql.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    // Remove ```sql ... ``` fences
    sql = sql.replace(/^```(?:sql)?\s*/i, '').replace(/\s*```$/i, '').trim()

    // Remove trailing semicolons
    sql = sql.replace(/;\s*$/, '').trim()

    return sql
  }
}

/** Singleton instance of the SQL retrieval service */
export const ragSqlService = new RagSqlService()
