/**
 * @fileoverview Custom checkbox component.
 * 
 * Wraps Headless UI Switch for accessible checkbox functionality.
 * Styled as a traditional checkbox with check icon.
 * Supports optional label.
 * 
 * @module components/Checkbox
 */

import { Switch } from '@headlessui/react';
import { Check } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

/** Props for Checkbox component */
interface CheckboxProps {
    /** Whether the checkbox is checked */
    checked: boolean;
    /** Callback when checked state changes */
    onChange: (checked: boolean) => void;
    /** Optional label text */
    label?: string;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Accessible checkbox component with custom styling using Headless UI Switch
 * @param {CheckboxProps} props - Checkbox configuration including checked state, change handler, and optional label
 * @returns {JSX.Element} Rendered checkbox with optional label
 */
export function Checkbox({ checked, onChange, label, className = '' }: CheckboxProps) {
    return (
        <Switch.Group>
            <div className={`flex items-center gap-2 ${className}`}>
                <Switch
                    checked={checked}
                    onChange={onChange}
                    // Apply primary color when checked, neutral border when unchecked
                    className={`relative inline-flex h-4 w-4 items-center justify-center rounded border-2 transition-colors ${checked
                            ? 'bg-primary border-primary'
                            : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                        }`}
                >
                        {/* Show check icon only when selected */}
                    {checked && <Check size={12} className="text-white" strokeWidth={3} />}
                </Switch>
                {/* Render optional clickable label beside checkbox */}
                {label && (
                    <Switch.Label className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                        {label}
                    </Switch.Label>
                )}
            </div>
        </Switch.Group>
    );
}
