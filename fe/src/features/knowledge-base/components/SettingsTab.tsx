/**
 * @fileoverview Settings tab content for the knowledge base detail page.
 *
 * Displays the permissions table with delete actions.
 *
 * @module features/knowledge-base/components/SettingsTab
 */

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import {
  removeKnowledgeBasePermission,
  type KnowledgeBasePermission,
} from '../api/knowledgeBaseApi'

// ============================================================================
// Types
// ============================================================================

interface SettingsTabProps {
  /** Current project ID */
  knowledgeBaseId: string
  /** List of project permissions */
  permissions: KnowledgeBasePermission[]
  /** Callback when a permission is removed so the parent can refetch */
  onPermissionRemoved: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Settings tab -- project permissions table.
 *
 * @param {SettingsTabProps} props - Component props
 * @returns {JSX.Element} The rendered settings tab content
 */
const SettingsTab = ({ knowledgeBaseId, permissions, onPermissionRemoved }: SettingsTabProps) => {
  const { t } = useTranslation()
  const confirm = useConfirm()

  /**
   * Handle permission deletion with confirmation.
   *
   * @param record - The permission to delete
   */
  const handleDelete = async (record: KnowledgeBasePermission) => {
    // Show confirmation dialog before deleting
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('knowledgeBase.permissions.deleteConfirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    await removeKnowledgeBasePermission(knowledgeBaseId, record.id)
    onPermissionRemoved()
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('knowledgeBase.permissions.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {permissions.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              {t('knowledgeBase.permissions.noPermissions')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('knowledgeBase.permissions.granteeType')}</TableHead>
                  <TableHead>{t('knowledgeBase.permissions.grantee')}</TableHead>
                  <TableHead>{t('knowledgeBase.permissions.tabDocuments')}</TableHead>
                  <TableHead>{t('knowledgeBase.permissions.tabChat')}</TableHead>
                  <TableHead>{t('knowledgeBase.permissions.tabSettings')}</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((perm) => (
                  <TableRow key={perm.id}>
                    <TableCell>{perm.grantee_type}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{perm.grantee_id}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t(`knowledgeBase.permissions.levels.${perm.tab_documents}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t(`knowledgeBase.permissions.levels.${perm.tab_chat}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t(`knowledgeBase.permissions.levels.${perm.tab_settings}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(perm)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default SettingsTab
