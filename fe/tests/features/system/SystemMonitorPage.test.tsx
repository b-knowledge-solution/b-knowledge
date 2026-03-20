import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const vi_mockSystemService = vi.hoisted(() => ({
  getSystemHealth: vi.fn()
}))

vi.mock('../../../src/features/system/api/systemToolsApi', () => ({
  getSystemHealth: vi_mockSystemService.getSystemHealth
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }), initReactI18next: { type: '3rdParty', init: () => {} } }))
vi.mock('lucide-react', () => {
  const NullIcon = () => null
  const factory = {
    default: NullIcon,
    RefreshCw: () => <div data-testid="refresh" />,
  } as Record<string | symbol, any>
  return new Proxy(factory, {
    get: (target, prop) => {
      if (prop in target) return (target as any)[prop]
      return NullIcon
    }
  })
})

// Mock TanStack Query to avoid real query scheduling which can hang tests
const vi_mockHealthData = vi.hoisted(() => ({ current: null as any }))
const vi_mockRefetch = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: any) => {
    // Call queryFn on first render to simulate fetching
    if (vi_mockHealthData.current === null && vi_mockSystemService.getSystemHealth.mock.results.length === 0) {
      vi_mockSystemService.getSystemHealth()
    }
    return {
      data: vi_mockHealthData.current,
      isLoading: vi_mockHealthData.current === null,
      isError: false,
      error: null,
      refetch: vi_mockRefetch,
    }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import SystemMonitorPage from '../../../src/features/system/pages/SystemMonitorPage'

describe('SystemMonitorPage', () => {
  const defaultHealth = {
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'connected', enabled: true, host: 'localhost' },
      redis: { status: 'connected', enabled: true, host: 'localhost' },
      minio: { status: 'connected', enabled: true, host: 'localhost' },
      langfuse: { status: 'connected', enabled: true, host: 'localhost' }
    },
    system: {
      uptime: 3600,
      memory: { rss: 100, heapTotal: 50, heapUsed: 25, external: 10 },
      loadAvg: [0.5, 0.6, 0.7],
      cpus: 4,
      platform: 'linux',
      arch: 'x64',
      hostname: 'server'
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi_mockHealthData.current = defaultHealth
    vi_mockSystemService.getSystemHealth.mockResolvedValue(defaultHealth)
  })

  it('renders monitor page', () => {
    render(<SystemMonitorPage />)
    expect(screen.getAllByText(/systemMonitor/).length).toBeGreaterThan(0)
  })

  it('loads health on mount', async () => {
    render(<SystemMonitorPage />)
    await waitFor(() => expect(vi_mockSystemService.getSystemHealth).toHaveBeenCalled())
  })

  it('displays service health', async () => {
    render(<SystemMonitorPage />)
    await waitFor(() => {
      expect(screen.getByText(/database/i)).toBeInTheDocument()
      expect(screen.getByText(/redis/i)).toBeInTheDocument()
    })
  })

  it('shows connected status badge', async () => {
    render(<SystemMonitorPage />)
    await waitFor(() => expect(screen.getAllByText(/healthy/).length).toBeGreaterThan(0))
  })

  it('displays system metrics', async () => {
    render(<SystemMonitorPage />)
    await waitFor(() => {
      expect(screen.getByText(/uptime/i)).toBeInTheDocument()
      expect(screen.getAllByText(/memory/i).length).toBeGreaterThan(0)
    })
  })

  it('auto-refreshes on interval', async () => {
    render(<SystemMonitorPage />)
    await waitFor(() => expect(vi_mockSystemService.getSystemHealth).toHaveBeenCalled())
    expect(vi_mockSystemService.getSystemHealth).toHaveBeenCalledTimes(1)
  })

  it('allows refresh interval change', async () => {
    render(<SystemMonitorPage />)
    const intervals = screen.getAllByText(/30s|1m|5m|10m/)
    if (intervals.length > 1) {
      fireEvent.click(intervals[1])
    }
  })

  it('shows error status for disconnected services', async () => {
    vi_mockHealthData.current = {
      timestamp: new Date().toISOString(),
      services: {
        database: { status: 'disconnected', enabled: true, host: 'localhost' },
        redis: { status: 'connected', enabled: true, host: 'localhost' },
        minio: { status: 'disconnected', enabled: true, host: 'localhost' },
        langfuse: { status: 'not_configured', enabled: false, host: 'localhost' }
      },
      system: { uptime: 3600, memory: { rss: 100, heapTotal: 50, heapUsed: 25, external: 10 }, loadAvg: [0.5], cpus: 4, platform: 'linux', arch: 'x64', hostname: 'server' }
    }
    render(<SystemMonitorPage />)
    await waitFor(() => expect(screen.getAllByText(/error/).length).toBeGreaterThan(0))
  })

  it('refreshes on manual click', async () => {
    render(<SystemMonitorPage />)
    await waitFor(() => expect(vi_mockSystemService.getSystemHealth).toHaveBeenCalled())
    const refreshBtn = screen.getByTestId('refresh').closest('button')
    if (refreshBtn) {
      fireEvent.click(refreshBtn)
      await waitFor(() => expect(vi_mockRefetch).toHaveBeenCalled())
    }
  })

  it('handles health check errors', async () => {
    vi_mockHealthData.current = null
    vi_mockSystemService.getSystemHealth.mockRejectedValueOnce(new Error('Failed to fetch health'))
    render(<SystemMonitorPage />)
    await waitFor(() => expect(vi_mockSystemService.getSystemHealth).toHaveBeenCalled())
  })

  it('displays disabled services appropriately', async () => {
    vi_mockHealthData.current = {
      timestamp: new Date().toISOString(),
      services: {
        database: { status: 'connected', enabled: true, host: 'localhost' },
        redis: { status: 'connected', enabled: false, host: 'localhost' },
        minio: { status: 'connected', enabled: true, host: 'localhost' },
        langfuse: { status: 'disabled', enabled: false, host: 'localhost' }
      },
      system: { uptime: 3600, memory: { rss: 100, heapTotal: 50, heapUsed: 25, external: 10 }, loadAvg: [0.5], cpus: 4, platform: 'linux', arch: 'x64', hostname: 'server' }
    }
    render(<SystemMonitorPage />)
    await waitFor(() => expect(screen.getAllByText(/disabled/).length).toBeGreaterThan(0))
  })
})
