/** Types for code knowledge graph feature */

/** Graph node from the Memgraph API */
export interface CodeGraphNode {
  id: number
  labels: string[]
  name: string
  qualified_name: string
  path?: string
  language?: string
}

/** Graph link/relationship from the API */
export interface CodeGraphLink {
  source: number
  target: number
  type: string
}

/** Full graph data for visualization */
export interface CodeGraphData {
  nodes: CodeGraphNode[]
  links: CodeGraphLink[]
}

/** Graph statistics */
export interface CodeGraphStats {
  nodes: Array<{ label: string[]; count: number }>
  relationships: Array<{ type: string; count: number }>
}

/** Caller/callee record */
export interface CodeGraphReference {
  caller?: string
  callee?: string
  source?: string
  target?: string
  file: string
}

/** Code snippet from the graph */
export interface CodeSnippet {
  name: string
  code: string
  file: string
  start_line: number
  end_line: number
}

/** Hierarchy chain */
export interface HierarchyChain {
  chain: Array<{ name: string; qualified_name: string }>
}

/** Natural language query result from AI-powered Cypher translation */
export interface NlQueryResult {
  cypher: string
  results: Record<string, unknown>[]
  count: number
  /** Node IDs returned by the query, used to highlight matched nodes in the graph */
  nodeIds?: number[]
}

/** Cypher query result */
export interface CypherResult {
  results: Record<string, unknown>[]
  count: number
}
