/**
 * @fileoverview Shared user hook for user info management.
 *
 * Uses TanStack Query for fetching with localStorage as initial data.
 *
 * @module hooks/useSharedUser
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

/** Backend API base URL */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const STORAGE_KEY = 'kb-user'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Shared user information structure.
 */
export interface SharedUserInfo {
  id: string
  email: string
  name?: string
  role?: string
}

/**
 * @description Return type for useSharedUser hook.
 */
interface UseSharedUserResult {
  /** Current shared user info or null */
  user: SharedUserInfo | null
  /** Whether user data is being fetched */
  isLoading: boolean
  /** Error message if fetch failed */
  error: string | null
  /** Function to refresh user data from backend */
  refresh: () => Promise<void>
  /** Function to clear shared user data */
  clear: () => void
}

// ============================================================================
// Fetcher
// ============================================================================

/**
 * @description Fetches user info from the backend and caches in localStorage.
 * @returns The shared user info or null if unauthenticated.
 */
const fetchSharedUser = async (): Promise<SharedUserInfo | null> => {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    credentials: 'include',
  })

  // Not authenticated — clear storage and return null
  if (response.status === 401) {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }

  if (!response.ok) {
    throw new Error('Failed to fetch user info')
  }

  const userData = await response.json()

  const sharedUser: SharedUserInfo = {
    id: userData.id,
    email: userData.email,
    name: userData.name,
    role: userData.role,
  }

  // Persist to localStorage for synchronous access
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sharedUser))
  return sharedUser
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * @description Hook to access user info with localStorage caching and TanStack Query.
 * @returns User state and control functions.
 */
export function useSharedUser(): UseSharedUserResult {
  const queryClient = useQueryClient()

  // Read cached user from localStorage as initial data
  const cachedUser = getSharedUserSync()

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.sharedUser.me(),
    queryFn: fetchSharedUser,
    // Use localStorage cache as initial data to avoid flash
    initialData: cachedUser,
    // Still refetch in background even with initial data
    initialDataUpdatedAt: 0,
  })

  /**
   * @description Refresh user data by invalidating the query.
   */
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.sharedUser.me() })
  }

  /**
   * @description Clear user data from cache and localStorage.
   */
  const clear = () => {
    localStorage.removeItem(STORAGE_KEY)
    queryClient.setQueryData(queryKeys.sharedUser.me(), null)
  }

  return {
    user: data ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Unknown error') : null,
    refresh,
    clear,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * @description Get user info synchronously from cache.
 * @returns Shared user info or null.
 */
export function getSharedUserSync(): SharedUserInfo | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

/**
 * @description Store user info in localStorage.
 * @param user - The user info to store.
 */
export function setSharedUser(user: SharedUserInfo): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

/**
 * @description Clear user info from localStorage.
 */
export function clearSharedUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export default useSharedUser
