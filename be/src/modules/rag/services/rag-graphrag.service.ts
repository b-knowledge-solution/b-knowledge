/**
 * @fileoverview Knowledge Graph (GraphRAG) retrieval service.
 *
 * Queries entity, relation, and community report documents stored in the
 * same OpenSearch index as regular chunks (`knowledge_{SYSTEM_TENANT_ID}`).
 * Documents are distinguished by the `knowledge_graph_kwd` field.
 *
 * @module modules/rag/services/rag-graphrag
 */

import { Client } from '@opensearch-project/opensearch'
import { llmClientService, LlmMessage } from '@/shared/services/llm-client.service.js'
import { graphragPrompt } from '@/shared/prompts/index.js'
import { log } from '@/shared/services/logger.service.js'
import { config } from '@/shared/config/index.js'

// ---------------------------------------------------------------------------
// Constants & OpenSearch client (reuse same pattern as rag-search.service)
// ---------------------------------------------------------------------------

// Centralized tenant ID and OpenSearch connection from config
const SYSTEM_TENANT_ID = config.opensearch.systemTenantId
const ES_HOST = config.opensearch.host
const ES_PASSWORD = config.opensearch.password

/**
 * Get the OpenSearch index name based on the system tenant ID.
 * @returns The index name string
 */
function getIndexName(): string {
  return `knowledge_${SYSTEM_TENANT_ID}`
}

let osClient: Client | null = null

/**
 * Get or create the singleton OpenSearch client.
 * @returns The OpenSearch client instance
 */
function getClient(): Client {
  if (!osClient) {
    const opts: Record<string, unknown> = { node: ES_HOST }
    if (ES_PASSWORD) {
      opts['auth'] = { username: 'admin', password: ES_PASSWORD }
    }
    // Disable SSL verification for local development
    opts['ssl'] = { rejectUnauthorized: false }
    osClient = new Client(opts as any)
  }
  return osClient
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A matched entity from the knowledge graph.
 */
export interface GraphEntity {
  /** Entity name */
  entity: string
  /** Entity type (e.g. "Person", "Organization") */
  type: string
  /** Entity description text */
  description: string
  /** Similarity score from search */
  similarity: number
  /** PageRank score from the graph */
  pagerank: number
  /** N-hop neighbor paths with edge weights */
  nHopEnts: Array<{ path: string[]; weights: number[] }>
}

/**
 * A relation edge from the knowledge graph.
 */
export interface GraphRelation {
  /** Source entity name */
  from: string
  /** Target entity name */
  to: string
  /** Relevance score */
  score: number
  /** Relation description text */
  description: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service for knowledge graph (GraphRAG) retrieval from OpenSearch.
 * Entities, relations, and community reports live alongside regular chunks
 * in the same index, differentiated by `knowledge_graph_kwd`.
 */
export class RagGraphragService {
  /**
   * Query rewrite: extract entity types and entities from user question.
   * Uses LLM to analyze the question against available entity types in the KB.
   * @param kbIds - Knowledge base IDs to search
   * @param question - User question
   * @param providerId - LLM provider ID
   * @returns Object with extracted typeKeywords and entities
   */
  async queryRewrite(
    kbIds: string[],
    question: string,
    providerId?: string
  ): Promise<{ typeKeywords: string[]; entities: string[] }> {
    // Fetch entity type samples so the LLM knows what types exist
    const typeSamples = await this.getEntityTypeSamples(kbIds)

    // Format samples for the prompt
    const sampleLines = [...typeSamples.entries()]
      .map(([type, examples]) => `- ${type}: ${examples.join(', ')}`)
      .join('\n')

    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: graphragPrompt.system,
      },
      {
        role: 'user',
        content: `Available entity types:\n${sampleLines || '(none found)'}\n\nQuestion: ${question}`,
      },
    ]

    try {
      const result = await llmClientService.chatCompletion(messages, {
        providerId,
        temperature: 0,
        max_tokens: 256,
      })

      // Parse JSON from LLM response
      const parsed = JSON.parse(result.trim())
      return {
        typeKeywords: Array.isArray(parsed.types) ? parsed.types : [],
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      }
    } catch (err) {
      log.warn('GraphRAG query rewrite failed', { error: String(err) })
      return { typeKeywords: [], entities: [] }
    }
  }

  /**
   * Get entity type samples from the knowledge base for the rewrite prompt.
   * Queries OpenSearch for distinct entity types with example entities.
   * @param kbIds - Knowledge base IDs
   * @returns Map of entity_type to sample entity names
   */
  async getEntityTypeSamples(kbIds: string[]): Promise<Map<string, string[]>> {
    const client = getClient()
    const result = new Map<string, string[]>()

    try {
      const res = await client.search({
        index: getIndexName(),
        body: {
          query: {
            bool: {
              must: [
                { terms: { kb_id: kbIds } },
                { term: { knowledge_graph_kwd: 'entity' } },
              ],
            },
          },
          size: 0,
          // Aggregate by entity type, with top-3 entity examples per type
          aggs: {
            types: {
              terms: { field: 'entity_type_kwd', size: 50 },
              aggs: {
                sample_entities: {
                  top_hits: {
                    size: 3,
                    _source: ['entity_kwd'],
                  },
                },
              },
            },
          },
        },
      })

      // Extract type buckets and their sample entities
      const typesAgg = res.body.aggregations?.types as any
      const buckets = typesAgg?.buckets || []
      for (const bucket of buckets) {
        const type = bucket.key as string
        const samples = (bucket.sample_entities?.hits?.hits || [])
          .map((h: any) => h._source?.entity_kwd as string)
          .filter(Boolean)
        result.set(type, samples)
      }
    } catch (err) {
      log.warn('Failed to fetch entity type samples', { error: String(err) })
    }

    return result
  }

  /**
   * Search entities by keywords using hybrid (text + vector) matching.
   * @param kbIds - Knowledge base IDs
   * @param keywords - Keywords to search for
   * @param topN - Max results (default 56)
   * @returns Array of matched GraphEntity objects
   */
  async getRelevantEntsByKeywords(
    kbIds: string[],
    keywords: string[],
    topN: number = 56
  ): Promise<GraphEntity[]> {
    if (keywords.length === 0) return []

    const client = getClient()
    // Join keywords into a single query string
    const queryText = keywords.join(' ')

    try {
      const res = await client.search({
        index: getIndexName(),
        body: {
          query: {
            bool: {
              must: [
                { terms: { kb_id: kbIds } },
                { term: { knowledge_graph_kwd: 'entity' } },
              ],
              should: [
                // Match entity name
                { match: { entity_kwd: { query: queryText, boost: 3 } } },
                // Match entity description
                { match: { content_with_weight: { query: queryText, boost: 1 } } },
              ],
              minimum_should_match: 1,
            },
          },
          size: topN,
          _source: ['entity_kwd', 'entity_type_kwd', 'content_with_weight', 'rank_flt', 'n_hop_with_weight'],
        },
      })

      return this.mapEntityHits(res.body.hits.hits)
    } catch (err) {
      log.warn('Entity keyword search failed', { error: String(err) })
      return []
    }
  }

  /**
   * Search entities by type.
   * @param kbIds - Knowledge base IDs
   * @param types - Entity types to filter
   * @param topN - Max results
   * @returns Array of matched GraphEntity objects
   */
  async getRelevantEntsByTypes(
    kbIds: string[],
    types: string[],
    topN: number = 56
  ): Promise<GraphEntity[]> {
    if (types.length === 0) return []

    const client = getClient()

    try {
      const res = await client.search({
        index: getIndexName(),
        body: {
          query: {
            bool: {
              must: [
                { terms: { kb_id: kbIds } },
                { term: { knowledge_graph_kwd: 'entity' } },
                { terms: { entity_type_kwd: types } },
              ],
            },
          },
          // Sort by PageRank descending to get most important entities first
          sort: [{ rank_flt: { order: 'desc' as const } }],
          size: topN,
          _source: ['entity_kwd', 'entity_type_kwd', 'content_with_weight', 'rank_flt', 'n_hop_with_weight'],
        },
      })

      return this.mapEntityHits(res.body.hits.hits)
    } catch (err) {
      log.warn('Entity type search failed', { error: String(err) })
      return []
    }
  }

  /**
   * Search relations by text query.
   * @param kbIds - Knowledge base IDs
   * @param query - Text query
   * @param topN - Max results
   * @returns Array of matched GraphRelation objects
   */
  async getRelevantRelations(
    kbIds: string[],
    query: string,
    topN: number = 30
  ): Promise<GraphRelation[]> {
    const client = getClient()

    try {
      const res = await client.search({
        index: getIndexName(),
        body: {
          query: {
            bool: {
              must: [
                { terms: { kb_id: kbIds } },
                { term: { knowledge_graph_kwd: 'relation' } },
              ],
              should: [
                // Match relation description
                { match: { content_with_weight: { query, boost: 1 } } },
                // Match source or target entity names
                { match: { from_entity_kwd: { query, boost: 2 } } },
                { match: { to_entity_kwd: { query, boost: 2 } } },
              ],
              minimum_should_match: 1,
            },
          },
          size: topN,
          _source: ['from_entity_kwd', 'to_entity_kwd', 'weight_int', 'content_with_weight'],
        },
      })

      // Map hits to GraphRelation objects
      return (res.body.hits.hits || []).map((hit: any) => {
        const src = hit._source || {}
        return {
          from: src.from_entity_kwd || '',
          to: src.to_entity_kwd || '',
          score: hit._score ?? 0,
          description: this.parseDescription(src.content_with_weight),
        }
      })
    } catch (err) {
      log.warn('Relation search failed', { error: String(err) })
      return []
    }
  }

  /**
   * Perform N-hop traversal from matched entities.
   * Each entity has pre-computed n_hop_with_weight field containing neighbor paths.
   * Score decay: entity_sim / (2 + hop_index)
   * @param entities - Matched entities with their n_hop data
   * @returns Array of GraphRelation representing traversal edges
   */
  nHopTraversal(entities: GraphEntity[]): GraphRelation[] {
    const relations: GraphRelation[] = []

    for (const ent of entities) {
      if (!ent.nHopEnts || ent.nHopEnts.length === 0) continue

      for (const hop of ent.nHopEnts) {
        const { path, weights } = hop
        // Each step in the path represents a hop from one entity to another
        for (let i = 0; i < path.length - 1; i++) {
          // Apply score decay: source entity similarity divided by (2 + hop distance)
          const decayedScore = ent.similarity / (2 + i)
          const edgeWeight = weights[i] ?? 1

          relations.push({
            from: path[i]!,
            to: path[i + 1]!,
            score: decayedScore * edgeWeight,
            description: `${path[i]} -> ${path[i + 1]} (hop ${i + 1} from ${ent.entity})`,
          })
        }
      }
    }

    // Sort by score descending
    relations.sort((a, b) => b.score - a.score)
    return relations
  }

  /**
   * Full knowledge graph retrieval pipeline.
   * 1. Query rewrite -> extract types + entities
   * 2. Get entities by keywords
   * 3. Get entities by types
   * 4. Get relations by text
   * 5. N-hop traversal
   * 6. Score boosting (2x for keyword+type overlap)
   * 7. Format as context text with token budget
   * @param kbIds - Knowledge base IDs
   * @param question - User question
   * @param providerId - LLM provider ID
   * @param maxTokens - Token budget for output (default 4096)
   * @returns Formatted knowledge graph context string
   */
  async retrieval(
    kbIds: string[],
    question: string,
    providerId?: string,
    maxTokens: number = 4096
  ): Promise<string> {
    // Step 1: Query rewrite to extract entity types and entity names
    const { typeKeywords, entities: extractedEntities } = await this.queryRewrite(kbIds, question, providerId)

    log.info('GraphRAG query rewrite', { typeKeywords, extractedEntities })

    // Step 2: Search entities by extracted keywords
    const keywordEnts = await this.getRelevantEntsByKeywords(kbIds, extractedEntities)

    // Step 3: Search entities by extracted types
    const typeEnts = await this.getRelevantEntsByTypes(kbIds, typeKeywords)

    // Step 4: Search relations by original question text
    const relations = await this.getRelevantRelations(kbIds, question)

    // Merge entities, deduplicate by entity name
    const entityMap = new Map<string, GraphEntity>()

    for (const ent of keywordEnts) {
      entityMap.set(ent.entity, ent)
    }

    // Step 6: Score boosting — entities found by both keyword and type get 2x boost
    for (const ent of typeEnts) {
      const existing = entityMap.get(ent.entity)
      if (existing) {
        // Entity appeared in both keyword and type results: boost 2x
        existing.similarity *= 2
      } else {
        entityMap.set(ent.entity, ent)
      }
    }

    const allEntities = [...entityMap.values()]
    // Sort by combined similarity + pagerank
    allEntities.sort((a, b) => (b.similarity + b.pagerank) - (a.similarity + a.pagerank))

    // Step 5: N-hop traversal from matched entities
    const hopRelations = this.nHopTraversal(allEntities)

    // Merge direct relations with hop relations, deduplicate
    const relationSet = new Map<string, GraphRelation>()
    for (const rel of [...relations, ...hopRelations]) {
      const key = `${rel.from}->${rel.to}`
      const existing = relationSet.get(key)
      if (!existing || rel.score > existing.score) {
        relationSet.set(key, rel)
      }
    }

    const allRelations = [...relationSet.values()]
    allRelations.sort((a, b) => b.score - a.score)

    // Step 7: Format as context text within token budget
    return this.formatContext(allEntities, allRelations, maxTokens)
  }

  /**
   * @description Aggregate graph metrics for the given knowledge base IDs.
   * Queries OpenSearch for entity, relation, and community report counts,
   * plus the most recent creation timestamp.
   * @param {string[]} kbIds - Knowledge base IDs to aggregate metrics for
   * @returns {Promise<{ entityCount: number; relationCount: number; communityCount: number; lastBuiltAt: string | null }>}
   */
  async getGraphMetrics(kbIds: string[]): Promise<{
    entityCount: number
    relationCount: number
    communityCount: number
    lastBuiltAt: string | null
  }> {
    // Return zeros immediately for empty input
    if (kbIds.length === 0) {
      return { entityCount: 0, relationCount: 0, communityCount: 0, lastBuiltAt: null }
    }

    const client = getClient()
    const index = getIndexName()

    try {
      // Count entities, relations, and community reports in parallel
      const [entityRes, relationRes, communityRes] = await Promise.all([
        client.count({
          index,
          body: {
            query: {
              bool: {
                must: [
                  { terms: { kb_id: kbIds } },
                  { term: { knowledge_graph_kwd: 'entity' } },
                ],
              },
            },
          },
        }),
        client.count({
          index,
          body: {
            query: {
              bool: {
                must: [
                  { terms: { kb_id: kbIds } },
                  { term: { knowledge_graph_kwd: 'relation' } },
                ],
              },
            },
          },
        }),
        client.count({
          index,
          body: {
            query: {
              bool: {
                must: [
                  { terms: { kb_id: kbIds } },
                  { term: { knowledge_graph_kwd: 'community_report' } },
                ],
              },
            },
          },
        }),
      ])

      // Get the most recent creation timestamp across all graph documents
      const lastBuiltRes = await client.search({
        index,
        body: {
          query: {
            bool: {
              must: [
                { terms: { kb_id: kbIds } },
                { terms: { knowledge_graph_kwd: ['entity', 'relation', 'community_report'] } },
              ],
            },
          },
          sort: [{ create_time: { order: 'desc' as const } }],
          size: 1,
          _source: ['create_time'],
        },
      })

      const lastHit = lastBuiltRes.body.hits.hits?.[0]
      const lastBuiltAt = lastHit?._source?.create_time ?? null

      return {
        entityCount: entityRes.body.count ?? 0,
        relationCount: relationRes.body.count ?? 0,
        communityCount: communityRes.body.count ?? 0,
        lastBuiltAt,
      }
    } catch (err) {
      log.warn('Failed to get graph metrics', { error: String(err) })
      return { entityCount: 0, relationCount: 0, communityCount: 0, lastBuiltAt: null }
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Map raw OpenSearch entity hits to GraphEntity objects.
   * @param hits - Raw hit array from OpenSearch response
   * @returns Array of GraphEntity objects
   */
  private mapEntityHits(hits: any[]): GraphEntity[] {
    return (hits || []).map((hit: any) => {
      const src = hit._source || {}

      // Parse n_hop_with_weight JSON field
      let nHopEnts: GraphEntity['nHopEnts'] = []
      try {
        if (src.n_hop_with_weight) {
          const parsed = typeof src.n_hop_with_weight === 'string'
            ? JSON.parse(src.n_hop_with_weight)
            : src.n_hop_with_weight
          if (Array.isArray(parsed)) {
            nHopEnts = parsed
          }
        }
      } catch {
        // Ignore malformed n_hop data
      }

      return {
        entity: src.entity_kwd || '',
        type: src.entity_type_kwd || '',
        description: this.parseDescription(src.content_with_weight),
        similarity: hit._score ?? 0,
        pagerank: src.rank_flt ?? 0,
        nHopEnts,
      }
    })
  }

  /**
   * Parse description from the content_with_weight field.
   * The field may be a JSON string or plain text.
   * @param raw - Raw content_with_weight value
   * @returns Extracted description text
   */
  private parseDescription(raw: unknown): string {
    if (!raw) return ''
    if (typeof raw === 'string') {
      try {
        // Try parsing as JSON (may contain a description field)
        const parsed = JSON.parse(raw)
        if (typeof parsed === 'string') return parsed
        if (parsed.description) return parsed.description
        return raw
      } catch {
        // Plain text
        return raw
      }
    }
    return String(raw)
  }

  /**
   * Format entities and relations into a context string within a token budget.
   * Approximates tokens as characters / 4.
   * @param entities - Sorted entities
   * @param relations - Sorted relations
   * @param maxTokens - Token budget
   * @returns Formatted context string
   */
  private formatContext(
    entities: GraphEntity[],
    relations: GraphRelation[],
    maxTokens: number
  ): string {
    const parts: string[] = []
    // Approximate token budget as character budget (4 chars per token)
    let charBudget = maxTokens * 4

    // Add entity section
    if (entities.length > 0) {
      parts.push('## Knowledge Graph Entities')
      for (const ent of entities) {
        const line = `- **${ent.entity}** (${ent.type}): ${ent.description}`
        if (charBudget - line.length < 0) break
        charBudget -= line.length
        parts.push(line)
      }
    }

    // Add relation section
    if (relations.length > 0 && charBudget > 100) {
      parts.push('\n## Knowledge Graph Relations')
      for (const rel of relations) {
        const line = `- ${rel.from} → ${rel.to}: ${rel.description}`
        if (charBudget - line.length < 0) break
        charBudget -= line.length
        parts.push(line)
      }
    }

    return parts.join('\n')
  }
}

/** Singleton instance of the GraphRAG service */
export const ragGraphragService = new RagGraphragService()
