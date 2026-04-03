/**
 * @fileoverview Unit tests for the KnowledgeBaseSettingsSheet component.
 *
 * Tests form rendering with name/description fields, save button calling
 * updateKnowledgeBase, delete button disabled until name confirmation, and
 * form state reset when sheet opens.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — setup.ts already mocks react-i18next, lucide-react
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: any) => <div data-testid="sheet-content">{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, id, ...props }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} id={id} data-testid={id || 'input'} {...props} />
  ),
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <button data-testid="switch" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} />
  ),
}))

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr data-testid="separator" />,
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span data-testid="spinner" />,
}))

const mockUpdateKnowledgeBase = vi.fn()
const mockDeleteKnowledgeBase = vi.fn()

vi.mock('@/features/knowledge-base/api/knowledgeBaseApi', () => ({
  updateKnowledgeBase: (...args: any[]) => mockUpdateKnowledgeBase(...args),
  deleteKnowledgeBase: (...args: any[]) => mockDeleteKnowledgeBase(...args),
}))

vi.mock('@/app/App', () => ({
  globalMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/features/knowledge-base/components/KnowledgeBaseMemberList', () => ({
  default: () => <div data-testid="member-list">Members</div>,
}))

import KnowledgeBaseSettingsSheet from '@/features/knowledge-base/components/KnowledgeBaseSettingsSheet'
import type { KnowledgeBase } from '@/features/knowledge-base/api/knowledgeBaseApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock KnowledgeBase for settings sheet rendering
 */
function buildKnowledgeBase(overrides: Partial<KnowledgeBase> = {}): KnowledgeBase {
  return {
    id: 'kb-1',
    name: 'My Knowledge Base',
    description: 'A test knowledge base',
    avatar: null,
    default_embedding_model: null,
    default_chunk_method: 'naive',
    default_parser_config: null,
    status: 'active',
    is_private: false,
    created_by: 'user-1',
    updated_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeBaseSettingsSheet', () => {
  const defaultProps = {
    knowledgeBase: buildKnowledgeBase(),
    open: true,
    onOpenChange: vi.fn(),
    onKnowledgeBaseUpdated: vi.fn(),
    onKnowledgeBaseDeleted: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateKnowledgeBase.mockResolvedValue({})
    mockDeleteKnowledgeBase.mockResolvedValue({})
  })

  /** @description Should render sheet with knowledge base name and description fields */
  it('renders sheet with knowledge base name and description fields', () => {
    render(<KnowledgeBaseSettingsSheet {...defaultProps} />)

    expect(screen.getByTestId('sheet')).toBeInTheDocument()
    // Component still uses project-name / project-description test IDs internally
    const nameInput = screen.getByTestId('project-name') as HTMLInputElement
    expect(nameInput.value).toBe('My Knowledge Base')
    const descInput = screen.getByTestId('project-description') as HTMLInputElement
    expect(descInput.value).toBe('A test knowledge base')
  })

  /** @description Should not render sheet content when open is false */
  it('does not render when closed', () => {
    render(<KnowledgeBaseSettingsSheet {...defaultProps} open={false} />)

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
  })

  /** @description Save button should call updateKnowledgeBase API with form values */
  it('save button calls updateKnowledgeBase API', async () => {
    render(<KnowledgeBaseSettingsSheet {...defaultProps} />)

    // Click save — text is the i18n key
    fireEvent.click(screen.getByText('common.save'))

    await waitFor(() => {
      expect(mockUpdateKnowledgeBase).toHaveBeenCalledWith('kb-1', {
        name: 'My Knowledge Base',
        description: 'A test knowledge base',
        is_private: false,
      })
    })
  })

  /** @description Delete button should be disabled until name confirmation matches */
  it('delete button is disabled until name confirmation matches', () => {
    render(<KnowledgeBaseSettingsSheet {...defaultProps} />)

    // Find the destructive delete button — there are two "common.delete" texts
    const deleteButtons = screen.getAllByText('common.delete')
    const deleteBtn = deleteButtons[deleteButtons.length - 1]!.closest('button')!
    expect(deleteBtn.disabled).toBe(true)

    // Type the knowledge base name in the confirmation input
    const confirmInput = screen.getByPlaceholderText('My Knowledge Base')
    fireEvent.change(confirmInput, { target: { value: 'My Knowledge Base' } })

    expect(deleteBtn.disabled).toBe(false)
  })

  /** @description Form state should reset to knowledge base values when sheet opens */
  it('resets form state when opened', () => {
    const { rerender } = render(
      <KnowledgeBaseSettingsSheet {...defaultProps} open={false} />
    )

    rerender(<KnowledgeBaseSettingsSheet {...defaultProps} open={true} />)

    const nameInput = screen.getByTestId('project-name') as HTMLInputElement
    expect(nameInput.value).toBe('My Knowledge Base')
  })

  /** @description Should render the settings title (i18n key) */
  it('renders settings title', () => {
    render(<KnowledgeBaseSettingsSheet {...defaultProps} />)

    expect(screen.getByText('projectManagement.tabs.settings')).toBeInTheDocument()
  })

  /** @description Should render danger zone section */
  it('renders danger zone section', () => {
    render(<KnowledgeBaseSettingsSheet {...defaultProps} />)

    expect(screen.getByText('projects.dangerZone')).toBeInTheDocument()
  })

  /** @description Should render knowledge base member list */
  it('renders knowledge base member list', () => {
    render(<KnowledgeBaseSettingsSheet {...defaultProps} />)

    expect(screen.getByTestId('member-list')).toBeInTheDocument()
  })
})
