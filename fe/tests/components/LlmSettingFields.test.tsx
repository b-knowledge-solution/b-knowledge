import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LlmSettingFields } from '@/components/llm-setting-fields/LlmSettingFields'

/**
 * @description Tests for the LlmSettingFields component with presets and per-param toggles.
 */
describe('LlmSettingFields', () => {
  const defaults = {
    temperature: 0.5, temperatureEnabled: true,
    top_p: 0.85, topPEnabled: true,
    frequency_penalty: 0.3, frequencyPenaltyEnabled: true,
    presence_penalty: 0.2, presencePenaltyEnabled: true,
    max_tokens: 4096, maxTokensEnabled: true,
  }

  it('renders preset selector with Balance detected', () => {
    render(<LlmSettingFields value={defaults} onChange={vi.fn()} />)
    // Preset dropdown should show "balance" (i18n mock returns the key)
    const select = screen.getByDisplayValue(/balance/i)
    expect(select).toBeInTheDocument()
  })

  it('renders all 5 parameter sliders', () => {
    render(<LlmSettingFields value={defaults} onChange={vi.fn()} />)
    expect(screen.getAllByRole('slider')).toHaveLength(5)
  })

  it('applies preset on selection', () => {
    const onChange = vi.fn()
    render(<LlmSettingFields value={defaults} onChange={onChange} />)
    // Change preset to Precise
    fireEvent.change(screen.getByDisplayValue(/balance/i), { target: { value: 'precise' } })
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0]
    expect(call.temperature).toBe(0.2)
  })

  it('respects showFields prop to hide parameters', () => {
    render(
      <LlmSettingFields value={defaults} onChange={vi.fn()}
        showFields={['temperature', 'top_p']} />
    )
    expect(screen.getAllByRole('slider')).toHaveLength(2)
  })
})
