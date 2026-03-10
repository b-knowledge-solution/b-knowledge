import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('lucide-react', () => {
  const mockIcon = () => null
  return new Proxy({}, {
    get: () => mockIcon
  })
})


import PermissionManagementPage from '../../../../src/features/users/pages/PermissionManagementPage'

describe('PermissionManagementPage', () => {
  it('renders permission matrix', () => {
    const { container } = render(<PermissionManagementPage />)
    expect(container.querySelector('[data-testid="permissions-table"]')).toBeTruthy()
  })

  it('displays permissions', () => {
    const { container } = render(<PermissionManagementPage />)
    expect(container.textContent).toContain('AI Chat Access')
  })
})
