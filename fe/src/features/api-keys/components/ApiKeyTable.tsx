/**
 * @fileoverview Table component displaying API keys with actions.
 * @module features/api-keys/components/ApiKeyTable
 */

import { useTranslation } from 'react-i18next'
import { Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ConfirmDialog'
import type { ApiKey } from '../types/apiKey.types'

/**
 * @description Props for the ApiKeyTable component
 */
interface ApiKeyTableProps {
  keys: ApiKey[]
  loading: boolean
  onToggleActive: (id: string, isActive: boolean) => void
  onDelete: (id: string) => void
}

/**
 * @description Displays API keys in a table with masked key prefixes, scope badges,
 *   status toggles, and delete actions.
 * @param {ApiKeyTableProps} props - Table data and action handlers
 * @returns {JSX.Element} Rendered API key table
 */
export default function ApiKeyTable({ keys, loading, onToggleActive, onDelete }: ApiKeyTableProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  /**
   * @description Handle delete with confirmation dialog
   * @param {ApiKey} key - The API key to delete
   */
  const handleDelete = async (key: ApiKey) => {
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('apiKeys.deleteConfirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (confirmed) {
      onDelete(key.id)
    }
  }

  /**
   * @description Format a date string for display, or return a fallback
   * @param {string | null} dateStr - ISO date string or null
   * @param {string} fallback - Fallback text when date is null
   * @returns {string} Formatted date or fallback
   */
  const formatDate = (dateStr: string | null, fallback: string): string => {
    if (!dateStr) return fallback
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t('common.loading')}
      </div>
    )
  }

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">{t('apiKeys.noKeys')}</p>
        <p className="text-sm mt-1">{t('apiKeys.noKeysDescription')}</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('apiKeys.name')}</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>{t('apiKeys.scopes')}</TableHead>
          <TableHead>{t('apiKeys.status')}</TableHead>
          <TableHead>{t('apiKeys.lastUsed')}</TableHead>
          <TableHead>{t('apiKeys.expiresAt')}</TableHead>
          <TableHead className="text-right">{t('common.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="font-medium">{key.name}</TableCell>
            <TableCell>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {key.key_prefix}...
              </code>
            </TableCell>
            <TableCell>
              <div className="flex gap-1 flex-wrap">
                {key.scopes.map((scope) => (
                  <Badge key={scope} variant="secondary" className="text-xs">
                    {t(`apiKeys.scope${scope.charAt(0).toUpperCase()}${scope.slice(1)}`)}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={key.is_active ? 'default' : 'outline'}>
                {key.is_active ? t('apiKeys.active') : t('apiKeys.inactive')}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatDate(key.last_used_at, t('apiKeys.neverUsed'))}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatDate(key.expires_at, t('apiKeys.never'))}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {/* Toggle active/inactive */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleActive(key.id, !key.is_active)}
                  title={key.is_active ? 'Deactivate' : 'Activate'}
                >
                  {key.is_active
                    ? <ToggleRight className="h-4 w-4 text-green-600" />
                    : <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                  }
                </Button>
                {/* Delete */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(key)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
