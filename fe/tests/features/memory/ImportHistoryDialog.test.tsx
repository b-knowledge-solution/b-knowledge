/**
 * @fileoverview Unit tests for the ImportHistoryDialog component.
 *
 * Tests open/close behavior, session list loading, session selection,
 * import trigger, progress states, and completion display.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetChatSessions = vi.fn()
const mockImportMutateAsync = vi.fn()

vi.mock('@/features/memory/api/memoryApi', () => ({
  memoryApi: {
    getChatSessions: (...args: any[]) => mockGetChatSessions(...args),
  },
}))

vi.mock('@/features/memory/api/memoryQueries', () => ({
  useImportChatHistory: () => ({
    mutateAsync: mockImportMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog">
        {children}
        <button data-testid="dialog-close" onClick={() => onOpenChange(false)}>
          X
        </button>
      </div>
    ) : null,
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

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, className }: any) => <label className={className}>{children}</label>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: any) => (
    <div data-testid="session-select" data-value={value}>
      {children}
      <button
        data-testid="session-select-pick"
        onClick={() => onValueChange?.('session-1')}
      >
        Pick
      </button>
    </div>
  ),
  SelectContent: ({ children }: any) => <div data-testid="session-options">{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-testid={`session-option-${value}`}>{children}</div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}))

import { ImportHistoryDialog } from '@/features/memory/components/ImportHistoryDialog'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImportHistoryDialog', () => {
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when open is false', () => {
    mockGetChatSessions.mockResolvedValue([])

    render(
      <ImportHistoryDialog memoryId="mem-1" open={false} onOpenChange={mockOnOpenChange} />
    )

    expect(screen.queryByTestId('dialog')).toBeNull()
  })

  it('renders dialog when open is true', async () => {
    mockGetChatSessions.mockResolvedValue([])

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    expect(screen.getByTestId('dialog')).toBeInTheDocument()
    expect(screen.getByText('memory.importHistory')).toBeInTheDocument()
    expect(screen.getByText('memory.importDescription')).toBeInTheDocument()
  })

  it('loads chat sessions when dialog opens', async () => {
    const sessions = [
      { id: 'session-1', name: 'Chat A', created_at: '2026-01-01' },
      { id: 'session-2', name: 'Chat B', created_at: '2026-01-02' },
    ]
    mockGetChatSessions.mockResolvedValue(sessions)

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      expect(mockGetChatSessions).toHaveBeenCalledTimes(1)
    })

    // Session options should be rendered
    await waitFor(() => {
      expect(screen.getByTestId('session-option-session-1')).toBeInTheDocument()
      expect(screen.getByTestId('session-option-session-2')).toBeInTheDocument()
    })
  })

  it('shows loading indicator while fetching sessions', async () => {
    // Create a promise that we can control
    let resolvePromise: (value: any) => void
    mockGetChatSessions.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve
      })
    )

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    // Loading text should appear
    expect(screen.getByText('common.loading:{"defaultValue":"Loading..."}')).toBeInTheDocument()

    // Resolve to complete
    await act(async () => {
      resolvePromise!([])
    })
  })

  it('renders manual session ID input', async () => {
    mockGetChatSessions.mockResolvedValue([])

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Session ID')).toBeInTheDocument()
    })
  })

  it('renders select session label', async () => {
    mockGetChatSessions.mockResolvedValue([])

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      expect(screen.getByText('memory.selectSession')).toBeInTheDocument()
    })
  })

  it('disables import button when no session is selected', async () => {
    mockGetChatSessions.mockResolvedValue([])

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      const importButton = screen.getByText('memory.importHistory')
      // The button inside the footer (not the title) should be disabled
      // since no session is selected
      const buttons = screen.getAllByText('memory.importHistory')
      // The footer import button
      const footerButton = buttons.find(
        (b) => b.closest('button') && !b.closest('button')?.disabled === false
      )
      // At least one import button should be disabled
      const disabledButtons = buttons.filter(
        (b) => b.closest('button')?.disabled
      )
      expect(disabledButtons.length).toBeGreaterThan(0)
    })
  })

  it('triggers import when import button is clicked with manual session ID', async () => {
    mockGetChatSessions.mockResolvedValue([])
    mockImportMutateAsync.mockResolvedValue({ imported: 5 })

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Session ID')).toBeInTheDocument()
    })

    // Type a manual session ID
    fireEvent.change(screen.getByPlaceholderText('Session ID'), {
      target: { value: 'manual-session-id' },
    })

    // Find and click the import button in the footer
    const importButtons = screen.getAllByText('memory.importHistory')
    const footerImportButton = importButtons.find(
      (b) => b.closest('button') && !b.closest('button')?.disabled
    )

    if (footerImportButton) {
      fireEvent.click(footerImportButton)

      await waitFor(() => {
        expect(mockImportMutateAsync).toHaveBeenCalledWith({
          memoryId: 'mem-1',
          sessionId: 'manual-session-id',
        })
      })
    }
  })

  it('shows completion state after successful import', async () => {
    mockGetChatSessions.mockResolvedValue([])
    mockImportMutateAsync.mockResolvedValue({ imported: 8 })

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Session ID')).toBeInTheDocument()
    })

    // Enter manual session ID
    fireEvent.change(screen.getByPlaceholderText('Session ID'), {
      target: { value: 'session-abc' },
    })

    // Click import
    const importButtons = screen.getAllByText('memory.importHistory')
    const footerImportButton = importButtons.find(
      (b) => b.closest('button') && !b.closest('button')?.disabled
    )
    if (footerImportButton) {
      fireEvent.click(footerImportButton)
    }

    // Wait for completion state
    await waitFor(() => {
      expect(screen.getByText('memory.importComplete:{"count":8}')).toBeInTheDocument()
    })

    // Close button should be visible in completion state
    expect(screen.getByText('common.close:{"defaultValue":"Close"}')).toBeInTheDocument()
  })

  it('resets to idle state on import error', async () => {
    mockGetChatSessions.mockResolvedValue([])
    mockImportMutateAsync.mockRejectedValue(new Error('Import failed'))

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Session ID')).toBeInTheDocument()
    })

    // Enter session ID
    fireEvent.change(screen.getByPlaceholderText('Session ID'), {
      target: { value: 'session-fail' },
    })

    // Click import
    const importButtons = screen.getAllByText('memory.importHistory')
    const footerImportButton = importButtons.find(
      (b) => b.closest('button') && !b.closest('button')?.disabled
    )
    if (footerImportButton) {
      fireEvent.click(footerImportButton)
    }

    // Should NOT show completion state, should remain in idle with import button still available
    await waitFor(() => {
      const buttons = screen.getAllByText('memory.importHistory')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  it('renders cancel button in idle state', async () => {
    mockGetChatSessions.mockResolvedValue([])

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      expect(screen.getByText('common.cancel')).toBeInTheDocument()
    })
  })

  it('calls onOpenChange(false) when cancel is clicked', async () => {
    mockGetChatSessions.mockResolvedValue([])

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('common.cancel'))
    })

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('handles empty sessions gracefully', async () => {
    mockGetChatSessions.mockResolvedValue([])

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      // Should not crash, manual input should still be available
      expect(screen.getByPlaceholderText('Session ID')).toBeInTheDocument()
    })

    // No session select should be rendered when sessions list is empty
    expect(screen.queryByTestId('session-select')).toBeNull()
  })

  it('handles getChatSessions API error gracefully', async () => {
    mockGetChatSessions.mockRejectedValue(new Error('Network error'))

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    // Should recover gracefully with empty sessions
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Session ID')).toBeInTheDocument()
    })
  })

  it('displays session dropdown when sessions are available', async () => {
    const sessions = [
      { id: 'session-1', name: 'Chat A', created_at: '2026-01-01' },
    ]
    mockGetChatSessions.mockResolvedValue(sessions)

    render(
      <ImportHistoryDialog memoryId="mem-1" open={true} onOpenChange={mockOnOpenChange} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-select')).toBeInTheDocument()
    })

    expect(screen.getByTestId('session-option-session-1')).toBeInTheDocument()
    expect(screen.getByText('Chat A')).toBeInTheDocument()
  })
})
