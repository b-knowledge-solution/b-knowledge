/**
 * @fileoverview TanStack Query hooks for system tools and health monitoring.
 * @module features/system/api/systemQueries
 */

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { getSystemTools, getSystemHealth } from './systemToolsApi'
import { getConverterStats, getConverterJobs } from './converterApi'
import type { JobListFilter } from './converterApi'

/**
 * @description Fetch enabled system monitoring tools.
 * @returns TanStack Query result with system tools list
 */
export function useSystemTools() {
  return useQuery({
    queryKey: queryKeys.systemTools.list(),
    queryFn: getSystemTools,
  })
}

/**
 * @description Fetch system health metrics with configurable auto-refresh.
 * @param options - Optional configuration for refetch interval
 * @param options.refetchInterval - Auto-refresh interval in ms, or false to disable
 * @returns TanStack Query result with system health data
 */
export function useSystemHealth(options?: { refetchInterval: number | false }) {
  return useQuery({
    queryKey: queryKeys.systemTools.health(),
    queryFn: getSystemHealth,
    ...(options && { refetchInterval: options.refetchInterval }),
  })
}

/**
 * @description Fetch aggregate converter queue statistics.
 * @returns TanStack Query result with queue stats
 */
export function useConverterStats() {
  return useQuery({
    queryKey: queryKeys.converter.stats(),
    queryFn: getConverterStats,
  })
}

/**
 * @description Fetch paginated converter jobs with optional filters.
 * @param filters - Optional filters and pagination params
 * @returns TanStack Query result with jobs and total count
 */
export function useConverterJobs(filters?: JobListFilter) {
  return useQuery({
    queryKey: queryKeys.converter.jobs(filters as Record<string, unknown>),
    queryFn: () => getConverterJobs(filters),
  })
}
