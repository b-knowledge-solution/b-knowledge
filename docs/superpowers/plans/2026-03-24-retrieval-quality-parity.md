# Retrieval Quality Parity with RAGFlow — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring B-Knowledge retrieval quality to RAGFlow parity by pushing intelligence into OpenSearch (CJK analysis plugins, hybrid query pipeline, multi-field boosted search) and improving Node.js search logic — no Python HTTP API needed.

**Architecture:** Install `analysis-smartcn` and `analysis-ik` OpenSearch plugins for CJK tokenization. Add `content_with_weight` sub-fields with CJK analyzers to the index mapping. Use OpenSearch's native `hybrid` query with `normalization-processor` for single-request text+vector fusion. Add multi-field search with RAGFlow boosts (title x10, keywords x30, questions x20, content x2). Fix threshold bug and add zero-result fallback. All changes are in OpenSearch config, index mapping, and Node.js — advance-rag worker remains a pure task executor.

**Tech Stack:** OpenSearch 3.5 (analysis-smartcn, analysis-ik plugins), Node.js/TypeScript (Express), Docker

---

## File Structure

### Docker — New/Modified Files
| File | Responsibility |
|------|---------------|
i| `docker/opensearch/Dockerfile` | Custom OpenSearch image with CJK analysis plugins |
| `docker/docker-compose-base.yml` | Use custom OpenSearch image instead of stock |

### OpenSearch Mapping — Modified Files
| File | Responsibility |
|------|---------------|
| `advance-rag/conf/os_mapping.json` | Add CJK multi-field sub-fields to mapping, add synonym analyzer |

### Node.js Backend — Modified Files
| File | Responsibility |
|------|---------------|
| `be/src/modules/rag/services/rag-search.service.ts` | Rewrite search to use multi-field queries, OpenSearch hybrid query, zero-result fallback, fix threshold |
| `be/tests/rag/rag-search.service.test.ts` | Update test assertions |
| `be/tests/rag/cross-dataset-search.test.ts` | Update test assertions |

### Migration Script — New Files
| File | Responsibility |
|------|---------------|
| `scripts/migrate-opensearch-mapping.sh` | Re-index existing data to pick up new field mappings |

---

## Chunk 1: OpenSearch Infrastructure — CJK Plugins + Mapping

### Task 1: Create Custom OpenSearch Dockerfile with CJK Plugins

**Files:**
- Create: `docker/opensearch/Dockerfile`

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
# Custom OpenSearch with CJK analysis plugins for RAGFlow-quality text search.
# Plugins:
#   analysis-smartcn — Lucene Smart Chinese segmentation (probabilistic)
#   analysis-ik      — IK Analyzer for Chinese (ik_max_word + ik_smart modes)
FROM opensearchproject/opensearch:3.5.0

RUN opensearch-plugin install --batch analysis-smartcn
RUN opensearch-plugin install --batch \
    https://release.infinilabs.com/analysis-ik/stable/opensearch-analysis-ik-3.5.0.zip
```

- [ ] **Step 2: Commit**

```bash
git add docker/opensearch/Dockerfile
git commit -m "infra(opensearch): add Dockerfile with CJK analysis plugins (smartcn, ik)"
```

---

### Task 2: Update Docker Compose to Use Custom OpenSearch Image

**Files:**
- Modify: `docker/docker-compose-base.yml:67-68`

- [ ] **Step 1: Replace stock image with build context**

Change:
```yaml
  opensearch:
    image: opensearchproject/opensearch:3.5.0
```
To:
```yaml
  opensearch:
    build:
      context: ./opensearch
      dockerfile: Dockerfile
    image: b-knowledge-opensearch:3.5.0
```

- [ ] **Step 2: Test build**

Run: `cd docker && docker compose -f docker-compose-base.yml build opensearch`
Expected: Image builds successfully with both plugins installed

- [ ] **Step 3: Commit**

```bash
git add docker/docker-compose-base.yml
git commit -m "infra(opensearch): use custom image with CJK analysis plugins"
```

---

### Task 3: Update OpenSearch Index Mapping with CJK Sub-Fields and Synonym Analyzer

**Files:**
- Modify: `advance-rag/conf/os_mapping.json`

- [ ] **Step 1: Add custom analyzers to settings block**

In the `"settings"` → `"index"` section (after the `"similarity"` block at line 15), add:

```json
"analysis": {
  "filter": {
    "ik_synonym": {
      "type": "synonym_graph",
      "synonyms": [],
      "updateable": true
    }
  },
  "analyzer": {
    "ik_search": {
      "type": "custom",
      "tokenizer": "ik_smart",
      "filter": ["ik_synonym", "lowercase"]
    },
    "smartcn_search": {
      "type": "custom",
      "tokenizer": "smartcn_tokenizer",
      "filter": ["lowercase"]
    }
  }
}
```

- [ ] **Step 2: Replace the `string` dynamic template for `*_with_weight` fields**

Current template (lines 132-141) makes `content_with_weight` non-indexed. Replace it so the field is indexed with CJK sub-fields:

Change from:
```json
{
  "string": {
    "match_pattern": "regex",
    "match": "^.*_(with_weight|list)$",
    "mapping": {
      "type": "text",
      "index": "false",
      "store": true
    }
  }
}
```

To:
```json
{
  "string_list": {
    "match": "*_list",
    "mapping": {
      "type": "text",
      "index": false,
      "store": true
    }
  }
},
{
  "string_with_weight": {
    "match": "*_with_weight",
    "mapping": {
      "type": "text",
      "store": true,
      "analyzer": "standard",
      "fields": {
        "cjk": {
          "type": "text",
          "analyzer": "ik_max_word",
          "search_analyzer": "ik_search"
        },
        "smartcn": {
          "type": "text",
          "analyzer": "smartcn_search"
        }
      }
    }
  }
}
```

This creates three ways to match `content_with_weight`:
- `content_with_weight` — standard analyzer (English tokenization)
- `content_with_weight.cjk` — IK analyzer (best Chinese segmentation)
- `content_with_weight.smartcn` — SmartCN analyzer (alternative Chinese)

- [ ] **Step 3: Commit**

```bash
git add advance-rag/conf/os_mapping.json
git commit -m "feat(mapping): add CJK sub-fields and synonym analyzer to OpenSearch mapping"
```

---

### Task 4: Create Migration Script for Existing Indices

**Files:**
- Create: `scripts/migrate-opensearch-mapping.sh`

- [ ] **Step 1: Write the migration script**

```bash
#!/usr/bin/env bash
# Re-indexes existing OpenSearch data to pick up new CJK field mappings.
#
# The new os_mapping.json adds sub-fields (content_with_weight.cjk, .smartcn)
# that only get populated when documents are re-indexed. This script triggers
# a no-op update on all documents to force re-analysis.
#
# Usage: ./scripts/migrate-opensearch-mapping.sh [opensearch_url]
#   Default URL: http://localhost:9201

set -euo pipefail

OS_URL="${1:-http://localhost:9201}"
OS_CREDS=""

# Check if auth is needed
if curl -sf "${OS_URL}/_cluster/health" > /dev/null 2>&1; then
  echo "OpenSearch accessible without auth"
elif curl -sf -u "admin:OpenSearch@123" "${OS_URL}/_cluster/health" > /dev/null 2>&1; then
  OS_CREDS="-u admin:OpenSearch@123"
  echo "OpenSearch accessible with default auth"
else
  echo "ERROR: Cannot connect to OpenSearch at ${OS_URL}"
  exit 1
fi

# Find all knowledge_* indices
INDICES=$(curl -sf ${OS_CREDS} "${OS_URL}/_cat/indices/knowledge_*?h=index" | tr -d '[:space:]' | tr '\n' ' ')

if [ -z "${INDICES}" ]; then
  echo "No knowledge_* indices found. Nothing to migrate."
  exit 0
fi

echo "Found indices: ${INDICES}"
echo ""

for INDEX in ${INDICES}; do
  echo "=== Re-indexing ${INDEX} ==="

  # Close index to update settings
  curl -sf ${OS_CREDS} -X POST "${OS_URL}/${INDEX}/_close" > /dev/null
  echo "  Closed index"

  # Update settings with new analyzers (from os_mapping.json settings block)
  curl -sf ${OS_CREDS} -X PUT "${OS_URL}/${INDEX}/_settings" \
    -H 'Content-Type: application/json' \
    -d '{
      "analysis": {
        "filter": {
          "ik_synonym": {
            "type": "synonym_graph",
            "synonyms": [],
            "updateable": true
          }
        },
        "analyzer": {
          "ik_search": {
            "type": "custom",
            "tokenizer": "ik_smart",
            "filter": ["ik_synonym", "lowercase"]
          },
          "smartcn_search": {
            "type": "custom",
            "tokenizer": "smartcn_tokenizer",
            "filter": ["lowercase"]
          }
        }
      }
    }' > /dev/null
  echo "  Updated analyzers"

  # Reopen index
  curl -sf ${OS_CREDS} -X POST "${OS_URL}/${INDEX}/_open" > /dev/null
  echo "  Reopened index"

  # Add new sub-field mappings
  curl -sf ${OS_CREDS} -X PUT "${OS_URL}/${INDEX}/_mapping" \
    -H 'Content-Type: application/json' \
    -d '{
      "properties": {
        "content_with_weight": {
          "type": "text",
          "store": true,
          "analyzer": "standard",
          "fields": {
            "cjk": {
              "type": "text",
              "analyzer": "ik_max_word",
              "search_analyzer": "ik_search"
            },
            "smartcn": {
              "type": "text",
              "analyzer": "smartcn_search"
            }
          }
        }
      }
    }' > /dev/null
  echo "  Added CJK sub-field mappings"

  # Trigger re-analysis by updating all docs (no-op script)
  RESULT=$(curl -sf ${OS_CREDS} -X POST "${OS_URL}/${INDEX}/_update_by_query?wait_for_completion=true&conflicts=proceed" \
    -H 'Content-Type: application/json' \
    -d '{
      "script": {
        "source": "ctx._source.content_with_weight = ctx._source.content_with_weight",
        "lang": "painless"
      }
    }')

  UPDATED=$(echo "${RESULT}" | grep -o '"updated":[0-9]*' | grep -o '[0-9]*')
  echo "  Re-indexed ${UPDATED:-0} documents"
  echo ""
done

echo "Migration complete."
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/migrate-opensearch-mapping.sh`

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-opensearch-mapping.sh
git commit -m "feat(migration): add OpenSearch CJK mapping migration script"
```

---

## Chunk 2: Node.js Search Improvements

### Task 5: Rewrite fullTextSearch with Multi-Field Boosted Query

**Files:**
- Modify: `be/src/modules/rag/services/rag-search.service.ts:123-180`

- [ ] **Step 1: Replace single-field match with multi-field query**

In `fullTextSearch()`, replace the `must` clause (currently a single `match` on `content_ltks`):

```typescript
must: [
    { term: { kb_id: datasetId } },
    {
        multi_match: {
            query,
            // RAGFlow-equivalent field boosts:
            // title x10, important_kwd x30, question_tks x20,
            // content x2, CJK sub-fields for non-tokenized query matching
            fields: [
                'content_ltks^2',
                'content_sm_ltks',
                'content_with_weight.cjk^2',
                'content_with_weight.smartcn^2',
                'title_tks^10',
                'title_sm_tks^5',
                'important_kwd^30',
                'important_tks^20',
                'question_tks^20',
            ],
            type: 'best_fields',
            minimum_should_match: '30%',
        },
    },
],
```

Also update the highlight field to include the CJK sub-field:
```typescript
highlight: {
    fields: {
        content_ltks: { pre_tags: ['<mark>'], post_tags: ['</mark>'], fragment_size: 300, number_of_fragments: 1 },
        'content_with_weight.cjk': { pre_tags: ['<mark>'], post_tags: ['</mark>'], fragment_size: 300, number_of_fragments: 1 },
    },
},
```

Update `mapHits` to read highlights from either field:
```typescript
const hl = highlightFields.content_ltks?.[0]
    || highlightFields['content_with_weight.cjk']?.[0]
    || ''
...(hl ? { highlight: hl } : {}),
```

- [ ] **Step 2: Apply same multi-field query to searchMultipleDatasets**

Replace the single `match` on `content_ltks` in `searchMultipleDatasets()` (~line 463) with the same `multi_match` structure.

- [ ] **Step 3: Verify build**

Run: `npm run build -w be`

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/rag/services/rag-search.service.ts
git commit -m "feat(search): multi-field boosted search matching RAGFlow field weights"
```

---

### Task 6: Fix Threshold Bug

**Files:**
- Modify: `be/src/modules/rag/services/rag-search.service.ts:401`

- [ ] **Step 1: Fix the threshold filter**

Current code (buggy — `threshold=0` becomes `0.2`):
```typescript
result.chunks = result.chunks.filter((chunk) => (chunk.score ?? 0) >= (threshold || 0.2))
```

Fix:
```typescript
// Default to 0.2 only when threshold was never set (undefined/null).
// Explicit threshold=0 must be respected (e.g., when doc_ids are provided).
const effectiveThreshold = threshold > 0 ? threshold : (req.similarity_threshold != null ? 0 : 0.2)
result.chunks = result.chunks.filter((chunk) => (chunk.score ?? 0) >= effectiveThreshold)
```

- [ ] **Step 2: Verify build**

Run: `npm run build -w be`

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/rag/services/rag-search.service.ts
git commit -m "fix(search): respect explicit threshold=0 instead of defaulting to 0.2"
```

---

### Task 7: Add Zero-Result Fallback

**Files:**
- Modify: `be/src/modules/rag/services/rag-search.service.ts:371-404`

- [ ] **Step 1: Add fallback retry logic after initial search**

After the `switch` block and before the threshold filter, add:

```typescript
// Zero-result fallback: retry with relaxed minimum_should_match (RAGFlow behavior).
// RAGFlow retries with min_match=0.1 and similarity=0.17 when initial search returns 0.
if (result.chunks.length === 0 && req.query && !req.doc_ids?.length) {
    log.debug('Zero results from initial search, retrying with relaxed min_match=10%')
    const relaxedExtra = [...this.buildMetadataFilters(req.metadata_filter)]
    switch (method) {
        case 'full_text':
            result = await this.fullTextSearch(tenantId, datasetId, req.query, topK, relaxedExtra, abacFilters, '10%')
            break
        case 'semantic':
            // Semantic search doesn't use min_match — no fallback needed
            break
        case 'hybrid':
        default:
            result = await this.hybridSearch(tenantId, datasetId, req.query, queryVector ?? null, topK, 0.17, vectorWeight, relaxedExtra, abacFilters, '10%')
            break
    }
}
```

- [ ] **Step 2: Add `minMatch` parameter to fullTextSearch and hybridSearch**

Add an optional `minMatch: string = '30%'` parameter to `fullTextSearch()` signature and use it in the `multi_match.minimum_should_match` value. Similarly pass it through `hybridSearch()`.

```typescript
async fullTextSearch(
    tenantId: string,
    datasetId: string,
    query: string,
    topK: number,
    extraFilters: Record<string, unknown>[] = [],
    abacFilters: Record<string, unknown>[] = [],
    minMatch: string = '30%',
): Promise<{ chunks: ChunkResult[]; total: number }> {
    // ... in the multi_match:
    minimum_should_match: minMatch,
```

Do the same for `hybridSearch` — accept `minMatch` and pass it to `fullTextSearch`.

- [ ] **Step 3: Verify build**

Run: `npm run build -w be`

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/rag/services/rag-search.service.ts
git commit -m "feat(search): add zero-result fallback with relaxed min_match=10%"
```

---

### Task 8: Rewrite hybridSearch to Use OpenSearch Hybrid Query (Optional Upgrade)

> **Note:** This task is optional. It requires OpenSearch 2.10+ (we have 3.5.0). If the hybrid query plugin is not available in the custom image, skip this task — the current two-query approach still works.

**Files:**
- Modify: `be/src/modules/rag/services/rag-search.service.ts:278-333`

- [ ] **Step 1: Create search pipeline on first use**

Add a method to ensure the hybrid search pipeline exists:

```typescript
private hybridPipelineCreated = false

/**
 * @description Ensure the hybrid search pipeline exists in OpenSearch.
 * Creates a normalization-processor pipeline that fuses BM25 and KNN scores
 * using min-max normalization and arithmetic mean combination.
 */
private async ensureHybridPipeline(vectorWeight: number): Promise<string> {
    const textWeight = Math.round((1 - vectorWeight) * 100) / 100
    const vWeight = Math.round(vectorWeight * 100) / 100
    const pipelineName = `hybrid-search`

    if (this.hybridPipelineCreated) return pipelineName

    const client = getClient()
    try {
        await client.transport.request({
            method: 'PUT',
            path: `/_search/pipeline/${pipelineName}`,
            body: {
                phase_results_processors: [{
                    'normalization-processor': {
                        normalization: { technique: 'min_max' },
                        combination: {
                            technique: 'arithmetic_mean',
                            parameters: { weights: [textWeight, vWeight] },
                        },
                    },
                }],
            },
        })
        this.hybridPipelineCreated = true
    } catch (err: any) {
        // Pipeline may already exist — that's OK
        if (!String(err).includes('already exists')) {
            log.warn('Failed to create hybrid search pipeline, falling back to two-query', { error: String(err) })
        }
        this.hybridPipelineCreated = true
    }
    return pipelineName
}
```

- [ ] **Step 2: Rewrite hybridSearch to use single OpenSearch hybrid query**

```typescript
async hybridSearch(
    tenantId: string,
    datasetId: string,
    query: string,
    queryVector: number[] | null,
    topK: number,
    threshold: number,
    vectorWeight: number = 0.5,
    extraFilters: Record<string, unknown>[] = [],
    abacFilters: Record<string, unknown>[] = [],
    minMatch: string = '30%',
): Promise<{ chunks: ChunkResult[]; total: number }> {
    // Fall back to text-only when no vector available
    if (!queryVector || queryVector.length === 0) {
        return this.fullTextSearch(tenantId, datasetId, query, topK, extraFilters, abacFilters, minMatch)
    }

    const client = getClient()
    const pipelineName = await this.ensureHybridPipeline(vectorWeight)

    const filters = [
        { bool: { must_not: [{ range: { available_int: { lt: 1 } } }] } },
        ...this.getFilters(abacFilters),
        ...extraFilters,
    ]

    try {
        const res = await client.transport.request({
            method: 'POST',
            path: `/${getIndexName(tenantId)}/_search?search_pipeline=${pipelineName}`,
            body: {
                query: {
                    hybrid: {
                        queries: [
                            // Sub-query 1: BM25 text search
                            {
                                bool: {
                                    must: [
                                        { term: { kb_id: datasetId } },
                                        {
                                            multi_match: {
                                                query,
                                                fields: [
                                                    'content_ltks^2', 'content_sm_ltks',
                                                    'content_with_weight.cjk^2', 'content_with_weight.smartcn^2',
                                                    'title_tks^10', 'title_sm_tks^5',
                                                    'important_kwd^30', 'important_tks^20', 'question_tks^20',
                                                ],
                                                type: 'best_fields',
                                                minimum_should_match: minMatch,
                                            },
                                        },
                                    ],
                                    filter: filters,
                                    should: [
                                        { rank_feature: { field: 'pagerank_fea', linear: {} } },
                                    ],
                                },
                            },
                            // Sub-query 2: KNN vector search
                            {
                                knn: {
                                    q_vec: {
                                        vector: queryVector,
                                        k: topK,
                                        filter: {
                                            bool: {
                                                must: [{ term: { kb_id: datasetId } }],
                                                filter: filters,
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
                size: topK,
                _source: ['content_with_weight', 'doc_id', 'docnm_kwd', 'page_num_int', 'position_int', 'img_id', 'available_int', 'important_kwd', 'question_kwd'],
                highlight: {
                    fields: {
                        content_ltks: { pre_tags: ['<mark>'], post_tags: ['</mark>'], fragment_size: 300, number_of_fragments: 1 },
                        'content_with_weight.cjk': { pre_tags: ['<mark>'], post_tags: ['</mark>'], fragment_size: 300, number_of_fragments: 1 },
                    },
                },
            },
        })

        const body = res.body
        const hitsTotal = body.hits?.total
        const total = typeof hitsTotal === 'number' ? hitsTotal : hitsTotal?.value ?? 0
        const chunks = this.mapHits(body.hits?.hits || [], 'hybrid')

        return { chunks, total }
    } catch (err: any) {
        // If hybrid query is not supported, fall back to two-query approach
        if (String(err).includes('hybrid') || String(err).includes('search_pipeline')) {
            log.warn('OpenSearch hybrid query not available, falling back to two-query approach', { error: String(err) })
            return this.hybridSearchFallback(tenantId, datasetId, query, queryVector, topK, threshold, vectorWeight, extraFilters, abacFilters, minMatch)
        }
        if (String(err).includes('index_not_found_exception')) return { chunks: [], total: 0 }
        throw err
    }
}
```

- [ ] **Step 3: Rename current hybridSearch to hybridSearchFallback**

Keep the existing two-query implementation as `hybridSearchFallback` so it's used when the OpenSearch hybrid query plugin is unavailable.

- [ ] **Step 4: Verify build**

Run: `npm run build -w be`

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/rag/services/rag-search.service.ts
git commit -m "feat(search): use OpenSearch hybrid query with normalization pipeline"
```

---

### Task 9: Update Tests

**Files:**
- Modify: `be/tests/rag/rag-search.service.test.ts`
- Modify: `be/tests/rag/cross-dataset-search.test.ts`

- [ ] **Step 1: Update fullTextSearch test assertions**

Tests that check for `{ match: { content_ltks: ... } }` must be updated to expect `{ multi_match: { fields: [...], ... } }`.

- [ ] **Step 2: Update cross-dataset search test assertions**

Same — update expected query structure.

- [ ] **Step 3: Run tests**

Run: `cd /mnt/d/Project/b-solution/b-knowledge/be && npx vitest run tests/rag/`

- [ ] **Step 4: Commit**

```bash
git add be/tests/rag/
git commit -m "test(search): update assertions for multi-field and hybrid query changes"
```

---

## Chunk 3: Verification

### Task 10: Full Build + Test Verification

- [ ] **Step 1: Build backend**

Run: `npm run build -w be`
Expected: No errors

- [ ] **Step 2: Run all backend tests**

Run: `cd /mnt/d/Project/b-solution/b-knowledge/be && npx vitest run`
Expected: No new failures (pre-existing failures in deleteChunksByDocId are OK)

- [ ] **Step 3: Build Docker OpenSearch image**

Run: `cd docker && docker compose -f docker-compose-base.yml build opensearch`
Expected: Image builds with smartcn + ik plugins

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(retrieval): RAGFlow-quality retrieval via OpenSearch CJK plugins and hybrid query

- Custom OpenSearch image with analysis-smartcn and analysis-ik plugins
- CJK sub-fields on content_with_weight (ik_max_word + smartcn analyzers)
- Multi-field boosted search: title x10, keywords x30, questions x20, content x2
- OpenSearch hybrid query with min-max normalization pipeline
- Zero-result fallback with relaxed min_match=10%
- Fixed threshold bug: explicit threshold=0 no longer ignored
- Migration script for existing indices"
```

---

## Gap Coverage Matrix

| Gap | Fix | Task |
|-----|-----|------|
| P0: No multi-field text search | `multi_match` with 9 fields + RAGFlow boosts | Task 5 |
| P0: No query tokenization (CJK) | OpenSearch `analysis-smartcn` + `analysis-ik` plugins + `.cjk` sub-field | Tasks 1-3 |
| P0: No rule-based reranking | Partially: multi-field boosts approximate field-level reranking. Model reranking already exists. | Task 5 |
| P1: No zero-result fallback | Retry with `min_match=10%` | Task 7 |
| P1: No proper score normalization | OpenSearch `hybrid` query + `normalization-processor` (min-max) | Task 8 |
| P1: Threshold bug | Fix `(threshold \|\| 0.2)` | Task 6 |
| P2: No synonym expansion | `synonym_graph` filter in `ik_search` analyzer | Task 3 |
| P2: No phrase boosting | `best_fields` multi_match with field boosts approximates | Task 5 |
| P2: No tag feature scoring | Future: add `rank_feature` queries for `tag_feas` | Not in this plan |
| P2: No TOC/parent chunk enhancement | Future | Not in this plan |
