/**
 * @fileoverview Unit tests for htmlToMarkdown utility.
 *
 * Covers plain text passthrough, HTML table conversion (with/without thead,
 * captions), nested elements, mixed content, and edge cases.
 */

import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '../../../src/shared/utils/html-to-markdown.js'

// ---------------------------------------------------------------------------
// Plain text passthrough
// ---------------------------------------------------------------------------

describe('htmlToMarkdown', () => {
  describe('plain text passthrough', () => {
    it('returns empty string for empty input', () => {
      expect(htmlToMarkdown('')).toBe('')
    })

    it('returns null/undefined as-is', () => {
      expect(htmlToMarkdown(null as any)).toBe(null)
      expect(htmlToMarkdown(undefined as any)).toBe(undefined)
    })

    it('passes through plain text without HTML tags', () => {
      const text = 'This is just plain text with no HTML.'
      expect(htmlToMarkdown(text)).toBe(text)
    })

    it('passes through text with angle brackets that are not HTML', () => {
      const text = 'x < 5 and y > 3'
      expect(htmlToMarkdown(text)).toBe(text)
    })
  })

  // ---------------------------------------------------------------------------
  // HTML table conversion
  // ---------------------------------------------------------------------------

  describe('HTML table conversion', () => {
    it('converts a simple table with thead to GFM pipe table', () => {
      const html = `<table>
        <thead><tr><th>Name</th><th>Age</th></tr></thead>
        <tbody><tr><td>Alice</td><td>30</td></tr></tbody>
      </table>`

      const md = htmlToMarkdown(html)

      // Should have header row, separator, and data row
      expect(md).toContain('| Name |')
      expect(md).toContain('| Age |')
      expect(md).toContain('| --- |')
      expect(md).toContain('| Alice |')
      expect(md).toContain('| 30 |')
    })

    it('converts a table without thead (infers separator after first row)', () => {
      const html = `<table>
        <tr><th>Col1</th><th>Col2</th></tr>
        <tr><td>A</td><td>B</td></tr>
      </table>`

      const md = htmlToMarkdown(html)

      expect(md).toContain('| Col1 |')
      expect(md).toContain('| --- |')
      expect(md).toContain('| A |')
    })

    it('converts table with caption to bold heading', () => {
      const html = `<table>
        <caption>Quarterly Revenue</caption>
        <thead><tr><th>Q1</th><th>Q2</th></tr></thead>
        <tbody><tr><td>$100M</td><td>$120M</td></tr></tbody>
      </table>`

      const md = htmlToMarkdown(html)

      expect(md).toContain('**Quarterly Revenue**')
      expect(md).toContain('| Q1 |')
      expect(md).toContain('| $100M |')
    })

    it('handles multi-row tables', () => {
      const html = `<table>
        <thead><tr><th>ID</th><th>Name</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>Alice</td><td>Active</td></tr>
          <tr><td>2</td><td>Bob</td><td>Inactive</td></tr>
          <tr><td>3</td><td>Charlie</td><td>Active</td></tr>
        </tbody>
      </table>`

      const md = htmlToMarkdown(html)
      const lines = md.trim().split('\n').filter(Boolean)

      // Header + separator + 3 data rows = 5 lines
      expect(lines.length).toBeGreaterThanOrEqual(5)
      expect(md).toContain('| Charlie |')
    })

    it('handles cells with whitespace and newlines', () => {
      const html = `<table>
        <thead><tr><th>Description</th></tr></thead>
        <tbody><tr><td>  Line 1\nLine 2  </td></tr></tbody>
      </table>`

      const md = htmlToMarkdown(html)

      // Newlines inside cells should be collapsed to spaces
      expect(md).not.toContain('\nLine 2')
      expect(md).toContain('Line 1')
      expect(md).toContain('Line 2')
    })

    it('produces significantly fewer characters than the HTML input for tables', () => {
      const html = `<table><caption>Sales Data</caption>
        <thead><tr><th>Region</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th></tr></thead>
        <tbody>
          <tr><td>North</td><td>100</td><td>200</td><td>300</td><td>400</td></tr>
          <tr><td>South</td><td>150</td><td>250</td><td>350</td><td>450</td></tr>
          <tr><td>East</td><td>120</td><td>220</td><td>320</td><td>420</td></tr>
          <tr><td>West</td><td>130</td><td>230</td><td>330</td><td>430</td></tr>
        </tbody>
      </table>`

      const md = htmlToMarkdown(html)

      // Markdown should be shorter than HTML (token savings)
      expect(md.length).toBeLessThan(html.length)
    })
  })

  // ---------------------------------------------------------------------------
  // Other HTML elements
  // ---------------------------------------------------------------------------

  describe('other HTML elements', () => {
    it('converts headings to atx-style markdown', () => {
      const html = '<h1>Title</h1><h2>Subtitle</h2><p>Body text</p>'
      const md = htmlToMarkdown(html)

      expect(md).toContain('# Title')
      expect(md).toContain('## Subtitle')
      expect(md).toContain('Body text')
    })

    it('converts bold and italic', () => {
      const html = '<p>This is <strong>bold</strong> and <em>italic</em> text.</p>'
      const md = htmlToMarkdown(html)

      expect(md).toContain('**bold**')
      // Turndown uses underscore style for em by default
      expect(md).toMatch(/[_*]italic[_*]/)
    })

    it('converts unordered lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>'
      const md = htmlToMarkdown(html)

      // Turndown may add extra spaces after bullet marker
      expect(md).toMatch(/-\s+Item 1/)
      expect(md).toMatch(/-\s+Item 2/)
    })

    it('converts links', () => {
      const html = '<a href="https://example.com">Example</a>'
      const md = htmlToMarkdown(html)

      expect(md).toContain('[Example](https://example.com)')
    })
  })

  // ---------------------------------------------------------------------------
  // Mixed content (HTML + plain text)
  // ---------------------------------------------------------------------------

  describe('mixed content', () => {
    it('converts only HTML portions in mixed content', () => {
      const html = 'Some text before <strong>bold part</strong> and after.'
      const md = htmlToMarkdown(html)

      expect(md).toContain('**bold part**')
      expect(md).toContain('Some text before')
      expect(md).toContain('and after.')
    })
  })

  // ---------------------------------------------------------------------------
  // Excessive blank lines
  // ---------------------------------------------------------------------------

  describe('blank line collapsing', () => {
    it('collapses excessive blank lines to at most double newline', () => {
      const html = '<p>First</p>\n\n\n\n<p>Second</p>'
      const md = htmlToMarkdown(html)

      expect(md).not.toMatch(/\n{3,}/)
    })
  })

  // ---------------------------------------------------------------------------
  // Excel-like chunked HTML (realistic RAG scenario)
  // ---------------------------------------------------------------------------

  describe('realistic RAG chunks', () => {
    it('converts Excel-parser style HTML table to markdown', () => {
      // This simulates the exact output from advance-rag's excel_parser.py
      const html = `<table><caption>Sheet1</caption><tr><th>Employee</th><th>Department</th><th>Salary</th></tr><tr><td>John Doe</td><td>Engineering</td><td>$95,000</td></tr><tr><td>Jane Smith</td><td>Marketing</td><td>$85,000</td></tr></table>`

      const md = htmlToMarkdown(html)

      // Should contain structured markdown, not HTML tags
      expect(md).not.toContain('<table>')
      expect(md).not.toContain('<tr>')
      expect(md).not.toContain('<td>')
      expect(md).not.toContain('<th>')
      expect(md).toContain('**Sheet1**')
      expect(md).toContain('| Employee |')
      expect(md).toContain('| John Doe |')
      expect(md).toContain('| $95,000 |')
    })
  })
})
