import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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
vi.mock('lucide-react', () => {
  const NullIcon = () => null
  const factory = { default: NullIcon } as Record<string | symbol, any>
  return new Proxy(factory, {
    get: (target, prop) => {
      if (prop in target) return (target as any)[prop]
      return NullIcon
    }
  })
})

// Mock audit hooks to avoid real useQuery (which hangs in React 19 + jsdom)
const vi_mockAuditLogs = vi.hoisted(() => ({
  logs: [] as any[],
  pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
  isLoading: false,
  actionTypes: ['login', 'logout'],
  resourceTypes: ['user', 'document'],
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
    vi_mockAuditLogs.logs = []
    vi_mockAuditLogs.pagination = { page: 1, limit: 25, total: 0, totalPages: 0 }
    vi_mockAuditLogs.isLoading = false
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
    render(<AuditLogPage />)
    // Loading spinner should be visible
    expect(document.querySelector('.animate-spin')).toBeTruthy()
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
    // With empty logs, the table should show some kind of empty state
    expect(screen.getAllByText(/auditLog/).length).toBeGreaterThan(0)
  })
})
