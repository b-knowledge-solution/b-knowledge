/**
 * API service for code knowledge graph endpoints.
 * @description Provides typed methods for graph data, stats, and queries.
 */
import { api } from '@/lib/api'
import type {
  CodeGraphData,
  CodeGraphStats,
  CodeGraphReference,
  CodeSnippet,
  HierarchyChain,
  CypherResult,
  NlQueryResult,
} from '../types/code-graph.types'

/** Base URL for code graph API */
const BASE = '/api/code-graph'

export const codeGraphApi = {
  /**
   * Get graph statistics for a knowledge base.
   * @param kbId - Knowledge base ID
   * @returns Node and relationship counts
   */
  getStats: async (kbId: string): Promise<CodeGraphStats> =>
    api.get<CodeGraphStats>(`${BASE}/${kbId}/stats`),

  /**
   * Get graph data for visualization.
   * @param kbId - Knowledge base ID
   * @param limit - Max nodes (default 500)
   * @returns Nodes and links for rendering
   */
  getGraphData: async (kbId: string, limit = 500): Promise<CodeGraphData> =>
    api.get<CodeGraphData>(`${BASE}/${kbId}/graph?limit=${limit}`),

  /**
   * Find callers of a function/method.
   * @param kbId - Knowledge base ID
   * @param name - Function name
   * @returns Caller references
   */
  getCallers: async (kbId: string, name: string): Promise<CodeGraphReference[]> =>
    api.get<CodeGraphReference[]>(`${BASE}/${kbId}/callers?name=${encodeURIComponent(name)}`),

  /**
   * Find callees of a function/method.
   * @param kbId - Knowledge base ID
   * @param name - Function name
   * @returns Callee references
   */
  getCallees: async (kbId: string, name: string): Promise<CodeGraphReference[]> =>
    api.get<CodeGraphReference[]>(`${BASE}/${kbId}/callees?name=${encodeURIComponent(name)}`),

  /**
   * Get source code snippet.
   * @param kbId - Knowledge base ID
   * @param name - Function/method name
   * @returns Code snippets
   */
  getSnippet: async (kbId: string, name: string): Promise<CodeSnippet[]> =>
    api.get<CodeSnippet[]>(`${BASE}/${kbId}/snippet?name=${encodeURIComponent(name)}`),

  /**
   * Get class hierarchy.
   * @param kbId - Knowledge base ID
   * @param name - Class name
   * @returns Inheritance chains
   */
  getHierarchy: async (kbId: string, name: string): Promise<HierarchyChain[]> =>
    api.get<HierarchyChain[]>(`${BASE}/${kbId}/hierarchy?name=${encodeURIComponent(name)}`),

  /**
   * Execute natural language query against the code graph.
   * @description Sends a question to the AI which translates it to Cypher and executes it
   * @param kbId - Knowledge base ID
   * @param question - Natural language question about the codebase
   * @returns AI-translated Cypher result with matching nodes
   */
  queryNl: async (kbId: string, question: string): Promise<NlQueryResult> =>
    api.post<NlQueryResult>(`${BASE}/${kbId}/query`, { question }),

  /**
   * Execute raw Cypher query (admin only).
   * @param kbId - Knowledge base ID
   * @param cypher - Cypher query string
   * @param params - Query parameters
   * @returns Query results
   */
  executeCypher: async (
    kbId: string,
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<CypherResult> =>
    api.post<CypherResult>(`${BASE}/${kbId}/cypher`, { cypher, params }),
}
