/**
 * @fileoverview Unit tests for the MemoryListPage component.
 *
 * Tests page rendering, loading/empty states, card grid,
 * create dialog, delete confirmation, and page header.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseMemories = vi.fn()
const mockCreateMutateAsync = vi.fn()
const mockUpdateMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()

vi.mock('@/features/memory/api/memoryQueries', () => ({
  useMemories: () => mockUseMemories(),
  useCreateMemory: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateMemory: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
  useDeleteMemory: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/features/memory/components/MemoryCard', () => ({
  MemoryCard: ({ memory, onEdit, onDelete }: any) => (
    <div data-testid={`memory-card-${memory.id}`}>
      <span>{memory.name}</span>
      <button data-testid={`edit-${memory.id}`} onClick={() => onEdit(memory)}>Edit</button>
      <button data-testid={`delete-${memory.id}`} onClick={() => onDelete(memory)}>Delete</button>
    </div>
  ),
}))

vi.mock('@/app/App', () => ({
  globalMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: any) => (
    <div data-testid="select" data-value={value}>{children}</div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
}))

import MemoryListPage from '@/features/memory/pages/MemoryListPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock Memory object for testing
 */
function buildMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    name: 'Test Memory Pool',
    description: 'A test pool',
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

describe('MemoryListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading skeleton when data is loading', () => {
    mockUseMemories.mockReturnValue({ data: undefined, isLoading: true })
    render(<MemoryListPage />)

    // Skeleton grid renders animated placeholders
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no memories exist', () => {
    mockUseMemories.mockReturnValue({ data: [], isLoading: false })
    render(<MemoryListPage />)

    expect(screen.getByText('memory.empty')).toBeInTheDocument()
    expect(screen.getByText('memory.emptyHint')).toBeInTheDocument()
  })

  it('shows empty state when data is null', () => {
    mockUseMemories.mockReturnValue({ data: null, isLoading: false })
    render(<MemoryListPage />)

    expect(screen.getByText('memory.empty')).toBeInTheDocument()
  })

  it('renders memory cards from API data', () => {
    const memories = [
      buildMemory({ id: 'mem-1', name: 'Alpha Pool' }),
      buildMemory({ id: 'mem-2', name: 'Beta Pool' }),
    ]
    mockUseMemories.mockReturnValue({ data: memories, isLoading: false })
    render(<MemoryListPage />)

    expect(screen.getByTestId('memory-card-mem-1')).toBeInTheDocument()
    expect(screen.getByTestId('memory-card-mem-2')).toBeInTheDocument()
    expect(screen.getByText('Alpha Pool')).toBeInTheDocument()
    expect(screen.getByText('Beta Pool')).toBeInTheDocument()
  })

  it('displays the page title and create button', () => {
    mockUseMemories.mockReturnValue({ data: [], isLoading: false })
    render(<MemoryListPage />)

    expect(screen.getByText('memory.title')).toBeInTheDocument()
    // Create button in header and possibly empty state
    const createButtons = screen.getAllByText('memory.create')
    expect(createButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('opens create dialog on button click', async () => {
    mockUseMemories.mockReturnValue({ data: [], isLoading: false })
    render(<MemoryListPage />)

    // Click the header create button
    const createButtons = screen.getAllByText('memory.create')
    fireEvent.click(createButtons[0]!)

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })
  })

  it('opens delete confirmation when delete action is triggered', async () => {
    const memories = [buildMemory({ id: 'mem-1', name: 'Alpha Pool' })]
    mockUseMemories.mockReturnValue({ data: memories, isLoading: false })
    render(<MemoryListPage />)

    // Click the delete button on the card mock
    fireEvent.click(screen.getByTestId('delete-mem-1'))

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })
    // Delete confirmation shows the pool name
    expect(screen.getByText('memory.deleteConfirm:{"name":"Alpha Pool"}')).toBeInTheDocument()
  })

  it('calls deleteMemory mutation on confirm', async () => {
    mockDeleteMutateAsync.mockResolvedValue(undefined)
    const memories = [buildMemory({ id: 'mem-1', name: 'Alpha Pool' })]
    mockUseMemories.mockReturnValue({ data: memories, isLoading: false })
    render(<MemoryListPage />)

    // Open delete dialog
    fireEvent.click(screen.getByTestId('delete-mem-1'))

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    // Find and click the destructive delete button inside the dialog
    const deleteButtons = screen.getAllByText('memory.delete')
    // The last one is the confirm button in the dialog footer
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!)

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith('mem-1')
    })
  })

  it('opens edit dialog with pre-filled form when edit action is triggered', async () => {
    const memories = [buildMemory({ id: 'mem-1', name: 'Alpha Pool' })]
    mockUseMemories.mockReturnValue({ data: memories, isLoading: false })
    render(<MemoryListPage />)

    fireEvent.click(screen.getByTestId('edit-mem-1'))

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })
    // Edit dialog title
    expect(screen.getByText('memory.edit')).toBeInTheDocument()
  })

  it('renders create button in empty state', () => {
    mockUseMemories.mockReturnValue({ data: [], isLoading: false })
    render(<MemoryListPage />)

    // Empty state has its own create button
    const createButtons = screen.getAllByText('memory.create')
    expect(createButtons.length).toBeGreaterThanOrEqual(2)
  })
})
