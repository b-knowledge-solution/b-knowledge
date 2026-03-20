/**
 * @fileoverview Unit tests for the SearchWidgetBar component.
 * Verifies input behavior, form submission, disabled state, and placeholder text.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchWidgetBar } from '../../../src/features/search-widget/SearchWidgetBar'

describe('SearchWidgetBar', () => {
  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------
  describe('rendering', () => {
    it('renders with default placeholder', () => {
      render(<SearchWidgetBar onSearch={vi.fn()} isSearching={false} />)
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
    })

    it('renders with custom placeholder', () => {
      render(
        <SearchWidgetBar onSearch={vi.fn()} isSearching={false} placeholder="Ask anything..." />
      )
      expect(screen.getByPlaceholderText('Ask anything...')).toBeInTheDocument()
    })

    it('does not show submit button when query is empty', () => {
      render(<SearchWidgetBar onSearch={vi.fn()} isSearching={false} />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // Input and submission
  // --------------------------------------------------------------------------
  describe('input and submission', () => {
    it('shows submit button when query is non-empty', async () => {
      const user = userEvent.setup()
      render(<SearchWidgetBar onSearch={vi.fn()} isSearching={false} />)

      await user.type(screen.getByPlaceholderText('Search...'), 'test')
      expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
    })

    it('calls onSearch with trimmed query on submit', async () => {
      const onSearch = vi.fn()
      const user = userEvent.setup()
      render(<SearchWidgetBar onSearch={onSearch} isSearching={false} />)

      const input = screen.getByPlaceholderText('Search...')
      await user.type(input, '  hello world  ')

      // Submit the form
      fireEvent.submit(input.closest('form')!)
      expect(onSearch).toHaveBeenCalledWith('hello world')
    })

    it('does not submit empty/whitespace-only queries', async () => {
      const onSearch = vi.fn()
      const user = userEvent.setup()
      render(<SearchWidgetBar onSearch={onSearch} isSearching={false} />)

      const input = screen.getByPlaceholderText('Search...')
      await user.type(input, '   ')

      // Submit the form
      fireEvent.submit(input.closest('form')!)
      expect(onSearch).not.toHaveBeenCalled()
    })
  })

  // --------------------------------------------------------------------------
  // Searching state
  // --------------------------------------------------------------------------
  describe('searching state', () => {
    it('disables input when searching', () => {
      render(<SearchWidgetBar onSearch={vi.fn()} isSearching={true} />)
      expect(screen.getByPlaceholderText('Search...')).toBeDisabled()
    })

    it('does not call onSearch when already searching', async () => {
      const onSearch = vi.fn()
      const user = userEvent.setup()
      const { rerender } = render(<SearchWidgetBar onSearch={onSearch} isSearching={false} />)

      // Type a query first (while not searching)
      await user.type(screen.getByPlaceholderText('Search...'), 'test')

      // Switch to searching state
      rerender(<SearchWidgetBar onSearch={onSearch} isSearching={true} />)

      // Try to submit — should be blocked
      fireEvent.submit(screen.getByPlaceholderText('Search...').closest('form')!)
      expect(onSearch).not.toHaveBeenCalled()
    })
  })
})
