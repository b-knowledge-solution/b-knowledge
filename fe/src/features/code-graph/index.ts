/**
 * Barrel exports for the code-graph feature module.
 * @module features/code-graph
 */
export { codeGraphApi } from './api/codeGraphApi'
export { useCodeGraphStats, useCodeGraphData, useCodeGraphCallers } from './api/codeGraphQueries'
export { default as CodeGraphPage } from './pages/CodeGraphPage'
export type { CodeGraphNode, CodeGraphData, CodeGraphStats } from './types/code-graph.types'
