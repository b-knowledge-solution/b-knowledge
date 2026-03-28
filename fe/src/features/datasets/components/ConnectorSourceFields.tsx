/**
 * @fileoverview Dynamic connection fields per connector source type.
 * Renders appropriate form fields for each external data source type,
 * with config keys matching the Python connector constructor expectations.
 *
 * @module features/datasets/components/ConnectorSourceFields
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import type { ConnectorSourceType } from '../types'

// ============================================================================
// Types
// ============================================================================

/** @description Props for the ConnectorSourceFields component */
interface ConnectorSourceFieldsProps {
  /** The selected source type */
  sourceType: ConnectorSourceType
  /** Current connection config values */
  config: Record<string, unknown>
  /** Callback when config values change */
  onChange: (config: Record<string, unknown>) => void
}

/** @description Definition for a single form field */
interface FieldDef {
  key: string
  labelKey: string
  type: 'text' | 'password' | 'url' | 'number'
  required?: boolean
  placeholder?: string
}

// ============================================================================
// Field definitions per source type (keys match Python connector constructors)
// ============================================================================

/** @description Field definitions for each connector source type */
const SOURCE_FIELDS: Partial<Record<ConnectorSourceType, FieldDef[]>> = {
  blob_storage: [
    { key: 'endpoint', labelKey: 'datasets.connectors.fields.endpoint', type: 'url', required: true },
    { key: 'access_key', labelKey: 'datasets.connectors.fields.accessKey', type: 'password', required: true },
    { key: 'secret_key', labelKey: 'datasets.connectors.fields.secretKey', type: 'password', required: true },
    { key: 'bucket_name', labelKey: 'datasets.connectors.fields.bucketName', type: 'text', required: true },
    { key: 'prefix', labelKey: 'datasets.connectors.fields.prefix', type: 'text' },
  ],
  github: [
    { key: 'github_access_token', labelKey: 'datasets.connectors.fields.accessToken', type: 'password', required: true },
    { key: 'repo_owner', labelKey: 'datasets.connectors.fields.repoOwner', type: 'text', required: true },
    { key: 'repositories', labelKey: 'datasets.connectors.fields.repositories', type: 'text', placeholder: 'repo1,repo2' },
  ],
  gitlab: [
    { key: 'gitlab_url', labelKey: 'datasets.connectors.fields.gitlabUrl', type: 'url', required: true },
    { key: 'gitlab_access_token', labelKey: 'datasets.connectors.fields.accessToken', type: 'password', required: true },
    { key: 'project_owner', labelKey: 'datasets.connectors.fields.projectOwner', type: 'text', required: true },
    { key: 'project_name', labelKey: 'datasets.connectors.fields.projectName', type: 'text' },
  ],
  jira: [
    { key: 'jira_base_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true },
    { key: 'jira_user_email', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true },
    { key: 'jira_api_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'project_key', labelKey: 'datasets.connectors.fields.projectKey', type: 'text' },
  ],
  confluence: [
    { key: 'wiki_base', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true },
    { key: 'confluence_user_email', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true },
    { key: 'confluence_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'space', labelKey: 'datasets.connectors.fields.spaceKey', type: 'text' },
  ],
  notion: [
    { key: 'notion_integration_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'root_page_id', labelKey: 'datasets.connectors.fields.rootPageId', type: 'text' },
  ],
  sharepoint: [
    { key: 'site_url', labelKey: 'datasets.connectors.fields.siteUrl', type: 'url', required: true },
    { key: 'tenant_id', labelKey: 'datasets.connectors.fields.tenantId', type: 'text', required: true },
    { key: 'client_id', labelKey: 'datasets.connectors.fields.clientId', type: 'text', required: true },
    { key: 'client_secret', labelKey: 'datasets.connectors.fields.clientSecret', type: 'password', required: true },
  ],
  google_drive: [
    { key: 'service_account_json', labelKey: 'datasets.connectors.fields.serviceAccountJson', type: 'password', required: true },
    { key: 'folder_id', labelKey: 'datasets.connectors.fields.folderId', type: 'text' },
  ],
  dropbox: [
    { key: 'dropbox_access_token', labelKey: 'datasets.connectors.fields.accessToken', type: 'password', required: true },
    { key: 'folder_path', labelKey: 'datasets.connectors.fields.folderPath', type: 'text' },
  ],
  slack: [
    { key: 'slack_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'channel_ids', labelKey: 'datasets.connectors.fields.channelIds', type: 'text', placeholder: 'C01234,C56789' },
  ],
  discord: [
    { key: 'discord_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'channel_ids', labelKey: 'datasets.connectors.fields.channelIds', type: 'text', placeholder: '123456,789012' },
  ],
  gmail: [
    { key: 'service_account_json', labelKey: 'datasets.connectors.fields.serviceAccountJson', type: 'password', required: true },
    { key: 'user_email', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true },
  ],
  imap: [
    { key: 'imap_host', labelKey: 'datasets.connectors.fields.imapHost', type: 'text', required: true },
    { key: 'imap_port', labelKey: 'datasets.connectors.fields.imapPort', type: 'number' },
    { key: 'imap_user', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true },
    { key: 'imap_password', labelKey: 'datasets.connectors.fields.password', type: 'password', required: true },
  ],
  asana: [
    { key: 'asana_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'project_gid', labelKey: 'datasets.connectors.fields.projectId', type: 'text' },
  ],
  airtable: [
    { key: 'airtable_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'base_id', labelKey: 'datasets.connectors.fields.baseId', type: 'text', required: true },
  ],
  zendesk: [
    { key: 'zendesk_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true },
    { key: 'zendesk_email', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true },
    { key: 'zendesk_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
  ],
  teams: [
    { key: 'teams_tenant_id', labelKey: 'datasets.connectors.fields.tenantId', type: 'text', required: true },
    { key: 'teams_client_id', labelKey: 'datasets.connectors.fields.clientId', type: 'text', required: true },
    { key: 'teams_client_secret', labelKey: 'datasets.connectors.fields.clientSecret', type: 'password', required: true },
  ],
  bitbucket: [
    { key: 'bitbucket_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url' },
    { key: 'bitbucket_username', labelKey: 'datasets.connectors.fields.username', type: 'text', required: true },
    { key: 'bitbucket_app_password', labelKey: 'datasets.connectors.fields.appPassword', type: 'password', required: true },
    { key: 'workspace', labelKey: 'datasets.connectors.fields.workspace', type: 'text', required: true },
    { key: 'repo_slug', labelKey: 'datasets.connectors.fields.repoSlug', type: 'text' },
  ],
  seafile: [
    { key: 'seafile_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true },
    { key: 'seafile_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'repo_id', labelKey: 'datasets.connectors.fields.repoId', type: 'text' },
  ],
  rdbms: [
    { key: 'db_type', labelKey: 'datasets.connectors.fields.dbType', type: 'text', required: true, placeholder: 'postgresql, mysql, mssql' },
    { key: 'db_host', labelKey: 'datasets.connectors.fields.dbHost', type: 'text', required: true },
    { key: 'db_port', labelKey: 'datasets.connectors.fields.dbPort', type: 'number', required: true },
    { key: 'db_name', labelKey: 'datasets.connectors.fields.dbName', type: 'text', required: true },
    { key: 'db_user', labelKey: 'datasets.connectors.fields.username', type: 'text', required: true },
    { key: 'db_password', labelKey: 'datasets.connectors.fields.password', type: 'password', required: true },
  ],
  webdav: [
    { key: 'webdav_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true },
    { key: 'webdav_user', labelKey: 'datasets.connectors.fields.username', type: 'text', required: true },
    { key: 'webdav_password', labelKey: 'datasets.connectors.fields.password', type: 'password', required: true },
    { key: 'webdav_path', labelKey: 'datasets.connectors.fields.folderPath', type: 'text' },
  ],
  box: [
    { key: 'box_access_token', labelKey: 'datasets.connectors.fields.accessToken', type: 'password', required: true },
    { key: 'folder_id', labelKey: 'datasets.connectors.fields.folderId', type: 'text' },
  ],
  moodle: [
    { key: 'moodle_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true },
    { key: 'moodle_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'course_id', labelKey: 'datasets.connectors.fields.courseId', type: 'text' },
  ],
  dingtalk: [
    { key: 'dingtalk_app_key', labelKey: 'datasets.connectors.fields.appKey', type: 'password', required: true },
    { key: 'dingtalk_app_secret', labelKey: 'datasets.connectors.fields.appSecret', type: 'password', required: true },
  ],
}

// ============================================================================
// Password Input Component
// ============================================================================

/**
 * @description Input with toggle visibility for password/secret fields
 * @param {object} props - Input value, onChange, and placeholder
 * @returns {JSX.Element} Password input with eye toggle
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
 * @description Renders dynamic connection fields based on the selected data source type.
 * Config keys match the Python connector constructor parameters.
 * @param {ConnectorSourceFieldsProps} props - Source type and config state handlers
 * @returns {JSX.Element} Rendered connection form fields
 */
const ConnectorSourceFields = ({
  sourceType,
  config,
  onChange,
}: ConnectorSourceFieldsProps) => {
  const { t } = useTranslation()
  const fields = SOURCE_FIELDS[sourceType] || []

  /** Update a single field in the config object */
  const handleFieldChange = (key: string, value: string) => {
    onChange({ ...config, [key]: value })
  }

  // Show fallback message for source types without field definitions
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('datasets.connectors.noFieldsDefined')}
      </p>
    )
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
              placeholder={field.placeholder || t(field.labelKey)}
            />
          ) : (
            <Input
              value={(config[field.key] as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(field.key, e.target.value)}
              placeholder={field.placeholder || t(field.labelKey)}
              type={field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text'}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default ConnectorSourceFields
