/**
 * @description Permission catalog for the `rag` module. Sourced from
 * `PERMISSION_INVENTORY.md` §15. The rag module owns the dataset pipeline and
 * splits into multiple sub-features:
 *
 *   - `datasets` — dataset CRUD, sharing, advanced jobs, re-embedding
 *   - `documents` — write-side actions on documents (parse, enrich, bulk).
 *     Read-side `documents.view` lives in `knowledge-base.permissions.ts`
 *     because the KB module is the natural owner of document browsing.
 *   - `chunks` — chunk-level CRUD inside a document
 *
 * The conventional `RAG_PERMISSIONS` export aliases the primary `datasets`
 * sub-feature; the other two are exported as named constants.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Primary dataset CRUD and lifecycle. */
export const RAG_PERMISSIONS = definePermissions('datasets', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Dataset,
    label: 'View datasets',
    description: 'Browse datasets and their settings',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.Dataset,
    label: 'Create dataset',
    description: 'Create a new dataset',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.Dataset,
    label: 'Edit dataset',
    description: 'Modify dataset settings, versions, and metadata',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.Dataset,
    label: 'Delete dataset',
    description: 'Remove a dataset',
  },
  share: {
    action: 'manage',
    subject: PermissionSubjects.Dataset,
    label: 'Share dataset',
    description: 'Manage user/team grants on a dataset',
  },
  reindex: {
    action: 'manage',
    subject: PermissionSubjects.Dataset,
    label: 'Re-embed dataset',
    description: 'Trigger a re-embedding pass over a dataset',
  },
  advanced: {
    action: 'manage',
    subject: PermissionSubjects.Dataset,
    label: 'Run advanced dataset jobs',
    description: 'Run GraphRAG, RAPTOR, mindmap, and other advanced pipelines',
  },
})

/** Write-side document actions owned by the dataset pipeline. */
export const RAG_DOCUMENTS_PERMISSIONS = definePermissions('documents', {
  create: {
    action: 'create',
    subject: PermissionSubjects.Document,
    label: 'Create document',
    description: 'Upload or create a new document inside a dataset',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.Document,
    label: 'Edit document',
    description: 'Modify document metadata or content',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.Document,
    label: 'Delete document',
    description: 'Remove a document',
  },
  parse: {
    action: 'manage',
    subject: PermissionSubjects.Document,
    label: 'Parse document',
    description: 'Trigger parsing/chunking on a document',
  },
  enrich: {
    action: 'manage',
    subject: PermissionSubjects.Document,
    label: 'Enrich document',
    description: 'Run enrichment passes (summarization, tagging) on a document',
  },
  bulk: {
    action: 'manage',
    subject: PermissionSubjects.Document,
    label: 'Bulk document operations',
    description: 'Run bulk delete / bulk move / bulk reparse operations',
  },
})

/** Chunk-level CRUD inside a document. */
export const RAG_CHUNKS_PERMISSIONS = definePermissions('chunks', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Chunk,
    label: 'View chunks',
    description: 'Browse chunks inside a document',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.Chunk,
    label: 'Create chunk',
    description: 'Insert a new chunk into a document',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.Chunk,
    label: 'Edit chunk',
    description: 'Modify chunk content or metadata',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.Chunk,
    label: 'Delete chunk',
    description: 'Remove a chunk from a document',
  },
})
