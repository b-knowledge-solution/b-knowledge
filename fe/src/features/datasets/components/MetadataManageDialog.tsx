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
import { useMetadata, useUpdateMetadata } from '../api/datasetQueries'
import type { MetadataField, MetadataValueType } from '../types'

/**
 * @description Props for the MetadataManageDialog component.
 */
interface MetadataManageDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Dataset UUID whose metadata fields to manage */
  datasetId: string
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
}) => {
  const { t } = useTranslation()
  const { data, isLoading } = useMetadata(open ? datasetId : undefined)
  const updateMutation = useUpdateMetadata(datasetId)

  // Local state for editing
  const [fields, setFields] = useState<MetadataField[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<MetadataValueType>('string')
  const [newValueInput, setNewValueInput] = useState('')

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
   * @description Save all metadata fields to the server.
   */
  const handleSave = async () => {
    await updateMutation.mutateAsync(fields)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('datasets.manageMetadata')}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
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
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Spinner size={16} className="mr-2" /> : <Save className="h-4 w-4 mr-1" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default MetadataManageDialog
