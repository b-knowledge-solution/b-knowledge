/**
 * TanStack Query hooks for code knowledge graph.
 * @description Wraps codeGraphApi methods with useQuery/useMutation.
 */
import { useQuery, useMutation } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { codeGraphApi } from './codeGraphApi'

// ── Queries ──────────────────────────────────

/**
 * Hook to fetch graph statistics.
 * @param kbId - Knowledge base ID
 */
export function useCodeGraphStats(kbId: string) {
  return useQuery({
    queryKey: queryKeys.codeGraph.stats(kbId),
    queryFn: () => codeGraphApi.getStats(kbId),
    enabled: !!kbId,
  })
}

/**
 * Hook to fetch graph visualization data.
 * @param kbId - Knowledge base ID
 * @param limit - Max nodes
 */
export function useCodeGraphData(kbId: string, limit = 500) {
  return useQuery({
    queryKey: queryKeys.codeGraph.graph(kbId, limit),
    queryFn: () => codeGraphApi.getGraphData(kbId, limit),
    enabled: !!kbId,
  })
}

/**
 * Hook to fetch callers of a function.
 * @param kbId - Knowledge base ID
 * @param name - Function name
 */
export function useCodeGraphCallers(kbId: string, name: string) {
  return useQuery({
    queryKey: queryKeys.codeGraph.callers(kbId, name),
    queryFn: () => codeGraphApi.getCallers(kbId, name),
    enabled: !!kbId && !!name,
  })
}

/**
 * Hook to fetch callees of a function.
 * @param kbId - Knowledge base ID
 * @param name - Function name
 */
export function useCodeGraphCallees(kbId: string, name: string) {
  return useQuery({
    queryKey: queryKeys.codeGraph.callees(kbId, name),
    queryFn: () => codeGraphApi.getCallees(kbId, name),
    enabled: !!kbId && !!name,
  })
}

/**
 * Hook to fetch code snippet.
 * @param kbId - Knowledge base ID
 * @param name - Function/method name
 */
export function useCodeGraphSnippet(kbId: string, name: string) {
  return useQuery({
    queryKey: queryKeys.codeGraph.snippet(kbId, name),
    queryFn: () => codeGraphApi.getSnippet(kbId, name),
    enabled: !!kbId && !!name,
  })
}

// ── Mutations ────────────────────────────────

/**
 * Hook to execute raw Cypher query (admin).
 */
export function useExecuteCypher(kbId: string) {
  return useMutation({
    mutationFn: ({ cypher, params }: { cypher: string; params?: Record<string, unknown> }) =>
      codeGraphApi.executeCypher(kbId, cypher, params),
  })
}
