/**
 * @fileoverview Unit tests for the StandardCategoryView component.
 *
 * Tests header rendering with category name and parser badge,
 * error state when dataset_id is missing, and DocumentListPanel
 * rendering when dataset_id is present.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — setup.ts already mocks react-i18next, lucide-react
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span data-testid="badge" className={className}>{children}</span>,
}))

vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: ({ title, icon }: any) => (
    <div data-testid="empty-state">
      {icon}
      <span>{title}</span>
    </div>
  ),
}))

vi.mock('@/features/knowledge-base/components/DocumentListPanel', () => ({
  default: ({ knowledgeBaseId, categoryId, versionId }: any) => (
    <div data-testid="document-list-panel" data-knowledge-base-id={knowledgeBaseId} data-category-id={categoryId} data-version-id={versionId}>
      DocumentListPanel
    </div>
  ),
}))

import StandardCategoryView from '@/features/knowledge-base/components/StandardCategoryView'
import type { DocumentCategory, DocumentCategoryType } from '@/features/knowledge-base/api/knowledgeBaseApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock DocumentCategory for StandardCategoryView rendering
 */
function buildCategory(overrides: Partial<DocumentCategory> = {}): DocumentCategory {
  return {
    id: 'cat-1',
    knowledge_base_id: 'kb-1',
    name: 'Standard Docs',
    description: null,
    sort_order: 0,
    category_type: 'standard' as DocumentCategoryType,
    dataset_id: 'ds-1',
    dataset_config: { chunk_method: 'recursive' },
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StandardCategoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** @description Should render header with category name */
  it('renders header with category name', () => {
    const category = buildCategory({ name: 'Research Papers' })
    render(<StandardCategoryView knowledgeBaseId="kb-1" category={category} />)

    expect(screen.getByText('Research Papers')).toBeInTheDocument()
  })

  /** @description Should show parser config badge with chunk method */
  it('renders parser config badge', () => {
    const category = buildCategory({ dataset_config: { chunk_method: 'semantic' } })
    render(<StandardCategoryView knowledgeBaseId="kb-1" category={category} />)

    // Badge text includes "projects.parserConfig" key and the chunk method
    expect(screen.getByText(/semantic/)).toBeInTheDocument()
  })

  /** @description Should show error state when dataset_id is missing */
  it('shows error state when dataset_id is missing', () => {
    const category = buildCategory({ dataset_id: null })
    render(<StandardCategoryView knowledgeBaseId="kb-1" category={category} />)

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  /** @description Should render DocumentListPanel when dataset_id is present */
  it('renders DocumentListPanel when dataset_id is present', () => {
    const category = buildCategory({ dataset_id: 'ds-42' })
    render(<StandardCategoryView knowledgeBaseId="kb-1" category={category} />)

    const panel = screen.getByTestId('document-list-panel')
    expect(panel).toBeInTheDocument()
    expect(panel.getAttribute('data-knowledge-base-id')).toBe('kb-1')
    expect(panel.getAttribute('data-category-id')).toBe('cat-1')
    expect(panel.getAttribute('data-version-id')).toBe('ds-42')
  })

  /** @description Should default parser summary to 'naive' when dataset_config has no chunk_method */
  it('defaults parser summary to naive when chunk_method is absent', () => {
    const category = buildCategory({ dataset_config: null })
    render(<StandardCategoryView knowledgeBaseId="kb-1" category={category} />)

    expect(screen.getByText(/naive/)).toBeInTheDocument()
  })

  /** @description Should not render DocumentListPanel when dataset_id is null */
  it('does not render DocumentListPanel when dataset_id is null', () => {
    const category = buildCategory({ dataset_id: null })
    render(<StandardCategoryView knowledgeBaseId="kb-1" category={category} />)

    expect(screen.queryByTestId('document-list-panel')).not.toBeInTheDocument()
  })
})
