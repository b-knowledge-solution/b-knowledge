/**
 * @description HTTP status code constants
 */

export const HttpStatus = {
  OK: 200,
  NO_CONTENT: 204,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const

export type HttpStatusType = (typeof HttpStatus)[keyof typeof HttpStatus]
