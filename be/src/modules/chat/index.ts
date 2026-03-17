/**
 * @fileoverview Chat module barrel exports.
 * Exposes routes, services, and types as the public API for the chat module.
 * All cross-module imports should go through this file.
 *
 * @module modules/chat
 */

/** @description Chat conversation route definitions */
export { default as chatConversationRoutes } from './routes/chat-conversation.routes.js'
/** @description Chat assistant route definitions */
export { default as chatAssistantRoutes } from './routes/chat-assistant.routes.js'
/** @description Chat embed token route definitions */
export { default as chatEmbedRoutes } from './routes/chat-embed.routes.js'
/** @description Chat file upload route definitions */
export { default as chatFileRoutes } from './routes/chat-file.routes.js'
/** @description OpenAI-compatible chat route definitions */
export { default as chatOpenaiRoutes } from './routes/chat-openai.routes.js'
/** @description Chat conversation service singleton */
export { chatConversationService } from './services/chat-conversation.service.js'
/** @description Chat assistant service singleton */
export { chatAssistantService } from './services/chat-assistant.service.js'
/** @description Chat file service singleton */
export { chatFileService } from './services/chat-file.service.js'

