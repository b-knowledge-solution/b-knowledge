/**
 * @fileoverview Barrel export for the llm-provider module.
 * Public API for LLM provider management -- all external consumers
 * should import from this file only (NX boundary rule).
 * @module modules/llm-provider
 */
export { default as llmProviderRoutes } from './routes/llm-provider.routes.js';
export { default as llmProviderPublicRoutes } from './routes/llm-provider-public.routes.js';
export { llmProviderService } from './services/llm-provider.service.js';
