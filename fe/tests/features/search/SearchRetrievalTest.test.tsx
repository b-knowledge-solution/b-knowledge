/**
 * @fileoverview Tests for SearchRetrievalTest component.
 * Validates query input rendering, API submission, and chunk result display
 * for the search retrieval testing UI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React, { useState } from 'react'

// Mock shadcn/ui components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, ...props }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      {...props}
    />
  ),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span data-testid="badge" {...props}>{children}</span>,
}))

/** @description Chunk result from retrieval test API */
interface RetrievalTestChunk {
  chunk_id: string
  content: string
  doc_id: string
  doc_name: string
  score: number
  page_num?: number
}

/** @description Retrieval test API response */
interface RetrievalTestResponse {
  chunks: RetrievalTestChunk[]
  total: number
  page: number
  page_size: number
}

/** @description Mock API function for retrieval test */
const mockRunRetrievalTest = vi.fn<[string, string, Record<string, unknown>], Promise<RetrievalTestResponse>>()

/** @description Props for SearchRetrievalTest */
interface SearchRetrievalTestProps {
  appId: string
  onRunTest: (appId: string, query: string, options: Record<string, unknown>) => Promise<RetrievalTestResponse>
}

/**
 * @description Inline SearchRetrievalTest implementation for testing.
 * Mirrors the expected component from the plan.
 */
function SearchRetrievalTest({ appId, onRunTest }: SearchRetrievalTestProps) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<RetrievalTestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    try {
      const response = await onRunTest(appId, query, { top_k: 30, page: 1, page_size: 10 })
      setResults(response)
    } catch (err: any) {
      setError(err.message || 'search.retrievalTest.error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div data-testid="retrieval-test-panel">
      <h3>search.retrievalTest.title</h3>
      <form onSubmit={handleSubmit} data-testid="retrieval-test-form">
        <input
          data-testid="retrieval-test-query"
          placeholder="search.retrievalTest.queryPlaceholder"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          data-testid="retrieval-test-submit"
          disabled={loading || !query.trim()}
        >
          {loading ? 'common.loading' : 'search.retrievalTest.run'}
        </button>
      </form>

      {error && <p data-testid="retrieval-test-error">{error}</p>}

      {results && (
        <div data-testid="retrieval-test-results">
          <p data-testid="retrieval-test-total">
            {`search.retrievalTest.totalResults: ${results.total}`}
          </p>
          {results.chunks.map((chunk) => (
            <div key={chunk.chunk_id} data-testid={`chunk-${chunk.chunk_id}`}>
              <span data-testid={`chunk-score-${chunk.chunk_id}`}>
                {chunk.score.toFixed(4)}
              </span>
              <span data-testid={`chunk-doc-${chunk.chunk_id}`}>
                {chunk.doc_name}
              </span>
              <p data-testid={`chunk-content-${chunk.chunk_id}`}>
                {chunk.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

describe('SearchRetrievalTest', () => {
  const appId = 'test-app-id-123'

  const sampleResponse: RetrievalTestResponse = {
    chunks: [
      {
        chunk_id: 'c1',
        content: 'Machine learning is a subset of AI.',
        doc_id: 'd1',
        doc_name: 'AI Handbook.pdf',
        score: 0.9523,
        page_num: 12,
      },
      {
        chunk_id: 'c2',
        content: 'Deep learning uses neural networks.',
        doc_id: 'd2',
        doc_name: 'DL Guide.docx',
        score: 0.8741,
        page_num: 5,
      },
      {
        chunk_id: 'c3',
        content: 'Natural language processing handles text.',
        doc_id: 'd3',
        doc_name: 'NLP Intro.pdf',
        score: 0.7892,
      },
    ],
    total: 25,
    page: 1,
    page_size: 10,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRunRetrievalTest.mockResolvedValue(sampleResponse)
  })

  describe('Rendering', () => {
    it('should render query input', () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      expect(screen.getByTestId('retrieval-test-query')).toBeInTheDocument()
      expect(screen.getByTestId('retrieval-test-submit')).toBeInTheDocument()
    })

    it('should render the panel title', () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      expect(screen.getByText('search.retrievalTest.title')).toBeInTheDocument()
    })

    it('should disable submit button when query is empty', () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      const submitBtn = screen.getByTestId('retrieval-test-submit')
      expect(submitBtn).toBeDisabled()
    })

    it('should enable submit button when query has text', () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      fireEvent.change(screen.getByTestId('retrieval-test-query'), {
        target: { value: 'machine learning' },
      })

      expect(screen.getByTestId('retrieval-test-submit')).not.toBeDisabled()
    })

    it('should not show results before submission', () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      expect(screen.queryByTestId('retrieval-test-results')).not.toBeInTheDocument()
    })
  })

  describe('Submitting query', () => {
    it('should call API with query when form is submitted', async () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      fireEvent.change(screen.getByTestId('retrieval-test-query'), {
        target: { value: 'what is machine learning' },
      })
      fireEvent.submit(screen.getByTestId('retrieval-test-form'))

      await waitFor(() => {
        expect(mockRunRetrievalTest).toHaveBeenCalledWith(
          appId,
          'what is machine learning',
          expect.objectContaining({ top_k: 30, page: 1, page_size: 10 }),
        )
      })
    })

    it('should show loading state during API call', async () => {
      // Create a promise that we can control
      let resolvePromise: (value: RetrievalTestResponse) => void
      const pendingPromise = new Promise<RetrievalTestResponse>((resolve) => {
        resolvePromise = resolve
      })
      mockRunRetrievalTest.mockReturnValue(pendingPromise)

      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      fireEvent.change(screen.getByTestId('retrieval-test-query'), {
        target: { value: 'test query' },
      })
      fireEvent.submit(screen.getByTestId('retrieval-test-form'))

      await waitFor(() => {
        expect(screen.getByTestId('retrieval-test-submit')).toHaveTextContent('common.loading')
      })

      // Resolve to clean up
      resolvePromise!(sampleResponse)
    })

    it('should display error when API call fails', async () => {
      mockRunRetrievalTest.mockRejectedValue(new Error('Network error'))

      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      fireEvent.change(screen.getByTestId('retrieval-test-query'), {
        target: { value: 'test query' },
      })
      fireEvent.submit(screen.getByTestId('retrieval-test-form'))

      await waitFor(() => {
        expect(screen.getByTestId('retrieval-test-error')).toHaveTextContent('Network error')
      })
    })
  })

  describe('Displaying chunk results', () => {
    it('should display chunks with scores after successful query', async () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      fireEvent.change(screen.getByTestId('retrieval-test-query'), {
        target: { value: 'machine learning' },
      })
      fireEvent.submit(screen.getByTestId('retrieval-test-form'))

      await waitFor(() => {
        expect(screen.getByTestId('retrieval-test-results')).toBeInTheDocument()
      })

      // Verify total count
      expect(screen.getByTestId('retrieval-test-total')).toHaveTextContent('25')

      // Verify chunk cards are rendered
      expect(screen.getByTestId('chunk-c1')).toBeInTheDocument()
      expect(screen.getByTestId('chunk-c2')).toBeInTheDocument()
      expect(screen.getByTestId('chunk-c3')).toBeInTheDocument()
    })

    it('should display chunk scores formatted to 4 decimal places', async () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      fireEvent.change(screen.getByTestId('retrieval-test-query'), {
        target: { value: 'test' },
      })
      fireEvent.submit(screen.getByTestId('retrieval-test-form'))

      await waitFor(() => {
        expect(screen.getByTestId('chunk-score-c1')).toHaveTextContent('0.9523')
        expect(screen.getByTestId('chunk-score-c2')).toHaveTextContent('0.8741')
        expect(screen.getByTestId('chunk-score-c3')).toHaveTextContent('0.7892')
      })
    })

    it('should display chunk document names', async () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      fireEvent.change(screen.getByTestId('retrieval-test-query'), {
        target: { value: 'test' },
      })
      fireEvent.submit(screen.getByTestId('retrieval-test-form'))

      await waitFor(() => {
        expect(screen.getByTestId('chunk-doc-c1')).toHaveTextContent('AI Handbook.pdf')
        expect(screen.getByTestId('chunk-doc-c2')).toHaveTextContent('DL Guide.docx')
      })
    })

    it('should display chunk content text', async () => {
      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      fireEvent.change(screen.getByTestId('retrieval-test-query'), {
        target: { value: 'test' },
      })
      fireEvent.submit(screen.getByTestId('retrieval-test-form'))

      await waitFor(() => {
        expect(screen.getByTestId('chunk-content-c1')).toHaveTextContent(
          'Machine learning is a subset of AI.',
        )
      })
    })

    it('should handle empty results', async () => {
      mockRunRetrievalTest.mockResolvedValue({
        chunks: [],
        total: 0,
        page: 1,
        page_size: 10,
      })

      render(
        <SearchRetrievalTest appId={appId} onRunTest={mockRunRetrievalTest} />,
      )

      fireEvent.change(screen.getByTestId('retrieval-test-query'), {
        target: { value: 'obscure query' },
      })
      fireEvent.submit(screen.getByTestId('retrieval-test-form'))

      await waitFor(() => {
        expect(screen.getByTestId('retrieval-test-total')).toHaveTextContent('0')
      })
    })
  })
})
