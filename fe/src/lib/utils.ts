/**
 * @fileoverview Shared utility functions for Tailwind CSS class management.
 *
 * @module lib/utils
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * @description Merges Tailwind CSS classes with proper conflict resolution using clsx for conditional classes and tailwind-merge for deduplication
 * @param {ClassValue[]} inputs - Class values (strings, arrays, objects with boolean conditions)
 * @returns {string} Merged and deduplicated class string
 *
 * @example
 * ```ts
 * cn('px-4 py-2', isActive && 'bg-blue-500', 'px-6') // 'py-2 px-6 bg-blue-500'
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
