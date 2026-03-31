/**
 * @fileoverview Default LLM prompt templates for memory extraction.
 * Ported from RAGFlow's PromptAssembler with adaptations for B-Knowledge's
 * memory type bitmask system (RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8).
 *
 * Each prompt is a { system, user } pair with a {{conversation}} placeholder
 * that gets replaced with the actual conversation content at extraction time.
 *
 * @module modules/memory/prompts/extraction
 */

/**
 * @description Prompt template shape used by all extraction and ranking prompts.
 *   The `system` field sets the LLM persona and instructions.
 *   The `user` field contains the actual task with a {{conversation}} placeholder.
 */
export interface PromptTemplate {
  /** System message defining LLM role and extraction behavior */
  system: string
  /** User message template with {{conversation}} placeholder */
  user: string
}

/**
 * @description Semantic extraction prompt (type=2).
 *   Extracts factual statements, definitions, key concepts, and relationships
 *   from conversation content. Produces structured knowledge items.
 */
export const SEMANTIC_EXTRACTION_PROMPT: PromptTemplate = {
  system: `You are a knowledge extraction assistant. Your task is to extract factual statements, definitions, and key concepts from conversations. Output each memory item as a JSON object with "content" (the extracted fact) and "confidence" (0.0-1.0) fields. Return a JSON array of items.`,
  user: `Extract factual statements, definitions, and key concepts from the following conversation. Focus on:
- Definitional knowledge (what something is)
- Factual claims and assertions
- Relationships between concepts
- Named entities and their attributes

Conversation:
{{conversation}}

Return a JSON array of extracted memory items.`,
}

/**
 * @description Episodic extraction prompt (type=4).
 *   Extracts notable events, experiences, interactions, and temporal references
 *   from conversation content. Captures "what happened" knowledge.
 */
export const EPISODIC_EXTRACTION_PROMPT: PromptTemplate = {
  system: `You are a memory extraction assistant specializing in episodic memory. Your task is to extract notable events, experiences, and interactions from conversations. Output each memory item as a JSON object with "content" (the event description) and "confidence" (0.0-1.0) fields. Return a JSON array of items.`,
  user: `Extract notable events, experiences, and interactions from the following conversation. Focus on:
- Specific events or incidents described
- User preferences and decisions made
- Problems encountered and their resolutions
- Temporal references (dates, sequences, deadlines)

Conversation:
{{conversation}}

Return a JSON array of extracted memory items.`,
}

/**
 * @description Procedural extraction prompt (type=8).
 *   Extracts step-by-step procedures, workflows, how-to instructions,
 *   and operational knowledge from conversation content.
 */
export const PROCEDURAL_EXTRACTION_PROMPT: PromptTemplate = {
  system: `You are a memory extraction assistant specializing in procedural knowledge. Your task is to extract step-by-step procedures, workflows, and how-to instructions from conversations. Output each memory item as a JSON object with "content" (the procedure description) and "confidence" (0.0-1.0) fields. Return a JSON array of items.`,
  user: `Extract step-by-step procedures, workflows, and how-to instructions from the following conversation. Focus on:
- Step-by-step instructions
- Workflows and processes described
- Best practices and guidelines mentioned
- Configuration steps and setup procedures

Conversation:
{{conversation}}

Return a JSON array of extracted memory items.`,
}

/**
 * @description Raw extraction prompt (type=1).
 *   Simply returns the raw message content without transformation.
 *   Used when users want to store verbatim conversation content.
 */
export const RAW_EXTRACTION_PROMPT: PromptTemplate = {
  system: `You are a message archival assistant. Your task is to preserve the raw conversation content as-is, splitting it into individual message items. Output each memory item as a JSON object with "content" (the raw message) and "confidence" (1.0) fields. Return a JSON array of items.`,
  user: `Archive the following conversation messages as raw memory items. Preserve the exact content without summarization or transformation.

Conversation:
{{conversation}}

Return a JSON array of raw message items.`,
}

/**
 * @description Memory ranking prompt used to rank retrieved memory items by relevance.
 *   Applied during recall to re-rank OpenSearch results before injecting into context.
 */
export const MEMORY_RANK_PROMPT: PromptTemplate = {
  system: `You are a memory relevance ranking assistant. Given a query and a list of memory items, rank them by relevance to the query. Return the items as a JSON array ordered by relevance (most relevant first), each with an added "relevance_score" (0.0-1.0) field.`,
  user: `Given the following query and memory items, rank them by relevance to the query.

Query: {{query}}

Memory items:
{{memories}}

Return a JSON array of the items ordered by relevance (most relevant first), each with an added "relevance_score" field.`,
}
