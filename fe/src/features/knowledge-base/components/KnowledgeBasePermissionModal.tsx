/**
 * KnowledgeBasePermissionModal — Phase 5 P5.3 rewrite.
 *
 * Grants flow through `/api/permissions/grants` via `<ResourceGrantEditor>`.
 * The `is_private` Public/Private toggle is preserved as a dual-write to the
 * KB record for backward compat with existing UI that reads `kb.is_private`
 * (see 5-RESEARCH.md §13 #8). Per-tab UI flags table (`knowledge_base_permissions`)
 * is intentionally untouched per TS1 — its existing rows continue to be read
 * by legacy consumers, but new changes happen via `resource_grants` only.
 *
 * Modal owns the KB-vs-Category scope state per D-08 / iteration-2 fix.
 *
 * @description Edit a knowledge base's public/private status and resource grants.
 */
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Globe } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { globalMessage } from '@/lib/globalMessage'
import { cn } from '@/lib/utils'
import { ResourceGrantEditor } from '@/features/permissions/components/ResourceGrantEditor'
import {
  GRANT_RESOURCE_KNOWLEDGE_BASE,
  GRANT_RESOURCE_DOCUMENT_CATEGORY,
  type GrantResourceType,
} from '@/features/permissions/types/permissions.types'
import {
  updateKnowledgeBase,
  type KnowledgeBase,
} from '../api/knowledgeBaseApi'

// ============================================================================
// Local scope literal aliases (avoid bare strings per CLAUDE.md)
// ============================================================================

const SCOPE_KB: GrantResourceType = GRANT_RESOURCE_KNOWLEDGE_BASE
const SCOPE_CATEGORY: GrantResourceType = GRANT_RESOURCE_DOCUMENT_CATEGORY

// ============================================================================
// Types
// ============================================================================

/** @description Props for {@link KnowledgeBasePermissionModal}. */
interface KnowledgeBasePermissionModalProps {
  /** Whether modal is visible */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** The project to configure */
  knowledgeBase: KnowledgeBase
  /** Callback after saving */
  onSaved?: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal for managing a KB's public/private flag and its resource
 * grants. Hosts the modal-owned scope toggle (KB vs Category) per D-08 and
 * delegates grant CRUD to {@link ResourceGrantEditor}.
 * @param {KnowledgeBasePermissionModalProps} props - Modal configuration.
 * @returns {JSX.Element} Rendered permission modal.
 */
export const KnowledgeBasePermissionModal: React.FC<KnowledgeBasePermissionModalProps> = ({
  open,
  onClose,
  knowledgeBase,
  onSaved,
}) => {
  const { t } = useTranslation()

  // Preserved is_private toggle (dual-write target — research §13 #8)
  const [isPrivate, setIsPrivate] = useState(knowledgeBase.is_private || false)
  const [saving, setSaving] = useState(false)

  // Modal-owned scope state (D-08 — iteration-2 fix). The editor is controlled.
  const [scope, setScope] = useState<GrantResourceType>(SCOPE_KB)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  // Resync local is_private when the modal reopens for a different KB
  useEffect(() => {
    if (open) {
      setIsPrivate(knowledgeBase.is_private || false)
      setScope(SCOPE_KB)
      setSelectedCategoryId(null)
    }
  }, [open, knowledgeBase.id, knowledgeBase.is_private])

  /**
   * @description Persist the is_private flag back to the KB record. Grant
   * mutations are saved immediately by the editor on Add/Remove, so this
   * Save button only handles the dual-write field.
   */
  const handleSave = async () => {
    setSaving(true)
    try {
      await updateKnowledgeBase(knowledgeBase.id, { is_private: isPrivate } as Partial<KnowledgeBase>)
      globalMessage.success(t('knowledgeBase.permissionsSaved', 'Permissions saved'))
      onSaved?.()
      onClose()
    } catch (err) {
      console.error('[KnowledgeBasePermissionModal] Failed to save:', err)
      globalMessage.error(t('knowledgeBase.permissionsSaveError', 'Failed to save permissions'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t('knowledgeBase.editPermissions', 'Edit Permissions')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Knowledge base info banner */}
          <div className="p-3 bg-gray-100 dark:bg-slate-800 rounded-lg">
            <p className="font-medium text-gray-900 dark:text-gray-100">{knowledgeBase.name}</p>
            {knowledgeBase.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {knowledgeBase.description}
              </p>
            )}
          </div>

          {/* Public/Private toggle (preserved dual-write — research §13 #8) */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600">
            <div className="flex items-center gap-3">
              {!isPrivate ? (
                <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              )}
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {!isPrivate
                    ? t('knowledgeBase.publicAccess', 'Public Access')
                    : t('knowledgeBase.privateAccess', 'Private Access')}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {!isPrivate
                    ? t('knowledgeBase.publicAccessDesc', 'All authenticated users can access this project')
                    : t('knowledgeBase.privateAccessDesc', 'Only granted principals can access this project')}
                </p>
              </div>
            </div>
            <Switch
              checked={!isPrivate}
              onCheckedChange={(checked: boolean) => setIsPrivate(!checked)}
            />
          </div>

          {/* Scope toggle (modal-owned per D-08) */}
          <div className="flex gap-2 border-b pb-2 dark:border-slate-700">
            <button
              type="button"
              onClick={() => { setScope(SCOPE_KB); setSelectedCategoryId(null) }}
              className={cn(
                'px-3 py-1.5 text-sm rounded-t',
                scope === SCOPE_KB
                  ? 'border-b-2 border-primary font-medium text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              data-testid="scope-tab-kb"
            >
              {t('permissions.admin.grants.scopeKb')}
            </button>
            <button
              type="button"
              onClick={() => setScope(SCOPE_CATEGORY)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-t',
                scope === SCOPE_CATEGORY
                  ? 'border-b-2 border-primary font-medium text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              data-testid="scope-tab-category"
            >
              {t('permissions.admin.grants.scopeCategory')}
            </button>
          </div>

          {/* Category-scope guidance — actual category picker handed off to a future plan */}
          {scope === SCOPE_CATEGORY && !selectedCategoryId && (
            <p className="text-xs text-muted-foreground">
              {t(
                'permissions.admin.grants.scopeCategoryHint',
                'Open a category from the knowledge base view to manage its grants.'
              )}
            </p>
          )}

          {/* Shared editor — controlled by modal state */}
          <ResourceGrantEditor
            scope={scope}
            resourceId={
              scope === SCOPE_KB ? String(knowledgeBase.id) : (selectedCategoryId ?? '')
            }
            kbId={Number(knowledgeBase.id)}
            allowScopeToggle={false}
            onScopeChange={setScope}
          />
        </div>

        <DialogFooter>
          <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700 w-full">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
