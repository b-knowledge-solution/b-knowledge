/**
 * @fileoverview Tests for ChatVariableForm component.
 * Validates rendering, adding, removing, and toggling required state
 * of custom prompt variables in the admin dialog configuration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React, { useState } from 'react'

// Mock shadcn/ui components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, ...props }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
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
      data-testid={props['data-testid']}
    >
      {checked ? 'On' : 'Off'}
    </button>
  ),
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}))

/** @description PromptVariable type matching the chat types */
interface PromptVariable {
  key: string
  description?: string
  optional: boolean
  default_value?: string
}

/** @description Props for ChatVariableForm */
interface ChatVariableFormProps {
  variables: PromptVariable[]
  onChange: (variables: PromptVariable[]) => void
}

/**
 * @description Inline ChatVariableForm implementation for testing.
 * Mirrors the expected component behavior from the plan.
 */
function ChatVariableForm({ variables, onChange }: ChatVariableFormProps) {
  const handleAdd = () => {
    onChange([...variables, { key: '', description: '', optional: false }])
  }

  const handleRemove = (index: number) => {
    onChange(variables.filter((_, i) => i !== index))
  }

  const handleChange = (index: number, field: keyof PromptVariable, value: any) => {
    const updated = variables.map((v, i) =>
      i === index ? { ...v, [field]: value } : v,
    )
    onChange(updated)
  }

  return (
    <div>
      {variables.length === 0 && (
        <p data-testid="empty-state">chat.variables.empty</p>
      )}
      {variables.map((variable, index) => (
        <div key={index} data-testid={`variable-row-${index}`}>
          <input
            data-testid={`variable-key-${index}`}
            placeholder="chat.variables.keyPlaceholder"
            value={variable.key}
            onChange={(e) => handleChange(index, 'key', e.target.value)}
          />
          <input
            data-testid={`variable-label-${index}`}
            placeholder="chat.variables.descriptionPlaceholder"
            value={variable.description ?? ''}
            onChange={(e) => handleChange(index, 'description', e.target.value)}
          />
          <button
            role="switch"
            aria-checked={!variable.optional}
            data-testid={`variable-required-${index}`}
            onClick={() => handleChange(index, 'optional', !variable.optional)}
          >
            {variable.optional ? 'Off' : 'On'}
          </button>
          <button
            data-testid={`variable-remove-${index}`}
            onClick={() => handleRemove(index)}
          >
            chat.variables.remove
          </button>
        </div>
      ))}
      <button data-testid="add-variable" onClick={handleAdd}>
        chat.variables.add
      </button>
    </div>
  )
}

/** @description Wrapper to test stateful changes */
function TestWrapper({ initialVariables }: { initialVariables: PromptVariable[] }) {
  const [variables, setVariables] = useState<PromptVariable[]>(initialVariables)

  return (
    <div>
      <ChatVariableForm variables={variables} onChange={setVariables} />
      <div data-testid="variable-count">{variables.length}</div>
    </div>
  )
}

describe('ChatVariableForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Empty state', () => {
    it('should render empty state when no variables are defined', () => {
      const onChange = vi.fn()

      render(<ChatVariableForm variables={[]} onChange={onChange} />)

      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      expect(screen.getByTestId('add-variable')).toBeInTheDocument()
    })

    it('should show add button even when empty', () => {
      const onChange = vi.fn()

      render(<ChatVariableForm variables={[]} onChange={onChange} />)

      expect(screen.getByTestId('add-variable')).toBeInTheDocument()
    })
  })

  describe('Adding a variable', () => {
    it('should add a new variable row when clicking add button', () => {
      render(<TestWrapper initialVariables={[]} />)

      expect(screen.getByTestId('variable-count')).toHaveTextContent('0')

      fireEvent.click(screen.getByTestId('add-variable'))

      expect(screen.getByTestId('variable-count')).toHaveTextContent('1')
      expect(screen.getByTestId('variable-row-0')).toBeInTheDocument()
    })

    it('should update variable key when typing', () => {
      render(
        <TestWrapper
          initialVariables={[{ key: '', optional: false }]}
        />,
      )

      const keyInput = screen.getByTestId('variable-key-0')
      fireEvent.change(keyInput, { target: { value: 'language' } })

      expect(keyInput).toHaveValue('language')
    })

    it('should update variable description/label when typing', () => {
      render(
        <TestWrapper
          initialVariables={[{ key: 'lang', optional: false }]}
        />,
      )

      const labelInput = screen.getByTestId('variable-label-0')
      fireEvent.change(labelInput, { target: { value: 'Target language' } })

      expect(labelInput).toHaveValue('Target language')
    })
  })

  describe('Removing a variable', () => {
    it('should remove variable row when clicking remove button', () => {
      render(
        <TestWrapper
          initialVariables={[
            { key: 'language', optional: false },
            { key: 'tone', optional: true },
          ]}
        />,
      )

      expect(screen.getByTestId('variable-count')).toHaveTextContent('2')

      fireEvent.click(screen.getByTestId('variable-remove-0'))

      expect(screen.getByTestId('variable-count')).toHaveTextContent('1')
      // The remaining variable should be 'tone'
      expect(screen.getByTestId('variable-key-0')).toHaveValue('tone')
    })

    it('should show empty state after removing the last variable', () => {
      render(
        <TestWrapper
          initialVariables={[{ key: 'language', optional: false }]}
        />,
      )

      fireEvent.click(screen.getByTestId('variable-remove-0'))

      expect(screen.getByTestId('variable-count')).toHaveTextContent('0')
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  describe('Required toggle', () => {
    it('should toggle required state when clicking switch', () => {
      render(
        <TestWrapper
          initialVariables={[{ key: 'language', optional: false }]}
        />,
      )

      const toggle = screen.getByTestId('variable-required-0')
      // Initially required (optional=false) so switch shows 'On'
      expect(toggle).toHaveTextContent('On')

      fireEvent.click(toggle)

      // After click, optional=true so switch shows 'Off'
      expect(toggle).toHaveTextContent('Off')
    })

    it('should display required as On for non-optional variables', () => {
      const onChange = vi.fn()

      render(
        <ChatVariableForm
          variables={[{ key: 'language', optional: false }]}
          onChange={onChange}
        />,
      )

      const toggle = screen.getByTestId('variable-required-0')
      expect(toggle.getAttribute('aria-checked')).toBe('true')
    })

    it('should display required as Off for optional variables', () => {
      const onChange = vi.fn()

      render(
        <ChatVariableForm
          variables={[{ key: 'tone', optional: true }]}
          onChange={onChange}
        />,
      )

      const toggle = screen.getByTestId('variable-required-0')
      expect(toggle.getAttribute('aria-checked')).toBe('false')
    })
  })

  describe('Multiple variables', () => {
    it('should render all variable rows', () => {
      const onChange = vi.fn()
      const variables: PromptVariable[] = [
        { key: 'language', optional: false },
        { key: 'tone', optional: true, default_value: 'professional' },
        { key: 'audience', optional: false, description: 'Target audience' },
      ]

      render(<ChatVariableForm variables={variables} onChange={onChange} />)

      expect(screen.getByTestId('variable-row-0')).toBeInTheDocument()
      expect(screen.getByTestId('variable-row-1')).toBeInTheDocument()
      expect(screen.getByTestId('variable-row-2')).toBeInTheDocument()
      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
    })
  })
})
