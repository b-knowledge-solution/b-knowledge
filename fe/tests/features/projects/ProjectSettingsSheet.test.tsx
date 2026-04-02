/**
 * @fileoverview Unit tests for the ProjectSettingsSheet component.
 *
 * Tests form rendering with name/description fields, save button calling
 * updateProject, delete button disabled until name confirmation, and
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

const mockUpdateProject = vi.fn()
const mockDeleteProject = vi.fn()

vi.mock('@/features/projects/api/projectApi', () => ({
  updateProject: (...args: any[]) => mockUpdateProject(...args),
  deleteProject: (...args: any[]) => mockDeleteProject(...args),
}))

vi.mock('@/app/App', () => ({
  globalMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/features/projects/components/ProjectMemberList', () => ({
  default: () => <div data-testid="member-list">Members</div>,
}))

import ProjectSettingsSheet from '@/features/projects/components/ProjectSettingsSheet'
import type { Project } from '@/features/projects/api/projectApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock Project for settings sheet rendering
 */
function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'My Project',
    description: 'A test project',
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

describe('ProjectSettingsSheet', () => {
  const defaultProps = {
    project: buildProject(),
    open: true,
    onOpenChange: vi.fn(),
    onProjectUpdated: vi.fn(),
    onProjectDeleted: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateProject.mockResolvedValue({})
    mockDeleteProject.mockResolvedValue({})
  })

  /** @description Should render sheet with project name and description fields */
  it('renders sheet with project name and description fields', () => {
    render(<ProjectSettingsSheet {...defaultProps} />)

    expect(screen.getByTestId('sheet')).toBeInTheDocument()
    const nameInput = screen.getByTestId('project-name') as HTMLInputElement
    expect(nameInput.value).toBe('My Project')
    const descInput = screen.getByTestId('project-description') as HTMLInputElement
    expect(descInput.value).toBe('A test project')
  })

  /** @description Should not render sheet content when open is false */
  it('does not render when closed', () => {
    render(<ProjectSettingsSheet {...defaultProps} open={false} />)

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
  })

  /** @description Save button should call updateProject API with form values */
  it('save button calls updateProject API', async () => {
    render(<ProjectSettingsSheet {...defaultProps} />)

    // Click save — text is the i18n key
    fireEvent.click(screen.getByText('common.save'))

    await waitFor(() => {
      expect(mockUpdateProject).toHaveBeenCalledWith('proj-1', {
        name: 'My Project',
        description: 'A test project',
        is_private: false,
      })
    })
  })

  /** @description Delete button should be disabled until name confirmation matches */
  it('delete button is disabled until name confirmation matches', () => {
    render(<ProjectSettingsSheet {...defaultProps} />)

    // Find the destructive delete button — there are two "common.delete" texts
    const deleteButtons = screen.getAllByText('common.delete')
    const deleteBtn = deleteButtons[deleteButtons.length - 1]!.closest('button')!
    expect(deleteBtn.disabled).toBe(true)

    // Type the project name in the confirmation input
    const confirmInput = screen.getByPlaceholderText('My Project')
    fireEvent.change(confirmInput, { target: { value: 'My Project' } })

    expect(deleteBtn.disabled).toBe(false)
  })

  /** @description Form state should reset to project values when sheet opens */
  it('resets form state when opened', () => {
    const { rerender } = render(
      <ProjectSettingsSheet {...defaultProps} open={false} />
    )

    rerender(<ProjectSettingsSheet {...defaultProps} open={true} />)

    const nameInput = screen.getByTestId('project-name') as HTMLInputElement
    expect(nameInput.value).toBe('My Project')
  })

  /** @description Should render the settings title (i18n key) */
  it('renders settings title', () => {
    render(<ProjectSettingsSheet {...defaultProps} />)

    expect(screen.getByText('projectManagement.tabs.settings')).toBeInTheDocument()
  })

  /** @description Should render danger zone section */
  it('renders danger zone section', () => {
    render(<ProjectSettingsSheet {...defaultProps} />)

    expect(screen.getByText('projects.dangerZone')).toBeInTheDocument()
  })

  /** @description Should render project member list */
  it('renders project member list', () => {
    render(<ProjectSettingsSheet {...defaultProps} />)

    expect(screen.getByTestId('member-list')).toBeInTheDocument()
  })
})
