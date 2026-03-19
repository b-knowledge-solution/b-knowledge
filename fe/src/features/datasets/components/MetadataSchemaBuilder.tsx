/**
 * @fileoverview Visual schema builder for metadata auto-extraction.
 * Builds an array of metadata field definitions matching the RAGFlow
 * turn2jsonschema() format: [{key, description, enum}].
 *
 * Stored in parser_config.metadata (NOT parser_config.metadata_tags).
 *
 * @module features/datasets/components/MetadataSchemaBuilder
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

// ============================================================================
// Types
// ============================================================================

/**
 * @description A single metadata schema field definition for LLM auto-extraction.
 * Matches the format expected by advance-rag/common/metadata_utils.py turn2jsonschema().
 */
export interface MetadataSchemaField {
  /** Unique field key (e.g., "department", "category") */
  key: string
  /** Human-readable description for the LLM extraction prompt */
  description: string
  /** Optional enum constraint — limits extraction to these values */
  enum?: string[]
}

/**
 * @description Props for the MetadataSchemaBuilder component.
 */
interface MetadataSchemaBuilderProps {
  /** Current list of metadata schema fields */
  fields: MetadataSchemaField[]
  /** Callback when the field list changes */
  onChange: (fields: MetadataSchemaField[]) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Visual schema builder for configuring metadata fields that the LLM
 * should auto-extract during parsing. Each field has a key, description, and optional
 * enum values. The resulting array is stored in parser_config.metadata.
 *
 * @param {MetadataSchemaBuilderProps} props - Component properties
 * @returns {JSX.Element} Rendered metadata schema builder
 */
const MetadataSchemaBuilder: React.FC<MetadataSchemaBuilderProps> = ({
  fields,
  onChange,
}) => {
  const { t } = useTranslation()

  /**
   * @description Add a new empty field row to the schema.
   */
  const addField = () => {
    onChange([...fields, { key: '', description: '', enum: [] }])
  }

  /**
   * @description Remove a field at the given index.
   * @param {number} idx - Index of the field to remove
   */
  const removeField = (idx: number) => {
    onChange(fields.filter((_, i) => i !== idx))
  }

  /**
   * @description Update a specific property of a field.
   * @param {number} idx - Index of the field
   * @param {keyof MetadataSchemaField} prop - Property to update
   * @param {string} value - New value for the property
   */
  const updateField = (idx: number, prop: keyof MetadataSchemaField, value: string) => {
    const updated = fields.map((f, i) => {
      if (i !== idx) return f
      if (prop === 'enum') {
        // Parse comma-separated enum values, trimming whitespace
        const enumValues = value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
        return { ...f, enum: enumValues }
      }
      return { ...f, [prop]: value }
    })
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">
        {t('datasets.metadataSchema', 'Metadata Schema')}
      </Label>

      {/* Field rows */}
      {fields.map((field, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 p-3 rounded-md border bg-muted/30"
        >
          <div className="flex-1 space-y-2">
            {/* Key input */}
            <Input
              value={field.key}
              onChange={(e) => updateField(idx, 'key', e.target.value)}
              placeholder={t('datasets.fieldKey', 'Field key (e.g., department)')}
              className="h-8 text-sm"
            />
            {/* Description input */}
            <Input
              value={field.description}
              onChange={(e) => updateField(idx, 'description', e.target.value)}
              placeholder={t('datasets.fieldDescription', 'Description for LLM extraction')}
              className="h-8 text-sm"
            />
            {/* Enum values input (comma-separated) */}
            <Input
              value={(field.enum ?? []).join(', ')}
              onChange={(e) => updateField(idx, 'enum', e.target.value)}
              placeholder={t('datasets.fieldEnum', 'Enum values (comma-separated, optional)')}
              className="h-8 text-sm text-muted-foreground"
            />
          </div>

          {/* Remove button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0 mt-0.5"
            onClick={() => removeField(idx)}
            aria-label={t('common.delete')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {/* Separator before add button when fields exist */}
      {fields.length > 0 && <Separator />}

      {/* Add field button */}
      <Button variant="outline" size="sm" onClick={addField} className="w-full">
        <Plus className="h-4 w-4 mr-1" />
        {t('datasets.addField', 'Add Field')}
      </Button>
    </div>
  )
}

export default MetadataSchemaBuilder
