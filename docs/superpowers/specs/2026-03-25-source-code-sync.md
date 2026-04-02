# 2026-03-25 Source Code Sync

> Documentation sync page for the source code and all commits made on 2026-03-25.

## 1. Purpose

This page connects today's implementation work to the current source tree so the documentation does not drift behind the code.

Primary source areas updated today:

- `be/src/modules/search/**`
- `be/src/modules/rag/**`
- `be/src/shared/services/tag-ranking.service.ts`
- `fe/src/features/search/**`
- `fe/src/components/DocumentPreviewer/**`
- `fe/src/components/Spotlight.tsx`
- `fe/src/features/datasets/components/ParserSettingsFields.tsx`

## 2. Implemented Search Changes

### Search embed and share

- Public embed config endpoint added and documented
- Public token-authenticated `search`, `related-questions`, and `mindmap` endpoints added
- Share page implemented at `/search/share/:token`
- Embed `askSearch` tenant resolution fixed to use the search app context

### Search retrieval quality

- SQL fallback added before normal retrieval for datasets with `field_map`
- Tag-based ranking added after retrieval and reranking
- Server-side OpenSearch highlights added and corrected to prefer readable text
- Search service fixes applied around embed routes, schema validation, and stream behavior

### Search UI and preview

- Spotlight landing effect added
- Search app avatar and `empty_response` added through DB, BE, and FE
- Document preview dialog now shows chunk metadata and opens PDFs at the selected page
- Share page, embed dialog, and result cards updated for richer search UX

### Dataset structured-data support

- Field map editor added to parser settings
- Auto-detect field map endpoint and FE integration added

## 3. Commits From 2026-03-25

### Documentation and design

| Commit | Summary |
|--------|---------|
| `32aaa19` | Add initial design mockups and documentation for new superpowers search, citation, and document preview features |

### Search embed, share page, and branding

| Commit | Summary |
|--------|---------|
| `fa8a1ad` | Fix embed `askSearch` tenant resolution |
| `473e813` | Fix embed route validation and related questions error handling |
| `1d4a7fc` | Add standalone share page for iframe embedding |
| `9eb7a9b` | Enhance embed dialog with iframe code generation and options |
| `88cc9d9` | Add embed config, search, related-questions, and mindmap endpoints |
| `4d9c249` | Pass `avatar` and `empty_response` through CRUD endpoints |
| `a6ea49a` | Add avatar picker and empty response to search app config dialog |
| `7db25e3` | Display avatar on search home and support custom empty response |
| `85cccdf` | Show avatar in search app management table |
| `015164e` | Add avatar, empty response, highlight, and embed FE types |
| `14d4066` | Add avatar and empty response to BE model type |
| `6d31ea6` | Add avatar, empty response, and embed schemas |
| `5394fad` | Add `avatar` and `empty_response` columns to `search_apps` |

### Retrieval pipeline, SQL fallback, and ranking

| Commit | Summary |
|--------|---------|
| `211b6d4` | Wire SQL fallback into `askSearch` and `executeSearch` |
| `1ef2bd9` | Enhance SQL retrieval with retry, KB filter, citations, validation, and timeout |
| `084e38c` | Integrate tag-based rank boosting into retrieval pipeline |
| `3217706` | Add tag ranking service |
| `55261f5` | Add OpenSearch highlight support for server-side snippets |
| `8cddf62` | Fix readable highlights and correct tag TF-IDF behavior |
| `71ffad2` | Fix rag-search service structure and null safety |
| `528b29f` | Address code review findings across SQL, search, and parser settings |
| `b806b63` | Address final review findings across SQL, search, and stream handling |
| `564aa04` | Add tests for tag ranking service and Spotlight component |

### Search UI polish and preview

| Commit | Summary |
|--------|---------|
| `0da1dd2` | Add spotlight effect to search landing pages |
| `45ad01b` | Add theme-aware Spotlight component |
| `54a68b5` | Use shared chunk content display in search result cards |
| `3e9eb2c` | Add shared chunk content display component |
| `cb7be44` | Add shared emoji picker component |
| `34c7db3` | Add `initialPage` prop to document previewer |
| `47754db` | Show chunk metadata in document preview header |
| `094cf94` | Add rotating phase labels to mind map progress |

### Dataset field map support

| Commit | Summary |
|--------|---------|
| `b432ded` | Add auto-detect field map endpoint and frontend API |
| `78a35d5` | Add field map editor to dataset parser settings |

### Larger feature foundations landed earlier today

| Commit | Summary |
|--------|---------|
| `21e3626` | Implement search page filters and supporting backend services |
| `eb829f0` | Introduce broader search and chat features |
| `bb49009` | Introduce RAG-powered chat application work |
| `3f9a586` | Land project, chat, dataset, memory, agents, and API key foundations |
| `f36c777` | Add line-of-code reporting script |

## 4. Doc Pages Updated By This Sync

- `/detail-design/search/retrieval-detail`
- `/detail-design/search/features-detail`
- `/detail-design/search/embed-widget`
- `/`

These pages were updated to match the source code instead of only the original design specs.

## 5. Related Specs

- [Search Feature Gaps Design](/superpowers/specs/2026-03-25-search-feature-gaps-design)
- [SQL Fallback, Tags, Spotlight Design](/superpowers/specs/2026-03-25-sql-fallback-tags-spotlight-design)
- [Search Feature Gaps Plan](/superpowers/plans/2026-03-25-search-feature-gaps)
- [SQL Tags Spotlight Plan](/superpowers/plans/2026-03-25-sql-tags-spotlight)
