/**
 * @fileoverview ResourceGrantEditor — shared internal grant editor used by
 * KnowledgeBasePermissionModal and EntityPermissionModal. Renders the existing
 * grants for a `(resource_type, resource_id)` pair above an Add-grant form
 * powered by {@link PrincipalPicker}. Per D-07 / D-08.
 *
 * @module features/permissions/components/ResourceGrantEditor
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { globalMessage } from '@/lib/globalMessage'
import { PERMISSION_KEYS } from '@/constants/permission-keys'
import {
  useGrants,
  useCreateGrant,
  useDeleteGrant,
} from '@/features/permissions/api/permissionsQueries'
import {
  GRANT_RESOURCE_KNOWLEDGE_BASE,
  GRANT_RESOURCE_DOCUMENT_CATEGORY,
  type CreateGrantBody,
  type GrantResourceType,
  type ResourceGrant,
} from '@/features/permissions/types/permissions.types'
import { PrincipalPicker, type Principal } from './PrincipalPicker'

// ============================================================================
// Constants — local aliases of the canonical type literals
// ============================================================================

/** @description Whole-knowledge-base scope literal. */
export const SCOPE_KB: GrantResourceType = GRANT_RESOURCE_KNOWLEDGE_BASE
/** @description Specific-document-category scope literal. */
export const SCOPE_CATEGORY: GrantResourceType = GRANT_RESOURCE_DOCUMENT_CATEGORY

/**
 * @description Default actions array attached to a freshly-created grant.
 *
 * IOU: For the initial Phase 5 ship we hardcode `KNOWLEDGE_BASE_VIEW`. A
 * multi-action picker is intentionally deferred — see plan 5.3 §research §4.
 */
export const DEFAULT_GRANT_ACTIONS: readonly string[] = [PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW]

// ============================================================================
// Pure helper (exported for testing)
// ============================================================================

/**
 * @description Build the `POST /api/permissions/grants` request body for a
 * (scope, resource, principal) triple. Pure function — no React state.
 *
 * Note: `knowledge_base_id` is populated when scope is `DocumentCategory` so
 * the BE can scope cache invalidation to the owning KB. The column is now
 * nullable per migration 5.0a, but we still prefer to send it when known.
 *
 * @param {object} args - Build inputs.
 * @param {GrantResourceType} args.scope - Resource type literal.
 * @param {string} args.resourceId - Resource id (kb id or category id).
 * @param {number | null | undefined} args.kbId - Owning KB id when scope is Category.
 * @param {Principal} args.principal - Selected grantee.
 * @returns {CreateGrantBody} Body ready for `permissionsApi.createGrant`.
 */
export function buildCreateGrantBody(args: {
  scope: GrantResourceType
  resourceId: string
  kbId?: number | null
  principal: Principal
}): CreateGrantBody {
  return {
    resource_type: args.scope,
    resource_id: args.resourceId,
    knowledge_base_id: args.scope === SCOPE_CATEGORY ? (args.kbId ?? null) : null,
    grantee_type: args.principal.type,
    grantee_id: args.principal.id,
    actions: [...DEFAULT_GRANT_ACTIONS],
  }
}

// ============================================================================
// Public types
// ============================================================================

/** @description Props for {@link ResourceGrantEditor}. */
export interface ResourceGrantEditorProps {
  /** Active scope (KnowledgeBase or DocumentCategory). */
  scope: GrantResourceType
  /** Resource identifier (KB id or DocumentCategory id) as a string. */
  resourceId: string
  /** Owning knowledge base id — required when scope is DocumentCategory. */
  kbId?: number | null
  /** When true, render an internal scope toggle. Defaults to false (modal owns it). */
  allowScopeToggle?: boolean
  /** Called when the (optional) internal scope toggle changes. */
  onScopeChange?: (scope: GrantResourceType) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Shared resource grant editor. Lists existing grants for the
 * `(scope, resourceId)` pair with × remove buttons, then renders an Add form
 * embedding {@link PrincipalPicker}. Every successful mutation fires the R-10
 * session-refresh toast (D-09).
 *
 * Controlled component: parents own scope state — see modal-owned scope toggle
 * in `KnowledgeBasePermissionModal` (D-08, iteration-2 fix).
 *
 * @param {ResourceGrantEditorProps} props - Editor configuration.
 * @returns {JSX.Element} Rendered grant editor surface.
 */
export function ResourceGrantEditor({
  scope,
  resourceId,
  kbId,
  allowScopeToggle = false,
  onScopeChange,
}: ResourceGrantEditorProps) {
  const { t } = useTranslation()

  // Fetch existing grants for the active resource
  const { data: grants = [], isLoading } = useGrants(scope, resourceId)
  const createMut = useCreateGrant()
  const deleteMut = useDeleteGrant()

  // Local UI state — selected principal pending Add
  const [selected, setSelected] = useState<Principal | null>(null)

  /**
   * @description Submit a create-grant request for the currently selected principal.
   */
  const handleAdd = async () => {
    // Guard: nothing selected or no resource yet
    if (!selected || !resourceId) return

    try {
      const body = buildCreateGrantBody({ scope, resourceId, kbId: kbId ?? null, principal: selected })
      await createMut.mutateAsync(body)
      // R-10 toast — affected users won't see changes until next request
      globalMessage.success(t('permissions.admin.sessionRefreshNotice'))
      setSelected(null)
    } catch (err) {
      console.error('[ResourceGrantEditor] add grant failed:', err)
      globalMessage.error(t('permissions.admin.grants.addError'))
    }
  }

  /**
   * @description Delete an existing grant row by id.
   * @param {ResourceGrant} grant - Row to remove.
   */
  const handleRemove = async (grant: ResourceGrant) => {
    try {
      await deleteMut.mutateAsync({
        id: grant.id,
        resourceType: scope,
        resourceId,
      })
      globalMessage.success(t('permissions.admin.sessionRefreshNotice'))
    } catch (err) {
      console.error('[ResourceGrantEditor] remove grant failed:', err)
      globalMessage.error(t('permissions.admin.grants.removeError'))
    }
  }

  return (
    <div className="space-y-4">
      {/* Optional internal scope toggle — disabled by default; modals own scope. */}
      {allowScopeToggle && (
        <div className="flex gap-2 border-b pb-2 dark:border-slate-700">
          <button
            type="button"
            onClick={() => onScopeChange?.(SCOPE_KB)}
            className={
              scope === SCOPE_KB
                ? 'px-2 py-1 text-xs font-medium border-b-2 border-primary'
                : 'px-2 py-1 text-xs text-muted-foreground'
            }
          >
            {t('permissions.admin.grants.scopeKb')}
          </button>
          <button
            type="button"
            onClick={() => onScopeChange?.(SCOPE_CATEGORY)}
            className={
              scope === SCOPE_CATEGORY
                ? 'px-2 py-1 text-xs font-medium border-b-2 border-primary'
                : 'px-2 py-1 text-xs text-muted-foreground'
            }
          >
            {t('permissions.admin.grants.scopeCategory')}
          </button>
        </div>
      )}

      {/* Current grants list */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {t('permissions.admin.grants.currentGrants')}
        </h4>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
        ) : grants.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('permissions.admin.grants.empty')}</p>
        ) : (
          <ul className="border rounded-md divide-y dark:border-slate-700 dark:divide-slate-700">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
                data-testid={`grant-row-${g.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium uppercase rounded bg-muted text-muted-foreground dark:bg-slate-700">
                    {t(`permissions.admin.picker.type.${g.grantee_type}`)}
                  </span>
                  <span>{String(g.grantee_id)}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.actions.join(', ')}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleRemove(g)}
                  aria-label={t('common.delete')}
                  data-testid={`grant-remove-${g.id}`}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add grant form */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {t('permissions.admin.grants.addGrant')}
        </h4>
        <PrincipalPicker
          onSelect={setSelected}
          excludeIds={grants.map((g) => `${g.grantee_type}:${g.grantee_id}`)}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {selected
              ? `${t(`permissions.admin.picker.type.${selected.type}`)}: ${selected.label}`
              : ''}
          </span>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!selected || createMut.isPending}
            data-testid="grant-add-button"
          >
            {t('permissions.admin.grants.addButton')}
          </Button>
        </div>
      </div>
    </div>
  )
}
