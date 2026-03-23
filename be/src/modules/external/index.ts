/**
 * @fileoverview Barrel export for the external API module.
 *   Provides API key management and evaluation-ready RAG endpoints.
 * @module modules/external
 */

export { apiKeyService } from './services/api-key.service.js'
export { externalApiService } from './services/external-api.service.js'
export { ApiKeyModel } from './models/api-key.model.js'
export type { ApiKey } from './models/api-key.model.js'
