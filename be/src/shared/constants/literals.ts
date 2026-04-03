/**
 * @description Shared literal constants used in conditionals to avoid hardcoded comparison values
 */

export const ComparisonLiteral = {
  MASKED_SECRET: '***',
  HTTP_METHOD_POST: 'POST',
  OLLAMA_FACTORY: 'Ollama',
  QUERY_TRUE: 'true',
  QUERY_ONE: '1',
  STREAM_DONE: '[DONE]',
  SEARCH_APP_NOT_FOUND: 'Search app not found',
  DATASET_NOT_FOUND: 'Dataset not found',
  CONNECTOR_NOT_FOUND: 'Connector not found',
} as const

/**
 * @description Providers whose base URL does NOT include /v1 by default.
 * When users configure these with a raw host (e.g. http://localhost:11434),
 * the OpenAI SDK needs /v1 appended to reach the OpenAI-compatible endpoint.
 * Must match advance-rag/rag/llm/chat_model.py local provider classes.
 */
export const LOCAL_PROVIDERS_NEEDING_V1: ReadonlySet<string> = new Set([
  'Ollama',
  'Xinference',
  'LocalAI',
  'LM-Studio',
  'GPUStack',
  'VLLM',
  'OpenAI-API-Compatible',
  'HuggingFace',
  'ModelScope',
])

export const ParseRunAction = {
  PARSE: 1,
  CANCEL: 2,
} as const
