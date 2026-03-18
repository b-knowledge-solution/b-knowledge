# Phase 3: Document Management - Research

**Researched:** 2026-03-18
**Domain:** Document versioning, metadata tagging, version-aware search, chunk detail viewer
**Confidence:** HIGH

## Summary

Phase 3 implements document lifecycle management on top of the existing B-Knowledge RAG platform. The key architectural decision is that **each document version creates a new dataset** with auto-incrementing `pagerank`, which means the existing dataset CRUD, parsing pipeline, ABAC policies, and OpenSearch indexing all work out of the box for each version. This is an elegant approach that minimizes new code paths.

The three main workstreams are: (1) version history with dataset-per-version model and pagerank-based recency boosting, (2) metadata and tagging with free-form key-value pairs plus auto-extraction via the existing Python LLM pipeline, and (3) chunk detail viewer with three container patterns (page, drawer, dialog) sharing a common document preview component. The existing codebase already has significant infrastructure in place: DocumentVersion/DocumentVersionFile models, VersionUploadArea component, MetadataManageDialog, DocumentPreviewer with ChunkList, and the full auto-extraction pipeline in task_executor.py.

**Primary recommendation:** Leverage the dataset-per-version model to reuse all existing dataset infrastructure. Focus implementation effort on: (a) wiring version creation to dataset cloning, (b) adding `rank_feature` boost for `pagerank_fea` in Node.js search queries, (c) extending parser settings UI with auto-extraction toggles and metadata schema builder, and (d) building the chunk detail page route with shared DocumentPreviewer.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Version History Model**: Each document version creates a new dataset with auto-incrementing `page_rank` (v1 = page_rank 1, v2 = page_rank 2, etc.)
- **Keep-all indexed** -- all version chunks stay in OpenSearch. page_rank-based scoring boosts newer versions to rank higher
- **Optional change summary** on version upload -- if blank, system uses "Version N uploaded by [user]"
- **Auto-inherit everything** -- new version dataset copies ABAC policies, parser settings, embedding model, chunk config from parent
- **Document metadata config** -- defined on parent document, auto-applied to each new version dataset's parser settings
- **Flat list with version badge** -- all version datasets appear in dataset list with v1, v2, v3 badges. No grouping or collapsing
- **Version metadata visible in both list and detail** -- author, timestamp, change summary shown in dataset card/row AND dataset overview
- **Delete individual versions** -- user can delete any version dataset independently. If all deleted, parent document cleaned up
- **No file format constraints** -- new version can be different format than original
- **Multi-file upload** -- supported per version
- **Upload Versioning Flow**: Trigger from document row action menu, immediately visible with status, two parsing modes (auto/manual), cron parsing scheduler
- **Version-Aware Search**: Dataset selection handles scope, page_rank field boost via OpenSearch `function_score` with `field_value_factor`, page_rank stored in both DB and OpenSearch
- **Metadata and Tagging**: Free-form key-value pairs as JSONB, two levels (document template + per-dataset), all three RAGFlow auto-extraction features, visual schema builder, per-dataset schema, tags searchable as filters, bulk edit via select + dialog, off by default
- **Parser Settings UI**: Toggle + count fields inline in ParserSettingsFields
- **Auto-Extraction Display**: Keywords and questions shown per chunk in chunk detail viewer
- **Chunk Detail Viewer**: Three patterns (dataset split page, chat drawer, search dialog), navigation from DocumentTable click, full CRUD on chunks, shared document preview component
- **Search Filter UI**: Inline filter chips below search bar, dynamic discovery via OpenSearch aggregations

### Claude's Discretion
- Database schema design for version-dataset relationships and page_rank storage
- OpenSearch function_score query construction details
- Cron job implementation (node-cron or system cron)
- LLM cache key strategy for auto-extraction
- Chunk detail page layout responsive breakpoints
- Document preview rendering (PDF.js, image preview, etc.)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCM-01 | Document version history -- upload new version, keep all previous versions stored | Dataset-per-version model with auto-incrementing pagerank; existing dataset CRUD reused; DocumentVersion model extended with parent_dataset_id and version_number |
| DOCM-02 | Search across document versions -- query current or historical versions | OpenSearch `rank_feature` query on `pagerank_fea` field already in mapping; Node.js RagSearchService needs `rank_feature` boost added to queries; dataset selection UI scopes versions |
| DOCM-03 | Version metadata -- track author, timestamp, and change summary per version | Additional columns on datasets table: `parent_dataset_id`, `version_number`, `change_summary`, `version_created_by`; visible in DatasetCard and DatasetDetailPage |
| DOCM-04 | Document metadata and tagging -- custom attributes on documents for filtering and ABAC | Free-form JSONB key-value pairs on dataset record; `parser_config.metadata` schema for auto-extraction; MetadataManageDialog extended for single and bulk operations |
| DOCM-05 | Auto-metadata extraction during document parsing | Python task_executor.py already implements auto_keywords, auto_questions, enable_metadata with LLM caching; just need parser_config UI toggles and metadata schema builder in FE |
| DOCM-06 | Bulk metadata and tag operations across multiple documents | Extend DocumentTable checkboxes with "Edit Tags" bulk action; MetadataManageDialog receives array of datasetIds; backend bulk update endpoint |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-cron | 4.2.1 | Cron scheduling for parsing scheduler | Already used for temp file cleanup; lightweight, no external deps |
| @opensearch-project/opensearch | 3.5.1 | OpenSearch client (rank_feature queries) | Already used in rag-search.service.ts |
| Knex | (project version) | DB migrations + dataset model queries | Project standard ORM |
| React 19 + TanStack Query 5 | (project versions) | FE state management for version/metadata CRUD | Project standard |
| shadcn/ui | (project version) | UI components for dialogs, badges, chips | Project standard |

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pdfjs-dist | (already in FE) | PDF preview in chunk detail viewer | Already used by PdfPreview component |
| mammoth | (already in FE) | DOCX preview | Already used by DocPreviewer |
| Peewee ORM | (Python, advance-rag) | Python worker DB access for metadata persistence | Already used by DocMetadataService |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-cron | cron (system) | node-cron is already in-process, no OS dependency; system cron adds deployment complexity |
| rank_feature query | function_score with field_value_factor | rank_feature is OpenSearch-native and already used in Python worker; function_score works but rank_feature is simpler for this use case |

**No new packages needed.** All infrastructure is already in the project.

## Architecture Patterns

### Database Schema Extensions (Knex Migration)

The core model is: **each version IS a dataset**. We extend the `datasets` table rather than creating separate version tables.

```sql
-- Add version tracking columns to datasets table
ALTER TABLE datasets ADD COLUMN parent_dataset_id UUID REFERENCES datasets(id) ON DELETE SET NULL;
ALTER TABLE datasets ADD COLUMN version_number INTEGER DEFAULT NULL;
ALTER TABLE datasets ADD COLUMN change_summary TEXT;
ALTER TABLE datasets ADD COLUMN version_created_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Add document-level metadata config (template for versions)
ALTER TABLE datasets ADD COLUMN metadata_config JSONB DEFAULT '{}';

-- Index for efficient version listing
CREATE INDEX idx_datasets_parent_id ON datasets(parent_dataset_id) WHERE parent_dataset_id IS NOT NULL;
CREATE INDEX idx_datasets_version ON datasets(parent_dataset_id, version_number);
```

**Key insight:** The existing `pagerank` column on `datasets` table already exists and maps to `pagerank_fea` in OpenSearch (via `PAGERANK_FLD` constant in Python). Setting `pagerank = version_number` on dataset creation automatically propagates to all chunks during indexing via `task_executor.py` line 451-452.

### Version-Dataset Relationship
```
datasets (parent)
  ├── id: "doc-abc"
  ├── parent_dataset_id: NULL (this IS the parent)
  ├── version_number: NULL (parent has no version)
  ├── metadata_config: {...} (template)
  │
  ├── datasets (v1)
  │   ├── parent_dataset_id: "doc-abc"
  │   ├── version_number: 1
  │   ├── pagerank: 1
  │   └── parser_config: {inherited from parent}
  │
  └── datasets (v2)
      ├── parent_dataset_id: "doc-abc"
      ├── version_number: 2
      ├── pagerank: 2
      └── parser_config: {inherited from parent}
```

### OpenSearch rank_feature Query Pattern

The `pagerank_fea` field is already declared as `rank_feature` type in `advance-rag/conf/mapping.json`. The Python worker already writes it via `PAGERANK_FLD`. The Node.js RagSearchService needs to add a `rank_feature` query clause:

```typescript
// Add to search query's should clause
{
  rank_feature: {
    field: 'pagerank_fea',
    linear: {}  // linear boost (v2 scores 2x v1)
  }
}
```

This matches the Python worker's existing pattern in `es_conn.py` line 270:
```python
bool_query.should.append(Q("rank_feature", field=fld, linear={}, boost=sc))
```

**Critical:** The `rank_feature` query type MUST be in a `should` clause, not a `must` or `filter`. It provides a scoring boost, not a filter. OpenSearch does not allow `rank_feature` in `filter` context.

### Parser Config Schema for Auto-Extraction

The Python task_executor checks three keys in `parser_config`:
1. `auto_keywords` (integer, 0 = off, N = extract N keywords per chunk)
2. `auto_questions` (integer, 0 = off, N = generate N questions per chunk)
3. `enable_metadata` (boolean) + `metadata` (array of field definitions)

These are already read from the `knowledgebase.parser_config` JSONB field. The FE ParserSettingsFields already has sliders for `auto_keywords` and `auto_questions`. What's needed:
- Add `enable_metadata` toggle to ParserSettingsFields
- Add visual metadata schema builder (list of `{key, description, enum}` objects)
- Wire the metadata schema into `parser_config.metadata`

### Metadata Schema Format (RAGFlow Compatible)

The Python `turn2jsonschema()` function in `metadata_utils.py` expects:
```json
[
  {"key": "department", "description": "Which department", "enum": ["engineering", "clinical"]},
  {"key": "sdlc_phase", "description": "SDLC phase", "enum": ["design", "development", "testing"]}
]
```

This gets converted to JSON Schema for the LLM extraction prompt. The same format should be used in `parser_config.metadata`.

### Chunk Detail Page Route

```
Route: /data-studio/datasets/:id/documents/:docId/chunks
Layout: Split view - DocumentPreviewer (left) + ChunkList (right)
```

The DocumentPreviewer already implements this split layout. The chunk detail page wraps it as a full-page route instead of a dialog/drawer.

### Three Viewer Patterns

| Pattern | Container | Trigger | Route/Component |
|---------|-----------|---------|-----------------|
| Dataset page | Full page split view | Click document name in DocumentTable | `/datasets/:id/documents/:docId/chunks` |
| Chat drawer | Drawer (right side) | Click citation tooltip in chat | `<Drawer>` wrapping DocumentPreviewer |
| Search dialog | Dialog (modal) | Click search result | `<Dialog>` wrapping DocumentPreviewer |

All three share the same `DocumentPreviewer` component -- only the container differs.

### Cron Parsing Scheduler

Use the existing `CronService` pattern:

```typescript
// Extend CronService with parsing scheduler
public startParsingScheduler(schedule: string) {
  cron.schedule(schedule, async () => {
    // Find queued documents with run='0' status
    // Trigger parsing for each via task queue
  })
}
```

Schedule stored in `system_configs` table (key: `parsing_scheduler_cron`), configurable in System Settings admin page. The `SystemConfigModel` already provides get/set by key.

### Search Filter Chips (Metadata)

Use OpenSearch aggregation query to discover available tag keys and values:

```typescript
// Aggregation for unique metadata keys and top values
{
  aggs: {
    metadata_keys: {
      terms: { field: 'tag_kwd', size: 50 }
    }
  }
}
```

FE renders as inline filter chips below search bar, clicking opens value dropdown. Active filters become `term` queries in search.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom timer/setInterval | node-cron (already installed) | Handles timezone, cron expression parsing, edge cases |
| PDF rendering | Custom PDF parser | pdfjs-dist (already in FE) | PDF rendering is extremely complex; already works in PdfPreview |
| Metadata schema validation | Custom validator | JSON Schema (turn2jsonschema from Python) | RAGFlow already has this; maintain compatibility |
| Version scoring | Custom ranking algorithm | OpenSearch rank_feature | Built-in, optimized, already in index mapping |
| LLM extraction caching | Custom cache layer | Existing get/set_llm_cache in Python worker | Already implemented with content hash + params as key |

**Key insight:** The Python worker already implements all three auto-extraction features (keywords, questions, metadata) with LLM caching. Do NOT reimplement in Node.js. Just ensure parser_config is correctly passed through.

## Common Pitfalls

### Pitfall 1: pagerank_fea Must Be Positive
**What goes wrong:** OpenSearch `rank_feature` fields must be positive (> 0). Setting pagerank to 0 causes indexing to silently skip the field.
**Why it happens:** The Python worker only writes `pagerank_fea` when `task["pagerank"]` is truthy (line 451: `if task["pagerank"]:`).
**How to avoid:** Start version_number at 1 (not 0). Parent datasets with version_number=NULL or 0 won't get pagerank boost, which is correct behavior.
**Warning signs:** Search results not boosting newer versions -- check if `pagerank_fea` field exists in indexed chunks.

### Pitfall 2: rank_feature Query Context
**What goes wrong:** Putting `rank_feature` query in a `filter` or `must` context causes OpenSearch to reject the query.
**Why it happens:** `rank_feature` is a scoring-only query type -- it modifies scores but cannot filter.
**How to avoid:** Always place `rank_feature` in a `should` clause within a `bool` query. The Python worker does this correctly (es_conn.py line 270).
**Warning signs:** OpenSearch query parse errors mentioning "rank_feature".

### Pitfall 3: Dataset Name Uniqueness Constraint
**What goes wrong:** Creating version datasets with auto-generated names hits the unique constraint on `datasets.name`.
**Why it happens:** The migration has `CREATE UNIQUE INDEX datasets_name_active_unique ON datasets (LOWER(name)) WHERE status <> 'deleted'`.
**How to avoid:** Version dataset names must be unique. Pattern: `"{parent_name} (v{N})"` or include a version suffix.
**Warning signs:** Unique constraint violation errors on dataset creation.

### Pitfall 4: Metadata Schema Propagation Timing
**What goes wrong:** Changing metadata_config on parent doesn't affect already-created version datasets.
**Why it happens:** Version datasets copy parser_config at creation time; they don't have a live reference to parent.
**How to avoid:** Document this as expected behavior. Optionally provide a "Sync to versions" action that bulk-updates version datasets' parser_config.metadata.
**Warning signs:** User confusion when metadata extraction differs between versions.

### Pitfall 5: Bulk Metadata Update Performance
**What goes wrong:** Updating metadata for many datasets in a loop causes N database queries.
**Why it happens:** Naive implementation updates one-by-one.
**How to avoid:** Use Knex batch update with `whereIn` for bulk operations. For OpenSearch, use `_bulk` API or `update_by_query`.
**Warning signs:** Slow bulk tag operations (> 5 seconds for 50+ datasets).

### Pitfall 6: OpenSearch kb_id Format
**What goes wrong:** UUID mismatch between PostgreSQL (with hyphens) and OpenSearch (without hyphens).
**Why it happens:** The existing code strips hyphens: `datasetId.replace(/-/g, '')`. New version datasets must follow this pattern.
**How to avoid:** Always strip hyphens when building OpenSearch queries. The RagSearchService already does this consistently.
**Warning signs:** Zero search results for a dataset that has indexed chunks.

## Code Examples

### Version Dataset Creation (Backend Service)

```typescript
// Source: Derived from existing dataset CRUD + CONTEXT.md decisions
async createVersionDataset(
  parentDatasetId: string,
  files: Express.Multer.File[],
  changeSummary: string | null,
  userId: string,
  tenantId: string,
  trx: Knex.Transaction
): Promise<Dataset> {
  // Fetch parent dataset to inherit settings
  const parent = await this.knex('datasets').where('id', parentDatasetId).first()

  // Determine next version number
  const maxVersion = await this.knex('datasets')
    .where('parent_dataset_id', parentDatasetId)
    .max('version_number as max')
    .first()
  const versionNumber = (maxVersion?.max ?? 0) + 1

  // Create new dataset inheriting parent settings
  const [versionDataset] = await this.knex('datasets')
    .insert({
      name: `${parent.name} (v${versionNumber})`,
      parent_dataset_id: parentDatasetId,
      version_number: versionNumber,
      pagerank: versionNumber,  // pagerank = version_number for recency boost
      change_summary: changeSummary || `Version ${versionNumber} uploaded by user`,
      version_created_by: userId,
      // Inherit from parent
      language: parent.language,
      embedding_model: parent.embedding_model,
      parser_id: parent.parser_id,
      parser_config: parent.parser_config,
      access_control: parent.access_control,
      policy_rules: parent.policy_rules,
      tenant_id: tenantId,
      created_by: userId,
    })
    .transacting(trx)
    .returning('*')

  return versionDataset
}
```

### rank_feature Search Query (RagSearchService Extension)

```typescript
// Source: OpenSearch rank_feature docs + existing Python pattern in es_conn.py:270
// Add to existing fullTextSearch/semanticSearch/hybridSearch methods
const query = {
  bool: {
    must: [
      { term: { kb_id: datasetId.replace(/-/g, '') } },
      { match: { content_with_weight: { query, minimum_should_match: '30%' } } },
    ],
    filter: [
      { term: { available_int: 1 } },
      ...this.getFilters(tenantId, abacFilters),
    ],
    should: [
      // Boost by pagerank (version recency)
      { rank_feature: { field: 'pagerank_fea', linear: {} } },
    ],
  },
}
```

### Metadata Schema Builder (FE Component Pattern)

```typescript
// Source: RAGFlow metadata_utils.py format + existing MetadataManageDialog pattern
interface MetadataSchemaField {
  key: string
  description: string
  enum?: string[]
}

// Stored in parser_config.metadata as array
// Python worker reads: task["parser_config"].get("metadata")
// Converted by turn2jsonschema() before LLM prompt
```

### Cron Scheduler Configuration

```typescript
// Source: Existing CronService + SystemConfigModel patterns
// Store schedule in system_configs table
const schedule = await systemConfigModel.findById('parsing_scheduler_cron')
// Default: "0 22 * * 1-5" (10 PM weekdays)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate version table | Version-as-dataset | Phase 3 design decision | Reuses all existing dataset infrastructure |
| is_current flag on chunks | pagerank boost scoring | Phase 3 design decision | All versions remain searchable; newer versions rank higher naturally |
| Custom metadata extraction | RAGFlow LLM extraction with caching | Already in codebase | No new Python code needed; just wire parser_config |

**Existing infrastructure to leverage:**
- `pagerank` column already on `datasets` table and `knowledgebase` Peewee model
- `pagerank_fea` field already in OpenSearch mapping as `rank_feature` type
- Python task_executor already writes `pagerank_fea` from `task["pagerank"]`
- Python task_executor already implements all three auto-extraction features
- `get_llm_cache`/`set_llm_cache` already handles extraction caching
- `DocumentPreviewer` already implements split view with chunk list
- `MetadataManageDialog` already handles field CRUD with types
- `VersionUploadArea` already handles drag-drop file upload
- `CronService` already uses node-cron with proper scheduling
- `SystemConfigModel` provides key-value config storage

## Open Questions

1. **Parent dataset behavior when all versions deleted**
   - What we know: User decided "if all deleted, parent document cleaned up"
   - What's unclear: Should parent dataset be hard-deleted or soft-deleted (status='deleted')?
   - Recommendation: Soft-delete (set status='deleted') to preserve referential integrity and allow potential recovery

2. **Version badge display in dataset list**
   - What we know: "Flat list with version badge" -- v1, v2, v3 badges
   - What's unclear: How to visually distinguish parent datasets from version datasets in the list
   - Recommendation: Version datasets show "v{N}" badge; parent datasets show no badge (they're metadata-only containers, not directly searchable)

3. **Cron schedule UI in System Settings**
   - What we know: Admin configures in System Settings page
   - What's unclear: Whether System Settings page already exists or needs creation
   - Recommendation: Check for existing settings page; if none, create minimal one with cron schedule field + enable/disable toggle

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (BE + FE) |
| Config file | `be/vitest.config.ts`, `fe/vitest.config.ts` |
| Quick run command | `npm run test -w be -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCM-01 | Create version dataset with inherited settings + pagerank | unit | `npm run test -w be -- --run tests/rag/version-dataset.service.test.ts` | No -- Wave 0 |
| DOCM-02 | rank_feature boost in search queries | unit | `npm run test -w be -- --run tests/rag/rag-search-version.test.ts` | No -- Wave 0 |
| DOCM-03 | Version metadata stored and returned | unit | `npm run test -w be -- --run tests/rag/version-dataset.service.test.ts` | No -- Wave 0 |
| DOCM-04 | Metadata CRUD on datasets | unit | `npm run test -w be -- --run tests/rag/metadata.service.test.ts` | No -- Wave 0 |
| DOCM-05 | Parser config with auto-extraction flags | unit | `npm run test -w be -- --run tests/rag/parser-config.test.ts` | No -- Wave 0 |
| DOCM-06 | Bulk metadata update | unit | `npm run test -w be -- --run tests/rag/bulk-metadata.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- --run`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `be/tests/rag/version-dataset.service.test.ts` -- covers DOCM-01, DOCM-03
- [ ] `be/tests/rag/rag-search-version.test.ts` -- covers DOCM-02
- [ ] `be/tests/rag/metadata.service.test.ts` -- covers DOCM-04
- [ ] `be/tests/rag/bulk-metadata.test.ts` -- covers DOCM-06
- [ ] No framework install needed -- Vitest already configured

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `advance-rag/conf/mapping.json` -- OpenSearch mapping with `pagerank_fea` as `rank_feature`
- Codebase analysis: `advance-rag/rag/svr/task_executor.py:451-452` -- pagerank writing to chunks
- Codebase analysis: `advance-rag/rag/svr/task_executor.py:496-604` -- auto_keywords, auto_questions, enable_metadata implementation
- Codebase analysis: `advance-rag/rag/utils/es_conn.py:265-270` -- rank_feature query pattern in Python
- Codebase analysis: `advance-rag/common/metadata_utils.py` -- turn2jsonschema, update_metadata_to helpers
- Codebase analysis: `be/src/modules/rag/services/rag-search.service.ts` -- current search implementation
- Codebase analysis: `be/src/shared/db/migrations/20260312000000_initial_schema.ts` -- datasets table with pagerank column
- Codebase analysis: `fe/src/components/DocumentPreviewer/DocumentPreviewer.tsx` -- split view component
- Codebase analysis: `fe/src/features/datasets/components/ParserSettingsFields.tsx` -- auto_keywords/auto_questions sliders already exist

### Secondary (MEDIUM confidence)
- OpenSearch `rank_feature` query behavior based on codebase patterns (Python worker uses it successfully)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, verified via package.json and codebase
- Architecture: HIGH -- dataset-per-version model verified against existing schema, pagerank flow traced end-to-end
- Pitfalls: HIGH -- derived from concrete codebase analysis (unique constraints, field format, query context)

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable; all infrastructure already in codebase)
