/**
 * @fileoverview Hook for text-to-speech playback.
 * Fetches audio from the TTS API and plays it via the Web Audio API.
 *
 * @module features/ai/hooks/useTts
 */

import { useState, useRef } from 'react'
import { chatApi } from '../api/chatApi'

/**
 * @description Hook providing text-to-speech speak/stop controls and state.
 * @returns Object with speak, stop, isPlaying, and isLoading
 */
export function useTts() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  /** Ref to the current Audio element for playback control */
  const audioRef = useRef<HTMLAudioElement | null>(null)
  /** Ref to the object URL for cleanup */
  const urlRef = useRef<string | null>(null)

  /**
   * Synthesize and play speech for the given text.
   * @param text - Text to speak
   */
  const speak = async (text: string) => {
    try {
      // Stop any currently playing audio first
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      // Revoke previous object URL to free memory
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }

      setIsLoading(true)

      // Fetch audio blob from the TTS API
      const blob = await chatApi.tts(text)

      // Create an object URL from the blob
      const url = URL.createObjectURL(blob)
      urlRef.current = url

      // Create and play the audio element
      const audio = new Audio(url)
      audioRef.current = audio

      // Set up event handlers
      audio.onplay = () => setIsPlaying(true)
      audio.onended = () => {
        setIsPlaying(false)
        // Clean up the object URL after playback
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current)
          urlRef.current = null
        }
      }
      audio.onerror = () => {
        setIsPlaying(false)
        setIsLoading(false)
      }

      setIsLoading(false)
      await audio.play()
    } catch {
      setIsLoading(false)
      setIsPlaying(false)
    }
  }

  /**
   * Stop the currently playing audio.
   */
  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    // Clean up the object URL
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    setIsPlaying(false)
  }

  return { speak, stop, isPlaying, isLoading }
}
