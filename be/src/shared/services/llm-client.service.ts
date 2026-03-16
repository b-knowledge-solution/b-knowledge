
/**
 * @fileoverview Singleton LLM client service that reads provider config from
 * the `model_providers` table and calls LLMs directly via the OpenAI SDK.
 *
 * Supports any OpenAI-compatible API (OpenAI, Azure, Anthropic via proxy,
 * local models, etc.) by reading `api_base` and `api_key` per provider.
 *
 * @module shared/services/llm-client
 */

import OpenAI from 'openai'
import { ModelFactory } from '@/shared/models/factory.js'
import { ModelProvider } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'
import { langfuseTraceService } from '@/shared/services/langfuse.service.js'
import type { LangfuseParent } from '@/shared/services/langfuse.service.js'
import { config } from '@/shared/config/index.js'

/**
 * A text content part for multimodal messages.
 */
export interface LlmTextPart {
  type: 'text'
  text: string
}

/**
 * An image content part for multimodal messages (vision).
 */
export interface LlmImagePart {
  type: 'image_url'
  image_url: { url: string; detail?: 'low' | 'high' | 'auto' }
}

/** Union of content parts that can appear in a multimodal user message. */
export type LlmContentPart = LlmTextPart | LlmImagePart

/**
 * Message in the OpenAI chat completion format.
 * User messages support both plain text and multimodal content arrays.
 */
export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'user'; content: string | LlmContentPart[] }

/**
 * Build a multimodal user message containing text and image URLs.
 * @description Constructs an LlmMessage with content parts for vision-capable models.
 * If no image URLs are provided, returns a plain text user message.
 * @param text - The text portion of the message
 * @param imageUrls - Array of image URLs to include
 * @returns A user LlmMessage with multimodal content
 */
export function buildMultimodalUserMessage(text: string, imageUrls: string[]): LlmMessage {
  // Return plain text message when no images are provided
  if (imageUrls.length === 0) {
    return { role: 'user', content: text }
  }

  const parts: LlmContentPart[] = [
    { type: 'text', text },
    ...imageUrls.map((url): LlmImagePart => ({
      type: 'image_url',
      image_url: { url, detail: 'auto' },
    })),
  ]

  return { role: 'user', content: parts }
}

/**
 * Options for a chat completion request.
 */
export interface LlmCompletionOptions {
  /** Model provider ID from model_providers table */
  providerId?: string | undefined
  /** Override model name (otherwise uses provider's model_name) */
  model?: string
  /** Temperature for sampling (0-2) */
  temperature?: number
  /** Maximum tokens to generate */
  max_tokens?: number
  /** Top-p sampling */
  top_p?: number
  /** Whether to stream the response */
  stream?: boolean
}

/**
 * Streamed chunk from the LLM.
 */
export interface LlmStreamChunk {
  /** Delta text content */
  content: string
  /** Whether this is the final chunk */
  done: boolean
}

/**
 * LLM client service. Reads provider config from DB, instantiates OpenAI SDK.
 */
export class LlmClientService {
  /** Cache of OpenAI client instances by provider ID */
  private clients = new Map<string, { client: OpenAI; provider: ModelProvider }>()

  /**
   * Resolve which model provider to use.
   * If providerId is given, fetch that one. Otherwise get the default chat provider.
   * @param providerId - Optional specific provider ID
   * @returns The ModelProvider record
   */
  async resolveProvider(providerId?: string): Promise<ModelProvider> {
    if (providerId) {
      const provider = await ModelFactory.modelProvider.findById(providerId)
      if (!provider || provider.status !== 'active') {
        throw new Error(`Model provider ${providerId} not found or inactive`)
      }
      return provider
    }

    // Find default chat model
    const defaults = await ModelFactory.modelProvider.findDefaults()
    const chatDefault = defaults.find(p => p.model_type === 'chat')
    if (!chatDefault) {
      throw new Error('No default chat model provider configured. Please add one via Admin > LLM Providers.')
    }
    return chatDefault
  }

  /**
   * Get or create an OpenAI client instance for the given provider.
   * @param provider - The model provider config
   * @returns OpenAI SDK client
   */
  private getClient(provider: ModelProvider): OpenAI {
    const cached = this.clients.get(provider.id)
    if (cached) return cached.client

    // Build OpenAI client with provider-specific config
    const client = new OpenAI({
      apiKey: provider.api_key || 'not-needed',
      baseURL: provider.api_base || undefined,
    })

    this.clients.set(provider.id, { client, provider })
    return client
  }

  /**
   * Send a non-streaming chat completion request.
   * @param messages - Conversation messages
   * @param options - Completion options
   * @param parent - Optional Langfuse parent (trace or span) for observability
   * @returns The assistant's response text
   */
  async chatCompletion(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {},
    parent?: LangfuseParent
  ): Promise<string> {
    const provider = await this.resolveProvider(options.providerId)
    const client = this.getClient(provider)
    const model = options.model || provider.model_name

    const response = await client.chat.completions.create({
      model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? provider.max_tokens ?? 4096,
      ...(options.top_p != null ? { top_p: options.top_p } : {}),
      stream: false as const,
    })

    const content = response.choices[0]?.message?.content || ''

    // Fire-and-forget: create Langfuse generation if parent is provided
    if (parent) {
      try {
        const usage = response.usage
        langfuseTraceService.createGeneration(parent, {
          name: model,
          input: messages,
          output: content,
          model,
          ...(usage ? {
            usage: {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            },
          } : {}),
        })
      } catch (err) {
        log.error('Langfuse generation trace failed', { error: String(err) })
      }
    }

    return content
  }

  /**
   * Send a streaming chat completion request.
   * Yields text chunks as they arrive from the LLM.
   * @param messages - Conversation messages
   * @param options - Completion options
   * @param parent - Optional Langfuse parent (trace or span) for observability
   * @returns Async iterable of LlmStreamChunk
   */
  async *chatCompletionStream(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {},
    parent?: LangfuseParent
  ): AsyncGenerator<LlmStreamChunk> {
    const provider = await this.resolveProvider(options.providerId)
    const client = this.getClient(provider)
    const model = options.model || provider.model_name

    log.info('Starting LLM stream', { model, provider: provider.factory_name })

    // Create Langfuse generation at stream start if parent provided
    let generation: ReturnType<typeof langfuseTraceService.createGeneration> | undefined
    if (parent) {
      try {
        generation = langfuseTraceService.createGeneration(parent, {
          name: model,
          input: messages,
          model,
        })
      } catch (err) {
        log.error('Langfuse stream generation init failed', { error: String(err) })
      }
    }

    const stream = await client.chat.completions.create({
      model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? provider.max_tokens ?? 4096,
      ...(options.top_p != null ? { top_p: options.top_p } : {}),
      stream: true as const,
    })

    // Accumulate full output for generation update
    let fullOutput = ''

    // Yield each delta chunk from the stream
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || ''
      const done = chunk.choices[0]?.finish_reason !== null && chunk.choices[0]?.finish_reason !== undefined

      if (delta) {
        fullOutput += delta
      }

      if (delta || done) {
        yield { content: delta, done }
      }

      // Update generation with final output when stream ends
      if (done && generation) {
        try {
          const endOpts: Record<string, unknown> = { output: fullOutput }
          // Add usage data if available from the final chunk
          if (chunk.usage) {
            endOpts.usage = {
              input: chunk.usage.prompt_tokens,
              output: chunk.usage.completion_tokens,
              total: chunk.usage.total_tokens,
              unit: 'TOKENS',
            }
          }
          generation.end(endOpts as any)
        } catch (err) {
          log.error('Langfuse stream generation end failed', { error: String(err) })
        }
      }
    }
  }

  /**
   * Generate embeddings for texts using the configured embedding model.
   * Reads embedding provider from model_providers (model_type='embedding').
   *
   * @param texts - Array of texts to embed
   * @param providerId - Optional specific embedding provider ID
   * @param parent - Optional Langfuse parent (trace or span) for observability
   * @returns Array of embedding vectors
   */
  async embedTexts(texts: string[], providerId?: string, parent?: LangfuseParent): Promise<number[][]> {
    // Resolve embedding provider: use given ID or find default embedding provider
    let provider: ModelProvider

    if (providerId) {
      provider = await this.resolveProvider(providerId)
    } else {
      const defaults = await ModelFactory.modelProvider.findDefaults()
      const embeddingDefault = defaults.find(p => p.model_type === 'embedding')
      if (!embeddingDefault) {
        throw new Error('No default embedding model provider configured. Please add one via Admin > LLM Providers.')
      }
      provider = embeddingDefault
    }

    const client = this.getClient(provider)
    const model = provider.model_name

    log.info('Generating embeddings', { model, count: texts.length })

    // Call OpenAI-compatible embeddings endpoint
    const response = await client.embeddings.create({
      model,
      input: texts,
    })

    // Fire-and-forget: trace embedding call if enabled and parent provided
    if (parent && config.langfuse.traceEmbeddings) {
      try {
        langfuseTraceService.createGeneration(parent, {
          name: `embedding:${model}`,
          input: texts,
          output: `${response.data.length} vectors`,
          model,
          ...(response.usage ? {
            usage: {
              promptTokens: response.usage.prompt_tokens,
              totalTokens: response.usage.total_tokens,
            },
          } : {}),
        })
      } catch (err) {
        log.error('Langfuse embedding trace failed', { error: String(err) })
      }
    }

    // Return embedding vectors in the same order as input texts
    return response.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding)
  }

  /**
   * Clear cached clients (useful when provider configs are updated).
   */
  clearCache(): void {
    this.clients.clear()
  }
}

/** Singleton instance of the LLM client service */
export const llmClientService = new LlmClientService()
