/**
 * @description Hook for managing guided tour state.
 * @returns Tour running state and start/stop controls.
 */
import { useState } from 'react'

export function useGuidedTour() {
  const [isTourRunning, setIsTourRunning] = useState(false)

  /** Start the guided tour */
  const startTour = () => {
    setIsTourRunning(true)
  }

  /** Stop the guided tour */
  const stopTour = () => {
    setIsTourRunning(false)
  }

  return { isTourRunning, startTour, stopTour }
}
