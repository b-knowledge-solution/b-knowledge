/**
 * @fileoverview Debounce hook for delaying rapid state updates.
 *
 * @module hooks/useDebounce
 */

import { useState, useEffect } from 'react';

/**
 * @description Delays updating a value until a specified time has passed since the last change, useful for search inputs and filters
 * @template T - The type of the value being debounced
 * @param {T} value - The rapidly-changing input value
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {T} The debounced value that updates only after the delay
 *
 * @example
 * ```ts
 * const [search, setSearch] = useState('')
 * const debouncedSearch = useDebounce(search, 300)
 * // debouncedSearch updates 300ms after the last setSearch call
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // Set a timer to update the debounced value after the delay
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // Clear the timer if value or delay changes before it fires
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}
