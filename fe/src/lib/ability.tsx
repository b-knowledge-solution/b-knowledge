/**
 * @fileoverview CASL ability integration for React.
 *
 * Provides:
 * - AbilityProvider: Fetches user permissions from backend and distributes via context
 * - Can: Declarative permission gate component from @casl/react
 * - useAppAbility: Hook to access the CASL ability instance
 *
 * The ability rules are fetched from `GET /api/auth/abilities` on mount and
 * updated whenever the auth session changes. Components can use `<Can>` or
 * the `useAppAbility()` hook to conditionally render based on permissions.
 *
 * @module lib/ability
 */

import { createContext, useContext, useState, useEffect } from 'react'
import { createMongoAbility, MongoAbility } from '@casl/ability'
import { createContextualCan } from '@casl/react'
import { useAuth } from '@/features/auth'

// ============================================================================
// Types
// ============================================================================

/** @description Available permission actions matching the backend CASL definition */
type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete'

/** @description Resource subjects that can be permission-gated */
type Subjects = 'Dataset' | 'Document' | 'ChatAssistant' | 'SearchApp' | 'User' | 'AuditLog' | 'Policy' | 'Org' | 'Project' | 'all'

/** @description CASL ability type combining actions and subjects for the app */
export type AppAbility = MongoAbility<[Actions, Subjects]>

// ============================================================================
// Context & Components
// ============================================================================

/** @description Default empty ability with no permissions -- used before rules are fetched */
const defaultAbility = createMongoAbility<[Actions, Subjects]>()

/**
 * @description React context holding the current user's CASL ability instance
 */
export const AbilityContext = createContext<AppAbility>(defaultAbility)

/**
 * @description Declarative permission gate component that conditionally renders children
 * based on the current user's CASL ability rules.
 *
 * @example
 * ```tsx
 * <Can I="create" a="Dataset">
 *   <Button>Create Dataset</Button>
 * </Can>
 * ```
 */
export const Can = createContextualCan(AbilityContext.Consumer)

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook to access the current user's CASL ability instance for imperative permission checks
 * @returns {AppAbility} The CASL ability instance with the user's permission rules
 *
 * @example
 * ```tsx
 * const ability = useAppAbility()
 * if (ability.can('create', 'Dataset')) {
 *   // show create button
 * }
 * ```
 */
export function useAppAbility(): AppAbility {
  return useContext(AbilityContext)
}

// ============================================================================
// Provider
// ============================================================================

/** Backend API base URL from environment */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

/**
 * @description Provider that fetches CASL ability rules from the backend and distributes
 * them via React context. Wraps children with AbilityContext so any descendant can use
 * the `<Can>` component or `useAppAbility()` hook for permission checks.
 *
 * Fetches rules from `GET /api/auth/abilities` when the user is authenticated.
 * On error, keeps default (no permissions) so the user sees access denied states.
 *
 * @param {{ children: React.ReactNode }} props - Children to wrap with ability context
 * @returns {JSX.Element} AbilityContext provider wrapping children
 */
export function AbilityProvider({ children }: { children: React.ReactNode }) {
  const [ability, setAbility] = useState<AppAbility>(defaultAbility)
  const { user } = useAuth()

  useEffect(() => {
    // Only fetch abilities when user is authenticated
    if (!user) {
      // Reset to default when user logs out
      setAbility(defaultAbility)
      return
    }

    async function loadAbilities() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/abilities`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          // Create a new ability instance with the rules from the backend
          setAbility(createMongoAbility<[Actions, Subjects]>(data.rules))
        }
      } catch (err) {
        // On error, keep default (no permissions) -- user will see access denied
        console.error('Failed to load abilities', err)
      }
    }

    loadAbilities()
  }, [user])

  return (
    <AbilityContext.Provider value={ability}>
      {children}
    </AbilityContext.Provider>
  )
}
