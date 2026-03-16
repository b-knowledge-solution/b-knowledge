/**
 * @fileoverview Shared web search utility using the Tavily API.
 *
 * Extracted from chat-conversation.service so it can be reused by
 * the deep research pipeline and other modules.
 *
 * @module shared/services/web-search
 */

import { ChunkResult } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Search the web via Tavily API for supplemental context.
 * Uses the "advanced" search depth for higher quality results and converts
 * Tavily results into the internal ChunkResult format for RAG pipeline consumption.
 * Returns an empty array on any error to allow graceful degradation.
 * @param {string} query - Search query
 * @param {string} apiKey - Tavily API key
 * @param {number} [maxResults=3] - Maximum results to return
 * @returns {Promise<ChunkResult[]>} Array of ChunkResult from web search
 */
export async function searchWeb(
  query: string,
  apiKey: string,
  maxResults: number = 3
): Promise<ChunkResult[]> {
  try {
    // Call Tavily API with advanced search depth for better quality results
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: maxResults,
        include_answer: false,
      }),
    })

    // Return empty results on non-OK status to allow graceful fallback
    if (!response.ok) {
      log.warn('Tavily search failed', { status: response.status })
      return []
    }

    const data = await response.json() as {
      results: Array<{ url: string; title: string; content: string; score: number }>
    }

    // Convert Tavily results to ChunkResult format for unified RAG pipeline consumption
    return (data.results || []).map((r, i) => ({
      chunk_id: `web_${i}`,
      text: `[Web: ${r.title}]\n${r.content}\nSource: ${r.url}`,
      doc_name: r.title,
      score: r.score,
      method: 'web_search',
    }))
  } catch (err) {
    // Catch network or parsing errors and return empty to avoid breaking the pipeline
    log.warn('Web search error', { error: String(err) })
    return []
  }
}
