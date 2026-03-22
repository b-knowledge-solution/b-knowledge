/**
 * @fileoverview Unit tests for the ApiKeysPage component.
 *
 * Tests page rendering with fully mocked dependencies.
 * Follows the project pattern of mocking all heavy UI dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be before the import of the component
// ---------------------------------------------------------------------------

const mockUseApiKeys = vi.fn()
const mockCreateMutate = vi.fn()
const mockUpdateMutate = vi.fn()
const mockDeleteMutate = vi.fn()

vi.mock('@/features/api-keys/api/apiKeyQueries', () => ({
  useApiKeys: () => mockUseApiKeys(),
  useCreateApiKey: () => ({
    mutate: mockCreateMutate,
    isPending: false,
  }),
  useUpdateApiKey: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
  }),
  useDeleteApiKey: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="plus-icon" />,
  Trash2: () => <div data-testid="trash-icon" />,
  ToggleLeft: () => <div data-testid="toggle-left" />,
  ToggleRight: () => <div data-testid="toggle-right" />,
  Copy: () => <div data-testid="copy-icon" />,
  Check: () => <div data-testid="check-icon" />,
  AlertTriangle: () => <div data-testid="alert-icon" />,
  ChevronDown: () => null,
  ChevronRight: () => null,
  KeyRound: () => null,
  X: () => null,
  Loader2: () => null,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: any) => <table>{children}</table>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
  TableHead: ({ children, className }: any) => <th className={className}>{children}</th>,
  TableCell: ({ children, className }: any) => <td className={className}>{children}</td>,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children, className }: any) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => (
    <button role="checkbox" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)} />
  ),
}))

vi.mock('@/components/ConfirmDialog', () => ({
  useConfirm: () => vi.fn(() => Promise.resolve(true)),
}))

import ApiKeysPage from '@/features/api-keys/pages/ApiKeysPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock API key
 */
function buildKey(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    user_id: 'user-1',
    name: 'Test Key',
    key_prefix: 'bk-abc1234',
    scopes: ['chat', 'search', 'retrieval'],
    is_active: true,
    last_used_at: null,
    expires_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiKeysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state', () => {
    mockUseApiKeys.mockReturnValue({ data: undefined, isLoading: true })
    render(<ApiKeysPage />)
    expect(screen.getByText(/common.loading/i)).toBeInTheDocument()
  })

  it('shows empty state when no keys exist', () => {
    mockUseApiKeys.mockReturnValue({ data: [], isLoading: false })
    render(<ApiKeysPage />)
    expect(screen.getByText('apiKeys.noKeys')).toBeInTheDocument()
  })

  it('renders API keys in a table', () => {
    const keys = [
      buildKey({ id: 'key-1', name: 'Production Key' }),
      buildKey({ id: 'key-2', name: 'Staging Key' }),
    ]
    mockUseApiKeys.mockReturnValue({ data: keys, isLoading: false })
    render(<ApiKeysPage />)

    expect(screen.getByText('Production Key')).toBeInTheDocument()
    expect(screen.getByText('Staging Key')).toBeInTheDocument()
  })

  it('displays the page title and create button', () => {
    mockUseApiKeys.mockReturnValue({ data: [], isLoading: false })
    render(<ApiKeysPage />)

    expect(screen.getByText('apiKeys.title')).toBeInTheDocument()
    expect(screen.getByText('apiKeys.createKey')).toBeInTheDocument()
  })

  it('shows key prefix in masked format', () => {
    mockUseApiKeys.mockReturnValue({
      data: [buildKey({ key_prefix: 'bk-abc1234' })],
      isLoading: false,
    })
    render(<ApiKeysPage />)
    expect(screen.getByText('bk-abc1234...')).toBeInTheDocument()
  })

  it('opens create dialog on button click', async () => {
    mockUseApiKeys.mockReturnValue({ data: [], isLoading: false })
    render(<ApiKeysPage />)

    // The create button text is the i18n key
    const buttons = screen.getAllByText('apiKeys.createKey')
    fireEvent.click(buttons[0]!)

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })
  })

  it('shows scope badges for each key', () => {
    mockUseApiKeys.mockReturnValue({
      data: [buildKey({ scopes: ['chat', 'search'] })],
      isLoading: false,
    })
    render(<ApiKeysPage />)

    // Since t() returns the key, scope badges will show i18n keys
    expect(screen.getByText('apiKeys.scopeChat')).toBeInTheDocument()
    expect(screen.getByText('apiKeys.scopeSearch')).toBeInTheDocument()
  })

  it('shows active status badge', () => {
    mockUseApiKeys.mockReturnValue({
      data: [buildKey({ is_active: true })],
      isLoading: false,
    })
    render(<ApiKeysPage />)
    expect(screen.getByText('apiKeys.active')).toBeInTheDocument()
  })

  it('shows inactive status badge', () => {
    mockUseApiKeys.mockReturnValue({
      data: [buildKey({ is_active: false })],
      isLoading: false,
    })
    render(<ApiKeysPage />)
    expect(screen.getByText('apiKeys.inactive')).toBeInTheDocument()
  })
})
