/**
 * @description Permission catalog for the `code-graph` module. Sourced from
 * `PERMISSION_INVENTORY.md` §6. Note: the feature slug `code-graph` is
 * normalized to `code_graph` by the registry helper, so the resulting keys are
 * `code_graph.view` and `code_graph.manage`.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for the code knowledge graph admin surface. */
export const CODE_GRAPH_PERMISSIONS = definePermissions('code-graph', {
  view: {
    action: 'read',
    subject: PermissionSubjects.CodeGraph,
    label: 'View code graph',
    description: 'Browse the code knowledge graph and run read-only queries',
  },
  manage: {
    action: 'manage',
    subject: PermissionSubjects.CodeGraph,
    label: 'Manage code graph',
    description: 'Trigger graph rebuilds, embeddings, and maintenance jobs',
  },
})
