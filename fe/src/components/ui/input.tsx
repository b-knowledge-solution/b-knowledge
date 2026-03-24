import * as React from 'react';
import { cn } from '@/lib/utils';

/** @description Props for the Input component extending native input attributes */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * @description Styled text input with consistent border, focus ring, and disabled states
 * @param {InputProps} props - Input props including type and className
 * @returns {JSX.Element} Rendered input element
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
