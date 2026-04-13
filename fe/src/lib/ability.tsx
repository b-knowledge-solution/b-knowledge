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

/**
 * @description Resource subjects that can be permission-gated. Aligned with BE ability.service.ts Subjects union (Phase 4).
 *
 * Phase 4 (D-03): drop legacy `Project`, add new BE-aligned entities
 * (`KnowledgeBase`, `Agent`, `Memory`, `DocumentCategory`). Atomic single-commit
 * swap — no transition window where both old and new are valid.
 */
type Subjects =
  | 'Dataset'
  | 'Document'
  | 'ChatAssistant'
  | 'SearchApp'
  | 'User'
  | 'AuditLog'
  | 'Policy'
  | 'Org'
  | 'KnowledgeBase'
  | 'Agent'
  | 'Memory'
  | 'DocumentCategory'
  | 'all'

/** @description CASL ability type combining actions and subjects for the app */
export type AppAbility = MongoAbility<[Actions, Subjects]>

/**
 * @description Ability context payload combining the CASL instance with its
 * loading state so route guards can distinguish "not loaded yet" from
 * "loaded and denied".
 */
interface AbilityContextValue {
  ability: AppAbility
  isLoading: boolean
}

// ============================================================================
// Context & Components
// ============================================================================

/** @description Default empty ability with no permissions -- used before rules are fetched */
const defaultAbility = createMongoAbility<[Actions, Subjects]>()

/**
 * @description React context that exposes only the CASL ability instance for
 * `@casl/react` consumers such as `<Can>`.
 */
const AbilityInstanceContext = createContext<AppAbility>(defaultAbility)

/**
 * @description React context holding the current user's CASL ability instance
 * and the current backend-loading state.
 */
export const AbilityContext = createContext<AbilityContextValue>({
  ability: defaultAbility,
  isLoading: false,
})

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
export const Can = createContextualCan(
  AbilityInstanceContext.Consumer,
)

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
  return useContext(AbilityContext).ability
}

/**
 * @description Hook exposing whether authenticated ability rules are still loading.
 * @returns {boolean} True while `/api/auth/abilities` is in flight for the current session.
 */
export function useAbilityLoading(): boolean {
  return useContext(AbilityContext).isLoading
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
  const [loadedAbilityScope, setLoadedAbilityScope] = useState<string | null>(null)
  const { user } = useAuth()
  const currentAbilityScope = user ? `${user.id}:${user.email}` : null
  const isLoading = currentAbilityScope !== null && loadedAbilityScope !== currentAbilityScope

  useEffect(() => {
    // Only fetch abilities when user is authenticated
    if (!user) {
      // Reset to default when user logs out
      setAbility(defaultAbility)
      setLoadedAbilityScope(null)
      return
    }

    let isCancelled = false

    async function loadAbilities() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/abilities`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          // Create a new ability instance with the rules from the backend
          if (!isCancelled) {
            setAbility(createMongoAbility<[Actions, Subjects]>(data.rules))
          }
        }
      } catch (err) {
        // On error, keep default (no permissions) -- user will see access denied
        console.error('Failed to load abilities', err)
      } finally {
        if (!isCancelled) {
          setLoadedAbilityScope(currentAbilityScope)
        }
      }
    }

    loadAbilities()

    return () => {
      isCancelled = true
    }
  }, [currentAbilityScope, user])

  return (
    <AbilityInstanceContext.Provider value={ability}>
      <AbilityContext.Provider value={{ ability, isLoading }}>
        {children}
      </AbilityContext.Provider>
    </AbilityInstanceContext.Provider>
  )
}
