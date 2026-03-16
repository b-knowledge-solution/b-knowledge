
/**
 * Zod validation schemas for chat assistant endpoints.
 * @module schemas/chat-assistant
 */
import { z } from 'zod'

/**
 * Reusable schema for prompt variable definitions.
 * Variables use `{key}` syntax in the system prompt template.
 */
const promptVariableSchema = z.object({
  /** Variable key (must be a valid identifier) */
  key: z.string().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  /** Human-readable description */
  description: z.string().max(256).optional(),
  /** Whether the variable can be omitted */
  optional: z.boolean().default(false),
  /** Default value when not provided */
  default_value: z.string().max(1024).optional(),
})

/**
 * Reusable schema for metadata filter configuration.
 * Applied to RAG search queries to narrow down results by document metadata.
 */
const metadataFilterSchema = z.object({
  /** Logical operator to combine conditions */
  logic: z.enum(['and', 'or']).default('and'),
  /** Array of filter conditions */
  conditions: z.array(z.object({
    /** Field name in the OpenSearch document metadata */
    name: z.string().min(1),
    /** Comparison operator */
    comparison_operator: z.enum(['is', 'is_not', 'contains', 'gt', 'lt', 'range']),
    /** Value to compare against (string, number, or [min, max] for range) */
    value: z.union([z.string(), z.number(), z.tuple([z.number(), z.number()])]),
  })).max(20),
})

/**
 * Reusable prompt_config schema for assistant create/update.
 */
const promptConfigSchema = z.object({
  /** System prompt template (may contain {variable_name} placeholders) */
  system: z.string().optional(),
  prologue: z.string().optional(),
  refine_multiturn: z.boolean().optional(),
  cross_languages: z.string().optional(),
  keyword: z.boolean().optional(),
  quote: z.boolean().optional(),
  empty_response: z.string().optional(),
  toc_enhance: z.boolean().optional(),
  tavily_api_key: z.string().optional(),
  use_kg: z.boolean().optional(),
  rerank_id: z.string().optional(),
  reasoning: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  max_tokens: z.number().int().min(1).max(128000).optional(),
  top_n: z.number().int().min(1).max(100).optional(),
  similarity_threshold: z.number().min(0).max(1).optional(),
  vector_similarity_weight: z.number().min(0).max(1).optional(),
  /** Custom prompt variables for template substitution */
  variables: z.array(promptVariableSchema).max(20).optional(),
  /** Metadata filter conditions for RAG search */
  metadata_filter: metadataFilterSchema.optional(),
}).passthrough()

/**
 * Schema for creating a new assistant.
 */
export const createAssistantSchema = z.object({
  /** Display name for the assistant */
  name: z.string().min(1, 'Name is required').max(128),
  /** Description of the assistant */
  description: z.string().optional(),
  /** Icon identifier */
  icon: z.string().optional(),
  /** Knowledge base IDs to associate */
  kb_ids: z.array(z.string().uuid()).min(1, 'At least one knowledge base ID is required'),
  /** LLM model identifier */
  llm_id: z.string().optional(),
  /** Prompt configuration object */
  prompt_config: promptConfigSchema.optional(),
  /** Whether the assistant is publicly accessible */
  is_public: z.boolean().optional(),
})

/**
 * Schema for updating an existing assistant.
 */
export const updateAssistantSchema = z.object({
  /** Display name for the assistant */
  name: z.string().min(1).max(128).optional(),
  /** Description of the assistant */
  description: z.string().optional(),
  /** Icon identifier */
  icon: z.string().optional(),
  /** Knowledge base IDs to associate */
  kb_ids: z.array(z.string().uuid()).optional(),
  /** LLM model identifier */
  llm_id: z.string().optional(),
  /** Prompt configuration object */
  prompt_config: promptConfigSchema.optional(),
  /** Whether the assistant is publicly accessible */
  is_public: z.boolean().optional(),
})

/**
 * Schema for setting assistant access control entries.
 * Validates the array of user/team access grants.
 */
export const assistantAccessSchema = z.object({
  /** Array of access entries to assign to the assistant */
  entries: z.array(
    z.object({
      /** Type of entity being granted access */
      entity_type: z.enum(['user', 'team']),
      /** UUID of the user or team */
      entity_id: z.string().uuid(),
    })
  ),
})

/**
 * Schema for listing assistants with pagination and search.
 */
export const listAssistantsQuerySchema = z.object({
  /** Page number (1-based) */
  page: z.coerce.number().int().min(1).default(1),
  /** Number of items per page */
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  /** Search term to filter by name or description (case-insensitive) */
  search: z.string().optional(),
  /** Field to sort by */
  sort_by: z.enum(['created_at', 'name']).default('created_at'),
  /** Sort direction */
  sort_order: z.enum(['asc', 'desc']).default('desc'),
})

/**
 * Schema for assistant UUID path param.
 */
export const assistantIdParamSchema = z.object({
  id: z.string().uuid('Invalid assistant ID'),
})
