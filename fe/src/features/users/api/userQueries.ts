/**
 * @fileoverview TanStack Query hooks for user management.
 * Provides query and mutation hooks for users, roles, permissions, and shared user state.
 * @module features/users/api/userQueries
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userApi } from './userApi'
import type { User } from '@/features/auth'
import type { IpHistoryMap } from '../types/user.types'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// useUserManagement
// ============================================================================

/**
 * @description Role filter type for user management.
 */
export type RoleFilter = 'all' | 'admin' | 'leader' | 'user'

/**
 * @description Return type for the useUserManagement hook.
 */
export interface UseUserManagementReturn {
    /** All users */
    users: User[]
    /** Loading state */
    isLoading: boolean
    /** Error message */
    error: string | null
    /** Search query */
    searchQuery: string
    /** Set search query */
    setSearchQuery: (q: string) => void
    /** Role filter */
    roleFilter: RoleFilter
    /** Set role filter */
    setRoleFilter: (f: RoleFilter) => void
    /** Department filter */
    departmentFilter: string
    /** Set department filter */
    setDepartmentFilter: (d: string) => void
    /** Unique department names */
    departments: string[]
    /** Filtered + paginated users */
    paginatedUsers: User[]
    /** Total filtered count */
    filteredCount: number
    /** Current page */
    currentPage: number
    /** Page size */
    pageSize: number
    /** Handle pagination change */
    handlePaginationChange: (page: number, size: number) => void
    /** IP history map */
    ipHistoryMap: IpHistoryMap
    /** Role mutation */
    updateRole: (userId: string, role: string) => void
    /** Role mutation loading */
    isUpdatingRole: boolean
    /** Permission mutation */
    updatePermissions: (userId: string, permissions: string[]) => void
    /** Permission mutation loading */
    isUpdatingPermissions: boolean
    /** Update local user state after mutation */
    setUsers: React.Dispatch<React.SetStateAction<User[]>>
}

/**
 * @description Hook for user management with CRUD, filtering, pagination, and mutations.
 * Filters are persisted in URL search params for bookmarkability.
 * @returns {UseUserManagementReturn} User management state and handlers.
 */
export const useUserManagement = (): UseUserManagementReturn => {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [searchParams, setSearchParams] = useSearchParams()

    // Read filter state from URL search params with defaults
    const searchQuery = searchParams.get('q') || ''
    const roleFilter = (searchParams.get('role') || 'all') as RoleFilter
    const departmentFilter = searchParams.get('dept') || 'all'
    const currentPage = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('size') || '20')

    // Local state for optimistic user updates
    const [localUsers, setLocalUsers] = useState<User[] | null>(null)

    /**
     * @description Helper to update a single URL search param while preserving others.
     * @param key - The param key to set.
     * @param value - The param value.
     * @param resetPage - Whether to reset page to 1 on change.
     */
    const updateParam = (key: string, value: string, resetPage = false) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            next.set(key, value)
            if (resetPage) next.set('page', '1')
            return next
        })
    }

    /** @description Set the search query param. */
    const setSearchQuery = (q: string) => updateParam('q', q, true)

    /** @description Set the role filter param. */
    const setRoleFilter = (f: RoleFilter) => updateParam('role', f, true)

    /** @description Set the department filter param. */
    const setDepartmentFilter = (d: string) => updateParam('dept', d, true)

    /** @description Handle pagination changes via URL params. */
    const handlePaginationChange = (page: number, size: number) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            next.set('page', String(page))
            next.set('size', String(size))
            return next
        })
    }

    // Fetch all users via TanStack Query
    const usersQuery = useQuery({
        queryKey: queryKeys.users.list(),
        queryFn: () => userApi.getUsers(),
    })

    // Fetch IP history via TanStack Query
    const ipHistoryQuery = useQuery({
        queryKey: queryKeys.users.ipHistory(),
        queryFn: () => userApi.getIpHistory(),
    })

    // Use local optimistic state if set, otherwise query data
    const users = localUsers ?? usersQuery.data ?? []

    /** @description Unique departments extracted from the user list. */
    const departments = Array.from(new Set(users.map(u => u.department).filter(Boolean))) as string[]

    /** @description Users filtered by search, role, and department. */
    const filteredUsers = users.filter(user => {
        const searchLower = searchQuery.toLowerCase()
        // Match against display name, email, or department
        const matchesSearch =
            (user.displayName?.toLowerCase() || '').includes(searchLower) ||
            (user.email?.toLowerCase() || '').includes(searchLower) ||
            (user.department?.toLowerCase() || '').includes(searchLower)
        // Match role filter
        const matchesRole = roleFilter === 'all' || user.role === roleFilter
        // Match department filter
        const matchesDepartment = departmentFilter === 'all' || user.department === departmentFilter
        return matchesSearch && matchesRole && matchesDepartment
    })

    /** @description Paginated slice of filtered users. */
    const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    // Role mutation with cache invalidation
    const updateRoleMutation = useMutation({
        mutationKey: ['update', 'user', 'role'],
        mutationFn: ({ userId, role }: { userId: string; role: string }) =>
            userApi.updateUserRole(userId, role),
        onSuccess: (_data, variables) => {
            // Optimistically update the local user list
            setLocalUsers(prev => (prev ?? users).map(u =>
                u.id === variables.userId ? { ...u, role: variables.role as any } : u
            ))
            // Invalidate to refetch in background
            queryClient.invalidateQueries({ queryKey: queryKeys.users.list() })
        },
        meta: { successMessage: t('userManagement.roleUpdateSuccess') },
    })

    // Permission mutation with cache invalidation
    const updatePermissionsMutation = useMutation({
        mutationKey: ['update', 'user', 'permissions'],
        mutationFn: ({ userId, permissions }: { userId: string; permissions: string[] }) =>
            userApi.updateUserPermissions(userId, permissions),
        onSuccess: (_data, variables) => {
            // Optimistically update the local user list
            setLocalUsers(prev => (prev ?? users).map(u =>
                u.id === variables.userId ? { ...u, permissions: variables.permissions } : u
            ))
            // Invalidate to refetch in background
            queryClient.invalidateQueries({ queryKey: queryKeys.users.list() })
        },
        meta: { successMessage: t('userManagement.permissionsUpdateSuccess') },
    })

    return {
        users,
        isLoading: usersQuery.isLoading,
        error: usersQuery.error ? (usersQuery.error instanceof Error ? usersQuery.error.message : t('userManagement.error')) : null,
        searchQuery,
        setSearchQuery,
        roleFilter,
        setRoleFilter,
        departmentFilter,
        setDepartmentFilter,
        departments,
        paginatedUsers,
        filteredCount: filteredUsers.length,
        currentPage,
        pageSize,
        handlePaginationChange,
        ipHistoryMap: ipHistoryQuery.data ?? {},
        updateRole: (userId, role) => updateRoleMutation.mutate({ userId, role }),
        isUpdatingRole: updateRoleMutation.isPending,
        updatePermissions: (userId, permissions) => updatePermissionsMutation.mutate({ userId, permissions }),
        isUpdatingPermissions: updatePermissionsMutation.isPending,
        setUsers: setLocalUsers as React.Dispatch<React.SetStateAction<User[]>>,
    }
}

// ============================================================================
// useSharedUser
// ============================================================================

/** Backend API base URL */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const STORAGE_KEY = 'kb-user'

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
