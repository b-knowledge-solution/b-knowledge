/**
 * @fileoverview Unit tests for the MemoryCard component.
 *
 * Tests name/description display, memory type bitmask badge rendering,
 * scope badge, storage type badge, and kebab menu edit/delete actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}))

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
  DropdownMenuTrigger: ({ children, onClick, asChild }: any) => (
    <div data-testid="dropdown-trigger" onClick={onClick}>{children}</div>
  ),
  DropdownMenuContent: ({ children, onClick }: any) => (
    <div data-testid="dropdown-content" onClick={onClick}>{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick, className }: any) => (
    <button data-testid="dropdown-item" onClick={onClick} className={className}>{children}</button>
  ),
}))

import { MemoryCard } from '@/features/memory/components/MemoryCard'
import type { Memory } from '@/features/memory/types/memory.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock Memory entity for card rendering
 */
function buildMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    name: 'Test Pool',
    description: 'A sample memory pool',
    avatar: null,
    memory_type: 15,
    storage_type: 'table',
    memory_size: 104857600,
    forgetting_policy: 'fifo',
    embd_id: null,
    llm_id: null,
    temperature: 0.7,
    system_prompt: null,
    user_prompt: null,
    extraction_mode: 'batch',
    permission: 'me',
    scope_type: 'user',
    scope_id: null,
    tenant_id: 't-1',
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryCard', () => {
  const mockOnEdit = vi.fn()
  const mockOnDelete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the memory pool name', () => {
    const memory = buildMemory({ name: 'My Knowledge Pool' })
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.getByText('My Knowledge Pool')).toBeInTheDocument()
  })

  it('renders the description when present', () => {
    const memory = buildMemory({ description: 'A detailed description here' })
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.getByText('A detailed description here')).toBeInTheDocument()
  })

  it('does not render description paragraph when description is null', () => {
    const memory = buildMemory({ description: null })
    const { container } = render(
      <MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />
    )

    // No paragraph element with line-clamp class should exist
    const descParagraph = container.querySelector('.line-clamp-2')
    expect(descParagraph).toBeNull()
  })

  it('renders all four memory type chips when bitmask is 15', () => {
    const memory = buildMemory({ memory_type: 15 })
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.getByText('memory.raw')).toBeInTheDocument()
    expect(screen.getByText('memory.semantic')).toBeInTheDocument()
    expect(screen.getByText('memory.episodic')).toBeInTheDocument()
    expect(screen.getByText('memory.procedural')).toBeInTheDocument()
  })

  it('renders only selected memory type chips when bitmask is partial', () => {
    // bitmask 3 = RAW(1) + SEMANTIC(2)
    const memory = buildMemory({ memory_type: 3 })
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.getByText('memory.raw')).toBeInTheDocument()
    expect(screen.getByText('memory.semantic')).toBeInTheDocument()
    expect(screen.queryByText('memory.episodic')).toBeNull()
    expect(screen.queryByText('memory.procedural')).toBeNull()
  })

  it('renders only episodic chip for bitmask 4', () => {
    const memory = buildMemory({ memory_type: 4 })
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.queryByText('memory.raw')).toBeNull()
    expect(screen.queryByText('memory.semantic')).toBeNull()
    expect(screen.getByText('memory.episodic')).toBeInTheDocument()
    expect(screen.queryByText('memory.procedural')).toBeNull()
  })

  it('renders storage type badge', () => {
    const memory = buildMemory({ storage_type: 'graph' })
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.getByText('memory.graph')).toBeInTheDocument()
  })

  it('renders extraction mode badge', () => {
    const memory = buildMemory({ extraction_mode: 'realtime' })
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.getByText('memory.realtime')).toBeInTheDocument()
  })

  it('renders scope type badge with capitalized key', () => {
    const memory = buildMemory({ scope_type: 'agent' })
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.getByText('memory.scopeAgent')).toBeInTheDocument()
  })

  it('renders scope badge for team scope', () => {
    const memory = buildMemory({ scope_type: 'team' })
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.getByText('memory.scopeTeam')).toBeInTheDocument()
  })

  it('calls onEdit when edit action is clicked', () => {
    const memory = buildMemory()
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    const menuItems = screen.getAllByTestId('dropdown-item')
    // First dropdown item is edit
    fireEvent.click(menuItems[0]!)

    expect(mockOnEdit).toHaveBeenCalledWith(memory)
  })

  it('calls onDelete when delete action is clicked', () => {
    const memory = buildMemory()
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    const menuItems = screen.getAllByTestId('dropdown-item')
    // Second dropdown item is delete
    fireEvent.click(menuItems[1]!)

    expect(mockOnDelete).toHaveBeenCalledWith(memory)
  })

  it('renders edit and delete text in kebab menu', () => {
    const memory = buildMemory()
    render(<MemoryCard memory={memory} onEdit={mockOnEdit} onDelete={mockOnDelete} />)

    expect(screen.getByText('memory.edit')).toBeInTheDocument()
    expect(screen.getByText('memory.delete')).toBeInTheDocument()
  })
})
