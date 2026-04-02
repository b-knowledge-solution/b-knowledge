/**
 * @fileoverview Dynamic connection fields per sync source type.
 *
 * Renders appropriate form fields for SharePoint, JIRA, Confluence,
 * GitLab, and GitHub data source connections.
 *
 * @module features/knowledge-base/components/SyncConnectionFields
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import type { SyncSourceType } from '../api/knowledgeBaseApi'

// ============================================================================
// Types
// ============================================================================

interface SyncConnectionFieldsProps {
  /** The selected source type */
  sourceType: SyncSourceType
  /** Current connection config values */
  config: Record<string, unknown>
  /** Callback when config values change */
  onChange: (config: Record<string, unknown>) => void
}

// ============================================================================
// Field definitions per source type
// ============================================================================

interface FieldDef {
  key: string
  labelKey: string
  type: 'text' | 'password' | 'url'
  required?: boolean
}

/** Field definitions for each sync source type. */
const SOURCE_FIELDS: Record<SyncSourceType, FieldDef[]> = {
  sharepoint: [
    { key: 'site_url', labelKey: 'projectManagement.sync.fields.siteUrl', type: 'url', required: true },
    { key: 'tenant_id', labelKey: 'projectManagement.sync.fields.tenantId', type: 'text', required: true },
    { key: 'client_id', labelKey: 'projectManagement.sync.fields.clientId', type: 'text', required: true },
    { key: 'client_secret', labelKey: 'projectManagement.sync.fields.clientSecret', type: 'password', required: true },
  ],
  jira: [
    { key: 'base_url', labelKey: 'projectManagement.sync.fields.baseUrl', type: 'url', required: true },
    { key: 'email', labelKey: 'projectManagement.sync.fields.email', type: 'text', required: true },
    { key: 'api_token', labelKey: 'projectManagement.sync.fields.apiToken', type: 'password', required: true },
    { key: 'project_key', labelKey: 'projectManagement.sync.fields.projectKey', type: 'text' },
  ],
  confluence: [
    { key: 'base_url', labelKey: 'projectManagement.sync.fields.baseUrl', type: 'url', required: true },
    { key: 'email', labelKey: 'projectManagement.sync.fields.email', type: 'text', required: true },
    { key: 'api_token', labelKey: 'projectManagement.sync.fields.apiToken', type: 'password', required: true },
    { key: 'space_key', labelKey: 'projectManagement.sync.fields.spaceKey', type: 'text' },
  ],
  gitlab: [
    { key: 'base_url', labelKey: 'projectManagement.sync.fields.baseUrl', type: 'url', required: true },
    { key: 'access_token', labelKey: 'projectManagement.sync.fields.accessToken', type: 'password', required: true },
    { key: 'project_id', labelKey: 'projectManagement.sync.fields.knowledgeBaseId', type: 'text' },
  ],
  github: [
    { key: 'access_token', labelKey: 'projectManagement.sync.fields.accessToken', type: 'password', required: true },
    { key: 'owner', labelKey: 'projectManagement.sync.fields.owner', type: 'text', required: true },
    { key: 'repo', labelKey: 'projectManagement.sync.fields.repo', type: 'text' },
  ],
}

// ============================================================================
// Password Input Component
// ============================================================================

/**
 * @description Input with toggle visibility for password fields
 * @param props - Standard input props plus value/onChange
 * @returns React element
 */
const PasswordInput = ({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder: string
}) => {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="pr-10"
      />
      {/* Toggle password visibility */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </Button>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders dynamic connection fields based on the selected data source type
 * @param {SyncConnectionFieldsProps} props - Source type and config state handlers
 * @returns {JSX.Element} Rendered connection form fields
 */
const SyncConnectionFields = ({
  sourceType,
  config,
  onChange,
}: SyncConnectionFieldsProps) => {
  const { t } = useTranslation()
  const fields = SOURCE_FIELDS[sourceType] || []

  /**
   * Update a single field in the config.
   *
   * @param key - Field key
   * @param value - New value
   */
  const handleFieldChange = (key: string, value: string) => {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {t(field.labelKey)}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {field.type === 'password' ? (
            <PasswordInput
              value={(config[field.key] as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(field.key, e.target.value)}
              placeholder={t(field.labelKey)}
            />
          ) : (
            <Input
              value={(config[field.key] as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(field.key, e.target.value)}
              placeholder={t(field.labelKey)}
              type={field.type === 'url' ? 'url' : 'text'}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default SyncConnectionFields
