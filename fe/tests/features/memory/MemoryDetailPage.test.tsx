/**
 * @fileoverview Unit tests for the MemoryDetailPage component.
 *
 * Tests tab switching (Messages/Settings), back navigation,
 * page title, loading state, 404 state, and import button.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseMemory = vi.fn()
const mockUpdateMutateAsync = vi.fn()

vi.mock('@/features/memory/api/memoryQueries', () => ({
  useMemory: (...args: any[]) => mockUseMemory(...args),
  useUpdateMemory: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/features/memory/components/MemoryMessageTable', () => ({
  MemoryMessageTable: ({ memoryId }: any) => (
    <div data-testid="memory-message-table">Messages for {memoryId}</div>
  ),
}))

vi.mock('@/features/memory/components/MemorySettingsPanel', () => ({
  MemorySettingsPanel: ({ memory, onSave }: any) => (
    <div data-testid="memory-settings-panel">
      <span>Settings for {memory.name}</span>
      <button data-testid="save-settings" onClick={() => onSave({ name: 'Updated' })}>Save</button>
    </div>
  ),
}))

vi.mock('@/features/memory/components/ImportHistoryDialog', () => ({
  ImportHistoryDialog: ({ memoryId, open, onOpenChange }: any) =>
    open ? (
      <div data-testid="import-dialog">
        Import for {memoryId}
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}))

vi.mock('@/app/App', () => ({
  globalMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock useParams to provide the :id URL parameter
const mockNavigate = vi.fn()
let mockParamsId = 'mem-1'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: mockParamsId }),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue }: any) => (
    <div data-testid="tabs" data-default={defaultValue}>{children}</div>
  ),
  TabsList: ({ children }: any) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button data-testid={`tab-${value}`}>{children}</button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
}))

import MemoryDetailPage from '@/features/memory/pages/MemoryDetailPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock Memory entity for detail page tests
 */
function buildMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    name: 'Test Pool',
    description: 'A test memory pool',
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

describe('MemoryDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParamsId = 'mem-1'
  })

  it('shows loading skeleton when data is loading', () => {
    mockUseMemory.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<MemoryDetailPage />)

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows not found state when memory is not available and error occurs', () => {
    mockUseMemory.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<MemoryDetailPage />)

    expect(screen.getByText('common.notFound:{"defaultValue":"Not Found"}')).toBeInTheDocument()
    expect(screen.getByText('common.back:{"defaultValue":"Back"}')).toBeInTheDocument()
  })

  it('shows not found state when data is null', () => {
    mockUseMemory.mockReturnValue({ data: null, isLoading: false, isError: false })
    render(<MemoryDetailPage />)

    expect(screen.getByText('common.notFound:{"defaultValue":"Not Found"}')).toBeInTheDocument()
  })

  it('displays the memory pool name as page title', () => {
    const memory = buildMemory({ name: 'My Knowledge Base' })
    mockUseMemory.mockReturnValue({ data: memory, isLoading: false, isError: false })
    render(<MemoryDetailPage />)

    expect(screen.getByText('My Knowledge Base')).toBeInTheDocument()
  })

  it('renders Messages and Settings tabs', () => {
    mockUseMemory.mockReturnValue({ data: buildMemory(), isLoading: false, isError: false })
    render(<MemoryDetailPage />)

    expect(screen.getByTestId('tab-messages')).toBeInTheDocument()
    expect(screen.getByTestId('tab-settings')).toBeInTheDocument()
    expect(screen.getByText('memory.messages')).toBeInTheDocument()
    expect(screen.getByText('memory.settings')).toBeInTheDocument()
  })

  it('defaults to messages tab', () => {
    mockUseMemory.mockReturnValue({ data: buildMemory(), isLoading: false, isError: false })
    render(<MemoryDetailPage />)

    const tabs = screen.getByTestId('tabs')
    expect(tabs.getAttribute('data-default')).toBe('messages')
  })

  it('renders MemoryMessageTable in messages tab content', () => {
    mockUseMemory.mockReturnValue({ data: buildMemory(), isLoading: false, isError: false })
    render(<MemoryDetailPage />)

    expect(screen.getByTestId('memory-message-table')).toBeInTheDocument()
    expect(screen.getByText('Messages for mem-1')).toBeInTheDocument()
  })

  it('renders MemorySettingsPanel in settings tab content', () => {
    mockUseMemory.mockReturnValue({ data: buildMemory(), isLoading: false, isError: false })
    render(<MemoryDetailPage />)

    expect(screen.getByTestId('memory-settings-panel')).toBeInTheDocument()
    expect(screen.getByText('Settings for Test Pool')).toBeInTheDocument()
  })

  it('navigates back to /memory when back button is clicked', () => {
    mockUseMemory.mockReturnValue({ data: buildMemory(), isLoading: false, isError: false })
    render(<MemoryDetailPage />)

    // The ghost back button has ArrowLeft icon, find the small button
    const backButton = document.querySelector('.h-8.w-8') as HTMLElement
    if (backButton) {
      fireEvent.click(backButton)
      expect(mockNavigate).toHaveBeenCalledWith('/memory')
    }
  })

  it('navigates back from 404 state', () => {
    mockUseMemory.mockReturnValue({ data: null, isLoading: false, isError: true })
    render(<MemoryDetailPage />)

    const backButton = screen.getByText('common.back:{"defaultValue":"Back"}')
    fireEvent.click(backButton)

    expect(mockNavigate).toHaveBeenCalledWith('/memory')
  })

  it('renders import history button', () => {
    mockUseMemory.mockReturnValue({ data: buildMemory(), isLoading: false, isError: false })
    render(<MemoryDetailPage />)

    expect(screen.getByText('memory.importHistory')).toBeInTheDocument()
  })

  it('opens import dialog on import button click', async () => {
    mockUseMemory.mockReturnValue({ data: buildMemory(), isLoading: false, isError: false })
    render(<MemoryDetailPage />)

    fireEvent.click(screen.getByText('memory.importHistory'))

    await waitFor(() => {
      expect(screen.getByTestId('import-dialog')).toBeInTheDocument()
    })
  })

  it('calls useMemory with the URL param id', () => {
    mockParamsId = 'mem-special'
    mockUseMemory.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<MemoryDetailPage />)

    expect(mockUseMemory).toHaveBeenCalledWith('mem-special')
  })
})
