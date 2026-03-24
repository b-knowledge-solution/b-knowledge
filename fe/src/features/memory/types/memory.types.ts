/**
 * @fileoverview Memory domain types defining interfaces, bitmask constants, DTOs,
 * and helper functions for the memory feature.
 *
 * These are the canonical type contracts for the entire memory feature.
 * Memory types use a bitmask system: RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8.
 *
 * @module features/memory/types/memory.types
 */

// ============================================================================
// Bitmask Constants
// ============================================================================

/**
 * @description Memory type bitmask values.
 *   A memory pool's memory_type field is an integer bitmask combining these values.
 *   Default 15 = all four types enabled (1+2+4+8).
 */
export const MemoryType = {
  /** Raw message storage without transformation */
  RAW: 1,
  /** Factual statements, definitions, and key concepts */
  SEMANTIC: 2,
  /** Notable events, experiences, and interactions */
  EPISODIC: 4,
  /** Step-by-step procedures, workflows, and how-to instructions */
  PROCEDURAL: 8,
} as const

// ============================================================================
// Union Types
// ============================================================================

/** @description Storage backend for memory pools */
export type MemoryStorageType = 'table' | 'graph'

/** @description Extraction timing mode */
export type MemoryExtractionMode = 'batch' | 'realtime'

/** @description Access control level */
export type MemoryPermission = 'me' | 'team'

/** @description Ownership scope determining what entity owns the memory pool */
export type MemoryScopeType = 'user' | 'agent' | 'team'

// ============================================================================
// Entity Interfaces
// ============================================================================

/**
 * @description Main Memory entity matching the memories database table schema.
 *   Represents a memory pool that stores extracted knowledge from conversations.
 */
export interface Memory {
  id: string
  name: string
  description: string | null
  avatar: string | null
  /** Bitmask for enabled memory types: RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8 */
  memory_type: number
  storage_type: MemoryStorageType
  /** Maximum memory pool size in bytes */
  memory_size: number
  forgetting_policy: string
  /** Per-pool embedding model override (null = use tenant default) */
  embd_id: string | null
  /** Per-pool LLM model override for extraction (null = use tenant default) */
  llm_id: string | null
  temperature: number
  /** Custom system prompt for memory extraction */
  system_prompt: string | null
  /** Custom user prompt template for memory extraction */
  user_prompt: string | null
  extraction_mode: MemoryExtractionMode
  permission: MemoryPermission
  scope_type: MemoryScopeType
  /** UUID of the owning entity (user, agent, or team based on scope_type) */
  scope_id: string | null
  tenant_id: string
  created_by: string | null
  /** ISO 8601 timestamp */
  created_at: string
  /** ISO 8601 timestamp */
  updated_at: string
}

/**
 * @description MemoryMessage interface for OpenSearch documents.
 *   Represents a single extracted memory item stored in OpenSearch.
 */
export interface MemoryMessage {
  /** Unique message identifier */
  message_id: string
  /** Parent memory pool UUID */
  memory_id: string
  /** Memory type bitmask value (1, 2, 4, or 8) */
  message_type: number
  /** Source conversation/chat session ID */
  source_id: string
  /** User who generated the source conversation */
  user_id: string
  /** Agent that generated the source conversation (if applicable) */
  agent_id: string | null
  /** Session ID for grouping related messages */
  session_id: string | null
  /** ISO timestamp when this memory became valid */
  valid_at: string | null
  /** ISO timestamp when this memory was invalidated */
  invalid_at: string | null
  /** ISO timestamp when this memory should be forgotten */
  forget_at: string | null
  /** Status: 0=inactive, 1=active */
  status: number
  /** Extracted memory content */
  content: string
  /** Multi-tenant isolation identifier */
  tenant_id: string
  /** ISO 8601 timestamp */
  created_at: string
}

// ============================================================================
// API Request/Response DTOs
// ============================================================================

/**
 * @description DTO for creating a new memory pool
 */
export type CreateMemoryDto = Pick<Memory, 'name'> & Partial<Pick<Memory,
  | 'description'
  | 'memory_type'
  | 'storage_type'
  | 'memory_size'
  | 'embd_id'
  | 'llm_id'
  | 'temperature'
  | 'system_prompt'
  | 'user_prompt'
  | 'extraction_mode'
  | 'permission'
  | 'scope_type'
  | 'scope_id'
>>

/**
 * @description DTO for updating an existing memory pool
 */
export type UpdateMemoryDto = Partial<CreateMemoryDto>

/**
 * @description Search result extending MemoryMessage with relevance score
 */
export type MemorySearchResult = MemoryMessage & { score: number }

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * @description Check if a memory type bitmask includes a specific type.
 *   Example: hasMemoryType(15, MemoryType.SEMANTIC) => true
 * @param {number} bitmask - The memory_type bitmask value (1-15)
 * @param {number} type - The specific type to check (1, 2, 4, or 8)
 * @returns {boolean} True if the bitmask includes the specified type
 */
export function hasMemoryType(bitmask: number, type: number): boolean {
  return (bitmask & type) !== 0
}
