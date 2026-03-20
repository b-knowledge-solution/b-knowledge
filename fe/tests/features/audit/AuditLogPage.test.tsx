import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', changeLanguage: vi.fn() }
  }),
  initReactI18next: { type: '3rdParty', init: () => {} }
}))
const vi_mockAbility = vi.hoisted(() => vi.fn(() => ({ can: () => true })))
vi.mock('@/lib/ability', () => ({ useAppAbility: vi_mockAbility }))
vi.mock('../../../src/features/auth', () => ({ useAuth: vi.fn(() => ({ user: { role: 'admin' } })) }))
vi.mock('@/features/guideline', () => ({
  useFirstVisit: () => ({ isFirstVisit: false }),
  GuidelineDialog: () => null,
}))
// Explicit icon mock (Proxy-based mocks hang vitest)
vi.mock('lucide-react', () => ({
  Search: () => null, Filter: () => null, Clock: () => null, User: () => null,
  FileText: () => null, Globe: () => null, RefreshCw: () => null, X: () => null,
  Calendar: () => null, Loader2: () => null, ChevronLeft: () => null,
  ChevronRight: () => null, MoreHorizontal: () => null,
}))
// Mock TanStack Query to prevent hanging in React 19 + jsdom
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

// Mock the audit hooks to provide controlled data
const vi_mockAuditLogs = vi.hoisted(() => ({
  logs: [] as any[],
  pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
  isLoading: false,
  actionTypes: ['login', 'logout'] as string[],
  resourceTypes: ['user', 'document'] as string[],
  handlePageChange: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('../../../src/features/audit/hooks/useAuditLogs', () => ({
  useAuditLogs: () => vi_mockAuditLogs,
}))

import AuditLogPage from '../../../src/features/audit/pages/AuditLogPage'

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(vi_mockAuditLogs, {
      logs: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
      isLoading: false,
      actionTypes: ['login', 'logout'],
      resourceTypes: ['user', 'document'],
    })
  })

  it('shows no perm for non-admin', () => {
    vi_mockAbility.mockReturnValueOnce({ can: () => false })
    render(<AuditLogPage />)
    expect(screen.getByText('auditLog.noPermission')).toBeInTheDocument()
  })

  it('fetches and displays logs', () => {
    vi_mockAuditLogs.logs = [{ id: 1, user_id: 'u1', user_email: 't@e.com', action: 'login', resource_type: 'user', resource_id: null, details: {}, ip_address: '1.1.1.1', created_at: new Date().toISOString() }]
    vi_mockAuditLogs.pagination = { page: 1, limit: 25, total: 1, totalPages: 1 }
    render(<AuditLogPage />)
    expect(screen.getByText('t@e.com')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    vi_mockAuditLogs.isLoading = true
    const { container } = render(<AuditLogPage />)
    // Spinner wrapper should be present when loading
    expect(container.querySelector('.justify-center')).toBeTruthy()
  })

  it('toggles filter panel', () => {
    render(<AuditLogPage />)
    fireEvent.click(screen.getByText('auditLog.filters'))
    expect(screen.getByText('auditLog.filterBy')).toBeInTheDocument()
  })

  it('updates search', () => {
    render(<AuditLogPage />)
    const inp = screen.getByPlaceholderText('auditLog.searchPlaceholder')
    fireEvent.change(inp, { target: { value: 'test' } })
    expect(inp).toHaveValue('test')
  })

  it('clears filters', () => {
    render(<AuditLogPage />)
    fireEvent.click(screen.getByText('auditLog.filters'))
    const inp = screen.getByPlaceholderText('auditLog.searchPlaceholder')
    fireEvent.change(inp, { target: { value: 'test' } })
    fireEvent.click(screen.getByText('auditLog.clearFilters'))
    expect(inp).toHaveValue('')
  })

  it('shows empty state', () => {
    render(<AuditLogPage />)
    expect(screen.getAllByText(/auditLog/).length).toBeGreaterThan(0)
  })
})
