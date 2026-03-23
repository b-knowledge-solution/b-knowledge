/**
 * @fileoverview Unit tests for the MemorySettingsPanel component.
 *
 * Tests form field rendering (types checkboxes, storage radios, model inputs,
 * prompt textareas), save button behavior, and dirty detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/slider', () => ({
  Slider: ({ value, onValueChange, min, max, step }: any) => (
    <input
      data-testid="slider"
      type="range"
      value={value?.[0] ?? 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
    />
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
      <button
        data-testid={`select-change-${value}`}
        onClick={() => onValueChange?.('agent')}
      >
        Change
      </button>
    </div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
}))

import { MemorySettingsPanel } from '@/features/memory/components/MemorySettingsPanel'
import type { Memory } from '@/features/memory/types/memory.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock Memory entity for settings panel tests
 */
function buildMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    name: 'Test Pool',
    description: 'A test description',
    avatar: null,
    memory_type: 15,
    storage_type: 'table',
    memory_size: 104857600, // 100 MB
    forgetting_policy: 'fifo',
    embd_id: 'embd-default',
    llm_id: 'llm-default',
    temperature: 0.7,
    system_prompt: 'System prompt text',
    user_prompt: 'User prompt text',
    extraction_mode: 'batch',
    permission: 'me',
    scope_type: 'user',
    scope_id: null,
    tenant_id: 't-1',
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemorySettingsPanel', () => {
  const mockOnSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================================================
  // Section rendering
  // ========================================================================

  it('renders General section with name and description fields', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    expect(screen.getByText('common.general:{"defaultValue":"General"}')).toBeInTheDocument()
    expect(screen.getByText('memory.name')).toBeInTheDocument()
    expect(screen.getByText('memory.description')).toBeInTheDocument()
  })

  it('renders memory type checkboxes section', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    expect(screen.getByText('memory.memoryType')).toBeInTheDocument()
    expect(screen.getByText('memory.raw')).toBeInTheDocument()
    expect(screen.getByText('memory.semantic')).toBeInTheDocument()
    expect(screen.getByText('memory.episodic')).toBeInTheDocument()
    expect(screen.getByText('memory.procedural')).toBeInTheDocument()
  })

  it('renders storage type radio buttons', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    expect(screen.getByText('memory.storageType')).toBeInTheDocument()
    expect(screen.getByText('memory.table')).toBeInTheDocument()
    expect(screen.getByText('memory.graph')).toBeInTheDocument()
  })

  it('renders extraction mode radio buttons', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    expect(screen.getByText('memory.extractionMode')).toBeInTheDocument()
    expect(screen.getByText('memory.batch')).toBeInTheDocument()
    expect(screen.getByText('memory.realtime')).toBeInTheDocument()
  })

  it('renders Models section with embedding, LLM, and temperature', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    expect(screen.getByText('common.models:{"defaultValue":"Models"}')).toBeInTheDocument()
    expect(screen.getByText('memory.embeddingModel')).toBeInTheDocument()
    expect(screen.getByText('memory.llmModel')).toBeInTheDocument()
    // Temperature label with value
    expect(screen.getByText('0.7')).toBeInTheDocument()
  })

  it('renders prompts section with system and user prompts', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    expect(screen.getByText('common.prompts:{"defaultValue":"Prompts"}')).toBeInTheDocument()
    expect(screen.getByText('memory.systemPrompt')).toBeInTheDocument()
    expect(screen.getByText('memory.userPrompt')).toBeInTheDocument()
  })

  it('renders reset prompt buttons', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    const resetButtons = screen.getAllByText('memory.resetPrompt')
    // Two reset buttons: one for system prompt, one for user prompt
    expect(resetButtons.length).toBe(2)
  })

  it('renders forgetting policy section with memory size input', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    // Two instances of forgetting policy label (section header + field label)
    const labels = screen.getAllByText('memory.forgettingPolicy')
    expect(labels.length).toBe(2)
    expect(screen.getByText('memory.memorySize')).toBeInTheDocument()
    expect(screen.getByText('MB')).toBeInTheDocument()
  })

  it('renders access control section with permission and scope type', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    expect(screen.getByText('common.access:{"defaultValue":"Access"}')).toBeInTheDocument()
    expect(screen.getByText('memory.permission')).toBeInTheDocument()
    expect(screen.getByText('memory.permMe')).toBeInTheDocument()
    expect(screen.getByText('memory.permTeam')).toBeInTheDocument()
    expect(screen.getByText('memory.scopeType')).toBeInTheDocument()
  })

  // ========================================================================
  // Form population
  // ========================================================================

  it('populates name input with memory name', () => {
    render(<MemorySettingsPanel memory={buildMemory({ name: 'My Pool' })} onSave={mockOnSave} />)

    const nameInputs = document.querySelectorAll('input')
    // Find the input with the pool name value
    const nameInput = Array.from(nameInputs).find((i) => i.value === 'My Pool')
    expect(nameInput).toBeDefined()
  })

  it('populates description textarea with memory description', () => {
    render(
      <MemorySettingsPanel
        memory={buildMemory({ description: 'Pool description here' })}
        onSave={mockOnSave}
      />
    )

    const textareas = document.querySelectorAll('textarea')
    const descTextarea = Array.from(textareas).find((t) => t.value === 'Pool description here')
    expect(descTextarea).toBeDefined()
  })

  it('checks memory type checkboxes based on bitmask', () => {
    // bitmask 5 = RAW(1) + EPISODIC(4)
    render(<MemorySettingsPanel memory={buildMemory({ memory_type: 5 })} onSave={mockOnSave} />)

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    // Order: RAW, SEMANTIC, EPISODIC, PROCEDURAL
    expect((checkboxes[0] as HTMLInputElement)?.checked).toBe(true)   // RAW
    expect((checkboxes[1] as HTMLInputElement)?.checked).toBe(false)  // SEMANTIC
    expect((checkboxes[2] as HTMLInputElement)?.checked).toBe(true)   // EPISODIC
    expect((checkboxes[3] as HTMLInputElement)?.checked).toBe(false)  // PROCEDURAL
  })

  it('selects correct storage type radio', () => {
    render(<MemorySettingsPanel memory={buildMemory({ storage_type: 'graph' })} onSave={mockOnSave} />)

    const radios = document.querySelectorAll('input[name="settings_storage_type"]')
    expect((radios[0] as HTMLInputElement)?.checked).toBe(false) // table
    expect((radios[1] as HTMLInputElement)?.checked).toBe(true)  // graph
  })

  it('selects correct extraction mode radio', () => {
    render(
      <MemorySettingsPanel
        memory={buildMemory({ extraction_mode: 'realtime' })}
        onSave={mockOnSave}
      />
    )

    const radios = document.querySelectorAll('input[name="settings_extraction_mode"]')
    expect((radios[0] as HTMLInputElement)?.checked).toBe(false) // batch
    expect((radios[1] as HTMLInputElement)?.checked).toBe(true)  // realtime
  })

  it('populates embedding model and LLM model inputs', () => {
    render(
      <MemorySettingsPanel
        memory={buildMemory({ embd_id: 'text-embedding-3', llm_id: 'gpt-4o' })}
        onSave={mockOnSave}
      />
    )

    const inputs = document.querySelectorAll('input[type="text"], input:not([type])')
    const values = Array.from(inputs).map((i) => (i as HTMLInputElement).value)
    expect(values).toContain('text-embedding-3')
    expect(values).toContain('gpt-4o')
  })

  it('displays memory size in MB', () => {
    // 52428800 bytes = 50 MB
    render(
      <MemorySettingsPanel
        memory={buildMemory({ memory_size: 52428800 })}
        onSave={mockOnSave}
      />
    )

    const numberInput = document.querySelector('input[type="number"]') as HTMLInputElement
    expect(numberInput?.value).toBe('50')
  })

  // ========================================================================
  // Save button
  // ========================================================================

  it('renders save button', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    expect(screen.getByText('common.save')).toBeInTheDocument()
  })

  it('calls onSave with form data when save is clicked', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    fireEvent.click(screen.getByText('common.save'))

    expect(mockOnSave).toHaveBeenCalledTimes(1)
    const savedData = mockOnSave.mock.calls[0]![0]
    expect(savedData.name).toBe('Test Pool')
    expect(savedData.memory_type).toBe(15)
    expect(savedData.storage_type).toBe('table')
    expect(savedData.extraction_mode).toBe('batch')
    expect(savedData.permission).toBe('me')
    expect(savedData.scope_type).toBe('user')
  })

  it('disables save button when name is empty', () => {
    render(<MemorySettingsPanel memory={buildMemory({ name: '' })} onSave={mockOnSave} />)

    const saveButton = screen.getByText('common.save')
    expect(saveButton).toBeDisabled()
  })

  it('includes optional fields only when they have values', () => {
    render(
      <MemorySettingsPanel
        memory={buildMemory({
          description: null,
          system_prompt: null,
          user_prompt: null,
          embd_id: null,
          llm_id: null,
        })}
        onSave={mockOnSave}
      />
    )

    fireEvent.click(screen.getByText('common.save'))

    const savedData = mockOnSave.mock.calls[0]![0]
    // Empty optional fields should not be in the payload
    expect(savedData).not.toHaveProperty('description')
    expect(savedData).not.toHaveProperty('system_prompt')
    expect(savedData).not.toHaveProperty('user_prompt')
    expect(savedData).not.toHaveProperty('embd_id')
    expect(savedData).not.toHaveProperty('llm_id')
  })

  // ========================================================================
  // Interactions
  // ========================================================================

  it('toggles memory type checkbox on click', () => {
    render(<MemorySettingsPanel memory={buildMemory({ memory_type: 15 })} onSave={mockOnSave} />)

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    // Toggle off SEMANTIC (index 1)
    fireEvent.click(checkboxes[1]!)

    // After toggling SEMANTIC off, bitmask should be 15 ^ 2 = 13
    fireEvent.click(screen.getByText('common.save'))
    const savedData = mockOnSave.mock.calls[0]![0]
    expect(savedData.memory_type).toBe(13)
  })

  it('changes storage type on radio click', () => {
    render(<MemorySettingsPanel memory={buildMemory({ storage_type: 'table' })} onSave={mockOnSave} />)

    const radios = document.querySelectorAll('input[name="settings_storage_type"]')
    // Click graph radio
    fireEvent.click(radios[1]!)

    fireEvent.click(screen.getByText('common.save'))
    const savedData = mockOnSave.mock.calls[0]![0]
    expect(savedData.storage_type).toBe('graph')
  })

  it('changes extraction mode on radio click', () => {
    render(
      <MemorySettingsPanel memory={buildMemory({ extraction_mode: 'batch' })} onSave={mockOnSave} />
    )

    const radios = document.querySelectorAll('input[name="settings_extraction_mode"]')
    // Click realtime radio
    fireEvent.click(radios[1]!)

    fireEvent.click(screen.getByText('common.save'))
    const savedData = mockOnSave.mock.calls[0]![0]
    expect(savedData.extraction_mode).toBe('realtime')
  })

  it('updates name field on input change', () => {
    render(<MemorySettingsPanel memory={buildMemory({ name: 'Old Name' })} onSave={mockOnSave} />)

    const nameInput = Array.from(document.querySelectorAll('input')).find(
      (i) => (i as HTMLInputElement).value === 'Old Name'
    ) as HTMLInputElement

    fireEvent.change(nameInput, { target: { value: 'New Name' } })
    fireEvent.click(screen.getByText('common.save'))

    const savedData = mockOnSave.mock.calls[0]![0]
    expect(savedData.name).toBe('New Name')
  })

  it('changes permission on radio click', () => {
    render(<MemorySettingsPanel memory={buildMemory({ permission: 'me' })} onSave={mockOnSave} />)

    const radios = document.querySelectorAll('input[name="settings_permission"]')
    // Click team radio
    fireEvent.click(radios[1]!)

    fireEvent.click(screen.getByText('common.save'))
    const savedData = mockOnSave.mock.calls[0]![0]
    expect(savedData.permission).toBe('team')
  })

  it('displays FIFO as the forgetting policy (display-only)', () => {
    render(<MemorySettingsPanel memory={buildMemory()} onSave={mockOnSave} />)

    expect(screen.getByText(/FIFO/)).toBeInTheDocument()
  })
})
