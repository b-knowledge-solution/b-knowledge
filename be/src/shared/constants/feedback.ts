/**
 * @description Feedback filter constants for admin history queries
 */

export const FeedbackFilter = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  ANY: 'any',
  NONE: 'none',
} as const

export type FeedbackFilterType = (typeof FeedbackFilter)[keyof typeof FeedbackFilter]
