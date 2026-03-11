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

const SYSTEM_TENANT_ID = process.env['SYSTEM_TENANT_ID'] || '00000000-0000-0000-0000-000000000001'
const ES_HOST = process.env['ES_HOST'] || 'http://localhost:9200'
const ES_PASSWORD = process.env['ES_PASSWORD'] || ''

/**
 * Service for SQL-based retrieval over structured data stored in OpenSearch.
 * Uses LLM to generate SQL from natural language and executes via OpenSearch SQL plugin.
 */
export class RagSqlService {
  /**
   * Attempt SQL-based retrieval for structured data questions.
   * 1. Check if KB has field_map (structured field mapping)
   * 2. Use LLM to generate SQL from natural language
   * 3. Execute SQL against OpenSearch
   * 4. Format results as markdown table
   *
   * @param question - User question
   * @param kbIds - Knowledge base IDs
   * @param providerId - LLM provider ID for SQL generation
   * @returns Object with answer and chunks, or null if not applicable
   */
  async querySql(
    question: string,
    kbIds: string[],
    providerId?: string
  ): Promise<{ answer: string; chunks: ChunkResult[] } | null> {
    // Try each KB to find one with a field_map
    for (const kbId of kbIds) {
      const fieldMap = await this.getFieldMap(kbId)
      if (!fieldMap || Object.keys(fieldMap).length === 0) continue

      // This KB has structured data; generate and execute SQL
      const tableName = `ragflow_${SYSTEM_TENANT_ID}`

      try {
        // Generate SQL from natural language
        const sql = await this.generateSql(question, fieldMap, tableName, providerId)
        if (!sql) continue

        // Execute SQL against OpenSearch
        const rows = await this.executeSql(sql)

        if (rows.length === 0) {
          log.info('SQL query returned no results', { kbId, sql })
          continue
        }

        // Format results as markdown table
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
        log.warn('SQL retrieval failed for KB', { kbId, error: String(err) })
        continue
      }
    }

    return null
  }

  /**
   * Get field mapping for a knowledge base.
   * Reads from knowledgebase parser_config.field_map.
   *
   * @param kbId - Knowledge base ID
   * @returns Field map (field name -> type) or null
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
   * Generate SQL from natural language using LLM.
   * Uses engine-specific prompts for OpenSearch SQL syntax.
   *
   * @param question - User question
   * @param fieldMap - Available fields with types
   * @param tableName - OpenSearch index name
   * @param providerId - LLM provider ID
   * @returns Generated SQL string
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
   * Execute SQL against OpenSearch's SQL plugin.
   * POST /_plugins/_sql with { "query": sql }
   *
   * @param sql - SQL query string
   * @returns Array of result rows
   */
  async executeSql(sql: string): Promise<any[]> {
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
   * Format SQL results as markdown table.
   *
   * @param rows - Result rows
   * @param fieldMap - Field names for headers
   * @returns Markdown table string
   */
  formatAsMarkdownTable(rows: any[], fieldMap: Record<string, string>): string {
    if (rows.length === 0) return 'No results found.'

    // Use the keys from the first row as column headers
    const columns = Object.keys(rows[0])

    // Build header row
    const header = `| ${columns.join(' | ')} |`
    const separator = `| ${columns.map(() => '---').join(' | ')} |`

    // Build data rows
    const dataRows = rows.map(row => {
      const cells = columns.map(col => String(row[col] ?? ''))
      return `| ${cells.join(' | ')} |`
    })

    return [header, separator, ...dataRows].join('\n')
  }

  /**
   * Detect row count questions (e.g. "how many rows", "total number of records").
   *
   * @param question - User question
   * @returns True if this is a count query
   */
  isRowCountQuestion(question: string): boolean {
    const lower = question.toLowerCase()
    return /\b(how many|count|number of|total)\b.*\b(rows?|records?|entries|items?|documents?)\b/.test(lower)
      || /\b(rows?|records?|entries|items?|documents?)\b.*\b(how many|count|number of|total)\b/.test(lower)
  }

  /**
   * Normalize SQL output from LLM: strip code fences, trailing semicolons, think blocks.
   *
   * @param raw - Raw SQL string from LLM
   * @returns Cleaned SQL string
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
