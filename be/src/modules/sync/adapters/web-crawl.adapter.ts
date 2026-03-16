
/**
 * @fileoverview Web crawl connector adapter.
 * @description Fetches web pages from a list of URLs, extracts text content,
 *   and yields them as markdown documents for ingestion.
 * @module modules/sync/adapters/web-crawl
 */
import { log } from '@/shared/services/logger.service.js'
import { ConnectorAdapter, FetchedDocument } from '../services/sync-worker.service.js'

/**
 * WebCrawlAdapter implements ConnectorAdapter for web page crawling.
 * @description Fetches HTML pages and converts them to plain text/markdown.
 */
export class WebCrawlAdapter implements ConnectorAdapter {
  /**
   * @description Fetch and convert web pages from a list of URLs to markdown documents
   * @param {Record<string, unknown>} config - Must contain: { urls: string[], depth?: number, max_pages?: number }
   * @param {Date} [_since] - Not used for web crawling (always fetches fresh content)
   * @yields {FetchedDocument} For each successfully fetched and converted page
   */
  async *fetch(config: Record<string, unknown>, _since?: Date): AsyncGenerator<FetchedDocument> {
    const urls = config.urls as string[]
    if (!urls?.length) throw new Error('URLs list is required')

    const maxPages = (config.max_pages as number) || 100
    const visited = new Set<string>()
    // Queue of URLs to process
    const queue = [...urls]
    let count = 0

    while (queue.length > 0 && count < maxPages) {
      const url = queue.shift()!
      // Skip already visited URLs
      if (visited.has(url)) continue
      visited.add(url)

      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'b-knowledge-sync/1.0' },
          signal: AbortSignal.timeout(30000),
        })

        if (!res.ok) {
          log.warn('Failed to fetch URL', { url, status: res.status })
          continue
        }

        const contentType = res.headers.get('content-type') || ''

        // Handle PDFs and other binary files
        if (contentType.includes('application/pdf')) {
          const buffer = Buffer.from(await res.arrayBuffer())
          const filename = this.urlToFilename(url, 'pdf')
          yield {
            filename,
            suffix: 'pdf',
            content: buffer,
            size: buffer.length,
            metadata: { source_url: url },
          }
          count++
          continue
        }

        // Handle HTML pages
        if (contentType.includes('text/html') || contentType.includes('text/plain')) {
          const html = await res.text()
          const text = this.htmlToText(html)

          if (text.length < 50) continue // Skip empty pages

          const filename = this.urlToFilename(url, 'md')
          const content = Buffer.from(text, 'utf-8')

          yield {
            filename,
            suffix: 'md',
            content,
            size: content.length,
            metadata: { source_url: url },
          }
          count++
        }
      } catch (err) {
        log.warn('Failed to crawl URL', { url, error: String(err) })
      }
    }
  }

  /**
   * @description Convert raw HTML to plain text with basic markdown formatting for headings and lists
   * @param {string} html - Raw HTML string
   * @returns {string} Cleaned text content with markdown formatting
   */
  private htmlToText(html: string): string {
    // Remove script and style tags with content
    let text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
    // Convert common HTML elements to markdown
    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
    text = text.replace(/<h[4-6][^>]*>(.*?)<\/h[4-6]>/gi, '#### $1\n')
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    // Remove remaining tags
    text = text.replace(/<[^>]+>/g, '')
    // Decode HTML entities
    text = text.replace(/&amp;/g, '&')
    text = text.replace(/&lt;/g, '<')
    text = text.replace(/&gt;/g, '>')
    text = text.replace(/&quot;/g, '"')
    text = text.replace(/&#39;/g, "'")
    text = text.replace(/&nbsp;/g, ' ')
    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n')
    return text.trim()
  }

  /**
   * @description Convert a URL to a safe filename using hostname and path components
   * @param {string} url - Source URL
   * @param {string} ext - File extension to append
   * @returns {string} Safe filename string (max 200 chars plus extension)
   */
  private urlToFilename(url: string, ext: string): string {
    try {
      const parsed = new URL(url)
      const path = parsed.pathname.replace(/\//g, '_').replace(/^_/, '')
      const host = parsed.hostname.replace(/\./g, '_')
      const name = path || 'index'
      return `${host}_${name}`.slice(0, 200) + `.${ext}`
    } catch {
      return `page_${Date.now()}.${ext}`
    }
  }
}
