/**
 * @description Entity type constants for access control and permission entries
 */

export const EntityType = {
  USER: 'user',
  TEAM: 'team',
} as const

export type EntityTypeValue = (typeof EntityType)[keyof typeof EntityType]
