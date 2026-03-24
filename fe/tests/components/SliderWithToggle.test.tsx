import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SliderWithToggle } from '@/components/llm-setting-fields/SliderWithToggle'

/**
 * @description Tests for the SliderWithToggle shared component.
 */
describe('SliderWithToggle', () => {
  const defaults = {
    label: 'Temperature',
    value: 0.5,
    enabled: true,
    onValueChange: vi.fn(),
    onEnabledChange: vi.fn(),
    min: 0,
    max: 1,
    step: 0.01,
  }

  it('renders label and current value', () => {
    render(<SliderWithToggle {...defaults} />)
    expect(screen.getByText('Temperature')).toBeInTheDocument()
    expect(screen.getByText('0.5')).toBeInTheDocument()
  })

  it('disables slider when toggle is off', () => {
    render(<SliderWithToggle {...defaults} enabled={false} />)
    const slider = screen.getByRole('slider')
    expect(slider).toBeDisabled()
  })

  it('calls onEnabledChange when toggle clicked', () => {
    const onEnabledChange = vi.fn()
    render(<SliderWithToggle {...defaults} onEnabledChange={onEnabledChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onEnabledChange).toHaveBeenCalledWith(false)
  })
})
