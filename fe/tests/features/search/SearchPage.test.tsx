/**
 * @fileoverview Tests for the SearchPage (DatasetSearchPage).
 *
 * Verifies:
 * - No settings/config button or admin config UI leakage
 * - SearchAppConfig does NOT render on the search page
 * - Search bar renders and accepts input
 * - Search execution triggers streaming
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useAuth
vi.mock('../../../src/features/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Test User', role: 'user' },
    isAuthenticated: true,
  }),
}))

// Mock useFirstVisit
vi.mock('../../../src/features/guideline', () => ({
  useFirstVisit: () => ({ isFirstVisit: false }),
  GuidelineDialog: () => null,
}))

// Track askSearch calls
const mockAskSearch = vi.fn()
const mockStopStream = vi.fn()
const mockClearResults = vi.fn()

vi.mock('../../../src/features/search/hooks/useSearchStream', () => ({
  useSearchStream: () => ({
    answer: '',
    chunks: [],
    relatedQuestions: [],
    isStreaming: false,
    pipelineStatus: '',
    error: null,
    docAggs: [],
    askSearch: mockAskSearch,
    stopStream: mockStopStream,
    clearResults: mockClearResults,
    lastQuery: '',
  }),
}))

// Mock child components to isolate SearchPage logic
vi.mock('../../../src/features/search/components/SearchBar', () => ({
  default: ({ onSearch, isSearching, defaultValue }: any) => (
    <div data-testid="search-bar">
      <input
        data-testid="search-input"
        defaultValue={defaultValue}
        onKeyDown={(e: any) => {
          if (e.key === 'Enter') onSearch(e.target.value)
        }}
      />
      {isSearching && <span data-testid="searching-indicator">Searching...</span>}
    </div>
  ),
}))

vi.mock('../../../src/features/search/components/SearchResults', () => ({
  default: () => <div data-testid="search-results" />,
}))

vi.mock('../../../src/features/search/components/SearchFilters', () => ({
  default: ({ onToggle }: any) => (
    <button data-testid="filter-toggle" onClick={onToggle}>Filters</button>
  ),
}))

vi.mock('../../../src/features/search/components/SearchDocumentPreviewDrawer', () => ({
  default: () => <div data-testid="doc-preview-drawer" />,
}))

vi.mock('../../../src/features/search/components/SearchMindMapDrawer', () => ({
  default: () => <div data-testid="mindmap-drawer" />,
}))

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import DatasetSearchPage from '../../../src/features/search/pages/SearchPage'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DatasetSearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search bar', () => {
    render(<DatasetSearchPage />)
    expect(screen.getByTestId('search-bar')).toBeInTheDocument()
  })

  it('renders the search input that accepts text', () => {
    render(<DatasetSearchPage />)
    const input = screen.getByTestId('search-input')
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'hello world' } })
    expect((input as HTMLInputElement).value).toBe('hello world')
  })

  it('does NOT render any Settings or config button', () => {
    render(<DatasetSearchPage />)

    // No element with text "Settings" or "Config"
    expect(screen.queryByText(/settings/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/config/i)).not.toBeInTheDocument()

    // No gear/settings icon button (by test-id or aria-label)
    expect(screen.queryByTestId('settings-button')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/settings/i)).not.toBeInTheDocument()
  })

  it('does NOT render SearchAppConfig component', () => {
    render(<DatasetSearchPage />)

    // SearchAppConfig would typically render a dialog or form with config fields
    expect(screen.queryByTestId('search-app-config')).not.toBeInTheDocument()
    expect(screen.queryByText(/search app config/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/llm model/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/system prompt/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/rerank/i)).not.toBeInTheDocument()
  })

  it('does NOT render SearchAppAccessDialog', () => {
    render(<DatasetSearchPage />)

    expect(screen.queryByTestId('search-app-access-dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/manage access/i)).not.toBeInTheDocument()
  })

  it('triggers askSearch when user submits a query', () => {
    render(<DatasetSearchPage />)

    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'test query' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockAskSearch).toHaveBeenCalledWith(
      'default',
      'test query',
      expect.objectContaining({
        page: 1,
      })
    )
  })

  it('renders landing state with branding when no search has been performed', () => {
    render(<DatasetSearchPage />)

    // The greeting or title should be visible on landing
    expect(screen.getByText(/search\.greeting|search\.title/)).toBeInTheDocument()
    expect(screen.getByText('search.description')).toBeInTheDocument()
  })

  it('renders the document preview drawer', () => {
    render(<DatasetSearchPage />)
    expect(screen.getByTestId('doc-preview-drawer')).toBeInTheDocument()
  })

  it('renders the mindmap drawer', () => {
    render(<DatasetSearchPage />)
    expect(screen.getByTestId('mindmap-drawer')).toBeInTheDocument()
  })
})
