/**
 * @fileoverview Checkbox component following shadcn/ui conventions.
 * Uses native HTML checkbox with Tailwind styling (no Radix dependency).
 *
 * @module components/ui/checkbox
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

/**
 * @description Props for the Checkbox component
 */
interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Whether the checkbox is checked */
  checked?: boolean
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void
}

/**
 * @description Styled checkbox component with consistent theming and dark mode support
 * @param {CheckboxProps} props - Checkbox configuration
 * @returns {JSX.Element} Rendered checkbox input
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    return (
      <label className="relative inline-flex items-center">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={(e) => {
            onChange?.(e)
            onCheckedChange?.(e.target.checked)
          }}
          className="peer sr-only"
          {...props}
        />
        <div
          className={cn(
            'h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 peer-checked:bg-primary peer-checked:text-primary-foreground flex items-center justify-center',
            className,
          )}
        >
          {checked && <Check className="h-3 w-3" />}
        </div>
      </label>
    )
  },
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
