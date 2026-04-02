/**
 * @fileoverview HTML-to-Markdown conversion utility for RAG chunks.
 *
 * Converts HTML content (especially tables from Excel/CSV parsers) into
 * compact Markdown before sending to the LLM. This significantly reduces
 * token usage while preserving the semantic structure and data quality.
 *
 * @module shared/utils/html-to-markdown
 */

import TurndownService from 'turndown'

// ---------------------------------------------------------------------------
// Singleton converter instance
// ---------------------------------------------------------------------------

/** @description Shared TurndownService instance configured for RAG chunk conversion */
let turndownInstance: TurndownService | null = null

/**
 * @description Creates or returns the singleton TurndownService instance
 * with rules optimized for knowledge-base content (tables, lists, headings).
 * @returns {TurndownService} Configured converter instance
 */
function getTurndown(): TurndownService {
  if (turndownInstance) return turndownInstance

  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    // Preserve line breaks inside table cells and structured content
    br: '\n',
  })

  // ── Table conversion rules ──────────────────────────────────────────
  // Tables are the primary HTML structure from Excel/CSV chunking.
  // Convert <table> to GFM (GitHub Flavored Markdown) pipe tables.

  td.addRule('tableCaption', {
    filter: 'caption',
    replacement(content) {
      // Render caption as a bold heading line above the table
      return `**${content.trim()}**\n`
    },
  })

  td.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement(content) {
      // Pipe-delimit cells; collapse whitespace within cells
      return ` ${content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()} |`
    },
  })

  td.addRule('tableRow', {
    filter: 'tr',
    replacement(content) {
      return `|${content}\n`
    },
  })

  td.addRule('tableHead', {
    filter: 'thead',
    replacement(content) {
      // Count columns from the header row to build the separator line
      const columnCount = (content.match(/\|/g) || []).length - 1
      // Build separator: |---|---|...|
      const separator = `|${' --- |'.repeat(Math.max(columnCount, 1))}`
      return `${content}${separator}\n`
    },
  })

  td.addRule('tableBody', {
    filter: ['tbody', 'tfoot'],
    replacement(content) {
      return content
    },
  })

  td.addRule('table', {
    filter: 'table',
    replacement(content) {
      // If no thead was present, infer separator after first row
      const lines = content.trim().split('\n').filter(Boolean)
      const hasCaption = lines.length > 0 && lines[0]!.startsWith('**')

      // Find the first pipe-table row (skip caption if present)
      const firstRowIdx = hasCaption ? 1 : 0
      const firstRow = lines[firstRowIdx]

      // Check if a separator line already exists (from thead rule)
      const hasSeparator = lines.some(l => /^\|[\s-|]+\|$/.test(l))

      if (!hasSeparator && firstRow) {
        // Insert separator after first data row (treat it as header)
        const colCount = (firstRow.match(/\|/g) || []).length - 1
        const separator = `|${' --- |'.repeat(Math.max(colCount, 1))}`
        lines.splice(firstRowIdx + 1, 0, separator)
      }

      return `\n${lines.join('\n')}\n`
    },
  })

  turndownInstance = td
  return td
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** @description Regex to detect HTML tags in content */
const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*?>/i

/**
 * @description Converts HTML content to Markdown format for token-efficient
 * LLM consumption. Only processes content that actually contains HTML tags;
 * plain text passes through unchanged.
 *
 * Handles common RAG chunk formats:
 * - HTML tables from Excel/CSV parsers → GFM pipe tables
 * - Headings, lists, bold/italic → Markdown equivalents
 * - Nested structures → flattened Markdown
 *
 * @param {string} html - Raw HTML content from a RAG chunk
 * @returns {string} Markdown representation of the content
 *
 * @example
 * const md = htmlToMarkdown('<table><tr><th>Name</th></tr><tr><td>Alice</td></tr></table>')
 * // Returns: "| Name |\n| --- |\n| Alice |"
 */
export function htmlToMarkdown(html: string): string {
  // Skip conversion if content has no HTML tags (plain text chunk)
  if (!html || !HTML_TAG_REGEX.test(html)) return html

  const td = getTurndown()
  const markdown = td.turndown(html)

  // Collapse excessive blank lines that may result from nested elements
  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}
