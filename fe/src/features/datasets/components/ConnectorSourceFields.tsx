/**
 * @fileoverview Dynamic connection fields per connector source type.
 * Renders appropriate form fields for each external data source type,
 * with config keys matching the Python connector constructor expectations.
 *
 * Supports rich field types (text, password, select, checkbox, textarea,
 * segmented, tags), conditional rendering, tooltips, default values,
 * and per-datasource configurations inspired by RagFlow's approach.
 *
 * @module features/datasets/components/ConnectorSourceFields
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { TagEditor } from '@/components/ui/tag-editor'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { Eye, EyeOff, HelpCircle } from 'lucide-react'
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

/** @description Supported field types for connector configuration */
type FieldType = 'text' | 'password' | 'url' | 'number' | 'select' | 'checkbox' | 'textarea' | 'segmented' | 'tags'

/** @description A single select/segmented option */
interface FieldOption {
  label: string
  value: string
}

/** @description Definition for a single form field */
interface FieldDef {
  key: string
  labelKey: string
  type: FieldType
  required?: boolean
  placeholder?: string
  tooltipKey?: string
  defaultValue?: unknown
  options?: FieldOption[]
  /** Conditional rendering based on current config state */
  shouldRender?: (config: Record<string, unknown>) => boolean
}

// ============================================================================
// Field definitions per source type (keys match Python connector constructors)
// ============================================================================

/** @description Field definitions for each connector source type */
const SOURCE_FIELDS: Partial<Record<ConnectorSourceType, FieldDef[]>> = {
  // ── S3 / Blob Storage ────────────────────────────────────────────────
  blob_storage: [
    { key: 'bucket_name', labelKey: 'datasets.connectors.fields.bucketName', type: 'text', required: true },
    { key: 'bucket_type', labelKey: 'datasets.connectors.fields.bucketType', type: 'segmented', defaultValue: 's3', options: [
      { label: 'S3', value: 's3' },
      { label: 'S3 Compatible', value: 's3_compatible' },
    ] },
    { key: 'region', labelKey: 'datasets.connectors.fields.region', type: 'text', placeholder: 'us-east-1',
      tooltipKey: 'datasets.connectors.tooltips.s3Region',
      shouldRender: (c) => (c.bucket_type ?? 's3') === 's3',
    },
    { key: 'access_key', labelKey: 'datasets.connectors.fields.accessKey', type: 'password', required: true },
    { key: 'secret_key', labelKey: 'datasets.connectors.fields.secretKey', type: 'password', required: true },
    { key: 'endpoint', labelKey: 'datasets.connectors.fields.endpoint', type: 'url', placeholder: 'https://s3.amazonaws.com',
      tooltipKey: 'datasets.connectors.tooltips.s3Endpoint',
      shouldRender: (c) => c.bucket_type === 's3_compatible',
    },
    { key: 'addressing_style', labelKey: 'datasets.connectors.fields.addressingStyle', type: 'select', defaultValue: 'virtual', options: [
      { label: 'Virtual Hosted Style', value: 'virtual' },
      { label: 'Path Style', value: 'path' },
    ],
      tooltipKey: 'datasets.connectors.tooltips.s3AddressingStyle',
      shouldRender: (c) => c.bucket_type === 's3_compatible',
    },
    { key: 'prefix', labelKey: 'datasets.connectors.fields.prefix', type: 'text',
      tooltipKey: 'datasets.connectors.tooltips.s3Prefix',
    },
  ],

  // ── GitHub ───────────────────────────────────────────────────────────
  github: [
    { key: 'github_access_token', labelKey: 'datasets.connectors.fields.accessToken', type: 'password', required: true },
    { key: 'repo_owner', labelKey: 'datasets.connectors.fields.repoOwner', type: 'text', required: true },
    { key: 'repositories', labelKey: 'datasets.connectors.fields.repositories', type: 'text', placeholder: 'repo1,repo2',
      tooltipKey: 'datasets.connectors.tooltips.githubRepos',
    },
    { key: 'include_pull_requests', labelKey: 'datasets.connectors.fields.includePullRequests', type: 'checkbox', defaultValue: false },
    { key: 'include_issues', labelKey: 'datasets.connectors.fields.includeIssues', type: 'checkbox', defaultValue: false },
  ],

  // ── GitLab ───────────────────────────────────────────────────────────
  gitlab: [
    { key: 'gitlab_url', labelKey: 'datasets.connectors.fields.gitlabUrl', type: 'url', required: true, placeholder: 'https://gitlab.com' },
    { key: 'gitlab_access_token', labelKey: 'datasets.connectors.fields.accessToken', type: 'password', required: true },
    { key: 'project_owner', labelKey: 'datasets.connectors.fields.projectOwner', type: 'text', required: true },
    { key: 'project_name', labelKey: 'datasets.connectors.fields.projectName', type: 'text' },
    { key: 'include_merge_requests', labelKey: 'datasets.connectors.fields.includeMergeRequests', type: 'checkbox', defaultValue: true },
    { key: 'include_issues', labelKey: 'datasets.connectors.fields.includeIssues', type: 'checkbox', defaultValue: true },
    { key: 'include_code_files', labelKey: 'datasets.connectors.fields.includeCodeFiles', type: 'checkbox', defaultValue: true },
  ],

  // ── Jira ─────────────────────────────────────────────────────────────
  jira: [
    { key: 'jira_base_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true, placeholder: 'https://your-domain.atlassian.net' },
    { key: 'jira_user_email', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true, placeholder: 'you@example.com',
      tooltipKey: 'datasets.connectors.tooltips.jiraEmail',
    },
    { key: 'jira_api_token', labelKey: 'datasets.connectors.fields.jiraApiToken', type: 'password',
      tooltipKey: 'datasets.connectors.tooltips.jiraToken',
    },
    { key: 'jira_password', labelKey: 'datasets.connectors.fields.jiraPassword', type: 'password',
      tooltipKey: 'datasets.connectors.tooltips.jiraPassword',
    },
    { key: 'project_key', labelKey: 'datasets.connectors.fields.projectKey', type: 'text', placeholder: 'PROJ',
      tooltipKey: 'datasets.connectors.tooltips.jiraProjectKey',
    },
    { key: 'jql_query', labelKey: 'datasets.connectors.fields.jqlQuery', type: 'textarea', placeholder: 'project = RAG AND updated >= -7d',
      tooltipKey: 'datasets.connectors.tooltips.jiraJql',
    },
    { key: 'batch_size', labelKey: 'datasets.connectors.fields.batchSize', type: 'number',
      tooltipKey: 'datasets.connectors.tooltips.jiraBatchSize',
    },
    { key: 'include_comments', labelKey: 'datasets.connectors.fields.includeComments', type: 'checkbox', defaultValue: true,
      tooltipKey: 'datasets.connectors.tooltips.jiraComments',
    },
    { key: 'include_attachments', labelKey: 'datasets.connectors.fields.includeAttachments', type: 'checkbox', defaultValue: false,
      tooltipKey: 'datasets.connectors.tooltips.jiraAttachments',
    },
    { key: 'attachment_size_limit', labelKey: 'datasets.connectors.fields.attachmentSizeLimit', type: 'number', defaultValue: 10485760,
      tooltipKey: 'datasets.connectors.tooltips.jiraAttachmentSize',
      shouldRender: (c) => !!c.include_attachments,
    },
    { key: 'labels_to_skip', labelKey: 'datasets.connectors.fields.labelsToSkip', type: 'tags',
      tooltipKey: 'datasets.connectors.tooltips.jiraLabelsToSkip',
    },
    { key: 'comment_email_blacklist', labelKey: 'datasets.connectors.fields.commentEmailBlacklist', type: 'tags',
      tooltipKey: 'datasets.connectors.tooltips.jiraEmailBlacklist',
    },
    { key: 'scoped_token', labelKey: 'datasets.connectors.fields.scopedToken', type: 'checkbox', defaultValue: false,
      tooltipKey: 'datasets.connectors.tooltips.jiraScopedToken',
    },
  ],

  // ── Confluence ───────────────────────────────────────────────────────
  confluence: [
    { key: 'confluence_user_email', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true },
    { key: 'confluence_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'wiki_base', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url',
      tooltipKey: 'datasets.connectors.tooltips.confluenceWikiBase',
    },
    { key: 'is_cloud', labelKey: 'datasets.connectors.fields.isCloud', type: 'checkbox', defaultValue: true,
      tooltipKey: 'datasets.connectors.tooltips.confluenceIsCloud',
    },
    { key: 'index_mode', labelKey: 'datasets.connectors.fields.indexMode', type: 'segmented', defaultValue: 'everything', options: [
      { label: 'Everything', value: 'everything' },
      { label: 'Space', value: 'space' },
      { label: 'Page', value: 'page' },
    ] },
    { key: 'space', labelKey: 'datasets.connectors.fields.spaceKey', type: 'text', required: true,
      shouldRender: (c) => c.index_mode === 'space',
    },
    { key: 'page_id', labelKey: 'datasets.connectors.fields.pageId', type: 'text', required: true,
      shouldRender: (c) => c.index_mode === 'page',
    },
    { key: 'index_recursively', labelKey: 'datasets.connectors.fields.indexRecursively', type: 'checkbox', defaultValue: true,
      shouldRender: (c) => c.index_mode === 'page',
    },
  ],

  // ── Notion ───────────────────────────────────────────────────────────
  notion: [
    { key: 'notion_integration_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'root_page_id', labelKey: 'datasets.connectors.fields.rootPageId', type: 'text',
      tooltipKey: 'datasets.connectors.tooltips.notionRootPage',
    },
  ],

  // ── SharePoint ───────────────────────────────────────────────────────
  sharepoint: [
    // ── Authentication ──
    { key: 'site_url', labelKey: 'datasets.connectors.fields.siteUrl', type: 'url', required: true,
      placeholder: 'https://contoso.sharepoint.com/sites/Engineering',
      tooltipKey: 'datasets.connectors.tooltips.spSiteUrl',
    },
    { key: 'tenant_id', labelKey: 'datasets.connectors.fields.tenantId', type: 'text', required: true,
      tooltipKey: 'datasets.connectors.tooltips.spTenantId',
    },
    { key: 'client_id', labelKey: 'datasets.connectors.fields.clientId', type: 'text', required: true,
      tooltipKey: 'datasets.connectors.tooltips.spClientId',
    },
    { key: 'client_secret', labelKey: 'datasets.connectors.fields.clientSecret', type: 'password', required: true,
      tooltipKey: 'datasets.connectors.tooltips.spClientSecret',
    },
    // ── Source Scoping ──
    { key: 'library_names', labelKey: 'datasets.connectors.fields.libraryNames', type: 'tags',
      placeholder: 'Documents',
      tooltipKey: 'datasets.connectors.tooltips.spLibraryNames',
    },
    { key: 'folder_path', labelKey: 'datasets.connectors.fields.folderPath', type: 'text',
      placeholder: '/Reports/2024',
      tooltipKey: 'datasets.connectors.tooltips.spFolderPath',
    },
    { key: 'include_subfolders', labelKey: 'datasets.connectors.fields.includeSubfolders', type: 'checkbox', defaultValue: true,
      tooltipKey: 'datasets.connectors.tooltips.spIncludeSubfolders',
    },
    // ── Content Filtering ──
    { key: 'file_extensions_include', labelKey: 'datasets.connectors.fields.fileExtensionsInclude', type: 'tags',
      placeholder: 'pdf,docx,pptx,xlsx',
      tooltipKey: 'datasets.connectors.tooltips.spFileExtInclude',
    },
    { key: 'file_extensions_exclude', labelKey: 'datasets.connectors.fields.fileExtensionsExclude', type: 'tags',
      placeholder: 'tmp,bak',
      tooltipKey: 'datasets.connectors.tooltips.spFileExtExclude',
    },
    { key: 'max_file_size_mb', labelKey: 'datasets.connectors.fields.maxFileSizeMb', type: 'number', defaultValue: 50,
      tooltipKey: 'datasets.connectors.tooltips.spMaxFileSize',
    },
    // ── Sync Behavior ──
    { key: 'include_permissions', labelKey: 'datasets.connectors.fields.includePermissions', type: 'checkbox', defaultValue: false,
      tooltipKey: 'datasets.connectors.tooltips.spIncludePermissions',
    },
    { key: 'include_metadata', labelKey: 'datasets.connectors.fields.includeMetadata', type: 'checkbox', defaultValue: true,
      tooltipKey: 'datasets.connectors.tooltips.spIncludeMetadata',
    },
    { key: 'exclude_hidden_libraries', labelKey: 'datasets.connectors.fields.excludeHiddenLibraries', type: 'checkbox', defaultValue: true,
      tooltipKey: 'datasets.connectors.tooltips.spExcludeHidden',
    },
  ],

  // ── Google Drive ─────────────────────────────────────────────────────
  google_drive: [
    { key: 'service_account_json', labelKey: 'datasets.connectors.fields.serviceAccountJson', type: 'textarea', required: true,
      placeholder: '{ "type": "service_account", ... }',
      tooltipKey: 'datasets.connectors.tooltips.googleServiceAccount',
    },
    { key: 'primary_admin_email', labelKey: 'datasets.connectors.fields.primaryAdminEmail', type: 'text', placeholder: 'admin@example.com',
      tooltipKey: 'datasets.connectors.tooltips.googlePrimaryAdmin',
    },
    { key: 'my_drive_emails', labelKey: 'datasets.connectors.fields.myDriveEmails', type: 'text', placeholder: 'user1@example.com,user2@example.com',
      tooltipKey: 'datasets.connectors.tooltips.googleMyDriveEmails',
    },
    { key: 'shared_folder_urls', labelKey: 'datasets.connectors.fields.sharedFolderUrls', type: 'textarea',
      placeholder: 'https://drive.google.com/drive/folders/XXXXX',
      tooltipKey: 'datasets.connectors.tooltips.googleSharedFolders',
    },
    { key: 'folder_id', labelKey: 'datasets.connectors.fields.folderId', type: 'text',
      tooltipKey: 'datasets.connectors.tooltips.googleFolderId',
    },
  ],

  // ── Dropbox ──────────────────────────────────────────────────────────
  dropbox: [
    { key: 'dropbox_access_token', labelKey: 'datasets.connectors.fields.accessToken', type: 'password', required: true,
      tooltipKey: 'datasets.connectors.tooltips.dropboxToken',
    },
    { key: 'folder_path', labelKey: 'datasets.connectors.fields.folderPath', type: 'text', placeholder: '/Documents' },
    { key: 'batch_size', labelKey: 'datasets.connectors.fields.batchSize', type: 'number', placeholder: '2',
      tooltipKey: 'datasets.connectors.tooltips.batchSize',
    },
  ],

  // ── Slack ────────────────────────────────────────────────────────────
  slack: [
    { key: 'slack_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'channel_ids', labelKey: 'datasets.connectors.fields.channelIds', type: 'tags', placeholder: 'C01234567',
      tooltipKey: 'datasets.connectors.tooltips.slackChannels',
    },
  ],

  // ── Discord ──────────────────────────────────────────────────────────
  discord: [
    { key: 'discord_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'server_ids', labelKey: 'datasets.connectors.fields.serverIds', type: 'tags', placeholder: '123456789',
      tooltipKey: 'datasets.connectors.tooltips.discordServers',
    },
    { key: 'channel_ids', labelKey: 'datasets.connectors.fields.channelIds', type: 'tags', placeholder: '987654321',
      tooltipKey: 'datasets.connectors.tooltips.discordChannels',
    },
  ],

  // ── Gmail ────────────────────────────────────────────────────────────
  gmail: [
    { key: 'service_account_json', labelKey: 'datasets.connectors.fields.serviceAccountJson', type: 'textarea', required: true,
      placeholder: '{ "type": "service_account", ... }',
      tooltipKey: 'datasets.connectors.tooltips.googleServiceAccount',
    },
    { key: 'user_email', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true, placeholder: 'admin@example.com' },
  ],

  // ── IMAP ─────────────────────────────────────────────────────────────
  imap: [
    { key: 'imap_host', labelKey: 'datasets.connectors.fields.imapHost', type: 'text', required: true, placeholder: 'imap.gmail.com' },
    { key: 'imap_port', labelKey: 'datasets.connectors.fields.imapPort', type: 'number', defaultValue: 993 },
    { key: 'imap_user', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true },
    { key: 'imap_password', labelKey: 'datasets.connectors.fields.password', type: 'password', required: true },
    { key: 'imap_mailboxes', labelKey: 'datasets.connectors.fields.mailboxes', type: 'tags', placeholder: 'INBOX',
      tooltipKey: 'datasets.connectors.tooltips.imapMailboxes',
    },
    { key: 'poll_range', labelKey: 'datasets.connectors.fields.pollRange', type: 'number',
      tooltipKey: 'datasets.connectors.tooltips.imapPollRange',
    },
  ],

  // ── Asana ────────────────────────────────────────────────────────────
  asana: [
    { key: 'asana_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'asana_workspace_id', labelKey: 'datasets.connectors.fields.workspaceId', type: 'text', required: true,
      tooltipKey: 'datasets.connectors.tooltips.asanaWorkspace',
    },
    { key: 'project_gid', labelKey: 'datasets.connectors.fields.projectId', type: 'text' },
    { key: 'team_id', labelKey: 'datasets.connectors.fields.teamId', type: 'text',
      tooltipKey: 'datasets.connectors.tooltips.asanaTeamId',
    },
  ],

  // ── Airtable ─────────────────────────────────────────────────────────
  airtable: [
    { key: 'airtable_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'base_id', labelKey: 'datasets.connectors.fields.baseId', type: 'text', required: true },
    { key: 'table_name_or_id', labelKey: 'datasets.connectors.fields.tableName', type: 'text', required: true,
      tooltipKey: 'datasets.connectors.tooltips.airtableTable',
    },
  ],

  // ── Zendesk ──────────────────────────────────────────────────────────
  zendesk: [
    { key: 'zendesk_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true, placeholder: 'https://yourcompany.zendesk.com' },
    { key: 'zendesk_email', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true },
    { key: 'zendesk_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'zendesk_content_type', labelKey: 'datasets.connectors.fields.contentType', type: 'segmented', defaultValue: 'articles', options: [
      { label: 'Articles', value: 'articles' },
      { label: 'Tickets', value: 'tickets' },
    ] },
  ],

  // ── Microsoft Teams ──────────────────────────────────────────────────
  teams: [
    { key: 'teams_tenant_id', labelKey: 'datasets.connectors.fields.tenantId', type: 'text', required: true },
    { key: 'teams_client_id', labelKey: 'datasets.connectors.fields.clientId', type: 'text', required: true },
    { key: 'teams_client_secret', labelKey: 'datasets.connectors.fields.clientSecret', type: 'password', required: true },
  ],

  // ── Bitbucket ────────────────────────────────────────────────────────
  bitbucket: [
    { key: 'bitbucket_username', labelKey: 'datasets.connectors.fields.email', type: 'text', required: true,
      tooltipKey: 'datasets.connectors.tooltips.bitbucketEmail',
    },
    { key: 'bitbucket_app_password', labelKey: 'datasets.connectors.fields.appPassword', type: 'password', required: true },
    { key: 'workspace', labelKey: 'datasets.connectors.fields.workspace', type: 'text', required: true,
      tooltipKey: 'datasets.connectors.tooltips.bitbucketWorkspace',
    },
    { key: 'index_mode', labelKey: 'datasets.connectors.fields.indexMode', type: 'segmented', defaultValue: 'repositories', options: [
      { label: 'Repositories', value: 'repositories' },
      { label: 'Projects', value: 'projects' },
      { label: 'Workspace', value: 'workspace' },
    ] },
    { key: 'repo_slug', labelKey: 'datasets.connectors.fields.repoSlug', type: 'text',
      tooltipKey: 'datasets.connectors.tooltips.bitbucketRepoSlugs',
      shouldRender: (c) => (c.index_mode ?? 'repositories') === 'repositories',
    },
    { key: 'projects', labelKey: 'datasets.connectors.fields.projectKey', type: 'text',
      tooltipKey: 'datasets.connectors.tooltips.bitbucketProjects',
      shouldRender: (c) => c.index_mode === 'projects',
    },
    { key: 'bitbucket_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', placeholder: 'https://bitbucket.org',
      tooltipKey: 'datasets.connectors.tooltips.bitbucketUrl',
    },
  ],

  // ── Seafile ──────────────────────────────────────────────────────────
  seafile: [
    { key: 'seafile_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true, placeholder: 'https://seafile.example.com',
      tooltipKey: 'datasets.connectors.tooltips.seafileUrl',
    },
    { key: 'sync_scope', labelKey: 'datasets.connectors.fields.syncScope', type: 'segmented', defaultValue: 'account', options: [
      { label: 'Entire Account', value: 'account' },
      { label: 'Single Library', value: 'library' },
      { label: 'Specific Directory', value: 'directory' },
    ],
      tooltipKey: 'datasets.connectors.tooltips.seafileSyncScope',
    },
    { key: 'seafile_token', labelKey: 'datasets.connectors.fields.accountApiToken', type: 'password', required: true,
      tooltipKey: 'datasets.connectors.tooltips.seafileAccountToken',
    },
    { key: 'repo_token', labelKey: 'datasets.connectors.fields.libraryToken', type: 'password',
      tooltipKey: 'datasets.connectors.tooltips.seafileLibraryToken',
      shouldRender: (c) => c.sync_scope === 'library' || c.sync_scope === 'directory',
    },
    { key: 'repo_id', labelKey: 'datasets.connectors.fields.repoId', type: 'text', placeholder: 'e.g. 7a9e1b3c-4d5f-6a7b-...',
      tooltipKey: 'datasets.connectors.tooltips.seafileRepoId',
      shouldRender: (c) => c.sync_scope === 'library' || c.sync_scope === 'directory',
    },
    { key: 'sync_path', labelKey: 'datasets.connectors.fields.directoryPath', type: 'text', placeholder: '/Documents/Reports',
      shouldRender: (c) => c.sync_scope === 'directory',
    },
    { key: 'include_shared', labelKey: 'datasets.connectors.fields.includeShared', type: 'checkbox', defaultValue: true,
      tooltipKey: 'datasets.connectors.tooltips.seafileIncludeShared',
      shouldRender: (c) => (c.sync_scope ?? 'account') === 'account',
    },
    { key: 'batch_size', labelKey: 'datasets.connectors.fields.batchSize', type: 'number', placeholder: '100',
      tooltipKey: 'datasets.connectors.tooltips.batchSize',
    },
  ],

  // ── Database (RDBMS) ─────────────────────────────────────────────────
  rdbms: [
    { key: 'db_type', labelKey: 'datasets.connectors.fields.dbType', type: 'select', required: true, options: [
      { label: 'PostgreSQL', value: 'postgresql' },
      { label: 'MySQL', value: 'mysql' },
      { label: 'Microsoft SQL Server', value: 'mssql' },
    ] },
    { key: 'db_host', labelKey: 'datasets.connectors.fields.dbHost', type: 'text', required: true, placeholder: 'localhost' },
    { key: 'db_port', labelKey: 'datasets.connectors.fields.dbPort', type: 'number', required: true,
      defaultValue: 5432,
    },
    { key: 'db_name', labelKey: 'datasets.connectors.fields.dbName', type: 'text', required: true },
    { key: 'db_user', labelKey: 'datasets.connectors.fields.username', type: 'text', required: true },
    { key: 'db_password', labelKey: 'datasets.connectors.fields.password', type: 'password', required: true },
    { key: 'query', labelKey: 'datasets.connectors.fields.sqlQuery', type: 'textarea', placeholder: 'SELECT * FROM documents WHERE ...',
      tooltipKey: 'datasets.connectors.tooltips.rdbmsQuery',
    },
    { key: 'content_columns', labelKey: 'datasets.connectors.fields.contentColumns', type: 'text', placeholder: 'title,description,content',
      tooltipKey: 'datasets.connectors.tooltips.rdbmsContentColumns',
    },
  ],

  // ── WebDAV ───────────────────────────────────────────────────────────
  webdav: [
    { key: 'webdav_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true, placeholder: 'https://webdav.example.com' },
    { key: 'webdav_user', labelKey: 'datasets.connectors.fields.username', type: 'text', required: true },
    { key: 'webdav_password', labelKey: 'datasets.connectors.fields.password', type: 'password', required: true },
    { key: 'webdav_path', labelKey: 'datasets.connectors.fields.folderPath', type: 'text', placeholder: '/',
      tooltipKey: 'datasets.connectors.tooltips.webdavPath',
    },
  ],

  // ── Box ──────────────────────────────────────────────────────────────
  box: [
    { key: 'box_access_token', labelKey: 'datasets.connectors.fields.accessToken', type: 'password', required: true },
    { key: 'folder_id', labelKey: 'datasets.connectors.fields.folderId', type: 'text', placeholder: 'Defaults to root' },
  ],

  // ── Moodle ───────────────────────────────────────────────────────────
  moodle: [
    { key: 'moodle_url', labelKey: 'datasets.connectors.fields.baseUrl', type: 'url', required: true, placeholder: 'https://moodle.example.com' },
    { key: 'moodle_token', labelKey: 'datasets.connectors.fields.apiToken', type: 'password', required: true },
    { key: 'course_id', labelKey: 'datasets.connectors.fields.courseId', type: 'text' },
  ],

  // ── DingTalk ─────────────────────────────────────────────────────────
  dingtalk: [
    { key: 'dingtalk_app_key', labelKey: 'datasets.connectors.fields.appKey', type: 'password', required: true },
    { key: 'dingtalk_app_secret', labelKey: 'datasets.connectors.fields.appSecret', type: 'password', required: true },
    { key: 'table_id', labelKey: 'datasets.connectors.fields.tableId', type: 'text',
      tooltipKey: 'datasets.connectors.tooltips.dingtalkTableId',
    },
    { key: 'operator_id', labelKey: 'datasets.connectors.fields.operatorId', type: 'text',
      tooltipKey: 'datasets.connectors.tooltips.dingtalkOperatorId',
    },
  ],
}

/** @description Default port by RDBMS type */
const DB_DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
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
// Tooltip Label Component
// ============================================================================

/**
 * @description Label with an optional tooltip icon for field help text
 * @param {{ label: string; tooltip?: string; required?: boolean }} props
 * @returns {JSX.Element} Label element with optional help icon
 */
const FieldLabel = ({ label, tooltip, required }: { label: string; tooltip?: string; required?: boolean }) => (
  <div className="flex items-center gap-1 mb-1">
    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </span>
    {tooltip && (
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle size={14} className="text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    )}
  </div>
)

// ============================================================================
// Segmented Control Component
// ============================================================================

/**
 * @description Inline segmented control for selecting between 2-4 options.
 * Renders as a row of toggle buttons with active state highlighting.
 * @param {{ options: FieldOption[]; value: string; onChange: (v: string) => void }} props
 * @returns {JSX.Element} Segmented control
 */
const SegmentedControl = ({ options, value, onChange }: { options: FieldOption[]; value: string; onChange: (v: string) => void }) => (
  <div className="flex rounded-md border border-input bg-background overflow-hidden">
    {options.map((opt) => {
      // Highlight the active option
      const isActive = value === opt.value
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {opt.label}
        </button>
      )
    })}
  </div>
)

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders dynamic connection fields based on the selected data source type.
 * Supports rich field types (text, password, select, checkbox, textarea, segmented, tags),
 * conditional rendering, tooltips, and default values. Config keys match the Python
 * connector constructor parameters.
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
  const handleFieldChange = (key: string, value: unknown) => {
    const updated = { ...config, [key]: value }

    // Auto-update RDBMS port when db_type changes to match default port
    if (sourceType === 'rdbms' && key === 'db_type' && typeof value === 'string') {
      const currentPort = config.db_port
      const previousDefault = DB_DEFAULT_PORTS[config.db_type as string]
      // Only auto-set port if user hasn't customized it
      if (!currentPort || currentPort === previousDefault) {
        updated.db_port = DB_DEFAULT_PORTS[value] ?? 5432
      }
    }

    onChange(updated)
  }

  /** Resolve a field's display value, falling back to its default */
  const getFieldValue = (field: FieldDef): unknown => {
    const val = config[field.key]
    if (val !== undefined && val !== null) return val
    return field.defaultValue ?? (field.type === 'tags' ? [] : '')
  }

  // Show fallback message for source types without field definition
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('datasets.connectors.noFieldsDefined')}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        // Skip fields that shouldn't render based on current config state
        if (field.shouldRender && !field.shouldRender(config)) return null

        const value = getFieldValue(field)
        const tooltipText = field.tooltipKey ? t(field.tooltipKey) : undefined

        return (
          <div key={field.key}>
            {/* Checkbox uses inline layout; all others use stacked layout */}
            {field.type === 'checkbox' ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!value}
                  onCheckedChange={(checked: boolean) => handleFieldChange(field.key, checked)}
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t(field.labelKey)}
                </span>
                {tooltipText && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle size={14} className="text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">{tooltipText}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </label>
            ) : (
              <>
                <FieldLabel
                  label={t(field.labelKey)}
                  {...(tooltipText ? { tooltip: tooltipText } : {})}
                  {...(field.required !== undefined ? { required: field.required } : {})}
                />

                {/* Password field with visibility toggle */}
                {field.type === 'password' && (
                  <PasswordInput
                    value={String(value)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder || t(field.labelKey)}
                  />
                )}

                {/* Select dropdown */}
                {field.type === 'select' && (
                  <Select
                    value={String(value)}
                    onValueChange={(v: string) => handleFieldChange(field.key, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || t(field.labelKey)} />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options || []).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Segmented control (inline toggle buttons) */}
                {field.type === 'segmented' && (
                  <SegmentedControl
                    options={field.options || []}
                    value={String(value || field.defaultValue || '')}
                    onChange={(v: string) => handleFieldChange(field.key, v)}
                  />
                )}

                {/* Textarea for multi-line input */}
                {field.type === 'textarea' && (
                  <Textarea
                    value={String(value)}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder || t(field.labelKey)}
                    rows={3}
                    className="font-mono text-xs"
                  />
                )}

                {/* Tag editor for list-based inputs */}
                {field.type === 'tags' && (
                  <TagEditor
                    value={Array.isArray(value) ? value as string[] : []}
                    onChange={(tags: string[]) => handleFieldChange(field.key, tags)}
                    placeholder={field.placeholder || t(field.labelKey)}
                  />
                )}

                {/* Standard text/url/number input */}
                {(field.type === 'text' || field.type === 'url' || field.type === 'number') && (
                  <Input
                    value={String(value)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const raw = e.target.value
                      handleFieldChange(field.key, field.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw)
                    }}
                    placeholder={field.placeholder || t(field.labelKey)}
                    type={field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text'}
                  />
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ConnectorSourceFields
