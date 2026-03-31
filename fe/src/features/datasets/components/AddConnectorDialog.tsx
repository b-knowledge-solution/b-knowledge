/**
 * @fileoverview Dialog for creating or editing an external source connector.
 * Allows the user to pick a source type, fill in connection fields,
 * and optionally set a cron schedule for automatic syncing.
 *
 * @module features/datasets/components/AddConnectorDialog
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plug } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import ConnectorSourceFields from './ConnectorSourceFields'
import { useTestConnection } from '../api/connectorQueries'
import type { Connector, ConnectorSourceType, CreateConnectorDto, UpdateConnectorDto } from '../types'

// ============================================================================
// Constants
// ============================================================================

/** @description All supported source types with display labels */
const SOURCE_TYPE_OPTIONS: { value: ConnectorSourceType; labelKey: string }[] = [
  { value: 'blob_storage', labelKey: 'datasets.connectors.sourceTypes.blob_storage' },
  { value: 'github', labelKey: 'datasets.connectors.sourceTypes.github' },
  { value: 'gitlab', labelKey: 'datasets.connectors.sourceTypes.gitlab' },
  { value: 'jira', labelKey: 'datasets.connectors.sourceTypes.jira' },
  { value: 'confluence', labelKey: 'datasets.connectors.sourceTypes.confluence' },
  { value: 'notion', labelKey: 'datasets.connectors.sourceTypes.notion' },
  { value: 'sharepoint', labelKey: 'datasets.connectors.sourceTypes.sharepoint' },
  { value: 'google_drive', labelKey: 'datasets.connectors.sourceTypes.google_drive' },
  { value: 'dropbox', labelKey: 'datasets.connectors.sourceTypes.dropbox' },
  { value: 'slack', labelKey: 'datasets.connectors.sourceTypes.slack' },
  { value: 'discord', labelKey: 'datasets.connectors.sourceTypes.discord' },
  { value: 'gmail', labelKey: 'datasets.connectors.sourceTypes.gmail' },
  { value: 'imap', labelKey: 'datasets.connectors.sourceTypes.imap' },
  { value: 'asana', labelKey: 'datasets.connectors.sourceTypes.asana' },
  { value: 'airtable', labelKey: 'datasets.connectors.sourceTypes.airtable' },
  { value: 'zendesk', labelKey: 'datasets.connectors.sourceTypes.zendesk' },
  { value: 'teams', labelKey: 'datasets.connectors.sourceTypes.teams' },
  { value: 'bitbucket', labelKey: 'datasets.connectors.sourceTypes.bitbucket' },
  { value: 'seafile', labelKey: 'datasets.connectors.sourceTypes.seafile' },
  { value: 'rdbms', labelKey: 'datasets.connectors.sourceTypes.rdbms' },
  { value: 'webdav', labelKey: 'datasets.connectors.sourceTypes.webdav' },
  { value: 'box', labelKey: 'datasets.connectors.sourceTypes.box' },
  { value: 'moodle', labelKey: 'datasets.connectors.sourceTypes.moodle' },
  { value: 'dingtalk', labelKey: 'datasets.connectors.sourceTypes.dingtalk' },
]

// ============================================================================
// Types
// ============================================================================

/** @description Props for the AddConnectorDialog component */
interface AddConnectorDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** Knowledge base ID to associate the connector with */
  kbId: string
  /** Submit handler for creating or updating a connector */
  onSubmit: (data: CreateConnectorDto | UpdateConnectorDto) => Promise<void>
  /** Whether the form is submitting */
  submitting?: boolean
  /** Existing connector for edit mode; omit for create mode */
  connector?: Connector | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Dialog for creating or editing an external source connector.
 * In create mode, all fields start empty. In edit mode, fields are pre-filled
 * from the existing connector.
 * @param {AddConnectorDialogProps} props - Dialog configuration
 * @returns {JSX.Element} Rendered dialog
 */
const AddConnectorDialog = ({
  open,
  onClose,
  kbId,
  onSubmit,
  submitting = false,
  connector = null,
}: AddConnectorDialogProps) => {
  const { t } = useTranslation()
  const isEdit = !!connector

  // Form state
  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState<ConnectorSourceType>('github')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [description, setDescription] = useState('')
  const [schedule, setSchedule] = useState('')

  // Reset form when dialog opens or connector changes
  useEffect(() => {
    if (open) {
      if (connector) {
        // Edit mode: populate from existing connector
        setName(connector.name)
        setSourceType(connector.source_type)
        // Safely parse config — may be stored as JSON string in DB
        let parsedConfig: Record<string, unknown> = {}
        try {
          parsedConfig = typeof connector.config === 'string'
            ? JSON.parse(connector.config)
            : connector.config || {}
        } catch {
          parsedConfig = {}
        }
        setConfig(parsedConfig)
        setDescription(connector.description || '')
        setSchedule(connector.schedule || '')
      } else {
        // Create mode: reset to defaults
        setName('')
        setSourceType('github')
        setConfig({})
        setDescription('')
        setSchedule('')
      }
    }
  }, [open, connector?.id])

  /** Handle form submission */
  const handleSubmit = async () => {
    if (isEdit) {
      // Update only changed fields
      const data: UpdateConnectorDto = {
        name,
        source_type: sourceType,
        config,
        description: description || undefined,
        schedule: schedule || null,
      }
      await onSubmit(data)
    } else {
      // Create with all required fields
      const data: CreateConnectorDto = {
        name,
        source_type: sourceType,
        kb_id: kbId,
        config,
        description: description || undefined,
        schedule: schedule || undefined,
      }
      await onSubmit(data)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('datasets.connectors.editTitle')
              : t('datasets.connectors.addTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Connector Name */}
          <div>
            <Label>{t('datasets.connectors.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('datasets.connectors.namePlaceholder')}
              className="mt-1"
            />
          </div>

          {/* Source Type Selector — disabled in edit mode */}
          <div>
            <Label>{t('datasets.connectors.sourceType')}</Label>
            <Select
              value={sourceType}
              onValueChange={(v: string) => {
                setSourceType(v as ConnectorSourceType)
                // Reset config when source type changes
                setConfig({})
              }}
              disabled={isEdit}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic connection fields based on source type */}
          <div>
            <Label className="mb-2 block">{t('datasets.connectors.connectionConfig')}</Label>
            <ConnectorSourceFields
              sourceType={sourceType}
              config={config}
              onChange={setConfig}
            />
          </div>

          {/* Description */}
          <div>
            <Label>{t('datasets.connectors.description')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('datasets.connectors.descriptionPlaceholder')}
              className="mt-1"
              rows={2}
            />
          </div>

          {/* Schedule (cron expression) */}
          <div>
            <Label>{t('datasets.connectors.schedule')}</Label>
            <Input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder={t('datasets.connectors.schedulePlaceholder')}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('datasets.connectors.scheduleHint')}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <TestConnectionButton sourceType={sourceType} config={config} />
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
              {submitting
                ? t('common.saving')
                : isEdit
                  ? t('common.save')
                  : t('common.create')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Test Connection Button
// ============================================================================

/**
 * @description Button to test connection to an external data source (SYN-FR-31).
 *   Shows success/error feedback after the test completes.
 * @param {{ sourceType: string; config: Record<string, unknown> }} props
 * @returns {JSX.Element} Rendered test connection button
 */
function TestConnectionButton({ sourceType, config }: { sourceType: string; config: Record<string, unknown> }) {
  const { t } = useTranslation()
  const testMutation = useTestConnection()

  const handleTest = async () => {
    await testMutation.mutateAsync({ sourceType, config })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleTest}
        disabled={testMutation.isPending}
      >
        <Plug size={14} className="mr-1" />
        {testMutation.isPending
          ? t('datasets.connectors.testConnectionTesting')
          : t('datasets.connectors.testConnection')}
      </Button>
      {/* Show result feedback */}
      {testMutation.data && !testMutation.isPending && (
        <span className={`text-xs ${testMutation.data.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {testMutation.data.success
            ? t('datasets.connectors.testConnectionSuccess')
            : testMutation.data.message || t('datasets.connectors.testConnectionFailed')}
        </span>
      )}
    </div>
  )
}

export default AddConnectorDialog
