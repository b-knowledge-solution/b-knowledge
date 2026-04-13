/**
 * @description Permission catalog for the `llm-provider` module. Sourced from
 * `PERMISSION_INVENTORY.md` §12. Slug normalizes to `llm_providers`.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for managing tenant LLM/embedding model providers. */
export const LLM_PROVIDER_PERMISSIONS = definePermissions('llm_providers', {
  view: {
    action: 'read',
    subject: PermissionSubjects.LlmProvider,
    label: 'View LLM providers',
    description: 'List configured LLM/embedding providers',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.LlmProvider,
    label: 'Create LLM provider',
    description: 'Add a new LLM/embedding provider configuration',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.LlmProvider,
    label: 'Edit LLM provider',
    description: 'Modify provider credentials, defaults, and model selection',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.LlmProvider,
    label: 'Delete LLM provider',
    description: 'Remove an LLM/embedding provider configuration',
  },
  test: {
    action: 'manage',
    subject: PermissionSubjects.LlmProvider,
    label: 'Test LLM provider',
    description: 'Run a connectivity/credential test against a provider',
  },
})
