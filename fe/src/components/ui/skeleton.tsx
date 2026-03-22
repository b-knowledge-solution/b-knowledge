/**
 * @description Skeleton placeholder component for loading states.
 * Renders an animated pulse block matching the specified dimensions.
 */

import { cn } from '@/lib/utils'

/**
 * @description Renders a pulsing skeleton placeholder element for loading states
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div props including className for sizing
 * @returns {JSX.Element} Animated skeleton placeholder
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
