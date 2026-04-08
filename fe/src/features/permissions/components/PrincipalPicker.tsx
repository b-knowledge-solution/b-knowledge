/**
 * @fileoverview PrincipalPicker — combined search across users, teams, and roles
 * with type-filter chips. Used by the resource grant editor (D-06).
 *
 * @module features/permissions/components/PrincipalPicker
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { userApi } from '@/features/users/api/userApi'
import { teamApi } from '@/features/teams/api/teamApi'
import { UserRole } from '@/constants/roles'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Type constants (no bare strings per CLAUDE.md no-hardcoded-strings rule)
// ============================================================================

/** @description Principal type literal — a user. */
export const PRINCIPAL_TYPE_USER = 'user' as const
/** @description Principal type literal — a team. */
export const PRINCIPAL_TYPE_TEAM = 'team' as const
/** @description Principal type literal — a role. */
export const PRINCIPAL_TYPE_ROLE = 'role' as const

/** @description Union of supported principal types. */
export type PrincipalType =
  | typeof PRINCIPAL_TYPE_USER
  | typeof PRINCIPAL_TYPE_TEAM
  | typeof PRINCIPAL_TYPE_ROLE

/** @description "All" filter chip sentinel. */
export const FILTER_ALL = 'all' as const
type FilterChip = typeof FILTER_ALL | PrincipalType

const FILTER_CHIPS: readonly FilterChip[] = [
  FILTER_ALL,
  PRINCIPAL_TYPE_USER,
  PRINCIPAL_TYPE_TEAM,
  PRINCIPAL_TYPE_ROLE,
] as const

// ============================================================================
// Public types
// ============================================================================

/**
 * @description A principal selectable in the picker.
 */
export interface Principal {
  type: PrincipalType
  id: number | string
  label: string
  sublabel?: string
}

/** @description Props for {@link PrincipalPicker}. */
export interface PrincipalPickerProps {
  /** Called when the admin selects a principal row. */
  onSelect: (p: Principal) => void
  /** `${type}:${id}` keys to hide (e.g. principals already granted). */
  excludeIds?: string[]
}

// ============================================================================
// Roles source — derived from the shared `UserRole` constants, never hardcoded
// ============================================================================

/**
 * @description Canonical role principals available as grantees. Sourced from
 * the shared `UserRole` constants — bare role string literals are forbidden
 * in this file by the project no-hardcoded-strings rule.
 */
export const ROLE_PRINCIPALS: ReadonlyArray<{ id: string; label: string }> = [
  // Excludes USER (legacy alias of MEMBER); admins grant against canonical roles only
  { id: UserRole.SUPER_ADMIN, label: UserRole.SUPER_ADMIN },
  { id: UserRole.ADMIN, label: UserRole.ADMIN },
  { id: UserRole.LEADER, label: UserRole.LEADER },
  { id: UserRole.MEMBER, label: UserRole.MEMBER },
]

// ============================================================================
// Pure helpers (exported for unit testing without rendering the component)
// ============================================================================

/** @description Lightweight user shape consumed by {@link buildPrincipalList}. */
export interface PickerUser {
  id: number | string
  displayName?: string
  name?: string
  email?: string
}

/** @description Lightweight team shape consumed by {@link buildPrincipalList}. */
export interface PickerTeam {
  id: number | string
  name: string
}

/**
 * @description Merge users, teams, and roles into a single principal list.
 * Pure function — no React, easy to unit test.
 * @param {PickerUser[]} users - Source users.
 * @param {PickerTeam[]} teams - Source teams.
 * @returns {Principal[]} Merged principal list with type tags.
 */
export function buildPrincipalList(users: PickerUser[], teams: PickerTeam[]): Principal[] {
  return [
    ...users.map<Principal>((u) => {
      const base: Principal = {
        type: PRINCIPAL_TYPE_USER,
        id: u.id,
        label: u.displayName || u.name || u.email || String(u.id),
      }
      // Only attach sublabel when defined (exactOptionalPropertyTypes is strict)
      return u.email ? { ...base, sublabel: u.email } : base
    }),
    ...teams.map<Principal>((tm) => ({
      type: PRINCIPAL_TYPE_TEAM,
      id: tm.id,
      label: tm.name,
    })),
    ...ROLE_PRINCIPALS.map<Principal>((r) => ({
      type: PRINCIPAL_TYPE_ROLE,
      id: r.id,
      label: r.label,
    })),
  ]
}

/**
 * @description Apply exclude / chip / query filters to a principal list.
 * Pure function — mirrors the in-component filter chain.
 * @param {Principal[]} principals - Source list (typically from `buildPrincipalList`).
 * @param {object} opts - Filter options.
 * @param {Set<string>} opts.excluded - `${type}:${id}` keys to drop.
 * @param {FilterChip} opts.filter - Active chip.
 * @param {string} opts.query - Case-insensitive substring filter on label.
 * @returns {Principal[]} Filtered subset.
 */
export function filterPrincipals(
  principals: Principal[],
  opts: { excluded: Set<string>; filter: FilterChip; query: string }
): Principal[] {
  const lowered = opts.query.toLowerCase()
  return principals
    .filter((p) => !opts.excluded.has(`${p.type}:${p.id}`))
    .filter((p) => opts.filter === FILTER_ALL || p.type === opts.filter)
    .filter((p) => p.label.toLowerCase().includes(lowered))
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Combined search picker that intermixes users, teams, and roles
 * with type-filter chips. Single search input filters by label substring
 * (case-insensitive). Uses shadcn `Command` primitive (D-06).
 * @param {PrincipalPickerProps} props - Selection callback and optional exclusions.
 * @returns {JSX.Element} Rendered command palette with chips and result list.
 */
export function PrincipalPicker({ onSelect, excludeIds = [] }: PrincipalPickerProps) {
  const { t } = useTranslation()

  // Fetch users and teams via the existing API services. Cached at query-key level
  // so opening the picker repeatedly doesn't refetch.
  const { data: users = [] } = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => userApi.getUsers(),
  })
  const { data: teams = [] } = useQuery({
    queryKey: queryKeys.teams.list(),
    queryFn: () => teamApi.getTeams(),
  })

  // Local UI state — active chip and search query
  const [filter, setFilter] = useState<FilterChip>(FILTER_ALL)
  const [query, setQuery] = useState('')

  // Merge sources into a single principal list with type tags, then filter
  const merged = buildPrincipalList(users, teams)
  const filtered = filterPrincipals(merged, {
    excluded: new Set(excludeIds),
    filter,
    query,
  })

  return (
    <Command shouldFilter={false} className="border rounded-md dark:border-slate-700">
      {/* Type filter chip row */}
      <div className="flex gap-2 p-2 border-b dark:border-slate-700">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setFilter(chip)}
            className={cn(
              'px-2 py-1 text-xs rounded-md border transition-colors',
              filter === chip
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-accent dark:bg-slate-800 dark:hover:bg-slate-700'
            )}
            data-testid={`chip-${chip}`}
          >
            {t(`permissions.admin.picker.chip.${chip}`)}
          </button>
        ))}
      </div>

      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('permissions.admin.picker.searchPlaceholder')}
      />
      <CommandList>
        <CommandEmpty>{t('permissions.admin.picker.empty')}</CommandEmpty>
        {filtered.map((p) => (
          <CommandItem
            key={`${p.type}:${p.id}`}
            value={`${p.type}:${p.id}:${p.label}`}
            onSelect={() => onSelect(p)}
            data-testid={`principal-${p.type}-${p.id}`}
          >
            {/* Inline type badge — uses i18n label so locales control casing */}
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium uppercase rounded bg-muted text-muted-foreground dark:bg-slate-700">
              {t(`permissions.admin.picker.type.${p.type}`)}
            </span>
            <span className="text-sm">{p.label}</span>
            {p.sublabel && (
              <span className="text-xs text-muted-foreground ml-auto">{p.sublabel}</span>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
}
