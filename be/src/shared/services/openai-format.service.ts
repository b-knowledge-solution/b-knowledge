
/**
 * @fileoverview Shared OpenAI-compatible response format service.
 *
 * Provides helpers for building OpenAI chat completion responses (both
 * streaming SSE chunks and non-streaming JSON) so that chat and search
 * OpenAI-compatible endpoints share the same formatting logic.
 *
 * @module shared/services/openai-format
 */

import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** A single message in the OpenAI messages array. */
export interface OaiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Token usage counters included in completion responses. */
export interface OaiUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/** Non-streaming chat completion response (OpenAI format). */
export interface OaiCompletionResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: { role: 'assistant'; content: string }
    finish_reason: 'stop'
  }>
  usage: OaiUsage
}

/** A single SSE chunk in a streaming chat completion (OpenAI format). */
export interface OaiStreamChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: { content?: string; role?: string }
    finish_reason: string | null
  }>
  usage?: OaiUsage | null
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Build a non-streaming OpenAI chat completion response.
 * @param answer - The assistant's full answer text
 * @param model - Model identifier string
 * @param usage - Optional token usage counters
 * @returns A fully-formed OaiCompletionResponse object
 */
export function buildOaiCompletion(
  answer: string,
  model: string,
  usage?: Partial<OaiUsage>
): OaiCompletionResponse {
  const resolvedUsage: OaiUsage = {
    prompt_tokens: usage?.prompt_tokens ?? 0,
    completion_tokens: usage?.completion_tokens ?? 0,
    total_tokens: usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
  }

  return {
    id: `chatcmpl-${uuidv4()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: answer },
        finish_reason: 'stop',
      },
    ],
    usage: resolvedUsage,
  }
}

/**
 * Build an SSE-formatted string for a streaming chat completion chunk.
 * @param id - The completion ID (shared across all chunks in a stream)
 * @param delta - The content delta text (empty string for final chunk)
 * @param model - Model identifier string
 * @param done - Whether this is the final chunk (sets finish_reason to 'stop')
 * @returns SSE string in format "data: {json}\n\n" or "data: [DONE]\n\n"
 */
export function buildOaiStreamChunk(
  id: string,
  delta: string,
  model: string,
  done: boolean
): string {
  if (done) {
    // Send the final chunk with finish_reason, then [DONE] sentinel
    const finalChunk: OaiStreamChunk = {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
    }
    return `data: ${JSON.stringify(finalChunk)}\n\ndata: [DONE]\n\n`
  }

  const chunk: OaiStreamChunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: { content: delta },
        finish_reason: null,
      },
    ],
  }

  return `data: ${JSON.stringify(chunk)}\n\n`
}

/**
 * Extract the content of the last user message from an OpenAI messages array.
 * @param messages - Array of OaiMessage objects
 * @returns The content of the last user message, or null if none found
 */
export function extractLastUserMessage(messages: OaiMessage[]): string | null {
  if (!Array.isArray(messages)) return null

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user' && messages[i]!.content) {
      return messages[i]!.content
    }
  }

  return null
}
