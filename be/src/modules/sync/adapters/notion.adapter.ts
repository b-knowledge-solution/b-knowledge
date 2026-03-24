
/**
 * @fileoverview Notion connector adapter.
 * @description Fetches pages from a Notion workspace via the Notion API,
 *   converts them to markdown, and yields them as documents for ingestion.
 * @module modules/sync/adapters/notion
 */
import { log } from '@/shared/services/logger.service.js'
import { ConnectorAdapter, FetchedDocument } from '../services/sync-worker.service.js'

/**
 * NotionAdapter implements ConnectorAdapter for Notion workspaces.
 * @description Uses the Notion API to search for pages and export their content.
 */
export class NotionAdapter implements ConnectorAdapter {
  /** Notion API base URL */
  private readonly baseUrl = 'https://api.notion.com/v1'

  /** Notion API version header */
  private readonly apiVersion = '2022-06-28'

  /**
   * @description Fetch pages from a Notion workspace via the search API, converting each to markdown
   * @param {Record<string, unknown>} config - Must contain: { api_key: string, filter?: object }
   * @param {Date} [since] - Optional timestamp for incremental sync (skips older pages)
   * @yields {FetchedDocument} For each page found in the workspace
   */
  async *fetch(config: Record<string, unknown>, since?: Date): AsyncGenerator<FetchedDocument> {
    const apiKey = config.api_key as string
    if (!apiKey) throw new Error('Notion API key is required')

    // Build search payload with optional date filter
    const searchPayload: Record<string, unknown> = {
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 100,
    }

    let hasMore = true
    let startCursor: string | undefined

    while (hasMore) {
      if (startCursor) searchPayload.start_cursor = startCursor

      // Search for pages
      const searchRes = await this.request('POST', '/search', apiKey, searchPayload)
      const results = searchRes.results || []

      for (const page of results) {
        // Skip pages not modified since last sync
        if (since && new Date(page.last_edited_time) <= since) {
          hasMore = false
          break
        }

        try {
          // Fetch page blocks and convert to markdown
          const markdown = await this.pageToMarkdown(apiKey, page.id)
          const title = this.extractPageTitle(page) || page.id
          const filename = `${this.sanitizeFilename(title)}.md`
          const content = Buffer.from(markdown, 'utf-8')

          yield {
            filename,
            suffix: 'md',
            content,
            size: content.length,
            metadata: {
              notion_page_id: page.id,
              last_edited_time: page.last_edited_time,
              url: page.url,
            },
          }
        } catch (err) {
          log.warn('Failed to fetch Notion page', { pageId: page.id, error: String(err) })
        }
      }

      // Handle pagination
      hasMore = hasMore && searchRes.has_more === true
      startCursor = searchRes.next_cursor
    }
  }

  /**
   * @description Convert a Notion page to markdown by fetching and processing all blocks
   * @param {string} apiKey - Notion API key
   * @param {string} pageId - Notion page ID
   * @returns {Promise<string>} Markdown string representation of the page
   */
  private async pageToMarkdown(apiKey: string, pageId: string): Promise<string> {
    const blocks = await this.fetchAllBlocks(apiKey, pageId)
    return this.blocksToMarkdown(blocks)
  }

  /**
   * @description Recursively fetch all blocks for a page, including nested children
   * @param {string} apiKey - Notion API key
   * @param {string} blockId - Parent block/page ID
   * @returns {Promise<any[]>} Array of block objects with optional _children
   */
  private async fetchAllBlocks(apiKey: string, blockId: string): Promise<any[]> {
    const blocks: any[] = []
    let startCursor: string | undefined
    let hasMore = true

    while (hasMore) {
      const url = `/blocks/${blockId}/children?page_size=100${startCursor ? `&start_cursor=${startCursor}` : ''}`
      const res = await this.request('GET', url, apiKey)

      for (const block of res.results || []) {
        blocks.push(block)
        // Recursively fetch children if block has them
        if (block.has_children) {
          block._children = await this.fetchAllBlocks(apiKey, block.id)
        }
      }

      hasMore = res.has_more === true
      startCursor = res.next_cursor
    }
    return blocks
  }

  /**
   * @description Convert Notion blocks to markdown text with heading, list, code, and table support
   * @param {any[]} blocks - Array of Notion block objects
   * @param {number} [indent=0] - Current indentation level for nested blocks
   * @returns {string} Markdown string
   */
  private blocksToMarkdown(blocks: any[], indent = 0): string {
    const lines: string[] = []
    const prefix = '  '.repeat(indent)

    for (const block of blocks) {
      const type = block.type
      const data = block[type]

      // Extract rich text from block
      const text = this.richTextToPlain(data?.rich_text || data?.text || [])

      switch (type) {
        case 'paragraph':
          lines.push(`${prefix}${text}`)
          break
        case 'heading_1':
          lines.push(`${prefix}# ${text}`)
          break
        case 'heading_2':
          lines.push(`${prefix}## ${text}`)
          break
        case 'heading_3':
          lines.push(`${prefix}### ${text}`)
          break
        case 'bulleted_list_item':
          lines.push(`${prefix}- ${text}`)
          break
        case 'numbered_list_item':
          lines.push(`${prefix}1. ${text}`)
          break
        case 'to_do':
          lines.push(`${prefix}- [${data?.checked ? 'x' : ' '}] ${text}`)
          break
        case 'toggle':
          lines.push(`${prefix}<details><summary>${text}</summary>`)
          break
        case 'code':
          lines.push(`${prefix}\`\`\`${data?.language || ''}`)
          lines.push(`${prefix}${text}`)
          lines.push(`${prefix}\`\`\``)
          break
        case 'quote':
          lines.push(`${prefix}> ${text}`)
          break
        case 'divider':
          lines.push(`${prefix}---`)
          break
        case 'callout':
          lines.push(`${prefix}> ${data?.icon?.emoji || ''} ${text}`)
          break
        case 'table':
          // Tables are handled by their row children
          break
        case 'table_row':
          if (data?.cells) {
            const cells = data.cells.map((cell: any[]) => this.richTextToPlain(cell))
            lines.push(`${prefix}| ${cells.join(' | ')} |`)
          }
          break
        default:
          if (text) lines.push(`${prefix}${text}`)
      }

      // Process children recursively
      if (block._children?.length) {
        lines.push(this.blocksToMarkdown(block._children, indent + 1))
      }
    }

    return lines.join('\n')
  }

  /**
   * @description Convert Notion rich text array to plain text by extracting plain_text fields
   * @param {any[]} richText - Array of Notion rich text objects
   * @returns {string} Plain text string
   */
  private richTextToPlain(richText: any[]): string {
    if (!Array.isArray(richText)) return ''
    return richText.map((rt: any) => rt.plain_text || rt.text?.content || '').join('')
  }

  /**
   * @description Extract page title from Notion page properties by finding the title-type property
   * @param {any} page - Notion page object
   * @returns {string} Title string or empty string if no title found
   */
  private extractPageTitle(page: any): string {
    const props = page.properties || {}
    for (const prop of Object.values(props) as any[]) {
      if (prop.type === 'title' && prop.title?.length) {
        return this.richTextToPlain(prop.title)
      }
    }
    return ''
  }

  /**
   * @description Make an authenticated HTTP request to the Notion API
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} path - API path (e.g., '/search')
   * @param {string} apiKey - Notion integration token
   * @param {unknown} [body] - Optional request body for POST/PUT
   * @returns {Promise<any>} Parsed JSON response
   * @throws {Error} If the API returns a non-OK status
   */
  private async request(method: string, path: string, apiKey: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': this.apiVersion,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Notion API error ${res.status}: ${text}`)
    }
    return res.json()
  }

  /**
   * @description Sanitize a string for use as a safe filesystem filename
   * @param {string} name - Raw string to sanitize
   * @returns {string} Safe filename string (max 200 chars)
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200)
  }
}
