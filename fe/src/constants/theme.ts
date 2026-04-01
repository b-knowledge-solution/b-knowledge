/**
 * @description Theme constants for appearance settings
 */

export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const

export type ThemeType = (typeof Theme)[keyof typeof Theme]

/** Valid theme values for settings validation */
export const VALID_THEMES: string[] = Object.values(Theme)
