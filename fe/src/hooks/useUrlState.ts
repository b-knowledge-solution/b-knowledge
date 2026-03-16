/**
 * @fileoverview Hook for syncing component state with URL search parameters.
 *
 * Provides a React-friendly API to read and write individual URL query params
 * with support for default values and object serialization (JSON-encoded).
 *
 * @module hooks/useUrlState
 */

import { useSearchParams } from 'react-router-dom'
import { useCallback, useRef } from 'react'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Configuration options for the useUrlState hook
 */
interface UseUrlStateOptions<T> {
  /** Default value when the param is absent from the URL */
  defaultValue: T
  /**
   * Serialization mode.
   * - `'string'` (default): stores the value as a plain string via `String()`.
   * - `'json'`: stores the value as a JSON-encoded string (for objects/arrays).
   */
  serialize?: 'string' | 'json'
}

/**
 * @description Return tuple from useUrlState, matching the useState API signature
 */
type UseUrlStateReturn<T> = [T, (value: T | ((prev: T) => T)) => void]

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Syncs a single URL search parameter with React state, supporting string and JSON serialization modes
 * @template T - The type of the state value
 * @param {string} key - The query parameter name in the URL
 * @param {UseUrlStateOptions<T>} options - Configuration including default value and serialization mode
 * @returns {UseUrlStateReturn<T>} A tuple of [currentValue, setValue] similar to useState
 *
 * @example
 * ```ts
 * const [page, setPage] = useUrlState('page', { defaultValue: 1, serialize: 'string' })
 * const [filters, setFilters] = useUrlState('filters', { defaultValue: {}, serialize: 'json' })
 * ```
 */
export function useUrlState<T>(
  key: string,
  options: UseUrlStateOptions<T>,
): UseUrlStateReturn<T> {
  const { defaultValue, serialize = 'string' } = options
  const [searchParams, setSearchParams] = useSearchParams()

  // Keep a stable ref of the default value for comparisons
  const defaultRef = useRef(defaultValue)
  defaultRef.current = defaultValue

  /**
   * Parse the raw URL param string back into the typed value.
   * Falls back to the default when the param is missing or unparseable.
   */
  const parseValue = useCallback(
    (raw: string | null): T => {
      // Param not present — return default
      if (raw === null) return defaultRef.current

      if (serialize === 'json') {
        try {
          return JSON.parse(raw) as T
        } catch {
          // Malformed JSON — fall back to default
          return defaultRef.current
        }
      }

      // For primitive types, coerce the string back to the expected type
      const def = defaultRef.current
      if (typeof def === 'number') return Number(raw) as unknown as T
      if (typeof def === 'boolean') return (raw === 'true') as unknown as T
      return raw as unknown as T
    },
    [serialize],
  )

  // Derive current value from the URL on every render
  const currentValue = parseValue(searchParams.get(key))

  /**
   * Update the URL search parameter.
   * Accepts either a direct value or a functional updater (like useState).
   */
  const setValue = useCallback(
    (valueOrUpdater: T | ((prev: T) => T)) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)

        // Resolve functional updater
        const prevValue = parseValue(prev.get(key))
        const newValue =
          typeof valueOrUpdater === 'function'
            ? (valueOrUpdater as (prev: T) => T)(prevValue)
            : valueOrUpdater

        // Serialize the value to a string
        const serialized =
          serialize === 'json'
            ? JSON.stringify(newValue)
            : String(newValue)

        // Remove param if it matches the default to keep URLs clean
        const defaultSerialized =
          serialize === 'json'
            ? JSON.stringify(defaultRef.current)
            : String(defaultRef.current)

        if (serialized === defaultSerialized) {
          next.delete(key)
        } else {
          next.set(key, serialized)
        }

        return next
      }, { replace: true })
    },
    [key, serialize, parseValue, setSearchParams],
  )

  return [currentValue, setValue]
}
