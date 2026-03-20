import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  initReactI18next: { type: '3rdParty', init: () => {} }
}))
vi.mock('../../../src/features/auth', () => ({ useAuth: vi.fn(() => ({ user: { role: 'admin' } })) }))
vi.mock('lucide-react', () => ({ Search: () => null, Filter: () => null, Clock: () => null, User: () => null, FileText: () => null, Globe: () => null, RefreshCw: () => null, X: () => null }))

import AuditLogPage from '../../../src/features/audit/pages/AuditLogPage'

describe('import', () => {
  it('imported', () => { expect(typeof AuditLogPage).toBe('function') })
})
