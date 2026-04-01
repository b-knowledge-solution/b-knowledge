
/**
 * @fileoverview Text-to-Speech (TTS) service.
 * Reads TTS provider config from the model_providers table and generates
 * speech audio via OpenAI-compatible TTS APIs.
 *
 * Supports any OpenAI-compatible TTS endpoint (OpenAI, Azure, hosted models).
 *
 * @module shared/services/tts
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { ModelProvider } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'
import { ProviderStatus, ModelType } from '@/shared/constants/index.js'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Options for text-to-speech synthesis
 */
export interface TtsOptions {
  /** Voice name (default: "alloy") */
  voice?: string
  /** Speech speed multiplier (0.25-4.0, default: 1.0) */
  speed?: number
  /** Audio format (default: "mp3") */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
}

// ============================================================================
// Service
// ============================================================================

/**
 * @description TTS service class. Reads provider config from the DB, calls OpenAI-compatible
 * TTS APIs, and streams audio chunks back to the caller.
 */
export class TtsService {
  /**
   * @description Normalize text for TTS: remove markdown formatting, code blocks, citations.
   * Matches RAGFlow's normalize_text() behavior for consistent TTS output.
   * @param {string} text - Raw text with markdown
   * @returns {string} Clean text suitable for speech
   */
  normalizeText(text: string): string {
    let normalized = text

    // Remove fenced code blocks (``` ... ```)
    normalized = normalized.replace(/```[\s\S]*?```/g, '')

    // Remove inline code (`...`)
    normalized = normalized.replace(/`[^`]*`/g, '')

    // Remove citation markers like ##ID:n$$ or ##0:1$$
    normalized = normalized.replace(/##\w+:\d+\$\$/g, '')

    // Remove markdown headers (## ... or ## ... ##)
    normalized = normalized.replace(/#{1,6}\s?/g, '')

    // Remove bold markers (**text** or __text__)
    normalized = normalized.replace(/\*\*(.*?)\*\*/g, '$1')
    normalized = normalized.replace(/__(.*?)__/g, '$1')

    // Remove italic markers (*text* or _text_)
    normalized = normalized.replace(/\*(.*?)\*/g, '$1')
    normalized = normalized.replace(/_(.*?)_/g, '$1')

    // Remove strikethrough (~~text~~)
    normalized = normalized.replace(/~~(.*?)~~/g, '$1')

    // Remove markdown links [text](url) -> text
    normalized = normalized.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

    // Remove markdown images ![alt](url)
    normalized = normalized.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')

    // Remove horizontal rules (---, ***, ___)
    normalized = normalized.replace(/^[-*_]{3,}$/gm, '')

    // Remove list markers (- item, * item, 1. item)
    normalized = normalized.replace(/^[\s]*[-*+]\s/gm, '')
    normalized = normalized.replace(/^[\s]*\d+\.\s/gm, '')

    // Collapse multiple whitespace into single space
    normalized = normalized.replace(/\s+/g, ' ')

    // Trim leading/trailing whitespace
    return normalized.trim()
  }

  /**
   * @description Split text into chunks suitable for TTS processing.
   * Splits by sentence boundaries, keeping chunks under maxChars.
   * @param {string} text - Text to split
   * @param {number} [maxChars=500] - Max chars per chunk
   * @returns {string[]} Array of text chunks
   */
  splitForTts(text: string, maxChars: number = 500): string[] {
    // Return as single chunk if short enough
    if (text.length <= maxChars) {
      return [text]
    }

    const chunks: string[] = []
    // Split by sentence-ending punctuation followed by whitespace
    const sentences = text.split(/(?<=[.!?])\s+/)
    let currentChunk = ''

    for (const sentence of sentences) {
      // If adding this sentence exceeds the limit, push current chunk
      if (currentChunk.length + sentence.length + 1 > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }
      // If a single sentence exceeds maxChars, push it as its own chunk
      if (sentence.length > maxChars) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim())
          currentChunk = ''
        }
        chunks.push(sentence)
      } else {
        currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence
      }
    }

    // Push any remaining text
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }

  /**
   * @description Generate speech audio from text.
   * Reads TTS provider from model_providers (model_type = 'tts').
   * Streams audio chunks for efficient delivery.
   * @param {string} text - Text to synthesize
   * @param {TtsOptions} [options] - TTS options (voice, speed, format)
   * @param {string} [providerId] - Optional specific TTS provider ID
   * @returns {AsyncGenerator<Buffer>} Async generator yielding audio Buffer chunks
   */
  async *synthesize(
    text: string,
    options: TtsOptions = {},
    providerId?: string
  ): AsyncGenerator<Buffer> {
    // Normalize text to strip markdown and citations
    const cleanText = this.normalizeText(text)

    if (!cleanText) {
      log.warn('TTS: empty text after normalization, skipping')
      return
    }

    // Resolve which TTS provider to use
    const provider = await this.resolveTtsProvider(providerId)

    log.info('TTS: synthesizing speech', {
      provider: provider.factory_name,
      model: provider.model_name,
      textLength: cleanText.length,
    })

    // Split into chunks if text is long
    const chunks = this.splitForTts(cleanText)

    // Stream audio for each text chunk
    for (const chunk of chunks) {
      yield* this.openaiTts(chunk, provider, options)
    }
  }

  /**
   * @description Generate speech via OpenAI-compatible TTS API.
   * POST {base_url}/v1/audio/speech and stream the audio response.
   * @param {string} text - Text chunk to synthesize
   * @param {ModelProvider} provider - Model provider config from DB
   * @param {TtsOptions} options - TTS options
   * @returns {AsyncGenerator<Buffer>} Async generator yielding audio Buffer chunks
   * @throws {Error} If the TTS API returns a non-OK response or empty body
   */
  private async *openaiTts(
    text: string,
    provider: ModelProvider,
    options: TtsOptions
  ): AsyncGenerator<Buffer> {
    // Build the TTS endpoint URL
    const baseUrl = (provider.api_base || 'https://api.openai.com').replace(/\/+$/, '')
    const url = `${baseUrl}/v1/audio/speech`

    // Build the request body
    const body = JSON.stringify({
      model: provider.model_name || 'tts-1',
      voice: options.voice || 'alloy',
      input: text,
      response_format: options.format || 'mp3',
      speed: options.speed || 1.0,
    })

    // Make the HTTP request to the TTS API
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.api_key || ''}`,
        'Content-Type': 'application/json',
      },
      body,
    })

    // Check for error responses
    if (!response.ok) {
      const errorText = await response.text()
      log.error('TTS API error', { status: response.status, error: errorText })
      throw new Error(`TTS API returned ${response.status}: ${errorText}`)
    }

    // Stream the response body as Buffer chunks
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('TTS API returned empty response body')
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        // Yield each chunk as a Buffer
        yield Buffer.from(value)
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * @description Resolve TTS model provider from DB.
   * If providerId is given, fetch that specific provider.
   * Otherwise find the default or any active TTS provider.
   * @param {string} [providerId] - Optional specific provider ID
   * @returns {Promise<ModelProvider>} The ModelProvider record for TTS
   * @throws {Error} If no active TTS provider is found
   */
  private async resolveTtsProvider(providerId?: string): Promise<ModelProvider> {
    // If a specific provider ID is given, look it up directly
    if (providerId) {
      const provider = await ModelFactory.modelProvider.findById(providerId)
      if (!provider || provider.status !== ProviderStatus.ACTIVE) {
        throw new Error(`TTS provider ${providerId} not found or inactive`)
      }
      return provider
    }

    // Find default TTS providers (model_type = 'tts', is_default = true, status = 'active')
    const defaults = await ModelFactory.modelProvider.findDefaults()
    const ttsDefault = defaults.find(p => p.model_type === ModelType.TTS)
    if (ttsDefault) {
      return ttsDefault
    }

    // Fallback: find any active TTS provider
    const allProviders = await ModelFactory.modelProvider.findAll({ model_type: ModelType.TTS, status: ProviderStatus.ACTIVE })
    if (allProviders.length > 0) {
      return allProviders[0]!
    }

    throw new Error('No TTS model provider configured. Please add one via Admin > LLM Providers with model_type "tts".')
  }
}

/** Singleton instance of the TTS service */
export const ttsService = new TtsService()
