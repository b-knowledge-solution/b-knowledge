/**
 * @fileoverview Theme-aware radial spotlight background effect component.
 * Renders a blurred radial gradient overlay that adapts to light/dark mode.
 * @module components/Spotlight
 */

import { cn } from '@/lib/utils'
import { useSettings } from '@/app/contexts/SettingsContext'

/**
 * @description Props for the Spotlight component
 */
interface SpotlightProps {
  /** Additional CSS classes for the outer container */
  className?: string
  /** Gradient opacity (0-1). Default 0.5 */
  opacity?: number
  /** Gradient coverage radius as percentage. Default 60 */
  coverage?: number
  /** Horizontal center of the gradient. Default '50%' */
  x?: string
  /** Vertical center of the gradient. Default '190%' */
  y?: string
  /** Override RGB color string (e.g., '255, 255, 255'). Auto-detects theme if omitted */
  color?: string
}

/**
 * @description Renders a theme-aware radial spotlight effect as a background overlay.
 * Uses backdrop blur and a radial gradient that fades from the specified color to transparent.
 * Automatically picks white for dark mode and light blue for light mode unless overridden.
 * @param {SpotlightProps} props - Spotlight configuration including position, color, and intensity
 * @returns {JSX.Element} Rendered spotlight overlay element
 */
export function Spotlight({ className, opacity = 0.5, coverage = 60, x = '50%', y = '190%', color }: SpotlightProps) {
  const { isDarkMode } = useSettings()

  // Use white in dark mode for a soft glow, light blue in light mode for subtle warmth
  const rgb = color ?? (isDarkMode ? '255, 255, 255' : '194, 221, 243')

  return (
    <div
      className={cn('absolute inset-0 rounded-lg', className)}
      style={{ backdropFilter: 'blur(30px)', zIndex: -1, pointerEvents: 'none' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at ${x} ${y}, rgba(${rgb},${opacity}) 0%, rgba(${rgb},0) ${coverage}%)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
