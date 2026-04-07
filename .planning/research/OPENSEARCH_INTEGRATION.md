# OpenSearch Filter Integration

**Researched:** 2026-04-07
**Sources:** `be/src/shared/services/ability.service.ts:294-395`, `advance-rag/rag/nlp/search.py`, `be/src/shared/db/migrations/20260312000000_initial_schema.ts`
**Confidence:** HIGH for existing behavior; MEDIUM for proposed schema changes (depends on indexing pipeline owner)

## Current state

### `buildOpenSearchAbacFilters` (`ability.service.ts:294`)
Translates `AbacPolicyRule[]` into OpenSearch bool filters:
- Only processes rules where `subject === 'Document'` AND action is `'read'` or `'manage'` (line 303)
- Allow rules → `bool.should[]` with `minimum_should_match: 1` (line 322)
- Deny rules → `bool.must_not[]` (line 333)
- Calls `translateConditions()` (line 351) which handles:
  - Simple equality → `{ term: { key: value } }`
  - `$in` operator → `{ terms: { key: [...] } }`
  - `$nin` operator → `{ bool: { must_not: [{ terms: ... }] } }`

### `buildAccessFilters` (`ability.service.ts:386`)
Combines:
1. **Mandatory tenant isolation**: `{ term: { tenant_id: tenantId } }` (line 392) — never omitted
2. **Optional ABAC filters** (spread)

### Current chunk schema in OpenSearch
From `advance-rag/rag/nlp/search.py` (lines 92, 478, 615, 650, 691):
- `kb_id` — but this is the **dataset id** (Peewee `dataset.id`), not the BE knowledge_base.id
- `tenant_id`
- `doc_id`, `docnm_kwd`, `content_ltks`, `img_id`, `title_tks`, `important_kwd`, `position_int`, `tag_kwd`
- **NO `category_id` field**
- **NO `knowledge_base_id` field** (the BE concept)

The `kb_ids` filter parameter throughout `search.py` (`kb_ids: list[str]`) is a **list of dataset ids**, used for filtering at query time. This is the existing escape hatch for resource-scoped queries.

## Two viable extension strategies

### Strategy A: Translate category grants → dataset_id list at query time (NO indexing changes)

**How it works:**
1. When building filters, the BE looks up: "what `DocumentCategoryVersion.ragflow_dataset_id` rows is this user allowed to read?"
2. Resolves to a `string[]` of dataset IDs.
3. Adds `{ terms: { kb_id: [...] } }` to the bool.filter clause.

**Pros:**
- Zero changes to `advance-rag` indexing pipeline
- No reindex required
- Schema-stable

**Cons:**
- Query-time JOIN cost on every search (cacheable per session)
- Set can be large for users with many categories
- Doesn't support per-document grants in the next milestone without further work

**Verdict:** Best **first** implementation. This is what R11 should ship.

### Strategy B: Add `category_id` and `knowledge_base_id` to chunk index (full integration)

**How it works:**
1. `advance-rag` indexing pipeline starts writing `category_id` and `knowledge_base_id` onto every chunk during embedding/indexing.
2. BE backfills existing chunks via a one-time `reindex` migration.
3. `buildAccessFilters` adds `{ terms: { category_id: [...] } }` directly.

**Pros:**
- Single OS query — no PG JOIN
- Future-proof for per-document grants (just add `doc_id` filter)
- Cleaner audit story

**Cons:**
- Requires changes to `advance-rag/rag/nlp/search.py`, the indexing pipeline (which writes chunks), and likely `embedding_worker.py`
- Mass reindex required for existing data (potentially hours for large tenants)
- Cross-language constants risk: `CATEGORY_ID_FIELD = 'category_id'` must be mirrored in `be/src/shared/constants/embedding.ts` and `advance-rag/embed_constants.py`

**Verdict:** Right long-term answer, but should NOT block this milestone. Schedule for next milestone (per-document grants), where it pays for itself.

## Proposed extension to `buildOpenSearchAbacFilters` (Strategy A)

```ts
/**
 * @description Builds OpenSearch filters that respect resource_grants on KnowledgeBase + DocumentCategory.
 *   Translates category grants into a kb_id (dataset_id) terms filter.
 */
export async function buildResourceGrantFilters(
  user: AbilityUserContext,
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  // Look up all dataset_ids the user can read via KB grants + Category grants
  // Hot path — should be cached per session in Redis
  const grantedDatasetIds = await ModelFactory.resourceGrant.findReadableDatasetIds({
    userId: user.id,
    tenantId,
    teamIds: user.team_ids,
    role: user.role,
  })

  // If user has no grants, return a filter that matches nothing (defensive)
  if (grantedDatasetIds.length === 0) {
    return [{ bool: { must_not: [{ match_all: {} }] } }]
  }

  return [{ terms: { kb_id: grantedDatasetIds } }]
}
```

The function `findReadableDatasetIds` would internally:
1. Query `resource_grants` for `(grantee_type='user', grantee_id=userId)` UNION teams UNION role
2. For `resource_type='KnowledgeBase'` → JOIN `knowledge_base_datasets` to expand to dataset_ids
3. For `resource_type='DocumentCategory'` → JOIN `document_category_versions.ragflow_dataset_id` to expand to dataset_ids
4. UNION the results

## Caching strategy

Per-session cache key: `grants:datasets:<sessionId>` (mirrors `ability:<sessionId>` in `ability.service.ts:75`).

Invalidation:
- On grant create/update/delete → call `invalidateAbility(sessionId)` for **all sessions of all affected users** (R3, R12)
- On role change → existing per-session invalidation already covers this
- Platform-wide policy change → existing `invalidateAllAbilities()` (`ability.service.ts:249`)

## Defensive backstop

The `tenant_id` term filter at `ability.service.ts:392` MUST remain unconditional. The new resource-grant filter is **additional**, not a replacement. Tenant isolation has zero failure modes today and that property must survive the migration.

## Open question for `advance-rag` indexing

If/when we move to Strategy B, the writes happen at:
- `advance-rag/embedding_worker.py` (embedding generation path)
- `advance-rag/rag/nlp/` chunking + indexing path
- Probably also `connector_sync_worker.py` and `web_crawl_worker.py`

But the BE owns the source-of-truth for `(dataset → category → KB)` mapping. Today the worker has no knowledge of the BE-side `document_categories` table. Either:
- The BE injects `category_id` into the task payload when queueing (cleanest)
- The worker JOINs PG itself (couples Peewee to a Knex-owned table — fragile)

The first option is preferred and aligns with the project rule that all schema changes flow through Knex.
