import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MetadataFilterEditor } from '@/components/metadata-filter/MetadataFilterEditor'

/**
 * @description Tests for the MetadataFilterEditor component.
 */
describe('MetadataFilterEditor', () => {
  it('renders empty state with add button', () => {
    render(
      <MetadataFilterEditor
        value={{ logic: 'and', conditions: [] }}
        onChange={vi.fn()}
      />
    )
    // i18n mock returns the key
    expect(screen.getByText('metadataFilter.addCondition')).toBeInTheDocument()
  })

  it('adds a condition when add button clicked', () => {
    const onChange = vi.fn()
    render(
      <MetadataFilterEditor
        value={{ logic: 'and', conditions: [] }}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('metadataFilter.addCondition'))
    expect(onChange).toHaveBeenCalledWith({
      logic: 'and',
      conditions: [{ name: '', comparison_operator: 'is', value: '' }],
    })
  })

  it('shows logic selector when 2+ conditions exist', () => {
    render(
      <MetadataFilterEditor
        value={{
          logic: 'and',
          conditions: [
            { name: 'type', comparison_operator: 'is', value: 'pdf' },
            { name: 'size', comparison_operator: 'gt', value: 1000 },
          ],
        }}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue('and')).toBeInTheDocument()
  })
})
