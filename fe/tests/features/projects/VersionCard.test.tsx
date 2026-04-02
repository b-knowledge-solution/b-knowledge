/**
 * @fileoverview Unit tests for the VersionCard component.
 *
 * Tests version label and date rendering, status badge variants,
 * archive menu item visibility for archived versions, and keyboard
 * accessibility (Enter/Space triggers onClick).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — setup.ts already mocks react-i18next, lucide-react
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span data-testid="badge" className={className}>{children}</span>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => (
    <div data-testid="dropdown-trigger">{children}</div>
  ),
  DropdownMenuContent: ({ children }: any) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick, className }: any) => (
    <button data-testid="dropdown-item" onClick={onClick} className={className}>{children}</button>
  ),
}))

import VersionCard from '@/features/projects/components/VersionCard'
import type { DocumentCategoryVersion } from '@/features/projects/api/projectApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock DocumentCategoryVersion for card rendering
 */
function buildVersion(overrides: Partial<DocumentCategoryVersion> = {}): DocumentCategoryVersion {
  return {
    id: 'ver-1',
    category_id: 'cat-1',
    version_label: 'v1.0',
    ragflow_dataset_id: 'rf-ds-1',
    ragflow_dataset_name: 'Dataset v1',
    status: 'ready',
    last_synced_at: null,
    metadata: {},
    created_by: 'user-1',
    created_at: '2026-03-15T10:30:00Z',
    updated_at: '2026-03-15T10:30:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VersionCard', () => {
  const defaultProps = {
    version: buildVersion(),
    isActive: false,
    onClick: vi.fn(),
    onDelete: vi.fn(),
    onArchive: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** @description Should render the version label */
  it('renders version label', () => {
    render(<VersionCard {...defaultProps} />)

    expect(screen.getByText('v1.0')).toBeInTheDocument()
  })

  /** @description Should show correct status badge for 'parsing' status */
  it('shows correct status badge for parsing status', () => {
    const version = buildVersion({ status: 'parsing' })
    render(<VersionCard {...defaultProps} version={version} />)

    expect(screen.getByText('Parsing')).toBeInTheDocument()
  })

  /** @description Should show correct status badge for 'ready' status */
  it('shows correct status badge for ready status', () => {
    const version = buildVersion({ status: 'ready' })
    render(<VersionCard {...defaultProps} version={version} />)

    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  /** @description Should show correct status badge for 'error' status */
  it('shows correct status badge for error status', () => {
    const version = buildVersion({ status: 'error' })
    render(<VersionCard {...defaultProps} version={version} />)

    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  /** @description Should show correct status badge for 'archived' status */
  it('shows correct status badge for archived status', () => {
    const version = buildVersion({ status: 'archived' })
    render(<VersionCard {...defaultProps} version={version} />)

    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  /** @description Archive menu item should be hidden when version is already archived */
  it('archive menu item hidden when already archived', () => {
    const version = buildVersion({ status: 'archived' })
    render(<VersionCard {...defaultProps} version={version} />)

    const items = screen.getAllByTestId('dropdown-item')
    // Only delete item should be present (archive is hidden)
    expect(items).toHaveLength(1)
  })

  /** @description Archive menu item should be visible for non-archived versions */
  it('archive menu item visible for non-archived versions', () => {
    const version = buildVersion({ status: 'ready' })
    render(<VersionCard {...defaultProps} version={version} />)

    const items = screen.getAllByTestId('dropdown-item')
    // Both archive and delete items should be present
    expect(items).toHaveLength(2)
  })

  /** @description Should trigger onClick when Enter key is pressed */
  it('keyboard accessible - Enter triggers onClick', () => {
    const { container } = render(<VersionCard {...defaultProps} />)

    const card = container.querySelector('[role="button"]')!
    fireEvent.keyDown(card, { key: 'Enter' })

    expect(defaultProps.onClick).toHaveBeenCalled()
  })

  /** @description Should trigger onClick when Space key is pressed */
  it('keyboard accessible - Space triggers onClick', () => {
    const { container } = render(<VersionCard {...defaultProps} />)

    const card = container.querySelector('[role="button"]')!
    fireEvent.keyDown(card, { key: ' ' })

    expect(defaultProps.onClick).toHaveBeenCalled()
  })

  /** @description Should call onClick when the card is clicked */
  it('calls onClick when card is clicked', () => {
    const { container } = render(<VersionCard {...defaultProps} />)

    const card = container.querySelector('[role="button"]')!
    fireEvent.click(card)

    expect(defaultProps.onClick).toHaveBeenCalled()
  })

  /** @description Should call onArchive with version id when archive action is clicked */
  it('calls onArchive when archive action is clicked', () => {
    const version = buildVersion({ status: 'ready' })
    render(<VersionCard {...defaultProps} version={version} />)

    const items = screen.getAllByTestId('dropdown-item')
    fireEvent.click(items[0]!)

    expect(defaultProps.onArchive).toHaveBeenCalledWith('ver-1')
  })

  /** @description Should call onDelete with version id when delete action is clicked */
  it('calls onDelete when delete action is clicked', () => {
    const version = buildVersion({ status: 'ready' })
    render(<VersionCard {...defaultProps} version={version} />)

    const items = screen.getAllByTestId('dropdown-item')
    fireEvent.click(items[1]!)

    expect(defaultProps.onDelete).toHaveBeenCalledWith('ver-1')
  })

  /** @description Active card should have primary border styling */
  it('active card has highlighted border style', () => {
    const { container } = render(<VersionCard {...defaultProps} isActive={true} />)

    const card = container.querySelector('[role="button"]')!
    expect(card.className).toContain('border-primary')
  })
})
