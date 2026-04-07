/**
 * @description Permission catalog for the `knowledge-base` module. This module
 * is the largest in the backend (~80 routes) and naturally splits into three
 * sub-features per `PERMISSION_INVENTORY.md` §11:
 *
 *   1. `knowledge_base` — KB CRUD, sharing, sync configs, chats/searches links
 *   2. `document_categories` — category CRUD plus version/import operations
 *   3. `documents` — view/create/delete on documents inside a KB
 *      (write/parse/enrich actions for documents live in the rag module —
 *      see `rag.permissions.ts` — because they are owned by the dataset
 *      pipeline.)
 *
 * Each sub-feature is registered with its own `definePermissions` call so
 * keys remain non-colliding across modules. The conventional
 * `KNOWLEDGE_BASE_PERMISSIONS` export aliases the primary `knowledge_base`
 * sub-feature; the other two sub-features are exported separately.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Primary KB CRUD + sharing + sync. */
export const KNOWLEDGE_BASE_PERMISSIONS = definePermissions('knowledge-base', {
  view: {
    action: 'read',
    subject: PermissionSubjects.KnowledgeBase,
    label: 'View knowledge base',
    description: 'Browse knowledge bases granted to the user',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.KnowledgeBase,
    label: 'Create knowledge base',
    description: 'Create a new knowledge base',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.KnowledgeBase,
    label: 'Edit knowledge base',
    description: 'Modify knowledge base settings, datasets bindings, and metadata',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.KnowledgeBase,
    label: 'Delete knowledge base',
    description: 'Remove a knowledge base and its category tree',
  },
  share: {
    action: 'manage',
    subject: PermissionSubjects.KnowledgeBase,
    label: 'Share knowledge base',
    description: 'Manage user/team grants and entity-level permissions on a KB',
  },
  chats: {
    action: 'manage',
    subject: PermissionSubjects.KnowledgeBase,
    label: 'Manage knowledge base chats',
    description: 'Bind and unbind chat assistants to a knowledge base',
  },
  searches: {
    action: 'manage',
    subject: PermissionSubjects.KnowledgeBase,
    label: 'Manage knowledge base searches',
    description: 'Bind and unbind search apps to a knowledge base',
  },
  sync: {
    action: 'manage',
    subject: PermissionSubjects.KnowledgeBase,
    label: 'Manage knowledge base sync',
    description: 'Configure scheduled sync jobs for a knowledge base',
  },
})

/** Sub-feature: document category CRUD, versioning, and bulk import. */
export const DOCUMENT_CATEGORIES_PERMISSIONS = definePermissions('document_categories', {
  view: {
    action: 'read',
    subject: PermissionSubjects.DocumentCategory,
    label: 'View document categories',
    description: 'Browse the document category tree inside a knowledge base',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.DocumentCategory,
    label: 'Create document category',
    description: 'Create a new document category',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.DocumentCategory,
    label: 'Edit document category',
    description: 'Modify category metadata and version information',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.DocumentCategory,
    label: 'Delete document category',
    description: 'Remove a document category',
  },
  import: {
    action: 'create',
    subject: PermissionSubjects.DocumentCategory,
    label: 'Import documents',
    description: 'Bulk import documents into a category from git or zip',
  },
})

/**
 * Sub-feature: read-only / lifecycle access to documents from the KB module's
 * perspective. Heavier write/parse actions on documents (parse, enrich, bulk)
 * live in `rag.permissions.ts` because they are owned by the dataset pipeline.
 */
export const KNOWLEDGE_BASE_DOCUMENTS_PERMISSIONS = definePermissions('documents', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Document,
    label: 'View documents',
    description: 'Browse and download documents inside a knowledge base',
  },
})
