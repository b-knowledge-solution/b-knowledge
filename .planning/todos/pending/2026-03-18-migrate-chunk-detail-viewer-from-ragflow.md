---
created: 2026-03-18T10:38:48.646Z
title: Migrate chunk detail viewer from RAGFlow
area: ui
files:
  - ragflow/web/src/pages/chunk/index.tsx
  - ragflow/web/src/pages/chunk/parsed-result-panel.tsx
  - ragflow/web/src/pages/chunk/chunked-result-panel.tsx
  - ragflow/web/src/pages/chunk/chunk-card.tsx
  - ragflow/web/src/pages/chunk/chunk-toolbar.tsx
  - ragflow/web/src/pages/dataset/dataset/use-dataset-table-columns.tsx:97
  - fe/src/features/datasets/components/DocumentTable.tsx
  - fe/src/features/datasets/pages/DatasetDetailPage.tsx
---

## Problem

In B-Knowledge's dataset detail page, clicking a document name does not navigate to a chunk detail/parsed result viewer. RAGFlow has a full chunk viewer page (`ragflow/web/src/pages/chunk/`) with:

- **Parsed result panel** — shows the parsed document with layout/OCR visualization
- **Chunked result panel** — shows individual chunks with text, metadata, and edit capabilities
- **Chunk cards** — display individual chunk content with highlighting
- **Chunk toolbar** — controls for filtering, sorting, and managing chunks

The navigation trigger is in `use-dataset-table-columns.tsx:97` (`navigateToChunkParsedResult`) which links the document name click to the chunk viewer page.

B-Knowledge currently shows chunks in a `ChunkList` / `ChunkCard` component in `DocumentPreviewer` but has no dedicated page or navigation from the document table.

## Solution

Migrate the RAGFlow chunk viewer page to B-Knowledge:

1. Create `fe/src/features/datasets/pages/ChunkDetailPage.tsx` based on `ragflow/web/src/pages/chunk/index.tsx`
2. Migrate parsed result panel and chunked result panel components
3. Add route for chunk detail page (e.g., `/datasets/:id/documents/:docId/chunks`)
4. Wire document name click in `DocumentTable.tsx` to navigate to the chunk detail page
5. Adapt API calls to use B-Knowledge's backend endpoints for chunk listing, editing, and deletion
6. Ensure dark mode and i18n support (en, vi, ja)
