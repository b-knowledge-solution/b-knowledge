/**
 * @fileoverview Tests for the SearchHighlight component.
 *
 * SearchHighlight is a client-side term highlighter that wraps matching
 * query terms in <mark> tags. These tests validate the component that
 * will be created in fe/src/features/search/components/SearchHighlight.tsx
 * per the search enhancement plan (Task 1.2).
 *
 * Covers:
 * - Highlights matching terms with <mark> tags
 * - Handles empty query (no highlights)
 * - Handles special regex characters in query
 * - Case-insensitive matching
 * - Multiple terms highlighted
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Inline SearchHighlight component (matches the plan spec)
// This tests the component logic independent of the source file.
// When the actual component is created, swap the import.
// ---------------------------------------------------------------------------

interface SearchHighlightProps {
  text: string
  query: string
  className?: string
}

function SearchHighlight({ text, query, className }: SearchHighlightProps) {
  if (!query.trim()) return <span className={className}>{text}</span>

  const terms = query.split(/\s+/).filter(Boolean)
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(regex)

  return (
    <span className={className} data-testid="search-highlight">
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{part}</mark>
          : <React.Fragment key={i}>{part}</React.Fragment>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchHighlight', () => {
  it('highlights a single matching term with <mark> tag', () => {
    const { container } = render(
      <SearchHighlight text="The quick brown fox" query="quick" />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('quick')
  })

  it('handles empty query without highlighting', () => {
    const { container } = render(
      <SearchHighlight text="The quick brown fox" query="" />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(0)
    expect(container.textContent).toBe('The quick brown fox')
  })

  it('handles whitespace-only query without highlighting', () => {
    const { container } = render(
      <SearchHighlight text="The quick brown fox" query="   " />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(0)
  })

  it('performs case-insensitive matching', () => {
    const { container } = render(
      <SearchHighlight text="The Quick Brown Fox" query="quick" />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('Quick')
  })

  it('highlights multiple different terms', () => {
    const { container } = render(
      <SearchHighlight text="The quick brown fox jumps over the lazy dog" query="quick lazy" />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(2)
    expect(marks[0].textContent).toBe('quick')
    expect(marks[1].textContent).toBe('lazy')
  })

  it('highlights multiple occurrences of the same term', () => {
    const { container } = render(
      <SearchHighlight text="the cat sat on the mat with the cat" query="the" />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(3)
  })

  it('handles special regex characters in query safely', () => {
    const { container } = render(
      <SearchHighlight text="Price is $100 (USD)" query="$100" />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('$100')
  })

  it('handles parentheses in query', () => {
    const { container } = render(
      <SearchHighlight text="Call fn(x) now" query="fn(x)" />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('fn(x)')
  })

  it('handles square brackets in query', () => {
    const { container } = render(
      <SearchHighlight text="Array [1,2,3] here" query="[1,2,3]" />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('[1,2,3]')
  })

  it('handles dots and asterisks in query', () => {
    const { container } = render(
      <SearchHighlight text="File is config.*.json" query="config.*.json" />
    )

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('config.*.json')
  })

  it('preserves non-matching text verbatim', () => {
    const { container } = render(
      <SearchHighlight text="Hello World" query="World" />
    )

    expect(container.textContent).toBe('Hello World')
  })

  it('applies custom className to wrapper span', () => {
    const { container } = render(
      <SearchHighlight text="test" query="test" className="custom-class" />
    )

    const span = container.querySelector('span.custom-class')
    expect(span).toBeInTheDocument()
  })

  it('renders without errors when text is empty', () => {
    const { container } = render(
      <SearchHighlight text="" query="test" />
    )

    expect(container.textContent).toBe('')
  })

  it('highlights mark tags with correct styling classes', () => {
    const { container } = render(
      <SearchHighlight text="highlight me" query="highlight" />
    )

    const mark = container.querySelector('mark')
    expect(mark).toHaveClass('bg-yellow-200')
    expect(mark).toHaveClass('dark:bg-yellow-800')
  })
})
