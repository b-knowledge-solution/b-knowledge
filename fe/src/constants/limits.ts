/**
 * @description Size limits, max counts, and threshold constants
 */

/** File size limits in bytes */
export const FileSize = {
  /** Max chat attachment size: 20MB */
  MAX_CHAT_FILE: 20 * 1024 * 1024,
  /** Max ZIP upload size: 100MB */
  MAX_ZIP_FILE: 100 * 1024 * 1024,
} as const

/** Upload constraints */
export const UploadLimit = {
  /** Max files per chat upload */
  MAX_CHAT_FILES: 5,
} as const

/** Broadcast message limits */
export const BroadcastLimit = {
  /** Max message character length */
  MAX_MESSAGE_LENGTH: 1_900,
} as const

/** Pagination defaults */
export const PaginationDefault = {
  PAGE_SIZE: 20,
  SEARCH_RESULT_LIMIT: 100,
} as const

/** System monitor alert thresholds (percentage) */
export const AlertThreshold = {
  /** Critical alert level (CPU/Memory) */
  CRITICAL: 90,
  /** Warning alert level (CPU/Memory) */
  WARNING: 70,
} as const

/** Chat input UI constraints */
export const ChatInputLimit = {
  /** Max textarea height in pixels */
  MAX_HEIGHT_PX: 200,
} as const

/** Unread notification display cap */
export const NotificationLimit = {
  /** Show "99+" when exceeding this count */
  UNREAD_CAP: 99,
} as const
