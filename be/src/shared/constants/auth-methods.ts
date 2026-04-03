/**
 * @description Git authentication method constants
 */

export const GitAuthMethod = {
  NONE: 'none',
  TOKEN: 'token',
  USERNAME_PASSWORD: 'username_password',
} as const

export type GitAuthMethodType = (typeof GitAuthMethod)[keyof typeof GitAuthMethod]

/** Session store type constants */
export const SessionStoreType = {
  REDIS: 'redis',
} as const
