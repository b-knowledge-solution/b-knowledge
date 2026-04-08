/**
 * @fileoverview Barrel export for the permissions admin feature module.
 * @module features/permissions
 */
export * from './api/permissionsApi'
export * from './api/permissionsQueries'
export * from './types/permissions.types'
export { PrincipalPicker } from './components/PrincipalPicker'
export type { Principal, PrincipalPickerProps } from './components/PrincipalPicker'
export { ResourceGrantEditor } from './components/ResourceGrantEditor'
export type { ResourceGrantEditorProps } from './components/ResourceGrantEditor'
