/**
 * @fileoverview Unit tests for the AgentToolbar component.
 *
 * Tests save button behavior, run/debug controls, inline name editing,
 * dirty indicator, and status badge rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('lucide-react', () => ({
  ArrowLeft: () => null,
  Save: () => null,
  Play: () => null,
  SkipForward: () => null,
  Bug: () => null,
  MoreHorizontal: () => null,
  Download: () => null,
  Trash2: () => null,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="more-menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button data-testid="menu-item" onClick={onClick}>{children}</button>
  ),
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}))

import { AgentToolbar } from '@/features/agents/components/AgentToolbar'
import type { Agent } from '@/features/agents/types/agent.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    description: null,
    avatar: null,
    mode: 'agent',
    status: 'draft',
    dsl: { nodes: {}, edges: [], variables: {}, settings: { mode: 'agent', max_execution_time: 300, retry_on_failure: false } },
    dsl_version: 1,
    policy_rules: null,
    tenant_id: 't-1',
    knowledge_base_id: null,
    parent_id: null,
    version_number: 1,
    version_label: null,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const defaultProps = {
  agent: buildAgent(),
  isDirty: false,
  isSaving: false,
  onSave: vi.fn(),
  onNameChange: vi.fn(),
}

function getButtonByText(text: string) {
  return screen.getAllByText(text)
    .map((element) => element.tagName === 'BUTTON' ? element : element.closest('button'))
    .find(Boolean) as HTMLButtonElement
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders agent name as clickable text', () => {
    render(<AgentToolbar {...defaultProps} />)
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
  })

  it('renders fallback title when no agent', () => {
    render(<AgentToolbar {...defaultProps} agent={undefined} />)
    expect(screen.getByText('agents.canvasTitle')).toBeInTheDocument()
  })

  it('shows dirty indicator asterisk when isDirty', () => {
    render(<AgentToolbar {...defaultProps} isDirty={true} />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('does not show dirty indicator when clean', () => {
    render(<AgentToolbar {...defaultProps} isDirty={false} />)
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  it('save button is disabled when not dirty', () => {
    render(<AgentToolbar {...defaultProps} isDirty={false} />)
    const saveBtn = getButtonByText('agents.agentSaved')
    expect(saveBtn).toBeDisabled()
  })

  it('save button is enabled when dirty', () => {
    render(<AgentToolbar {...defaultProps} isDirty={true} />)
    const saveBtn = getButtonByText('agents.agentSaved')
    expect(saveBtn).not.toBeDisabled()
  })

  it('save button is disabled when saving', () => {
    render(<AgentToolbar {...defaultProps} isDirty={true} isSaving={true} />)
    const saveBtn = getButtonByText('agents.agentSaved')
    expect(saveBtn).toBeDisabled()
  })

  it('calls onSave when save button clicked', () => {
    const onSave = vi.fn()
    render(<AgentToolbar {...defaultProps} isDirty={true} onSave={onSave} />)

    fireEvent.click(getButtonByText('agents.agentSaved'))

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('shows Run button when debug is not active', () => {
    render(<AgentToolbar {...defaultProps} />)
    expect(getButtonByText('common.run')).toBeInTheDocument()
  })

  it('shows Step and Continue buttons when debug is active', () => {
    render(
      <AgentToolbar
        {...defaultProps}
        isDebugActive={true}
        onToggleDebug={vi.fn()}
        onStepNext={vi.fn()}
        onContinueRun={vi.fn()}
      />
    )

    expect(screen.getByText('agents.stepNext')).toBeInTheDocument()
    expect(screen.getByText('agents.continueRun')).toBeInTheDocument()
  })

  it('does not show Step/Continue when debug is inactive', () => {
    render(<AgentToolbar {...defaultProps} />)

    expect(screen.queryByText('agents.stepNext')).not.toBeInTheDocument()
    expect(screen.queryByText('agents.continueRun')).not.toBeInTheDocument()
  })

  it('calls onStepNext when step button clicked', () => {
    const onStepNext = vi.fn()
    render(
      <AgentToolbar
        {...defaultProps}
        isDebugActive={true}
        onToggleDebug={vi.fn()}
        onStepNext={onStepNext}
        onContinueRun={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('agents.stepNext'))
    expect(onStepNext).toHaveBeenCalledTimes(1)
  })

  it('calls onContinueRun when continue button clicked', () => {
    const onContinueRun = vi.fn()
    render(
      <AgentToolbar
        {...defaultProps}
        isDebugActive={true}
        onToggleDebug={vi.fn()}
        onStepNext={vi.fn()}
        onContinueRun={onContinueRun}
      />
    )

    fireEvent.click(screen.getByText('agents.continueRun'))
    expect(onContinueRun).toHaveBeenCalledTimes(1)
  })

  it('shows debug toggle switch when onToggleDebug provided', () => {
    render(
      <AgentToolbar
        {...defaultProps}
        onToggleDebug={vi.fn()}
      />
    )

    expect(screen.getByRole('switch')).toBeInTheDocument()
    expect(screen.getByText('agents.debug')).toBeInTheDocument()
  })

  it('does not show debug toggle when onToggleDebug is not provided', () => {
    render(<AgentToolbar {...defaultProps} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('calls onToggleDebug when switch clicked', () => {
    const onToggleDebug = vi.fn()
    render(
      <AgentToolbar
        {...defaultProps}
        onToggleDebug={onToggleDebug}
      />
    )

    fireEvent.click(screen.getByRole('switch'))
    expect(onToggleDebug).toHaveBeenCalled()
  })

  it('renders status badge', () => {
    render(<AgentToolbar {...defaultProps} />)
    expect(screen.getByText('agents.draft')).toBeInTheDocument()
  })

  it('renders published status badge with default variant', () => {
    const agent = buildAgent({ status: 'published' })
    render(<AgentToolbar {...defaultProps} agent={agent} />)

    const badge = screen.getByText('agents.published')
    expect(badge.getAttribute('data-variant')).toBe('default')
  })

  it('starts inline name editing on click', () => {
    render(<AgentToolbar {...defaultProps} />)

    // Click the name to start editing
    fireEvent.click(screen.getByText('Test Agent'))

    // Should now show an input
    const input = screen.getByDisplayValue('Test Agent')
    expect(input).toBeInTheDocument()
  })

  it('calls onNameChange when name is edited and blurred', () => {
    const onNameChange = vi.fn()
    render(<AgentToolbar {...defaultProps} onNameChange={onNameChange} />)

    // Start editing
    fireEvent.click(screen.getByText('Test Agent'))
    const input = screen.getByDisplayValue('Test Agent')

    // Change name
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.blur(input)

    expect(onNameChange).toHaveBeenCalledWith('Renamed')
  })

  it('does not call onNameChange if name unchanged', () => {
    const onNameChange = vi.fn()
    render(<AgentToolbar {...defaultProps} onNameChange={onNameChange} />)

    fireEvent.click(screen.getByText('Test Agent'))
    const input = screen.getByDisplayValue('Test Agent')
    fireEvent.blur(input)

    expect(onNameChange).not.toHaveBeenCalled()
  })

  it('commits name on Enter key', () => {
    const onNameChange = vi.fn()
    render(<AgentToolbar {...defaultProps} onNameChange={onNameChange} />)

    fireEvent.click(screen.getByText('Test Agent'))
    const input = screen.getByDisplayValue('Test Agent')

    fireEvent.change(input, { target: { value: 'NewName' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onNameChange).toHaveBeenCalledWith('NewName')
  })

  it('cancels name editing on Escape', () => {
    render(<AgentToolbar {...defaultProps} />)

    fireEvent.click(screen.getByText('Test Agent'))
    const input = screen.getByDisplayValue('Test Agent')

    fireEvent.change(input, { target: { value: 'NewName' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    // Should exit edit mode and show original name
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
  })

  it('navigates back on back button click', () => {
    render(<AgentToolbar {...defaultProps} />)

    fireEvent.click(getButtonByText('common.back'))

    expect(mockNavigate).toHaveBeenCalledWith('/admin/agent-studio/agents')
  })

  it('shows export and delete in more menu', () => {
    render(<AgentToolbar {...defaultProps} />)

    expect(getButtonByText('agents.exportJson')).toBeInTheDocument()
    expect(getButtonByText('agents.deleteAgent')).toBeInTheDocument()
  })
})
