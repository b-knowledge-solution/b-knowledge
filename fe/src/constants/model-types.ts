/**
 * @description LLM model type constants for provider filtering and display
 */

export const ModelType = {
  CHAT: 'chat',
  EMBEDDING: 'embedding',
  TTS: 'tts',
  RERANK: 'rerank',
  IMAGE2TEXT: 'image2text',
  SPEECH2TEXT: 'speech2text',
} as const

export type ModelTypeValue = (typeof ModelType)[keyof typeof ModelType]
