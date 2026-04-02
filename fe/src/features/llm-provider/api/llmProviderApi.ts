/**
 * @fileoverview API service for LLM Provider CRUD operations.
 * @module features/llm-provider/api/llmProviderApi
 */

import { api } from '@/lib/api'
import type { ModelProvider, CreateProviderDTO, UpdateProviderDTO, FactoryPreset } from '../types/llmProvider.types'

/** Base endpoint for llm-provider API */
const BASE = '/api/llm-provider'

/**
 * Fetch all active LLM providers.
 * @returns Array of model providers
 */
export function getProviders(): Promise<ModelProvider[]> {
  return api.get<ModelProvider[]>(BASE)
}

/**
 * Fetch a single provider by ID.
 * @param id - Provider UUID
 * @returns The matching model provider
 */
export function getProvider(id: string): Promise<ModelProvider> {
  return api.get<ModelProvider>(`${BASE}/${id}`)
}

/**
 * Fetch the default providers (one per model_type).
 * @returns Array of default model providers
 */
export function getDefaults(): Promise<ModelProvider[]> {
  return api.get<ModelProvider[]>(`${BASE}/defaults`)
}

/**
 * Create a new LLM provider.
 * @param data - Provider creation payload
 * @returns The newly created provider
 */
export function createProvider(data: CreateProviderDTO): Promise<ModelProvider> {
  return api.post<ModelProvider>(BASE, data)
}

/**
 * Update an existing LLM provider.
 * @param id - Provider UUID
 * @param data - Fields to update
 * @returns The updated provider
 */
export function updateProvider(id: string, data: UpdateProviderDTO): Promise<ModelProvider> {
  return api.put<ModelProvider>(`${BASE}/${id}`, data)
}

/**
 * Soft-delete a provider (sets status to "deleted").
 * @param id - Provider UUID
 */
export function deleteProvider(id: string): Promise<void> {
  return api.delete<void>(`${BASE}/${id}`)
}

/**
 * Fetch factory presets with pre-defined models.
 * @returns Array of factory presets
 */
export function getPresets(): Promise<FactoryPreset[]> {
  return api.get<FactoryPreset[]>(`${BASE}/presets`)
}

// ============================================================================
// Connection Test
// ============================================================================

/** Result of a provider connection test */
export interface TestConnectionResult {
  /** Whether the connection was successful */
  success: boolean
  /** Round-trip latency in milliseconds (present on success) */
  latencyMs?: number
  /** Error message (present on failure) */
  error?: string
}

/**
 * Test the connection to an LLM provider by sending a lightweight probe.
 * @param id - Provider UUID
 * @returns Test result with success flag, latency, and optional error
 */
export function testConnection(id: string): Promise<TestConnectionResult> {
  return api.post<TestConnectionResult>(`${BASE}/${id}/test-connection`)
}
