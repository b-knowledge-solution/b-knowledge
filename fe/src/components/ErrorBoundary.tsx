/**
 * @fileoverview Error boundary components for graceful error handling.
 *
 * Provides two exports:
 * - `ErrorBoundary` — a class-based React error boundary with a styled fallback UI.
 * - `FeatureErrorBoundary` — a wrapper that integrates with TanStack Query to
 *   clear the query cache on retry, preventing stale error states.
 *
 * @module components/ErrorBoundary
 */

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// ============================================================================
// Types
// ============================================================================

/** Props for the ErrorBoundary component */
interface ErrorBoundaryProps {
  /** Child tree to render */
  children: ReactNode
  /** Optional custom fallback renderer */
  fallback?: ((error: Error, reset: () => void) => ReactNode) | undefined
  /** Callback invoked when an error is caught */
  onError?: ((error: Error, errorInfo: ErrorInfo) => void) | undefined
  /** Optional callback to run alongside reset (e.g. cache clearing) */
  onReset?: (() => void) | undefined
}

/** Internal state for the error boundary */
interface ErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean
  /** The caught error instance */
  error: Error | null
}

// ============================================================================
// Default Fallback UI
// ============================================================================

/**
 * Styled fallback UI displayed when an error is caught.
 * Supports light and dark themes via Tailwind dark: variants.
 *
 * @param error - The error that was caught
 * @param onReset - Callback to reset the error boundary
 */
function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
      {/* Error icon */}
      <AlertTriangle className="w-16 h-16 text-yellow-500 dark:text-yellow-400 mb-4" />

      {/* Title */}
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        {t('common.errorOccurred')}
      </h2>

      {/* Error message */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-md">
        {error.message || t('common.errorOccurred')}
      </p>

      {/* Retry button */}
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      >
        <RotateCcw className="w-4 h-4" />
        {t('common.tryAgain')}
      </button>

      {/* Collapsed error details for debugging */}
      {import.meta.env.DEV && (
        <details className="mt-6 w-full max-w-lg text-left">
          <summary className="cursor-pointer text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            Error details
          </summary>
          <pre className="mt-2 p-3 text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg overflow-auto max-h-48">
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  )
}

// ============================================================================
// ErrorBoundary (Class Component)
// ============================================================================

/**
 * Class-based error boundary that catches render errors in its child tree.
 *
 * @description Wraps children in a try/catch at the React render level.
 * When an error is caught it displays either a custom fallback or the
 * default styled fallback UI. Call `reset()` to clear the error and
 * re-render the children.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  /**
   * Derive error state from a caught error.
   * @param error - The thrown error
   * @returns Updated state with the error
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  /**
   * Log the error and invoke the optional onError callback.
   * @param error - The thrown error
   * @param errorInfo - React component stack info
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Forward to optional error callback
    this.props.onError?.(error, errorInfo)

    // Log in development for easier debugging
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo)
    }
  }

  /**
   * Reset the error state so children can re-render.
   * Also invokes the optional onReset callback.
   */
  reset = (): void => {
    this.props.onReset?.()
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    const { hasError, error } = this.state
    const { children, fallback } = this.props

    // Render fallback when an error has been caught
    if (hasError && error) {
      if (fallback) {
        return fallback(error, this.reset)
      }
      return <DefaultFallback error={error} onReset={this.reset} />
    }

    return children
  }
}

// ============================================================================
// FeatureErrorBoundary (Function Wrapper)
// ============================================================================

/** Props for the FeatureErrorBoundary wrapper */
interface FeatureErrorBoundaryProps {
  /** Child tree to render */
  children: ReactNode
  /** Optional custom fallback renderer */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Optional callback invoked when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

/**
 * Feature-level error boundary that clears the TanStack Query cache on retry.
 *
 * @description Wraps the base ErrorBoundary and hooks into TanStack Query's
 * `queryClient.clear()` when the user clicks "Try again". This ensures stale
 * cached errors do not persist after a retry.
 *
 * @param children - Child tree to render
 * @param fallback - Optional custom fallback
 * @param onError - Optional error callback
 */
export function FeatureErrorBoundary({
  children,
  fallback,
  onError,
}: FeatureErrorBoundaryProps) {
  // Access the query client from the nearest QueryClientProvider
  const queryClient = useQueryClient()

  /**
   * On reset, clear all cached queries so retried fetches start fresh.
   */
  const handleReset = () => {
    queryClient.clear()
  }

  return (
    <ErrorBoundary fallback={fallback} onError={onError} onReset={handleReset}>
      {children}
    </ErrorBoundary>
  )
}
