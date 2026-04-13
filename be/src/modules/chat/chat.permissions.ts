/**
 * @description Permission catalog for the `chat` module. The module ships
 * three distinct features that share a directory:
 *   - chat assistant configuration (admin)
 *   - end-user conversations
 *   - public embed endpoints
 *
 * Per `PERMISSION_INVENTORY.md` §5, the registry exposes a single feature
 * namespace `chat` that aggregates all of these surfaces. Subjects differ per
 * action so the CASL ability builder can target each surface independently.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for chat assistants, conversations, embeds, and uploads. */
export const CHAT_PERMISSIONS = definePermissions('chat', {
  view: {
    action: 'read',
    subject: PermissionSubjects.ChatAssistant,
    label: 'View chat assistants',
    description: 'List and inspect chat assistants and their configuration',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.ChatAssistant,
    label: 'Create chat assistant',
    description: 'Create a new chat assistant configuration',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.ChatAssistant,
    label: 'Edit chat assistant',
    description: 'Modify chat assistant configuration, prompts, and bindings',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.ChatAssistant,
    label: 'Delete chat assistant',
    description: 'Remove a chat assistant configuration',
  },
  embed: {
    action: 'manage',
    subject: PermissionSubjects.ChatAssistant,
    label: 'Manage chat embeds',
    description: 'Configure public embed tokens and surfaces for chat assistants',
  },
  upload: {
    action: 'create',
    subject: PermissionSubjects.ChatAssistant,
    label: 'Upload chat files',
    description: 'Upload files into a chat conversation context',
  },
  api: {
    action: 'manage',
    subject: PermissionSubjects.ChatAssistant,
    label: 'Use OpenAI-compatible chat API',
    description: 'Call the OpenAI-compatible chat completion endpoints with an API key',
  },
})
