# Phase 3: Document Management - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Full document lifecycle management: version history (each version creates a new dataset with auto-incrementing page_rank), version-aware search via page_rank boost, custom metadata tagging with free-form key-value pairs, auto-extraction of keywords/questions/metadata during parsing, bulk metadata operations, and three document viewer patterns (dataset split view, chat drawer, search dialog). Includes cron-based parsing scheduler and chunk detail page migration from RAGFlow.

</domain>

<decisions>
## Implementation Decisions

### Version History Model
- **Each document version creates a new dataset** with auto-incrementing `page_rank` (v1 = page_rank 1, v2 = page_rank 2, etc.)
- **Keep-all indexed** — all version chunks stay in OpenSearch. page_rank-based scoring boosts newer versions to rank higher
- **Optional change summary** on version upload — if blank, system uses "Version N uploaded by [user]"
- **Auto-inherit everything** — new version dataset copies ABAC policies, parser settings, embedding model, chunk config from parent
- **Document metadata config** — defined on parent document, auto-applied to each new version dataset's parser settings
- **Flat list with version badge** — all version datasets appear in dataset list with v1, v2, v3 badges. No grouping or collapsing
- **Version metadata visible in both list and detail** — author, timestamp, change summary shown in dataset card/row AND dataset overview
- **Delete individual versions** — user can delete any version dataset independently. If all deleted, parent document cleaned up
- **No file format constraints** — new version can be different format than original
- **Multi-file upload** — supported per version

### Upload Versioning Flow
- **Trigger from document row action menu** — kebab menu in DocumentTable has "Upload New Version"
- **Immediately visible with status** — new version dataset appears in list with "Processing" badge during parse/chunk/index
- **Two parsing modes** — auto-parse (starts immediately) or manual trigger (user starts when ready)
- **Cron parsing scheduler** — admin configures in System Settings page. Global schedule for parsing queued documents outside office hours

### Version-Aware Search
- **Dataset selection handles scope** — user selects which datasets (versions) to include in chat/search. No special "version search" UI
- **page_rank field boost** — OpenSearch `function_score` with `field_value_factor` on page_rank. Multiplies with BM25+vector hybrid score
- **page_rank stored in both DB and OpenSearch** — on dataset record (PostgreSQL) and indexed on each chunk (OpenSearch) for query-time boost without DB lookup
- **File names already contain version** — no additional version badge on search results needed. Just ensure page_rank scoring puts latest on top

### Metadata and Tagging
- **Free-form key-value pairs** — users type any key and value. Stored as JSONB on document record
- **Two levels of metadata** — (1) document metadata config (template, propagates to each version dataset) and (2) per-dataset extracted/manual metadata
- **All three RAGFlow auto-extraction features enabled** — auto_keywords, auto_questions, and metadata schema extraction. All use LLM with caching, toggled via parser_config
- **Visual schema builder** in parser settings for metadata extraction — user adds fields with name + type (text, number, date, enum). Extends ParserSettingsFields.tsx
- **Per-dataset schema** — each dataset defines its own metadata schema (matches RAGFlow's parser_config.metadata)
- **Tags searchable as filters** — indexed in OpenSearch alongside chunks. Search UI gets inline filter chips
- **Bulk edit via select + dialog** — user selects multiple documents via checkboxes, clicks "Edit Tags", MetadataManageDialog extended for bulk ops
- **Off by default** — all three auto-extraction toggles off for new datasets. User opts in per dataset

### Parser Settings UI
- **Toggle + count fields** inline in ParserSettingsFields — auto_keywords toggle + count (default 5), auto_questions toggle + count (default 3), enable_metadata toggle + visual schema builder

### Auto-Extraction Display
- **Keywords and questions shown per chunk** in the chunk detail viewer. Users can see, edit, or delete extracted data

### Chunk Detail Viewer
- **Three document viewer patterns:**
  1. **Dataset page** — full page split view: document preview (left) + chunk list (right). Route: `/datasets/:id/documents/:docId/chunks`
  2. **Chat** — drawer showing document with highlight when clicking citation tooltip
  3. **Search** — dialog showing document with highlight
- **Navigation** — click document name in DocumentTable to navigate to chunk detail page
- **Full CRUD** on chunks — view, edit text, delete, add chunks inline. Existing ChunkEditInline.tsx and AddChunkModal.tsx wired into new page
- **Shared document preview component** — underlying rendering shared across all three patterns, only container differs

### Search Filter UI
- **Inline filter chips** below search bar — available tag keys as clickable chips, clicking opens value dropdown. Active filters shown as chips
- **Dynamic discovery** — query OpenSearch aggregations for unique tag keys and top values from accessible datasets. Respects ABAC

### Claude's Discretion
- Database schema design for version-dataset relationships and page_rank storage
- OpenSearch function_score query construction details
- Cron job implementation (node-cron or system cron)
- LLM cache key strategy for auto-extraction
- Chunk detail page layout responsive breakpoints
- Document preview rendering (PDF.js, image preview, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Version Infrastructure
- `be/src/modules/rag/models/document-version.model.ts` — Existing version model (39 lines, foundation to extend)
- `be/src/modules/rag/models/document-version-file.model.ts` — Existing version file model (66 lines)
- `fe/src/features/datasets/components/VersionUploadArea.tsx` — Existing upload UI (169 lines, trigger point)

### Existing Metadata Infrastructure
- `fe/src/features/datasets/components/MetadataManageDialog.tsx` — Existing metadata dialog (281 lines, extend for bulk ops)

### RAGFlow Auto-Extraction (Python Worker)
- `advance-rag/rag/svr/task_executor.py` §auto_keywords, §auto_questions, §enable_metadata — Three extraction features with LLM caching. Lines ~496-604 contain the implementation
- `advance-rag/common/metadata_utils.py` — turn2jsonschema(), update_metadata_to() helpers
- `advance-rag/db/services/doc_metadata_service.py` — DocMetadataService for metadata persistence

### Existing Chunk Viewer Components
- `fe/src/components/DocumentPreviewer/` — ChunkCard, ChunkList, DocumentPreviewer (shared base)
- `fe/src/features/datasets/components/ChunkEditInline.tsx` — Inline chunk editing
- `fe/src/features/datasets/components/AddChunkModal.tsx` — Add new chunk modal
- `fe/src/features/datasets/components/ChunkResultCard.tsx` — Chunk result card

### RAGFlow Chunk Viewer (Migration Source)
- `ragflow/web/src/pages/chunk/index.tsx` — Main chunk viewer page
- `ragflow/web/src/pages/chunk/parsed-result-panel.tsx` — Parsed document visualization
- `ragflow/web/src/pages/chunk/chunked-result-panel.tsx` — Chunk list with edit
- `ragflow/web/src/pages/chunk/chunk-card.tsx` — Individual chunk card
- `ragflow/web/src/pages/chunk/chunk-toolbar.tsx` — Chunk filtering/sorting toolbar

### Search Service (page_rank Integration)
- `be/src/modules/rag/services/rag-search.service.ts` — Hybrid search service where function_score with page_rank boost must be added
- `fe/src/features/datasets/components/DocumentTable.tsx` — Navigation trigger for chunk detail page

### Parser Settings
- `fe/src/features/datasets/components/ParserSettingsFields.tsx` — Parser config UI to extend with auto-extraction toggles

### Pending Todo
- `.planning/todos/pending/2026-03-18-migrate-chunk-detail-viewer-from-ragflow.md` — Chunk viewer migration todo with file references

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **document-version.model.ts** (39 lines) + **document-version-file.model.ts** (66 lines): Foundation for version management — extend with page_rank and dataset linking
- **VersionUploadArea.tsx** (169 lines): Existing upload UI — wire into version creation flow
- **MetadataManageDialog.tsx** (281 lines): Existing metadata dialog — extend for bulk operations
- **ChunkEditInline.tsx** + **AddChunkModal.tsx**: Chunk CRUD components — wire into new chunk detail page
- **DocumentPreviewer**: Shared preview component — extract rendering logic for reuse across 3 viewer patterns
- **task_executor.py auto-extraction**: All three features (keywords, questions, metadata) already implemented with LLM caching

### Established Patterns
- **Dataset CRUD**: ModelFactory.knowledgeBases with Knex ORM
- **OpenSearch indexing**: Chunks indexed via rag-search.service.ts — add page_rank field to index mapping
- **Parser config**: JSONB field on knowledgebase record — extend with auto_keywords, auto_questions, enable_metadata, metadata schema
- **Socket.IO progress**: Real-time task progress via Redis pub/sub — already works for parse/chunk/index

### Integration Points
- **DocumentTable click** → navigate to chunk detail page
- **Chat citation tooltip** → open document drawer with highlight
- **Search result click** → open document dialog with highlight
- **Parser settings form** → extend with auto-extraction toggles
- **OpenSearch queries** → add function_score with page_rank boost
- **Cron service** → existing cron job scheduling in `be/src/shared/services/`

</code_context>

<specifics>
## Specific Ideas

- Each version creates a new dataset — this means the existing dataset CRUD, parsing, and ABAC all work out of the box for each version
- page_rank field on datasets provides a simple, tunable boost mechanism for version recency
- Document metadata config acts as a template that auto-propagates to version datasets — reduces manual setup per version
- Three document viewer patterns share rendering logic but differ in container (page, drawer, dialog)
- RAGFlow's auto-extraction is already fully implemented in Python — just need parser config UI and data flow to B-Knowledge models
- Cron parsing scheduler uses System Settings page (admin-only) for office-hours scheduling

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The cron parsing scheduler was explicitly included per user decision.

</deferred>

---

*Phase: 03-document-management*
*Context gathered: 2026-03-18*
