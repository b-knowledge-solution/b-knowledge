/**
 * @fileoverview Custom radio group component.
 * 
 * Wraps Headless UI RadioGroup with grid-based styling.
 * Supports icons, descriptions, and configurable column layouts.
 * Used for settings selection (language, theme).
 * 
 * @module components/RadioGroup
 */

import { Radio, RadioGroup as HeadlessRadioGroup, Label, Description, Field } from '@headlessui/react';
import { Check } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

/** Option item for the radio group */
interface RadioOption {
    /** Unique value for the option */
    value: string;
    /** Display label for the option */
    label: string;
    /** Optional icon (emoji or React node) */
    icon?: string | React.ReactNode;
    /** Optional description text */
    description?: string;
}

/** Props for RadioGroup component */
interface RadioGroupProps {
    /** Currently selected value */
    value: string;
    /** Callback when selection changes */
    onChange: (value: string) => void;
    /** Array of available options */
    options: RadioOption[];
    /** Number of columns in the grid (1-4) */
    columns?: number;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Grid-based radio group with styled option cards, icons, and check indicators
 * @param {RadioGroupProps} props - Selected value, change handler, options, and grid configuration
 * @returns {JSX.Element} Rendered radio group with grid layout option cards
 */
export function RadioGroup({
    value,
    onChange,
    options,
    columns = 3,
    className = ''
}: RadioGroupProps) {
    // Map column count to Tailwind grid class
    const gridCols = {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-4',
    }[columns] || 'grid-cols-3';

    return (
        <HeadlessRadioGroup value={value} onChange={onChange} className={className}>
            <div className={`grid ${gridCols} gap-2`}>
                {options.map((option) => (
                    <Field key={option.value}>
                        <Radio
                            value={option.value}
                            className={({ checked }: { checked: boolean }) =>
                                `relative flex flex-col items-center p-3 rounded-lg border-2 transition-all cursor-pointer ${checked
                                    ? 'border-primary bg-primary/10 dark:bg-primary/20'
                                    : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                                }`
                            }
                        >
                            {({ checked }: { checked: boolean }) => (
                                <>
                                    {option.icon && (
                                        <span className="text-2xl mb-1">
                                            {typeof option.icon === 'string' ? option.icon : option.icon}
                                        </span>
                                    )}
                                    <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                        {option.label}
                                    </Label>
                                    {option.description && (
                                        <Description className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            {option.description}
                                        </Description>
                                    )}
                                    {checked && (
                                        <div className="absolute top-2 right-2">
                                            <Check size={16} className="text-primary" />
                                        </div>
                                    )}
                                </>
                            )}
                        </Radio>
                    </Field>
                ))}
            </div>
        </HeadlessRadioGroup>
    );
}
