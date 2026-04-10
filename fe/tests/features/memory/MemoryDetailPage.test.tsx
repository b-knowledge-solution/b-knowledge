/**
 * @fileoverview Route-focused tests for the MemoryDetailPage component.
 *
 * Covers admin memory back navigation, loading, not-found, and import dialog
 * behavior without depending on the full page implementation stack.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import MemoryDetailPage from '@/features/memory/pages/MemoryDetailPage'

const {
  mockUseMemory,
  mockUpdateMutateAsync,
  mockNavigate,
  mockGlobalMessageSuccess,
  mockGlobalMessageError,
  routerState,
} = vi.hoisted(() => ({
  mockUseMemory: vi.fn(),
  mockUpdateMutateAsync: vi.fn(),
  mockNavigate: vi.fn(),
  mockGlobalMessageSuccess: vi.fn(),
  mockGlobalMessageError: vi.fn(),
  routerState: { id: 'mem-1' },
}))

vi.mock('@/features/memory/api/memoryQueries', () => ({
  useMemory: (...args: unknown[]) => mockUseMemory(...args),
  useUpdateMemory: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/components/NavigationLoader', () => ({
  useNavigateWithLoader: () => mockNavigate,
  usePageReady: vi.fn(),
}))

vi.mock('@/features/memory/components/MemoryMessageTable', () => ({
  MemoryMessageTable: ({ memoryId }: { memoryId: string }) => (
    <div data-testid="memory-message-table">Messages for {memoryId}</div>
  ),
}))

vi.mock('@/features/memory/components/MemorySettingsPanel', () => ({
  MemorySettingsPanel: ({ memory }: { memory: { name: string } }) => (
    <div data-testid="memory-settings-panel">Settings for {memory.name}</div>
  ),
}))

vi.mock('@/features/memory/components/ImportHistoryDialog', () => ({
  ImportHistoryDialog: ({
    memoryId,
    open,
  }: {
    memoryId: string
    open: boolean
  }) => (open ? <div data-testid="import-dialog">Import for {memoryId}</div> : null),
}))

vi.mock('@/lib/globalMessage', () => ({
  globalMessage: {
    success: mockGlobalMessageSuccess,
    error: mockGlobalMessageError,
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: routerState.id }),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue }: { children: ReactNode; defaultValue: string }) => (
    <div data-testid="tabs" data-default={defaultValue}>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: { children: ReactNode; value: string }) => (
    <button data-testid={`tab-${value}`}>{children}</button>
  ),
  TabsContent: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
}))

/**
 * @description Builds a minimal memory payload for the detail page tests.
 * @param {Record<string, unknown>} overrides - Optional memory field overrides.
 * @returns {Record<string, unknown>} Memory-like object matching the page contract.
 */
function buildMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    name: 'Test Pool',
    tenant_id: 'tenant-1',
    ...overrides,
  }
}

describe('MemoryDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routerState.id = 'mem-1'
    mockGlobalMessageSuccess.mockReset()
    mockGlobalMessageError.mockReset()
  })

  it('shows a loading skeleton while memory data is loading', () => {
    mockUseMemory.mockReturnValue({ data: undefined, isLoading: true, isError: false })

    render(<MemoryDetailPage />)

    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders the memory name and tabbed content when data loads', () => {
    mockUseMemory.mockReturnValue({
      data: buildMemory(),
      isLoading: false,
      isError: false,
    })

    render(<MemoryDetailPage />)

    expect(screen.getByText('Test Pool')).toBeInTheDocument()
    expect(screen.getByTestId('tabs')).toHaveAttribute('data-default', 'messages')
    expect(screen.getByTestId('memory-message-table')).toBeInTheDocument()
    expect(screen.getByTestId('memory-settings-panel')).toBeInTheDocument()
  })

  it('routes the page back button to the admin memory list', () => {
    mockUseMemory.mockReturnValue({
      data: buildMemory(),
      isLoading: false,
      isError: false,
    })

    render(<MemoryDetailPage />)

    fireEvent.click(document.querySelector('.h-8.w-8') as HTMLElement)

    expect(mockNavigate).toHaveBeenCalledWith('/admin/agent-studio/memory')
  })

  it('routes the not-found action back to the admin memory list', () => {
    mockUseMemory.mockReturnValue({ data: null, isLoading: false, isError: true })

    render(<MemoryDetailPage />)

    fireEvent.click(screen.getByText('common.back:{"defaultValue":"Back"}'))

    expect(mockNavigate).toHaveBeenCalledWith('/admin/agent-studio/memory')
  })

  it('opens the import history dialog from the detail header', async () => {
    mockUseMemory.mockReturnValue({
      data: buildMemory(),
      isLoading: false,
      isError: false,
    })

    render(<MemoryDetailPage />)

    fireEvent.click(screen.getByText('memory.importHistory'))

    await waitFor(() => {
      expect(screen.getByTestId('import-dialog')).toBeInTheDocument()
    })
  })

  it('calls useMemory with the route id', () => {
    routerState.id = 'mem-special'
    mockUseMemory.mockReturnValue({ data: undefined, isLoading: true, isError: false })

    render(<MemoryDetailPage />)

    expect(mockUseMemory).toHaveBeenCalledWith('mem-special')
  })
})
