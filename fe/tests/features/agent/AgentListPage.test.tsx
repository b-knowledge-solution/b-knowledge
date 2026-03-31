/**
 * @fileoverview Unit tests for the AgentListPage component.
 *
 * Tests page rendering, loading/empty states, agent card grid,
 * tab switching, search input, and create dialog.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAgents = vi.fn()
const mockCreateMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()
const mockDuplicateMutateAsync = vi.fn()

vi.mock('@/features/agents/api/agentQueries', () => ({
  useAgents: () => mockUseAgents(),
  useCreateAgent: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useDeleteAgent: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
  useDuplicateAgent: () => ({
    mutateAsync: mockDuplicateMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/features/agents/api/agentApi', () => ({
  agentApi: {
    exportJson: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/features/agents/components/AgentCard', () => ({
  AgentCard: ({ agent }: any) => (
    <div data-testid={`agent-card-${agent.id}`}>{agent.name}</div>
  ),
}))

vi.mock('@/features/agents/components/TemplateGallery', () => ({
  TemplateGallery: () => <div data-testid="template-gallery">Templates</div>,
}))

vi.mock('@/app/App', () => ({
  globalMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="tabs" data-value={value}>
      {typeof children === 'function' ? children : children}
    </div>
  ),
  TabsList: ({ children }: any) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button data-testid={`tab-${value}`}>{children}</button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
}))

import AgentListPage from '@/features/agents/pages/AgentListPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock Agent object for testing
 */
function buildAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'A test agent',
    avatar: null,
    mode: 'agent',
    status: 'draft',
    dsl: { nodes: {}, edges: [], variables: {}, settings: { mode: 'agent', max_execution_time: 300, retry_on_failure: false } },
    dsl_version: 1,
    policy_rules: null,
    tenant_id: 't-1',
    project_id: null,
    parent_id: null,
    version_number: 1,
    version_label: null,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading skeleton when data is loading', () => {
    mockUseAgents.mockReturnValue({ data: undefined, isLoading: true })
    render(<AgentListPage />)

    // Skeleton grid renders animated placeholders (we check for the pulse class presence)
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no agents exist', () => {
    mockUseAgents.mockReturnValue({
      data: { data: [], total: 0, page: 1, page_size: 20 },
      isLoading: false,
    })
    render(<AgentListPage />)

    expect(screen.getByText('agents.noAgentsYet')).toBeInTheDocument()
    expect(screen.getByText('agents.emptyDescription')).toBeInTheDocument()
  })

  it('renders agent cards from API data', () => {
    const agents = [
      buildAgent({ id: 'a-1', name: 'Alpha Agent' }),
      buildAgent({ id: 'a-2', name: 'Beta Agent' }),
    ]
    mockUseAgents.mockReturnValue({
      data: { data: agents, total: 2, page: 1, page_size: 20 },
      isLoading: false,
    })
    render(<AgentListPage />)

    expect(screen.getByTestId('agent-card-a-1')).toBeInTheDocument()
    expect(screen.getByTestId('agent-card-a-2')).toBeInTheDocument()
    expect(screen.getByText('Alpha Agent')).toBeInTheDocument()
    expect(screen.getByText('Beta Agent')).toBeInTheDocument()
  })

  it('displays the page title and create button', () => {
    mockUseAgents.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false })
    render(<AgentListPage />)

    expect(screen.getByText('agents.pageTitle')).toBeInTheDocument()
    // Multiple "create" buttons exist (header + empty state)
    const createButtons = screen.getAllByText('agents.createAgent')
    expect(createButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('renders tabs for All, My Agents, and Templates', () => {
    mockUseAgents.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false })
    render(<AgentListPage />)

    expect(screen.getByTestId('tab-all')).toBeInTheDocument()
    expect(screen.getByTestId('tab-my')).toBeInTheDocument()
    expect(screen.getByTestId('tab-templates')).toBeInTheDocument()
  })

  it('shows template gallery in the templates tab content', () => {
    mockUseAgents.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false })
    render(<AgentListPage />)

    expect(screen.getByTestId('template-gallery')).toBeInTheDocument()
  })

  it('opens create dialog on button click', async () => {
    mockUseAgents.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false })
    render(<AgentListPage />)

    // Click the first create button (in page header)
    const createButtons = screen.getAllByText('agents.createAgent')
    fireEvent.click(createButtons[0]!)

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })
  })

  it('shows search input for agent tabs', () => {
    mockUseAgents.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false })
    render(<AgentListPage />)

    // Search input should have the placeholder
    const searchInput = screen.getByPlaceholderText('agents.searchPlaceholder')
    expect(searchInput).toBeInTheDocument()
  })

  it('renders browse templates button in empty state', () => {
    mockUseAgents.mockReturnValue({
      data: { data: [], total: 0 },
      isLoading: false,
    })
    render(<AgentListPage />)

    expect(screen.getByText('agents.browseTemplates')).toBeInTheDocument()
  })
})
