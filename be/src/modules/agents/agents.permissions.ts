/**
 * @description Permission catalog for the `agents` module. Sourced from
 * `.planning/research/PERMISSION_INVENTORY.md` §1. Imported eagerly by
 * `@/shared/permissions/index.ts` so the registry side effects fire at boot.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/**
 * @description Registered permissions for the agent builder, runtime, and
 * embed/credentials surfaces. Action keys map 1:1 to the keys exposed by
 * `definePermissions`, so consumers reference e.g. `AGENTS_PERMISSIONS.run.key`.
 */
export const AGENTS_PERMISSIONS = definePermissions('agents', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Agent,
    label: 'View agents',
    description: 'List and inspect agent definitions and run history',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.Agent,
    label: 'Create agents',
    description: 'Create or duplicate agent definitions',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.Agent,
    label: 'Edit agents',
    description: 'Modify agent definitions, versions, and metadata',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.Agent,
    label: 'Delete agents',
    description: 'Remove agent definitions',
  },
  run: {
    action: 'run',
    subject: PermissionSubjects.Agent,
    label: 'Run agents',
    description: 'Execute, stream, and cancel agent runs',
  },
  debug: {
    action: 'debug',
    subject: PermissionSubjects.Agent,
    label: 'Debug agents',
    description: 'Use the agent debugger and inspect intermediate state',
  },
  credentials: {
    action: 'manage',
    subject: PermissionSubjects.Agent,
    label: 'Manage agent tool credentials',
    description: 'Create, rotate, and delete sensitive third-party credentials used by agent tools',
  },
  embed: {
    action: 'manage',
    subject: PermissionSubjects.Agent,
    label: 'Manage agent embeds',
    description: 'Configure publicly embeddable agent endpoints',
  },
})
