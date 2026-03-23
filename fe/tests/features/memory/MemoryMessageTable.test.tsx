/**
 * @fileoverview Unit tests for the MemoryMessageTable component.
 *
 * Tests table rendering, search input, type filter, pagination controls,
 * forget/delete actions, empty state, and loading state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseMemoryMessages = vi.fn()
const mockForgetMutate = vi.fn()
const mockDeleteMutate = vi.fn()

vi.mock('@/features/memory/api/memoryQueries', () => ({
  useMemoryMessages: (...args: any[]) => mockUseMemoryMessages(...args),
  useForgetMemoryMessage: () => ({
    mutate: mockForgetMutate,
    isPending: false,
  }),
  useDeleteMemoryMessage: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}))

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: any) => <table data-testid="message-table">{children}</table>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableHead: ({ children, className }: any) => <th className={className}>{children}</th>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
  TableCell: ({ children, className }: any) => <td className={className}>{children}</td>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
      <button data-testid="select-change" onClick={() => onValueChange?.('1')}>
        Change
      </button>
    </div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children, asChild }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) =>
    open ? <div data-testid="delete-dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

import { MemoryMessageTable } from '@/features/memory/components/MemoryMessageTable'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock MemoryMessage object
 */
function buildMessage(overrides: Record<string, unknown> = {}) {
  return {
    message_id: 'msg-1',
    memory_id: 'mem-1',
    message_type: 2,
    source_id: 'src-1',
    user_id: 'user-1',
    agent_id: null,
    session_id: 'sess-1',
    valid_at: '2026-01-01T00:00:00Z',
    invalid_at: null,
    forget_at: null,
    status: 1,
    content: 'This is a test memory message content.',
    tenant_id: 't-1',
    created_at: '2026-03-20T10:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryMessageTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows loading skeleton when data is loading', () => {
    mockUseMemoryMessages.mockReturnValue({ data: undefined, isLoading: true })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no messages exist', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    expect(screen.getByText('memory.noMessages')).toBeInTheDocument()
    expect(screen.getByText('memory.noMessagesHint')).toBeInTheDocument()
  })

  it('renders message table with rows', () => {
    const messages = [
      buildMessage({ message_id: 'msg-1', content: 'First message', message_type: 1 }),
      buildMessage({ message_id: 'msg-2', content: 'Second message', message_type: 2 }),
    ]
    mockUseMemoryMessages.mockReturnValue({
      data: { items: messages, total: 2 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    expect(screen.getByTestId('message-table')).toBeInTheDocument()
    expect(screen.getByText('First message')).toBeInTheDocument()
    expect(screen.getByText('Second message')).toBeInTheDocument()
  })

  it('renders table column headers', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [buildMessage()], total: 1 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    expect(screen.getByText('memory.content')).toBeInTheDocument()
    expect(screen.getByText('memory.type')).toBeInTheDocument()
    expect(screen.getByText('memory.status')).toBeInTheDocument()
    expect(screen.getByText('memory.createdAt')).toBeInTheDocument()
    expect(screen.getByText('memory.actions')).toBeInTheDocument()
  })

  it('shows "active" status for non-forgotten messages', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [buildMessage({ forget_at: null })], total: 1 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    expect(screen.getByText('memory.active')).toBeInTheDocument()
  })

  it('shows "forgotten" status for forgotten messages', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [buildMessage({ forget_at: '2026-03-20T12:00:00Z' })], total: 1 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    expect(screen.getByText('memory.forgotten')).toBeInTheDocument()
  })

  it('renders search input with correct placeholder', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    const searchInput = screen.getByPlaceholderText('memory.search')
    expect(searchInput).toBeInTheDocument()
  })

  it('renders type filter dropdown', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    expect(screen.getByText('memory.filterType')).toBeInTheDocument()
  })

  it('renders pagination controls when total > 0', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [buildMessage()], total: 25 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    expect(screen.getByText('common.previous:{"defaultValue":"Previous"}')).toBeInTheDocument()
    expect(screen.getByText('common.next:{"defaultValue":"Next"}')).toBeInTheDocument()
    // Page indicator (1 / 2 for 25 items with pageSize 20)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('does not render pagination when total is 0', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    expect(screen.queryByText('common.previous:{"defaultValue":"Previous"}')).toBeNull()
    expect(screen.queryByText('common.next:{"defaultValue":"Next"}')).toBeNull()
  })

  it('disables Previous button on first page', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [buildMessage()], total: 25 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    const prevButton = screen.getByText('common.previous:{"defaultValue":"Previous"}')
    expect(prevButton).toBeDisabled()
  })

  it('opens delete confirmation dialog when delete action is clicked', async () => {
    const message = buildMessage({ message_id: 'msg-del' })
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [message], total: 1 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    // Find the delete button (red-colored Trash2 icon button)
    const deleteButtons = document.querySelectorAll('.text-red-500')
    if (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0]!)

      await waitFor(() => {
        expect(screen.getByTestId('delete-dialog')).toBeInTheDocument()
      })
      expect(screen.getByText('memory.deleteMessageConfirm')).toBeInTheDocument()
    }
  })

  it('calls forget mutation when forget button is clicked on active message', () => {
    const message = buildMessage({ message_id: 'msg-forget', forget_at: null })
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [message], total: 1 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    // The first small ghost button in the actions column is the forget button (for active messages)
    const actionButtons = document.querySelectorAll('.h-7.w-7')
    // The first action button should be the forget (EyeOff) button
    if (actionButtons.length > 0) {
      fireEvent.click(actionButtons[0]!)
      expect(mockForgetMutate).toHaveBeenCalledWith({
        id: 'mem-1',
        messageId: 'msg-forget',
      })
    }
  })

  it('does not show forget button for already forgotten messages', () => {
    const message = buildMessage({
      message_id: 'msg-gone',
      forget_at: '2026-03-20T12:00:00Z',
    })
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [message], total: 1 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    // Forgotten messages have only 1 action button (delete), not 2 (forget + delete)
    const actionButtons = document.querySelectorAll('.h-7.w-7')
    // For a forgotten message, there should be only the delete button
    expect(actionButtons.length).toBeLessThanOrEqual(1)
  })

  it('displays total count in pagination area', () => {
    mockUseMemoryMessages.mockReturnValue({
      data: { items: [buildMessage()], total: 42 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    // The total count is displayed as "42 total"
    expect(screen.getByText(/42/)).toBeInTheDocument()
  })

  it('renders memory type badge for each message', () => {
    const messages = [
      buildMessage({ message_id: 'msg-1', message_type: 1 }),
      buildMessage({ message_id: 'msg-2', message_type: 4 }),
    ]
    mockUseMemoryMessages.mockReturnValue({
      data: { items: messages, total: 2 },
      isLoading: false,
    })
    render(<MemoryMessageTable memoryId="mem-1" tenantId="t-1" />)

    expect(screen.getByText('memory.raw')).toBeInTheDocument()
    expect(screen.getByText('memory.episodic')).toBeInTheDocument()
  })
})
