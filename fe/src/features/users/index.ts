/**
 * @fileoverview Barrel file for the users feature.
 * Exports pages, types, API, hooks, and components for external consumption.
 * @module features/users
 */

// Pages
export { default as UserManagementPage } from './pages/UserManagementPage'
export { default as UserDetailPage } from './pages/UserDetailPage'

// Components
export { default as UserMultiSelect } from './components/UserMultiSelect'

// Types
export type { UserIpHistory, IpHistoryMap } from './types/user.types'

// API
export { userApi } from './api/userApi'

// Hooks
export * from './api/userQueries'

// Preferences (IndexedDB service)
export * from './api/userPreferences'
