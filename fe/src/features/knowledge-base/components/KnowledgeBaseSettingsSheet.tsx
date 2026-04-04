/**
 * @fileoverview Sheet-based settings sidebar for project management.
 *
 * Slides in from the right (320px) and contains:
 * - Knowledge base name/description edit form
 * - Visibility toggle (is_private)
 * - Member management (reuses KnowledgeBaseMemberList)
 * - Danger zone with delete project (name confirmation)
 *
 * @module features/knowledge-base/components/KnowledgeBaseSettingsSheet
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { globalMessage } from '@/lib/globalMessage'
import {
  updateKnowledgeBase,
  deleteKnowledgeBase,
  type KnowledgeBase,
} from '../api/knowledgeBaseApi'
import KnowledgeBaseMemberList from './KnowledgeBaseMemberList'

// ============================================================================
// Types
// ============================================================================

interface KnowledgeBaseSettingsSheetProps {
  /** The project being configured */
  knowledgeBase: KnowledgeBase
  /** Whether the sheet is open */
  open: boolean
  /** Callback to control open state */
  onOpenChange: (open: boolean) => void
  /** Callback after the project is successfully updated */
  onKnowledgeBaseUpdated: () => void
  /** Callback after the project is deleted (navigate away) */
  onKnowledgeBaseDeleted: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Sheet sidebar for project settings: edit name/description, toggle visibility, manage members, delete project
 * @param {KnowledgeBaseSettingsSheetProps} props - Settings sheet configuration
 * @returns {JSX.Element} Rendered Sheet component with settings sections
 */
const KnowledgeBaseSettingsSheet = ({
  knowledgeBase,
  open,
  onOpenChange,
  onKnowledgeBaseUpdated,
  onKnowledgeBaseDeleted,
}: KnowledgeBaseSettingsSheetProps) => {
  const { t } = useTranslation()

  // Edit form state
  const [name, setName] = useState(knowledgeBase.name)
  const [description, setDescription] = useState(knowledgeBase.description || '')
  const [isPrivate, setIsPrivate] = useState(knowledgeBase.is_private)
  const [saving, setSaving] = useState(false)

  // Delete confirmation state
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Reset form state when sheet opens or project changes
  useEffect(() => {
    if (open) {
      setName(knowledgeBase.name)
      setDescription(knowledgeBase.description || '')
      setIsPrivate(knowledgeBase.is_private)
      setDeleteConfirmName('')
    }
  }, [open, knowledgeBase])

  /**
   * @description Save project name, description, and visibility changes
   */
  const handleSave = async () => {
    // Validate name is not empty
    if (!name.trim()) {
      globalMessage.error(t('knowledgeBase.name') + ' is required')
      return
    }

    setSaving(true)
    try {
      await updateKnowledgeBase(knowledgeBase.id, {
        name: name.trim(),
        description: description.trim() || null,
        is_private: isPrivate,
      })
      globalMessage.success(t('knowledgeBase.updateSuccess'))
      onKnowledgeBaseUpdated()
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * @description Delete the project after verifying name confirmation
   */
  const handleDelete = async () => {
    // Block deletion unless typed name matches project name exactly
    if (deleteConfirmName !== knowledgeBase.name) return

    setDeleting(true)
    try {
      await deleteKnowledgeBase(knowledgeBase.id)
      globalMessage.success(t('knowledgeBase.deleteSuccess'))
      onKnowledgeBaseDeleted()
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[320px] sm:max-w-[320px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('knowledgeBase.tabs.settings', 'Settings')}</SheetTitle>
          <SheetDescription>
            {t('knowledgeBase.settingsDescription', 'Manage project settings and members.')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Project name */}
          <div className="space-y-2">
            <Label htmlFor="project-name">{t('knowledgeBase.name')}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder={t('knowledgeBase.namePlaceholder')}
            />
          </div>

          {/* Knowledge base description */}
          <div className="space-y-2">
            <Label htmlFor="project-description">{t('knowledgeBase.descriptionLabel')}</Label>
            <Input
              id="project-description"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              placeholder={t('knowledgeBase.descriptionPlaceholder')}
            />
          </div>

          {/* Visibility toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>{t('knowledgeBase.privateAccess')}</Label>
              <p className="text-xs text-muted-foreground">
                {isPrivate
                  ? t('knowledgeBase.privateAccessDesc')
                  : t('knowledgeBase.publicAccessDesc')}
              </p>
            </div>
            <Switch
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
            />
          </div>

          {/* Save button */}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Spinner size={16} className="mr-2" />}
            {t('common.save', 'Save')}
          </Button>

          <Separator />

          {/* Member management section */}
          <div>
            <h4 className="text-sm font-semibold mb-3">{t('knowledgeBase.tabs.members', 'Members')}</h4>
            <KnowledgeBaseMemberList knowledgeBaseId={knowledgeBase.id} />
          </div>

          <Separator />

          {/* Danger zone: delete project */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-destructive">
              {t('knowledgeBase.dangerZone', 'Danger Zone')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('knowledgeBase.deleteConfirm', 'This will permanently delete the project and all its categories, versions, and files. Type the project name to confirm.')}
            </p>
            <Input
              placeholder={knowledgeBase.name}
              value={deleteConfirmName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeleteConfirmName(e.target.value)}
            />
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleDelete}
              disabled={deleteConfirmName !== knowledgeBase.name || deleting}
            >
              {deleting && <Spinner size={16} className="mr-2" />}
              <Trash2 size={14} className="mr-1.5" />
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default KnowledgeBaseSettingsSheet
