import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  initReactI18next: { type: '3rdParty', init: () => {} }
}))
vi.mock('@/lib/ability', () => ({ useAppAbility: () => ({ can: () => true }) }))
vi.mock('../../../src/features/auth', () => ({ useAuth: vi.fn(() => ({ user: { role: 'admin' } })) }))
vi.mock('@/features/guideline', () => ({ useFirstVisit: () => ({ isFirstVisit: false }), GuidelineDialog: () => null }))
vi.mock('lucide-react', () => {
  const NullIcon = () => null
  const factory = { default: NullIcon } as Record<string | symbol, any>
  return new Proxy(factory, { get: (target, prop) => (prop in target ? (target as any)[prop] : NullIcon) })
})

import AuditLogPage from '../../../src/features/audit/pages/AuditLogPage'

describe('AuditLogPage', () => {
  it('renders', () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify([])))) as any
    render(<AuditLogPage />)
    expect(screen.getAllByText(/auditLog/).length).toBeGreaterThan(0)
  })
})
