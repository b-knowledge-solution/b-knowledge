import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * @description Card container with border, shadow, and themed background
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div attributes
 * @returns {JSX.Element} Rendered card container
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
  )
);
Card.displayName = 'Card';

/**
 * @description Card header section with vertical spacing and padding
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div attributes
 * @returns {JSX.Element} Rendered card header
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

/**
 * @description Card title rendered as h3 heading
 * @param {React.HTMLAttributes<HTMLHeadingElement>} props - Standard heading attributes
 * @returns {JSX.Element} Rendered card title
 */
const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

/**
 * @description Card subtitle/description with muted text styling
 * @param {React.HTMLAttributes<HTMLParagraphElement>} props - Standard paragraph attributes
 * @returns {JSX.Element} Rendered card description
 */
const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

/**
 * @description Card body content area with horizontal padding
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div attributes
 * @returns {JSX.Element} Rendered card content
 */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

/**
 * @description Card footer with horizontal flex layout for actions
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div attributes
 * @returns {JSX.Element} Rendered card footer
 */
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
