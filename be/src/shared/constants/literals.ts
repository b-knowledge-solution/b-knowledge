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

export const ParseRunAction = {
  PARSE: 1,
  CANCEL: 2,
} as const
