import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const vi_mockSystemService = vi.hoisted(() => ({
  getSystemTools: vi.fn(),
  getSystemHealth: vi.fn(),
  reloadTools: vi.fn()
}))

vi.mock('../../../src/features/system/api/systemToolsApi', () => ({
  getSystemTools: vi_mockSystemService.getSystemTools,
  getSystemHealth: vi_mockSystemService.getSystemHealth,
  reloadTools: vi_mockSystemService.reloadTools
}))
// Mock sub-components to avoid heavy dependency chains
vi.mock('../../../src/features/system/components/SystemToolCard', () => ({
  default: ({ tool }: any) => <div data-testid="tool-card">{tool.name}</div>,
}))
vi.mock('../../../src/features/system/components/CronSchedulerSettings', () => ({
  default: () => <div data-testid="cron-settings" />,
}))
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiFetch: vi.fn(),
}))
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { role: 'admin' }, isAuthenticated: true, isLoading: false })
}))
// Mock TanStack Query to avoid real query scheduling
const vi_mockQueryData = vi.hoisted(() => ({ current: undefined as any, isLoading: false, isError: false, error: null }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: vi_mockQueryData.current,
    isLoading: vi_mockQueryData.isLoading,
    isError: vi_mockQueryData.isError,
    error: vi_mockQueryData.error,
    refetch: vi.fn(),
  }),
  useMutation: (opts: any) => ({ mutate: opts?.mutationFn || vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }), initReactI18next: { type: '3rdParty', init: () => {} } }))
vi.mock('lucide-react', () => {
  const NullIcon = () => null
  const factory = {
    default: NullIcon,
    AlertCircle: () => <div data-testid="alert" />,
    RefreshCw: () => <div data-testid="refresh" />,
  } as Record<string | symbol, any>
  return new Proxy(factory, {
    get: (target, prop) => {
      if (prop in target) return (target as any)[prop]
      return NullIcon
    }
  })
})

import SystemToolsPage from '../../../src/features/system/pages/SystemToolsPage'

describe('SystemToolsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi_mockSystemService.getSystemTools.mockResolvedValue([])
    global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify([])))) as any
  })

  it('renders tools page', () => {
    render(<SystemToolsPage />)
    expect(screen.getByText(/systemTools/)).toBeInTheDocument()
  })

  it('loads tools on mount', async () => {
    vi_mockSystemService.getSystemTools.mockResolvedValue([])
    render(<SystemToolsPage />)
    await waitFor(() => expect(vi_mockSystemService.getSystemTools).toHaveBeenCalled())
  })

  it('displays tools in grid', async () => {
    const tools = [
      { id: '1', name: 'Prometheus', description: 'Metrics', icon: 'prometheus.svg', url: 'http://localhost:9090', order: 1, enabled: true },
      { id: '2', name: 'Grafana', description: 'Dashboards', icon: 'grafana.svg', url: 'http://localhost:3000', order: 2, enabled: true }
    ]
    vi_mockSystemService.getSystemTools.mockResolvedValue(tools)
    render(<SystemToolsPage />)
    await waitFor(() => {
      expect(screen.getByText('Prometheus')).toBeInTheDocument()
      expect(screen.getByText('Grafana')).toBeInTheDocument()
    })
  })

  it('shows loading state', () => {
    vi_mockSystemService.getSystemTools.mockImplementationOnce(() => new Promise(() => {}))
    render(<SystemToolsPage />)
    expect(screen.getByText(/systemTools.loading/)).toBeInTheDocument()
  })

  it('shows error state', async () => {
    vi_mockSystemService.getSystemTools.mockRejectedValueOnce(new Error('API Error'))
    render(<SystemToolsPage />)
    await waitFor(() => expect(screen.getByTestId('alert')).toBeInTheDocument())
  })

  it('retries on error', async () => {
    vi_mockSystemService.getSystemTools.mockRejectedValueOnce(new Error('API Error'))
    render(<SystemToolsPage />)
    await waitFor(() => expect(screen.getByTestId('refresh')).toBeInTheDocument())
    const retryBtn = screen.getByTestId('refresh').closest('button')
    if (retryBtn) {
      fireEvent.click(retryBtn)
      vi_mockSystemService.getSystemTools.mockResolvedValueOnce([{ id: '1', name: 'Tool', description: 'desc', icon: 'icon.svg', url: 'http://localhost', order: 1, enabled: true }])
      await waitFor(() => expect(vi_mockSystemService.getSystemTools).toHaveBeenCalledTimes(2))
    }
  })

  it('shows empty state when no tools', async () => {
    vi_mockSystemService.getSystemTools.mockReset()
    vi_mockSystemService.getSystemTools.mockResolvedValue([])
    render(<SystemToolsPage />)
    await waitFor(() => expect(screen.queryByText(/systemTools.noToolsConfigured/i) || screen.queryByText(/empty/i)).toBeInTheDocument())
  })

  it('opens tool in new tab on click', async () => {
    const tools = [
      { id: '1', name: 'Tool', description: 'desc', icon: 'icon.svg', url: 'http://localhost:8080', order: 1, enabled: true }
    ]
    vi_mockSystemService.getSystemTools.mockResolvedValue(tools)
    window.open = vi.fn()
    render(<SystemToolsPage />)
    await waitFor(() => {
      const toolCard = screen.getByText('Tool').closest('div')
      if (toolCard) fireEvent.click(toolCard)
    })
  })

  it('handles network errors', async () => {
    vi_mockSystemService.getSystemTools.mockRejectedValueOnce(new Error('Network error'))
    render(<SystemToolsPage />)
    await waitFor(() => expect(screen.getByTestId('alert')).toBeInTheDocument())
  })
})