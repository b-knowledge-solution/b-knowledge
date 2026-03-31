/**
 * @fileoverview Unit tests for the AgentCard component.
 *
 * Tests rendering of agent metadata, status/mode badges, kebab menu actions,
 * and card click navigation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, onClick, className }: any) => (
    <div data-testid="card" className={className} onClick={onClick}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown">{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button data-testid="dropdown-item" onClick={onClick}>{children}</button>
  ),
  DropdownMenuTrigger: ({ children, onClick }: any) => (
    <div data-testid="dropdown-trigger" onClick={onClick}>{children}</div>
  ),
}))

import { AgentCard } from '@/features/agents/components/AgentCard'
import type { Agent } from '@/features/agents/types/agent.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'My Agent',
    description: 'A test agent description',
    avatar: null,
    mode: 'agent',
    status: 'draft',
    dsl: { nodes: {}, edges: [], variables: {}, settings: { mode: 'agent', max_execution_time: 300, retry_on_failure: false } },
    dsl_version: 1,
    policy_rules: null,
    tenant_id: 't-1',
    project_id: null,
    parent_id: null,
    version_number: 1,
    version_label: null,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-03-15T00:00:00Z',
    ...overrides,
  }
}

const defaultProps = {
  agent: buildAgent(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
  onExport: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders agent name', () => {
    render(<AgentCard {...defaultProps} />)
    expect(screen.getByText('My Agent')).toBeInTheDocument()
  })

  it('renders agent description', () => {
    render(<AgentCard {...defaultProps} />)
    expect(screen.getByText('A test agent description')).toBeInTheDocument()
  })

  it('does not render description when null', () => {
    const agent = buildAgent({ description: null })
    render(<AgentCard {...defaultProps} agent={agent} />)
    expect(screen.queryByText('A test agent description')).not.toBeInTheDocument()
  })

  it('renders mode badge', () => {
    render(<AgentCard {...defaultProps} />)
    // t() returns the key, so the badge text will be "agents.agent"
    expect(screen.getByText('agents.agent')).toBeInTheDocument()
  })

  it('renders status badge with correct variant', () => {
    const agent = buildAgent({ status: 'published' })
    render(<AgentCard {...defaultProps} agent={agent} />)

    const badges = screen.getAllByTestId('badge')
    // Status badge for published should have variant "default"
    const statusBadge = badges.find((b) => b.textContent === 'agents.published')
    expect(statusBadge).toBeInTheDocument()
    expect(statusBadge?.getAttribute('data-variant')).toBe('default')
  })

  it('renders draft status badge with secondary variant', () => {
    render(<AgentCard {...defaultProps} />)

    const badges = screen.getAllByTestId('badge')
    const statusBadge = badges.find((b) => b.textContent === 'agents.draft')
    expect(statusBadge?.getAttribute('data-variant')).toBe('secondary')
  })

  it('renders last modified date', () => {
    render(<AgentCard {...defaultProps} />)
    // new Date('2026-03-15T00:00:00Z').toLocaleDateString() produces a localized date string
    const dateStr = new Date('2026-03-15T00:00:00Z').toLocaleDateString()
    expect(screen.getByText(dateStr)).toBeInTheDocument()
  })

  it('navigates to canvas page on card click', () => {
    render(<AgentCard {...defaultProps} />)

    const card = screen.getByTestId('card')
    fireEvent.click(card)

    expect(mockNavigate).toHaveBeenCalledWith('/agents/agent-1')
  })

  it('renders kebab dropdown menu', () => {
    render(<AgentCard {...defaultProps} />)
    expect(screen.getByTestId('dropdown')).toBeInTheDocument()
  })

  it('shows edit action in dropdown menu', () => {
    render(<AgentCard {...defaultProps} />)
    expect(screen.getByText('agents.edit')).toBeInTheDocument()
  })

  it('shows duplicate action in dropdown menu', () => {
    render(<AgentCard {...defaultProps} />)
    expect(screen.getByText('agents.duplicate')).toBeInTheDocument()
  })

  it('shows export action in dropdown menu', () => {
    render(<AgentCard {...defaultProps} />)
    expect(screen.getByText('agents.exportJson')).toBeInTheDocument()
  })

  it('shows delete action in dropdown menu', () => {
    render(<AgentCard {...defaultProps} />)
    expect(screen.getByText('agents.deleteAgent')).toBeInTheDocument()
  })

  it('calls onDuplicate with agent when duplicate clicked', () => {
    const onDuplicate = vi.fn()
    render(<AgentCard {...defaultProps} onDuplicate={onDuplicate} />)

    const items = screen.getAllByTestId('dropdown-item')
    // Duplicate is the second menu item
    const dupItem = items.find((item) => item.textContent?.includes('agents.duplicate'))
    fireEvent.click(dupItem!)

    expect(onDuplicate).toHaveBeenCalledWith(defaultProps.agent)
  })

  it('calls onDelete with agent when delete clicked', () => {
    const onDelete = vi.fn()
    render(<AgentCard {...defaultProps} onDelete={onDelete} />)

    const items = screen.getAllByTestId('dropdown-item')
    const deleteItem = items.find((item) => item.textContent?.includes('agents.deleteAgent'))
    fireEvent.click(deleteItem!)

    expect(onDelete).toHaveBeenCalledWith(defaultProps.agent)
  })

  it('calls onExport with agent when export clicked', () => {
    const onExport = vi.fn()
    render(<AgentCard {...defaultProps} onExport={onExport} />)

    const items = screen.getAllByTestId('dropdown-item')
    const exportItem = items.find((item) => item.textContent?.includes('agents.exportJson'))
    fireEvent.click(exportItem!)

    expect(onExport).toHaveBeenCalledWith(defaultProps.agent)
  })

  it('applies violet border for agent mode', () => {
    render(<AgentCard {...defaultProps} />)
    const card = screen.getByTestId('card')
    expect(card.className).toContain('border-l-violet-500')
  })

  it('applies cyan border for pipeline mode', () => {
    const agent = buildAgent({ mode: 'pipeline' })
    render(<AgentCard {...defaultProps} agent={agent} />)
    const card = screen.getByTestId('card')
    expect(card.className).toContain('border-l-cyan-500')
  })
})
