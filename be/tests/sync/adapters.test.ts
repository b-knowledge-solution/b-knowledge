/**
 * @fileoverview Unit tests for sync connector adapters (Notion, S3, WebCrawl).
 * @description Tests adapter-specific logic including API interactions,
 *   pagination handling, file filtering, and HTML-to-text conversion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock minio for S3Adapter
vi.mock('minio', () => ({
  Client: vi.fn(),
}))

// ---------------------------------------------------------------------------
// NotionAdapter Tests
// ---------------------------------------------------------------------------

import { NotionAdapter } from '../../src/modules/sync/adapters/notion.adapter'

describe('NotionAdapter', () => {
  let adapter: NotionAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new NotionAdapter()
  })

  /** @description Should throw when API key is missing */
  it('should throw when api_key is not provided', async () => {
    const gen = adapter.fetch({})

    await expect(gen.next()).rejects.toThrow('Notion API key is required')
  })

  /** @description Should fetch pages and yield markdown documents */
  it('should yield markdown documents from Notion pages', async () => {
    // Mock the global fetch for Notion API calls
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    // Mock search response with one page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{
          id: 'page-1',
          last_edited_time: '2025-06-01T00:00:00Z',
          url: 'https://notion.so/page-1',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Test Page' }] },
          },
        }],
        has_more: false,
        next_cursor: null,
      }),
    })

    // Mock blocks response for page content
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [
          {
            type: 'heading_1',
            heading_1: { rich_text: [{ plain_text: 'Hello World' }] },
            has_children: false,
          },
          {
            type: 'paragraph',
            paragraph: { rich_text: [{ plain_text: 'Some content' }] },
            has_children: false,
          },
        ],
        has_more: false,
      }),
    })

    const docs: any[] = []
    for await (const doc of adapter.fetch({ api_key: 'test-key' })) {
      docs.push(doc)
    }

    // Verify one document was yielded
    expect(docs).toHaveLength(1)
    expect(docs[0].filename).toBe('Test Page.md')
    expect(docs[0].suffix).toBe('md')
    // Verify markdown content includes heading and paragraph
    const content = docs[0].content.toString('utf-8')
    expect(content).toContain('# Hello World')
    expect(content).toContain('Some content')
    // Verify metadata
    expect(docs[0].metadata).toEqual(expect.objectContaining({
      notion_page_id: 'page-1',
    }))

    vi.unstubAllGlobals()
  })

  /** @description Should skip pages older than 'since' timestamp for incremental sync */
  it('should skip pages older than since timestamp', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const since = new Date('2025-06-01T00:00:00Z')

    // Return a page that was edited before the since timestamp
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{
          id: 'old-page',
          last_edited_time: '2025-05-01T00:00:00Z',
          url: 'https://notion.so/old',
          properties: {},
        }],
        has_more: false,
      }),
    })

    const docs: any[] = []
    for await (const doc of adapter.fetch({ api_key: 'test-key' }, since)) {
      docs.push(doc)
    }

    // Old page should be skipped
    expect(docs).toHaveLength(0)

    vi.unstubAllGlobals()
  })

  /** @description Should handle Notion API errors gracefully per page */
  it('should handle API errors and continue pagination', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    // Search returns two pages
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { id: 'page-1', last_edited_time: '2025-06-01T00:00:00Z', properties: {} },
          { id: 'page-2', last_edited_time: '2025-06-01T00:00:00Z', properties: { Title: { type: 'title', title: [{ plain_text: 'Good Page' }] } } },
        ],
        has_more: false,
      }),
    })

    // First page blocks fetch fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })

    // Second page blocks fetch succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Content' }] }, has_children: false }],
        has_more: false,
      }),
    })

    const docs: any[] = []
    for await (const doc of adapter.fetch({ api_key: 'test-key' })) {
      docs.push(doc)
    }

    // Only the second page should succeed
    expect(docs).toHaveLength(1)
    expect(docs[0].filename).toBe('Good Page.md')

    vi.unstubAllGlobals()
  })

  /** @description Should handle pagination with multiple pages of results */
  it('should handle paginated search results', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    // First search page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{ id: 'page-1', last_edited_time: '2025-06-01T00:00:00Z', properties: {} }],
        has_more: true,
        next_cursor: 'cursor-2',
      }),
    })

    // Blocks for page-1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Page 1' }] }, has_children: false }],
        has_more: false,
      }),
    })

    // Second search page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{ id: 'page-2', last_edited_time: '2025-06-01T00:00:00Z', properties: {} }],
        has_more: false,
      }),
    })

    // Blocks for page-2
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Page 2' }] }, has_children: false }],
        has_more: false,
      }),
    })

    const docs: any[] = []
    for await (const doc of adapter.fetch({ api_key: 'test-key' })) {
      docs.push(doc)
    }

    // Both pages should be yielded
    expect(docs).toHaveLength(2)

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// WebCrawlAdapter Tests
// ---------------------------------------------------------------------------

import { WebCrawlAdapter } from '../../src/modules/sync/adapters/web-crawl.adapter'

describe('WebCrawlAdapter', () => {
  let adapter: WebCrawlAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new WebCrawlAdapter()
  })

  /** @description Should throw when URLs list is empty */
  it('should throw when urls list is empty', async () => {
    const gen = adapter.fetch({ urls: [] })
    await expect(gen.next()).rejects.toThrow('URLs list is required')
  })

  /** @description Should throw when urls is not provided */
  it('should throw when urls is not provided', async () => {
    const gen = adapter.fetch({})
    await expect(gen.next()).rejects.toThrow('URLs list is required')
  })

  /** @description Should yield markdown documents from HTML pages */
  it('should fetch HTML pages and yield markdown documents', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]) as any,
      text: () => Promise.resolve('<html><body><h1>Title</h1><p>Hello world paragraph content here for testing</p></body></html>'),
    })

    const docs: any[] = []
    for await (const doc of adapter.fetch({ urls: ['https://example.com/page'] })) {
      docs.push(doc)
    }

    expect(docs).toHaveLength(1)
    expect(docs[0].suffix).toBe('md')
    // Verify URL is used for filename
    expect(docs[0].filename).toContain('example_com')
    // Verify content was converted from HTML
    const content = docs[0].content.toString('utf-8')
    expect(content).toContain('Title')

    vi.unstubAllGlobals()
  })

  /** @description Should handle PDF content type */
  it('should yield PDF documents when content-type is application/pdf', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const pdfBuffer = Buffer.from('fake-pdf-content')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/pdf']]) as any,
      arrayBuffer: () => Promise.resolve(pdfBuffer.buffer),
    })

    const docs: any[] = []
    for await (const doc of adapter.fetch({ urls: ['https://example.com/file.pdf'] })) {
      docs.push(doc)
    }

    expect(docs).toHaveLength(1)
    expect(docs[0].suffix).toBe('pdf')
    expect(docs[0].metadata).toEqual({ source_url: 'https://example.com/file.pdf' })

    vi.unstubAllGlobals()
  })

  /** @description Should skip pages with less than 50 characters of content */
  it('should skip nearly empty pages', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]) as any,
      text: () => Promise.resolve('<html><body>Hi</body></html>'),
    })

    const docs: any[] = []
    for await (const doc of adapter.fetch({ urls: ['https://example.com/empty'] })) {
      docs.push(doc)
    }

    // Page with < 50 chars of text should be skipped
    expect(docs).toHaveLength(0)

    vi.unstubAllGlobals()
  })

  /** @description Should skip duplicate URLs */
  it('should not visit the same URL twice', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    // Same URL listed twice
    const urls = ['https://example.com/page', 'https://example.com/page']

    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/html']]) as any,
      text: () => Promise.resolve('<html><body><p>Enough content to be above the fifty character minimum threshold for pages</p></body></html>'),
    })

    const docs: any[] = []
    for await (const doc of adapter.fetch({ urls })) {
      docs.push(doc)
    }

    // Only one fetch should happen due to deduplication
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(docs).toHaveLength(1)

    vi.unstubAllGlobals()
  })

  /** @description Should respect max_pages limit */
  it('should stop after max_pages is reached', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const urls = ['https://a.com', 'https://b.com', 'https://c.com']

    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/html']]) as any,
      text: () => Promise.resolve('<html><body><p>Enough content to be above the fifty character minimum threshold for pages</p></body></html>'),
    })

    const docs: any[] = []
    // Limit to 2 pages
    for await (const doc of adapter.fetch({ urls, max_pages: 2 })) {
      docs.push(doc)
    }

    expect(docs).toHaveLength(2)

    vi.unstubAllGlobals()
  })

  /** @description Should handle fetch errors gracefully and continue */
  it('should continue crawling when a URL fails to fetch', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    // First URL fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    // Second URL succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]) as any,
      text: () => Promise.resolve('<html><body><p>Enough content to be above the fifty character minimum threshold for pages</p></body></html>'),
    })

    const docs: any[] = []
    for await (const doc of adapter.fetch({ urls: ['https://fail.com', 'https://ok.com'] })) {
      docs.push(doc)
    }

    // Only the successful URL yields a document
    expect(docs).toHaveLength(1)

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// S3Adapter Tests
// ---------------------------------------------------------------------------

import { S3Adapter } from '../../src/modules/sync/adapters/s3.adapter'
import * as Minio from 'minio'

describe('S3Adapter', () => {
  let adapter: S3Adapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new S3Adapter()
  })

  /** @description Should create a Minio client with connector config */
  it('should create Minio client with provided config', async () => {
    const MockClient = vi.mocked(Minio.Client)

    // Create a mock object stream that yields nothing
    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        // No objects to yield
      },
    }
    MockClient.prototype.listObjectsV2 = vi.fn().mockReturnValue(mockStream)

    const docs: any[] = []
    for await (const doc of adapter.fetch({
      endpoint: 'minio.local',
      port: 9000,
      use_ssl: false,
      access_key: 'access',
      secret_key: 'secret',
      bucket: 'test-bucket',
      prefix: 'docs/',
    })) {
      docs.push(doc)
    }

    // Verify Minio.Client was instantiated with correct config
    expect(MockClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endPoint: 'minio.local',
        port: 9000,
        useSSL: false,
        accessKey: 'access',
        secretKey: 'secret',
      }),
    )
    expect(docs).toHaveLength(0)
  })

  /** @description Should skip directory entries and unsupported file extensions */
  it('should skip directories and unsupported extensions', async () => {
    const MockClient = vi.mocked(Minio.Client)

    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        // Directory entry
        yield { name: 'folder/', size: 0 }
        // Unsupported extension
        yield { name: 'script.exe', size: 100, lastModified: new Date() }
        // Supported file
        yield { name: 'doc.pdf', size: 1024, lastModified: new Date() }
      },
    }

    // Mock getObject to return a readable stream
    const mockGetObject = vi.fn().mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('pdf-content')
      },
    })

    MockClient.prototype.listObjectsV2 = vi.fn().mockReturnValue(mockStream)
    MockClient.prototype.getObject = mockGetObject

    const docs: any[] = []
    for await (const doc of adapter.fetch({
      endpoint: 'minio.local',
      access_key: 'a',
      secret_key: 's',
      bucket: 'bucket',
    })) {
      docs.push(doc)
    }

    // Only the PDF should be yielded, directory and .exe are skipped
    expect(docs).toHaveLength(1)
    expect(docs[0].filename).toBe('doc.pdf')
    expect(docs[0].suffix).toBe('pdf')
  })

  /** @description Should skip files older than 'since' for incremental sync */
  it('should skip files older than since timestamp', async () => {
    const MockClient = vi.mocked(Minio.Client)
    const since = new Date('2025-06-01T00:00:00Z')

    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        // Old file
        yield { name: 'old.pdf', size: 100, lastModified: new Date('2025-05-01T00:00:00Z') }
        // New file
        yield { name: 'new.pdf', size: 200, lastModified: new Date('2025-07-01T00:00:00Z') }
      },
    }

    const mockGetObject = vi.fn().mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('content')
      },
    })

    MockClient.prototype.listObjectsV2 = vi.fn().mockReturnValue(mockStream)
    MockClient.prototype.getObject = mockGetObject

    const docs: any[] = []
    for await (const doc of adapter.fetch({
      endpoint: 'minio.local',
      access_key: 'a',
      secret_key: 's',
      bucket: 'bucket',
    }, since)) {
      docs.push(doc)
    }

    // Only the newer file should be yielded
    expect(docs).toHaveLength(1)
    expect(docs[0].filename).toBe('new.pdf')
  })

  /** @description Should handle download errors gracefully and continue */
  it('should continue when individual file download fails', async () => {
    const MockClient = vi.mocked(Minio.Client)

    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { name: 'fail.pdf', size: 100, lastModified: new Date() }
        yield { name: 'ok.txt', size: 50, lastModified: new Date() }
      },
    }

    const mockGetObject = vi.fn()
    // First file download fails
    mockGetObject.mockRejectedValueOnce(new Error('Network error'))
    // Second file download succeeds
    mockGetObject.mockResolvedValueOnce({
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('text content')
      },
    })

    MockClient.prototype.listObjectsV2 = vi.fn().mockReturnValue(mockStream)
    MockClient.prototype.getObject = mockGetObject

    const docs: any[] = []
    for await (const doc of adapter.fetch({
      endpoint: 'minio.local',
      access_key: 'a',
      secret_key: 's',
      bucket: 'bucket',
    })) {
      docs.push(doc)
    }

    // Only the successful file yields a document
    expect(docs).toHaveLength(1)
    expect(docs[0].filename).toBe('ok.txt')
  })
})
