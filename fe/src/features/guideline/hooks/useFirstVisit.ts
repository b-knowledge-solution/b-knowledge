/**
 * @description Hook to manage guideline visibility.
 * Auto-show logic has been disabled as per user request.
 * Now only manages manual visibility indirectly via manual triggers.
 *
 * @param {string} _featureId - Unique identifier for the feature (unused).
 * @returns {object} Visibility state and control functions.
 */
export function useFirstVisit(_featureId: string) {
  // Auto-show logic removed — always false
  const shouldShowAuto = false

  /** Mark as seen - No-op now as we don't track auto-show state */
  const markAsSessionSeen = () => {
    // No-op
  }

  /** Mark as permanently seen - No-op */
  const markAsPermanentlySeen = () => {
    // No-op
  }

  /** Reset seen state - No-op */
  const resetSeen = () => {
    // No-op
  }

  return {
    isFirstVisit: shouldShowAuto,
    shouldShowAuto,
    markAsSessionSeen,
    markAsPermanentlySeen,
    resetSeen,
  }
}
