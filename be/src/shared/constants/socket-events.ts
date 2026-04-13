/**
 * @description Canonical Socket.IO event names emitted by the backend.
 * Centralizing them avoids string drift between producers, consumers, and tests.
 */
export const SocketEvents = {
  PermissionsCatalogUpdated: 'permissions:catalog-updated',
} as const
