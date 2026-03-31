/**
 * @fileoverview Unit tests for the GenerateForm component.
 *
 * Tests field rendering with defaults, config propagation via onUpdate,
 * and model selection dropdown.
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

vi.mock('@/components/ui/slider', () => ({
  Slider: ({ value, onValueChange, min, max, step, ...props }: any) => (
    <input
      type="range"
      data-testid={`slider-${value?.[0]}`}
      value={value?.[0] ?? 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
      {...props}
    />
  ),
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
      {/* Render a hidden select for testing value changes */}
      <select
        data-testid="select-native"
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        <option value="">Select</option>
        <option value="gpt-4o">GPT-4o</option>
        <option value="gpt-4o-mini">GPT-4o Mini</option>
        <option value="claude-3-opus">Claude 3 Opus</option>
      </select>
    </div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}))

import { GenerateForm } from '@/features/agents/components/canvas/forms/GenerateForm'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenerateForm', () => {
  const defaultProps = {
    nodeId: 'n-1',
    config: {},
    onUpdate: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all form fields', () => {
    render(<GenerateForm {...defaultProps} />)

    expect(screen.getByText('agents.generate.model')).toBeInTheDocument()
    expect(screen.getByText('agents.generate.systemPrompt')).toBeInTheDocument()
    expect(screen.getByText('agents.generate.temperature')).toBeInTheDocument()
    expect(screen.getByText('agents.generate.topP')).toBeInTheDocument()
    expect(screen.getByText('agents.generate.maxTokens')).toBeInTheDocument()
    expect(screen.getByText('agents.generate.frequencyPenalty')).toBeInTheDocument()
    expect(screen.getByText('agents.generate.messagePassthrough')).toBeInTheDocument()
  })

  it('renders default temperature value', () => {
    render(<GenerateForm {...defaultProps} />)
    // Default temperature is 0.7
    expect(screen.getByText('0.7')).toBeInTheDocument()
  })

  it('renders default top_p value', () => {
    render(<GenerateForm {...defaultProps} />)
    expect(screen.getByText('1.00')).toBeInTheDocument()
  })

  it('renders default max tokens value', () => {
    render(<GenerateForm {...defaultProps} />)
    const maxTokensInput = screen.getByDisplayValue('2048')
    expect(maxTokensInput).toBeInTheDocument()
  })

  it('renders default frequency penalty value', () => {
    render(<GenerateForm {...defaultProps} />)
    expect(screen.getByText('0.0')).toBeInTheDocument()
  })

  it('initializes with provided config values', () => {
    const config = {
      model: 'gpt-4o',
      temperature: 0.5,
      max_tokens: 4096,
      system_prompt: 'You are a helper',
    }
    render(<GenerateForm {...defaultProps} config={config} />)

    expect(screen.getByText('0.5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('4096')).toBeInTheDocument()
    expect(screen.getByDisplayValue('You are a helper')).toBeInTheDocument()
  })

  it('calls onUpdate when system prompt changes', () => {
    const onUpdate = vi.fn()
    render(<GenerateForm {...defaultProps} onUpdate={onUpdate} />)

    const textarea = screen.getByPlaceholderText('agents.generate.systemPromptPlaceholder')
    fireEvent.change(textarea, { target: { value: 'New prompt' } })

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          system_prompt: 'New prompt',
        }),
      })
    )
  })

  it('calls onUpdate when max tokens changes', () => {
    const onUpdate = vi.fn()
    render(<GenerateForm {...defaultProps} onUpdate={onUpdate} />)

    const maxTokensInput = screen.getByDisplayValue('2048')
    fireEvent.change(maxTokensInput, { target: { value: '8192' } })

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          max_tokens: 8192,
        }),
      })
    )
  })

  it('calls onUpdate when model is selected', () => {
    const onUpdate = vi.fn()
    render(<GenerateForm {...defaultProps} onUpdate={onUpdate} />)

    const nativeSelect = screen.getByTestId('select-native')
    fireEvent.change(nativeSelect, { target: { value: 'gpt-4o' } })

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          model: 'gpt-4o',
        }),
      })
    )
  })

  it('toggles message passthrough', () => {
    const onUpdate = vi.fn()
    render(<GenerateForm {...defaultProps} onUpdate={onUpdate} />)

    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          message_passthrough: true,
        }),
      })
    )
  })

  it('renders passthrough hint text', () => {
    render(<GenerateForm {...defaultProps} />)
    expect(screen.getByText('agents.generate.messagePassthroughHint')).toBeInTheDocument()
  })

  it('re-syncs state when config prop changes', () => {
    const { rerender } = render(
      <GenerateForm {...defaultProps} config={{ temperature: 0.3 }} />
    )

    expect(screen.getByText('0.3')).toBeInTheDocument()

    rerender(
      <GenerateForm {...defaultProps} config={{ temperature: 0.9 }} />
    )

    expect(screen.getByText('0.9')).toBeInTheDocument()
  })

  it('renders model select placeholder', () => {
    render(<GenerateForm {...defaultProps} />)
    expect(screen.getByText('agents.generate.selectModel')).toBeInTheDocument()
  })
})
