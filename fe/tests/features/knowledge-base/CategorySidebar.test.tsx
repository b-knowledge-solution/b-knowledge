/**
 * @fileoverview Unit tests for the CategorySidebar component.
 *
 * Tests category list rendering, empty state, selection callback,
 * context menu visibility, "New Category" button, and active highlight.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — setup.ts already mocks react-i18next (returns keys), lucide-react
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: any) => <div className={className}>{children}</div>,
}))

vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: ({ title }: any) => <div data-testid="empty-state">{title}</div>,
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

import CategorySidebar from '@/features/knowledge-base/components/CategorySidebar'
import type { DocumentCategory, DocumentCategoryType } from '@/features/knowledge-base/api/knowledgeBaseApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock DocumentCategory for sidebar rendering
 */
function buildCategory(overrides: Partial<DocumentCategory> = {}): DocumentCategory {
  return {
    id: 'cat-1',
    knowledge_base_id: 'kb-1',
    name: 'Test Category',
    description: null,
    sort_order: 0,
    category_type: 'standard' as DocumentCategoryType,
    dataset_id: 'ds-1',
    dataset_config: null,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CategorySidebar', () => {
  const defaultProps = {
    categories: [] as DocumentCategory[],
    activeCategoryId: null,
    onSelectCategory: vi.fn(),
    onCreateCategory: vi.fn(),
    onEditCategory: vi.fn(),
    onDeleteCategory: vi.fn(),
    categoryType: 'standard' as DocumentCategoryType,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** @description Should render the list of category names */
  it('renders category list', () => {
    const cats = [
      buildCategory({ id: 'c1', name: 'Alpha' }),
      buildCategory({ id: 'c2', name: 'Beta' }),
    ]
    render(<CategorySidebar {...defaultProps} categories={cats} />)

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  /** @description Should render empty state message when categories array is empty */
  it('renders empty state when no categories', () => {
    render(<CategorySidebar {...defaultProps} categories={[]} />)

    // Global i18n mock returns keys; component uses inline fallback text
    expect(screen.getByText('projects.emptyCategoryTitle')).toBeInTheDocument()
  })

  /** @description Should call onSelectCategory with category id when a category is clicked */
  it('calls onSelectCategory when clicked', () => {
    const cats = [buildCategory({ id: 'c1', name: 'Alpha' })]
    render(<CategorySidebar {...defaultProps} categories={cats} />)

    fireEvent.click(screen.getByText('Alpha'))

    expect(defaultProps.onSelectCategory).toHaveBeenCalledWith('c1')
  })

  /** @description Should show dropdown menu trigger on each category for context actions */
  it('shows context menu on each category', () => {
    const cats = [buildCategory({ id: 'c1', name: 'Alpha' })]
    render(<CategorySidebar {...defaultProps} categories={cats} />)

    expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument()
  })

  /** @description Should call onCreateCategory when the "New Category" button is clicked */
  it('calls onCreateCategory when "New Category" button clicked', () => {
    render(<CategorySidebar {...defaultProps} categories={[]} />)

    // Button text is the i18n key
    fireEvent.click(screen.getByText('projects.newCategory'))

    expect(defaultProps.onCreateCategory).toHaveBeenCalled()
  })

  /** @description Active category should have highlighted style class */
  it('active category has highlighted style', () => {
    const cats = [buildCategory({ id: 'c1', name: 'Alpha' })]
    const { container } = render(
      <CategorySidebar {...defaultProps} categories={cats} activeCategoryId="c1" />
    )

    // Active category has bg-accent class for highlight
    const activeItem = container.querySelector('.bg-accent')
    expect(activeItem).not.toBeNull()
  })

  /** @description Should render edit and delete items in the dropdown context menu */
  it('renders edit and delete actions in context menu', () => {
    const cats = [buildCategory({ id: 'c1', name: 'Alpha' })]
    render(<CategorySidebar {...defaultProps} categories={cats} />)

    const items = screen.getAllByTestId('dropdown-item')
    // First item is edit, second is delete
    expect(items).toHaveLength(2)
  })

  /** @description Should call onEditCategory with the category when edit is clicked */
  it('calls onEditCategory when edit action is clicked', () => {
    const cat = buildCategory({ id: 'c1', name: 'Alpha' })
    render(<CategorySidebar {...defaultProps} categories={[cat]} />)

    const items = screen.getAllByTestId('dropdown-item')
    fireEvent.click(items[0]!)

    expect(defaultProps.onEditCategory).toHaveBeenCalledWith(cat)
  })

  /** @description Should call onDeleteCategory with category id when delete is clicked */
  it('calls onDeleteCategory when delete action is clicked', () => {
    const cat = buildCategory({ id: 'c1', name: 'Alpha' })
    render(<CategorySidebar {...defaultProps} categories={[cat]} />)

    const items = screen.getAllByTestId('dropdown-item')
    fireEvent.click(items[1]!)

    expect(defaultProps.onDeleteCategory).toHaveBeenCalledWith('c1')
  })

  /** @description Should render category description when present */
  it('renders category description when present', () => {
    const cats = [buildCategory({ id: 'c1', name: 'Alpha', description: 'Some desc' })]
    render(<CategorySidebar {...defaultProps} categories={cats} />)

    expect(screen.getByText('Some desc')).toBeInTheDocument()
  })
})
