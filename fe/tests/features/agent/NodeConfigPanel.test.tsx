/**
 * @fileoverview Unit tests for the NodeConfigPanel component.
 *
 * Tests FORM_MAP dispatch to correct form components, JSON editor fallback
 * for unknown operator types, and update propagation to the canvas store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useCanvasStore } from '@/features/agents/store/canvasStore'
import type { Node } from '@xyflow/react'

// ---------------------------------------------------------------------------
// Mocks — form components
// ---------------------------------------------------------------------------

vi.mock('@/features/agents/components/canvas/forms/GenerateForm', () => ({
  GenerateForm: ({ nodeId, onUpdate }: any) => (
    <div data-testid="generate-form" data-node-id={nodeId}>
      <button onClick={() => onUpdate({ config: { model: 'gpt-4o' } })}>
        Update Generate
      </button>
    </div>
  ),
}))

vi.mock('@/features/agents/components/canvas/forms/RetrievalForm', () => ({
  RetrievalForm: ({ nodeId }: any) => (
    <div data-testid="retrieval-form" data-node-id={nodeId}>Retrieval Form</div>
  ),
}))

vi.mock('@/features/agents/components/canvas/forms/BeginForm', () => ({
  BeginForm: () => <div data-testid="begin-form">Begin Form</div>,
}))

vi.mock('@/features/agents/components/canvas/forms/SwitchForm', () => ({
  SwitchForm: () => <div data-testid="switch-form">Switch Form</div>,
}))

vi.mock('@/features/agents/components/canvas/forms/CodeForm', () => ({
  CodeForm: () => <div data-testid="code-form">Code Form</div>,
}))

vi.mock('@/features/agents/components/canvas/forms/CategorizeForm', () => ({
  CategorizeForm: () => <div data-testid="categorize-form">Categorize Form</div>,
}))

vi.mock('@/features/agents/components/canvas/forms/MessageForm', () => ({
  MessageForm: () => <div data-testid="message-form">Message Form</div>,
}))

vi.mock('@/features/agents/components/canvas/forms/LoopForm', () => ({
  LoopForm: () => <div data-testid="loop-form">Loop Form</div>,
}))

vi.mock('@/features/agents/components/canvas/forms/IterationForm', () => ({
  IterationForm: () => <div data-testid="iteration-form">Iteration Form</div>,
}))

vi.mock('@/features/agents/components/canvas/forms/IterationItemForm', () => ({
  IterationItemForm: () => <div data-testid="iteration-item-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/LoopItemForm', () => ({
  LoopItemForm: () => <div data-testid="loop-item-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/InvokeForm', () => ({
  InvokeForm: () => <div data-testid="invoke-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/VariableAssignerForm', () => ({
  VariableAssignerForm: () => <div data-testid="variable-assigner-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/VariableAggregatorForm', () => ({
  VariableAggregatorForm: () => <div data-testid="variable-aggregator-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/DataOperationsForm', () => ({
  DataOperationsForm: () => <div data-testid="data-operations-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/ListOperationsForm', () => ({
  ListOperationsForm: () => <div data-testid="list-operations-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/StringTransformForm', () => ({
  StringTransformForm: () => <div data-testid="string-transform-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/ExitLoopForm', () => ({
  ExitLoopForm: () => <div data-testid="exit-loop-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/DocsGeneratorForm', () => ({
  DocsGeneratorForm: () => <div data-testid="docs-generator-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/ExcelProcessorForm', () => ({
  ExcelProcessorForm: () => <div data-testid="excel-processor-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/FillUpForm', () => ({
  FillUpForm: () => <div data-testid="fillup-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/AgentWithToolsForm', () => ({
  AgentWithToolsForm: () => <div data-testid="agent-with-tools-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/RewriteForm', () => ({
  RewriteForm: () => <div data-testid="rewrite-form" />,
}))

vi.mock('@/features/agents/components/canvas/forms/MemoryForm', () => ({
  MemoryForm: () => <div data-testid="memory-form" />,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('lucide-react', () => ({
  X: () => null,
}))

import { NodeConfigPanel } from '@/features/agents/components/canvas/NodeConfigPanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNode(id: string, type: string, config: Record<string, unknown> = {}): Node {
  return {
    id,
    type: 'canvasNode',
    position: { x: 0, y: 0 },
    data: { type, label: `Node ${type}`, config },
  }
}

function setStoreState(nodeId: string | null, nodes: Node[]) {
  useCanvasStore.setState({
    selectedNodeId: nodeId,
    nodes,
    edges: [],
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NodeConfigPanel', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      selectedNodeId: null,
      nodes: [],
      edges: [],
    })
  })

  it('returns null when no node is selected', () => {
    const { container } = render(<NodeConfigPanel />)
    expect(container.innerHTML).toBe('')
  })

  it('shows panel when a node is selected', () => {
    const node = buildNode('n-1', 'generate')
    setStoreState('n-1', [node])

    render(<NodeConfigPanel />)

    // Panel header shows node label and type
    expect(screen.getByText('Node generate')).toBeInTheDocument()
    expect(screen.getByText('generate')).toBeInTheDocument()
  })

  it('dispatches to GenerateForm for generate operator', () => {
    setStoreState('n-1', [buildNode('n-1', 'generate')])
    render(<NodeConfigPanel />)
    expect(screen.getByTestId('generate-form')).toBeInTheDocument()
  })

  it('dispatches to RetrievalForm for retrieval operator', () => {
    setStoreState('n-1', [buildNode('n-1', 'retrieval')])
    render(<NodeConfigPanel />)
    expect(screen.getByTestId('retrieval-form')).toBeInTheDocument()
  })

  it('dispatches to BeginForm for begin operator', () => {
    setStoreState('n-1', [buildNode('n-1', 'begin')])
    render(<NodeConfigPanel />)
    expect(screen.getByTestId('begin-form')).toBeInTheDocument()
  })

  it('dispatches to SwitchForm for switch operator', () => {
    setStoreState('n-1', [buildNode('n-1', 'switch')])
    render(<NodeConfigPanel />)
    expect(screen.getByTestId('switch-form')).toBeInTheDocument()
  })

  it('dispatches to CodeForm for code operator', () => {
    setStoreState('n-1', [buildNode('n-1', 'code')])
    render(<NodeConfigPanel />)
    expect(screen.getByTestId('code-form')).toBeInTheDocument()
  })

  it('dispatches to CategorizeForm for categorize operator', () => {
    setStoreState('n-1', [buildNode('n-1', 'categorize')])
    render(<NodeConfigPanel />)
    expect(screen.getByTestId('categorize-form')).toBeInTheDocument()
  })

  it('dispatches to RewriteForm for rewrite operator', () => {
    setStoreState('n-1', [buildNode('n-1', 'rewrite')])
    render(<NodeConfigPanel />)
    expect(screen.getByTestId('rewrite-form')).toBeInTheDocument()
  })

  it('dispatches to AgentWithToolsForm for agent_with_tools operator', () => {
    setStoreState('n-1', [buildNode('n-1', 'agent_with_tools')])
    render(<NodeConfigPanel />)
    expect(screen.getByTestId('agent-with-tools-form')).toBeInTheDocument()
  })

  it('shows JSON editor fallback for unmapped operator types', () => {
    // 'wikipedia' is not in FORM_MAP
    setStoreState('n-1', [buildNode('n-1', 'wikipedia', { query: 'test' })])
    render(<NodeConfigPanel />)

    // Should show textarea with JSON config
    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeInTheDocument()
    expect((textarea as HTMLTextAreaElement).value).toContain('"query"')
  })

  it('shows Apply button only for JSON editor fallback', () => {
    // Unmapped type shows Apply
    setStoreState('n-1', [buildNode('n-1', 'wikipedia')])
    render(<NodeConfigPanel />)
    expect(screen.getByText('common.apply')).toBeInTheDocument()
  })

  it('does not show Apply button for mapped forms', () => {
    setStoreState('n-1', [buildNode('n-1', 'generate')])
    render(<NodeConfigPanel />)
    expect(screen.queryByText('common.apply')).not.toBeInTheDocument()
  })

  it('propagates form updates to canvas store', () => {
    const node = buildNode('n-1', 'generate')
    setStoreState('n-1', [node])
    render(<NodeConfigPanel />)

    // Click the mock update button in GenerateForm
    fireEvent.click(screen.getByText('Update Generate'))

    // Verify node data was updated in the store
    const updatedNode = useCanvasStore.getState().nodes[0]!
    expect((updatedNode.data as any).config.model).toBe('gpt-4o')
  })

  it('closes panel when close button clicked', () => {
    setStoreState('n-1', [buildNode('n-1', 'generate')])
    const { container } = render(<NodeConfigPanel />)

    // Close button has sr-only text
    const closeBtn = screen.getByText('common.close').closest('button')
    fireEvent.click(closeBtn!)

    expect(useCanvasStore.getState().selectedNodeId).toBeNull()
  })

  it('shows JSON validation error for invalid JSON in fallback editor', () => {
    setStoreState('n-1', [buildNode('n-1', 'wikipedia')])
    render(<NodeConfigPanel />)

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '{ invalid json' } })

    // Click Apply to trigger validation
    fireEvent.click(screen.getByText('common.apply'))

    // Error message should appear
    const errorEl = document.querySelector('.text-destructive')
    expect(errorEl).not.toBeNull()
  })

  it('shows node label in header', () => {
    const node = buildNode('n-1', 'generate')
    ;(node.data as any).label = 'My Generator'
    setStoreState('n-1', [node])
    render(<NodeConfigPanel />)

    expect(screen.getByText('My Generator')).toBeInTheDocument()
  })
})
