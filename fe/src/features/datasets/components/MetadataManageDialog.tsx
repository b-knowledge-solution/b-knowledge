/**
 * @fileoverview Metadata Management Dialog — manage metadata fields for a dataset.
 * Adapted from RAGFlow's metadata manage-modal with B-Knowledge conventions.
 *
 * @module features/datasets/components/MetadataManageDialog
 */

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Pencil, X, Save } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useMetadata, useUpdateMetadata, useBulkUpdateMetadata } from '../api/datasetQueries'
import type { MetadataField, MetadataValueType } from '../types'

/**
 * @description Props for the MetadataManageDialog component.
 */
interface MetadataManageDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Dataset UUID whose metadata fields to manage (single mode) */
  datasetId: string
  /** Optional array of dataset IDs for bulk tag editing mode */
  datasetIds?: string[]
}

const VALUE_TYPES: { value: MetadataValueType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'list', label: 'List' },
  { value: 'time', label: 'Time' },
]

/**
 * @description Metadata Management Dialog component.
 * Allows adding, editing, and deleting metadata fields and their values.
 * Fields are edited locally and saved as a complete set to the server.
 *
 * @param {MetadataManageDialogProps} props - Component properties
 * @returns {JSX.Element} Rendered metadata management dialog
 */
const MetadataManageDialog: React.FC<MetadataManageDialogProps> = ({
  open,
  onClose,
  datasetId,
  datasetIds,
}) => {
  const { t } = useTranslation()

  // Determine if we're in bulk mode (editing tags for multiple datasets)
  const isBulkMode = !!datasetIds && datasetIds.length > 0
  const { data, isLoading } = useMetadata(open && !isBulkMode ? datasetId : undefined)
  const updateMutation = useUpdateMetadata(datasetId)
  const bulkMutation = useBulkUpdateMetadata()

  // Local state for editing
  const [fields, setFields] = useState<MetadataField[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<MetadataValueType>('string')
  const [newValueInput, setNewValueInput] = useState('')

  // Bulk mode state: key-value tag pairs and merge/overwrite mode
  const [bulkTags, setBulkTags] = useState<Record<string, string>>({})
  const [bulkMode, setBulkMode] = useState<'merge' | 'overwrite'>('merge')
  const [bulkNewKey, setBulkNewKey] = useState('')
  const [bulkNewValue, setBulkNewValue] = useState('')

  // Sync fields from server data
  useEffect(() => {
    if (data?.fields) {
      setFields(data.fields)
    }
  }, [data?.fields])

  /**
   * @description Add a new metadata field.
   */
  const addField = () => {
    if (!newFieldName.trim()) return
    // Prevent duplicate names
    if (fields.some(f => f.name === newFieldName.trim())) return

    setFields([...fields, {
      name: newFieldName.trim(),
      type: newFieldType,
      values: [],
    }])
    setNewFieldName('')
    setNewFieldType('string')
  }

  /**
   * @description Remove a metadata field by index.
   */
  const removeField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx))
  }

  /**
   * @description Add a value to a field's values array.
   */
  const addValue = (fieldIdx: number) => {
    if (!newValueInput.trim()) return
    const updated = [...fields]
    const field = updated[fieldIdx]!
    if (!field.values) field.values = []
    if (!field.values.includes(newValueInput.trim())) {
      field.values.push(newValueInput.trim())
    }
    setFields(updated)
    setNewValueInput('')
  }

  /**
   * @description Remove a value from a field's values array.
   */
  const removeValue = (fieldIdx: number, valueIdx: number) => {
    const updated = [...fields]
    updated[fieldIdx]!.values = (updated[fieldIdx]!.values ?? []).filter((_, i) => i !== valueIdx)
    setFields(updated)
  }

  /**
   * @description Add a key-value tag pair in bulk mode.
   */
  const addBulkTag = () => {
    if (!bulkNewKey.trim() || !bulkNewValue.trim()) return
    setBulkTags((prev) => ({ ...prev, [bulkNewKey.trim()]: bulkNewValue.trim() }))
    setBulkNewKey('')
    setBulkNewValue('')
  }

  /**
   * @description Remove a bulk tag by key.
   */
  const removeBulkTag = (key: string) => {
    setBulkTags((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  /**
   * @description Save metadata — single mode saves fields, bulk mode saves tags.
   */
  const handleSave = async () => {
    if (isBulkMode) {
      // Bulk mode: write to parser_config.metadata_tags via bulk API
      await bulkMutation.mutateAsync({
        datasetIds: datasetIds!,
        metadataTags: bulkTags,
        mode: bulkMode,
      })
    } else {
      // Single mode: save metadata field definitions
      await updateMutation.mutateAsync(fields)
    }
    onClose()
  }

  const isSaving = isBulkMode ? bulkMutation.isPending : updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isBulkMode
              ? t('datasets.editTags', 'Edit Tags for {{count}} documents', { count: datasetIds!.length })
              : t('datasets.manageMetadata')}
          </DialogTitle>
        </DialogHeader>

        {/* Bulk mode UI for editing metadata_tags */}
        {isBulkMode ? (
          <div className="flex-1 overflow-auto space-y-4">
            {/* Merge/Overwrite toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <Label className="text-sm">{t('datasets.mergeMode', 'Merge')}</Label>
              <Switch
                checked={bulkMode === 'overwrite'}
                onCheckedChange={(checked: boolean) => setBulkMode(checked ? 'overwrite' : 'merge')}
              />
              <Label className="text-sm">{t('datasets.overwriteMode', 'Overwrite')}</Label>
            </div>

            {/* Add new tag pair */}
            <div className="flex items-end gap-2 p-3 rounded-lg border bg-muted/30">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t('datasets.fieldKey', 'Key')}
                </label>
                <Input
                  value={bulkNewKey}
                  onChange={(e) => setBulkNewKey(e.target.value)}
                  placeholder="e.g., department"
                  onKeyDown={(e) => e.key === 'Enter' && addBulkTag()}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t('datasets.addValue', 'Value')}
                </label>
                <Input
                  value={bulkNewValue}
                  onChange={(e) => setBulkNewValue(e.target.value)}
                  placeholder="e.g., engineering"
                  onKeyDown={(e) => e.key === 'Enter' && addBulkTag()}
                />
              </div>
              <Button size="sm" onClick={addBulkTag} disabled={!bulkNewKey.trim() || !bulkNewValue.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                {t('common.add')}
              </Button>
            </div>

            {/* Current tag pairs */}
            {Object.keys(bulkTags).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('datasets.noMetadata', 'No metadata')}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(bulkTags).map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="gap-1 pr-1">
                    {key}: {value}
                    <button
                      onClick={() => removeBulkTag(key)}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={32} />
          </div>
        ) : (
          <div className="flex-1 overflow-auto space-y-4">
            {/* Add new field */}
            <div className="flex items-end gap-2 p-3 rounded-lg border bg-muted/30">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t('datasets.fieldName')}
                </label>
                <Input
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder={t('datasets.enterFieldName')}
                  onKeyDown={(e) => e.key === 'Enter' && addField()}
                />
              </div>
              <div className="w-[120px]">
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t('datasets.fieldType')}
                </label>
                <Select value={newFieldType} onValueChange={(v: string) => setNewFieldType(v as MetadataValueType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALUE_TYPES.map(vt => (
                      <SelectItem key={vt.value} value={vt.value}>{vt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={addField} disabled={!newFieldName.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                {t('common.add')}
              </Button>
            </div>

            {/* Fields list */}
            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('datasets.noMetadataFields')}
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2">
                    {/* Field header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{field.name}</span>
                        <Badge variant="outline" className="text-xs">{field.type}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeField(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Values */}
                    {field.values && field.values.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {field.values.map((val, vIdx) => (
                          <Badge key={vIdx} variant="secondary" className="gap-1 pr-1">
                            {val}
                            {editingIdx === idx && (
                              <button
                                onClick={() => removeValue(idx, vIdx)}
                                className="ml-0.5 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Add value input (shown when editing) */}
                    {editingIdx === idx && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          value={newValueInput}
                          onChange={(e) => setNewValueInput(e.target.value)}
                          placeholder={t('datasets.addValue')}
                          className="h-8 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && addValue(idx)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => addValue(idx)}
                          disabled={!newValueInput.trim()}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size={16} className="mr-2" /> : <Save className="h-4 w-4 mr-1" />}
            {isBulkMode
              ? t('datasets.applyTagChanges', 'Apply Tag Changes')
              : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default MetadataManageDialog
