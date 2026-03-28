/**
 * @fileoverview Panel listing external source connectors for a dataset.
 * Shows connector name, source type, status, last sync time, and actions
 * (Sync Now, Edit, Delete, View Logs).
 *
 * @module features/datasets/components/ConnectorListPanel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, RefreshCw, Pencil, Trash2, Clock, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useConfirm } from '@/components/ConfirmDialog'
import {
  useConnectors,
  useCreateConnector,
  useUpdateConnector,
  useDeleteConnector,
  useTriggerSync,
} from '../api/connectorQueries'
import AddConnectorDialog from './AddConnectorDialog'
import ConnectorSyncLogsDialog from './ConnectorSyncLogsDialog'
import type { Connector, CreateConnectorDto, UpdateConnectorDto } from '../types'

// ============================================================================
// Types
// ============================================================================

/** @description Props for the ConnectorListPanel component */
interface ConnectorListPanelProps {
  /** Knowledge base (dataset) ID */
  kbId: string
  /** Whether the user has admin privileges to manage connectors */
  isAdmin: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Panel displaying all external source connectors linked to a dataset.
 * Provides CRUD actions and sync triggering for each connector.
 * @param {ConnectorListPanelProps} props - Dataset ID and permission info
 * @returns {JSX.Element} Rendered connector list panel
 */
const ConnectorListPanel = ({ kbId, isAdmin }: ConnectorListPanelProps) => {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // Data hooks
  const { data: connectors = [], isLoading } = useConnectors(kbId)
  const createMutation = useCreateConnector(kbId)
  const updateMutation = useUpdateConnector(kbId)
  const deleteMutation = useDeleteConnector(kbId)
  const syncMutation = useTriggerSync(kbId)

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editConnector, setEditConnector] = useState<Connector | null>(null)
  const [logsConnectorId, setLogsConnectorId] = useState<string | null>(null)

  /** Handle creating a new connector */
  const handleCreate = async (data: CreateConnectorDto | UpdateConnectorDto) => {
    await createMutation.mutateAsync(data as CreateConnectorDto)
    setAddDialogOpen(false)
  }

  /** Handle updating an existing connector */
  const handleUpdate = async (data: CreateConnectorDto | UpdateConnectorDto) => {
    if (!editConnector) return
    await updateMutation.mutateAsync({ id: editConnector.id, data: data as UpdateConnectorDto })
    setEditConnector(null)
  }

  /** Handle deleting a connector with confirmation */
  const handleDelete = async (connector: Connector) => {
    const confirmed = await confirm({
      title: t('datasets.connectors.deleteConfirmTitle'),
      message: t('datasets.connectors.deleteConfirmDescription', { name: connector.name }),
    })
    if (!confirmed) return
    await deleteMutation.mutateAsync(connector.id)
  }

  /** Trigger an immediate sync for a connector */
  const handleSync = async (connectorId: string) => {
    await syncMutation.mutateAsync({ id: connectorId })
  }

  /** Format the last synced timestamp or show "Never" */
  const formatLastSynced = (date?: string | null) => {
    if (!date) return t('datasets.connectors.neverSynced')
    return new Date(date).toLocaleString()
  }

  /** Get badge variant based on connector status */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t('datasets.connectors.statusActive')}</Badge>
      case 'error':
        return <Badge variant="destructive">{t('datasets.connectors.statusError')}</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {t('datasets.connectors.title')}
        </h3>
        {isAdmin && (
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus size={16} className="mr-1" />
            {t('datasets.connectors.addSource')}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {connectors.length === 0 && (
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {t('datasets.connectors.empty')}
            </p>
            {isAdmin && (
              <Button variant="outline" className="mt-4" onClick={() => setAddDialogOpen(true)}>
                <Plus size={16} className="mr-1" />
                {t('datasets.connectors.addSource')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Connector cards */}
      {connectors.map((connector) => (
        <Card key={connector.id} className="dark:bg-slate-800 dark:border-slate-700">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">{connector.name}</CardTitle>
                {getStatusBadge(connector.status)}
                <Badge variant="outline" className="text-xs">
                  {t(`datasets.connectors.sourceTypes.${connector.source_type}`)}
                </Badge>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  {/* Sync Now */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSync(connector.id)}
                    disabled={syncMutation.isPending}
                    title={t('datasets.connectors.syncNow')}
                  >
                    <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
                  </Button>
                  {/* View Logs */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogsConnectorId(connector.id)}
                    title={t('datasets.connectors.viewLogs')}
                  >
                    <History size={14} />
                  </Button>
                  {/* Edit */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditConnector(connector)}
                    title={t('common.edit')}
                  >
                    <Pencil size={14} />
                  </Button>
                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(connector)}
                    title={t('common.delete')}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {t('datasets.connectors.lastSynced')}: {formatLastSynced(connector.last_synced_at)}
              </span>
              {connector.schedule && (
                <span>
                  {t('datasets.connectors.schedule')}: {connector.schedule}
                </span>
              )}
            </div>
            {connector.description && (
              <p className="text-xs text-muted-foreground mt-1">{connector.description}</p>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Add Connector Dialog */}
      <AddConnectorDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        kbId={kbId}
        onSubmit={handleCreate}
        submitting={createMutation.isPending}
      />

      {/* Edit Connector Dialog */}
      <AddConnectorDialog
        open={!!editConnector}
        onClose={() => setEditConnector(null)}
        kbId={kbId}
        onSubmit={handleUpdate}
        submitting={updateMutation.isPending}
        connector={editConnector}
      />

      {/* Sync Logs Dialog */}
      <ConnectorSyncLogsDialog
        open={!!logsConnectorId}
        onClose={() => setLogsConnectorId(null)}
        connectorId={logsConnectorId || ''}
      />
    </div>
  )
}

export default ConnectorListPanel
