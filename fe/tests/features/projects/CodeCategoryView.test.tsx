/**
 * @fileoverview Unit tests for the CodeCategoryView component.
 *
 * Tests header rendering with category name and code badge,
 * error state when dataset_id is missing, git sync collapsible panel,
 * and disabled Connect Repository button.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — setup.ts already mocks react-i18next, lucide-react
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span data-testid="badge" className={className}>{children}</span>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: ({ title, icon }: any) => (
    <div data-testid="empty-state">
      {icon}
      <span>{title}</span>
    </div>
  ),
}))

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open }: any) => (
    <div data-testid="collapsible" data-open={open}>{children}</div>
  ),
  CollapsibleTrigger: ({ children }: any) => (
    <div data-testid="collapsible-trigger">{children}</div>
  ),
  CollapsibleContent: ({ children }: any) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
}))

vi.mock('@/features/projects/components/DocumentListPanel', () => ({
  default: ({ projectId, categoryId, versionId }: any) => (
    <div data-testid="document-list-panel" data-project-id={projectId} data-category-id={categoryId} data-version-id={versionId}>
      DocumentListPanel
    </div>
  ),
}))

import CodeCategoryView from '@/features/projects/components/CodeCategoryView'
import type { DocumentCategory, DocumentCategoryType } from '@/features/projects/api/projectApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock DocumentCategory for CodeCategoryView rendering
 */
function buildCategory(overrides: Partial<DocumentCategory> = {}): DocumentCategory {
  return {
    id: 'cat-code-1',
    project_id: 'proj-1',
    name: 'Backend Code',
    description: null,
    sort_order: 0,
    category_type: 'code' as DocumentCategoryType,
    dataset_id: 'ds-code-1',
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

describe('CodeCategoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** @description Should render header with category name */
  it('renders header with category name', () => {
    const category = buildCategory({ name: 'API Source' })
    render(<CodeCategoryView projectId="proj-1" category={category} />)

    expect(screen.getByText('API Source')).toBeInTheDocument()
  })

  /** @description Should show error state when dataset_id is missing */
  it('shows error state when dataset_id is missing', () => {
    const category = buildCategory({ dataset_id: null })
    render(<CodeCategoryView projectId="proj-1" category={category} />)

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  /** @description Should not render DocumentListPanel or git sync when dataset_id is null */
  it('does not render DocumentListPanel when dataset_id is null', () => {
    const category = buildCategory({ dataset_id: null })
    render(<CodeCategoryView projectId="proj-1" category={category} />)

    expect(screen.queryByTestId('document-list-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('collapsible')).not.toBeInTheDocument()
  })

  /** @description Should render git sync collapsible panel when dataset_id is present */
  it('renders git sync collapsible panel', () => {
    const category = buildCategory()
    render(<CodeCategoryView projectId="proj-1" category={category} />)

    expect(screen.getByTestId('collapsible')).toBeInTheDocument()
    // i18n key for git sync title
    expect(screen.getByText('projects.gitSyncTitle')).toBeInTheDocument()
  })

  /** @description Git sync "Connect Repository" button should be disabled */
  it('connect repository button is disabled', () => {
    const category = buildCategory()
    render(<CodeCategoryView projectId="proj-1" category={category} />)

    const connectBtn = screen.getByText('projects.connectRepository').closest('button')!
    expect(connectBtn.disabled).toBe(true)
  })

  /** @description Should render DocumentListPanel with correct props when dataset_id is present */
  it('renders DocumentListPanel when dataset_id is present', () => {
    const category = buildCategory({ dataset_id: 'ds-99' })
    render(<CodeCategoryView projectId="proj-1" category={category} />)

    const panel = screen.getByTestId('document-list-panel')
    expect(panel).toBeInTheDocument()
    expect(panel.getAttribute('data-project-id')).toBe('proj-1')
    expect(panel.getAttribute('data-category-id')).toBe('cat-code-1')
    expect(panel.getAttribute('data-version-id')).toBe('ds-99')
  })

  /** @description Should show "coming soon" badge in git sync trigger */
  it('shows coming soon badge in git sync panel', () => {
    const category = buildCategory()
    render(<CodeCategoryView projectId="proj-1" category={category} />)

    // The i18n key for coming soon appears in both trigger badge and content
    expect(screen.getAllByText('projects.gitSyncComingSoon').length).toBeGreaterThanOrEqual(1)
  })
})
