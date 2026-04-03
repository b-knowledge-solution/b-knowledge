import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { RetrievalChunk } from '@/features/datasets/types'

// Mock DOMPurify — strip all tags except <mark>
vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string, _opts: any) => {
      return html.replace(/<(?!\/?mark\b)[^>]*>/gi, '')
    },
  },
}))

// Import after mock setup
import ChunkResultCard from '@/features/datasets/components/ChunkResultCard'

/** Factory for a minimal RetrievalChunk */
function makeChunk(overrides: Partial<RetrievalChunk> = {}): RetrievalChunk {
  return {
    chunk_id: 'chunk-1',
    text: 'Default chunk text content',
    score: 0.85,
    ...overrides,
  }
}

describe('ChunkResultCard', () => {
  it('renders overall score as percentage', () => {
    render(<ChunkResultCard chunk={makeChunk({ score: 0.923 })} index={1} />)

    expect(screen.getByText('92.3%')).toBeInTheDocument()
  })

  it('renders vector_similarity when present', () => {
    render(
      <ChunkResultCard
        chunk={makeChunk({ vector_similarity: 0.756 })}
        index={1}
      />
    )

    expect(screen.getByText('75.6%')).toBeInTheDocument()
  })

  it('renders term_similarity when present', () => {
    render(
      <ChunkResultCard
        chunk={makeChunk({ term_similarity: 0.432 })}
        index={1}
      />
    )

    expect(screen.getByText('43.2%')).toBeInTheDocument()
  })

  it('renders token count', () => {
    render(
      <ChunkResultCard
        chunk={makeChunk({ token_count: 256 })}
        index={1}
      />
    )

    // The i18n mock returns the key; the rendered text is "256 retrievalTest.tokens"
    expect(screen.getByText(/256/)).toBeInTheDocument()
  })

  it('sanitizes highlight HTML — only mark tags remain', () => {
    const highlight = '<mark>important</mark> text <script>alert("xss")</script> <b>bold</b>'
    const { container } = render(
      <ChunkResultCard
        chunk={makeChunk({ highlight })}
        index={1}
      />
    )

    // Find the paragraph element that renders the sanitized highlight
    const highlightP = container.querySelector('p.line-clamp-6')!
    expect(highlightP.innerHTML).toContain('<mark>important</mark>')
    expect(highlightP.innerHTML).not.toContain('<script>')
    expect(highlightP.innerHTML).not.toContain('<b>')
  })

  it('falls back to plain text when no highlight is provided', () => {
    render(
      <ChunkResultCard
        chunk={makeChunk({ text: 'Plain text fallback', highlight: undefined })}
        index={1}
      />
    )

    expect(screen.getByText('Plain text fallback')).toBeInTheDocument()
  })
})
