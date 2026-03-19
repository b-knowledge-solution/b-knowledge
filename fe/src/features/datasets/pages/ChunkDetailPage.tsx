/**
 * @fileoverview Chunk detail page with split-view document preview and chunk list.
 * Route: /data-studio/datasets/:id/documents/:docId/chunks
 *
 * Full-page layout with document preview on the left and a scrollable chunk
 * list on the right. Supports chunk CRUD operations (edit, delete, add).
 *
 * @module features/datasets/pages/ChunkDetailPage
 */

import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { DocumentPreviewer } from '@/components/DocumentPreviewer'
import { datasetApi } from '../api/datasetApi'
import { queryKeys } from '@/lib/queryKeys'
import { getExtension } from '@/utils/document-util'

/**
 * @description Chunk detail page with split-view document preview and chunk management.
 * Shows the document file on the left and a searchable chunk list with CRUD on the right.
 * Responsive: xl = 50/50, md-lg = 40/60, sm = stacked.
 * @returns {JSX.Element} Rendered chunk detail page
 */
const ChunkDetailPage: React.FC = () => {
  const { id: datasetId, docId } = useParams<{ id: string; docId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [_selectedChunkId, setSelectedChunkId] = useState<string | null>(null)

  // Fetch document info for the header bar (name, suffix, chunk count)
  const { data: docLogs, isLoading } = useQuery({
    queryKey: queryKeys.datasets.documentLogs(datasetId ?? '', docId ?? ''),
    queryFn: () => datasetApi.getDocumentLogs(datasetId!, docId!),
    enabled: !!datasetId && !!docId,
  })

  const docInfo = docLogs?.document
  const docName = docInfo?.name || ''
  const suffix = docInfo?.suffix || getExtension(docName)
  const downloadUrl = `/api/rag/datasets/${datasetId}/documents/${docId}/download`

  // Guard: require both route params
  if (!datasetId || !docId) {
    return <EmptyState title={t('common.error', 'Error')} description="Missing parameters" />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar with back navigation, file info, and download */}
      <div className="flex items-center gap-3 p-3 border-b bg-background shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/data-studio/datasets/${datasetId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm truncate max-w-[400px]">
          {docName || docId}
        </span>
        {suffix && (
          <Badge variant="outline" className="text-xs">
            {suffix.toUpperCase()}
          </Badge>
        )}
        {docInfo?.chunk_num !== undefined && (
          <Badge variant="secondary" className="text-xs">
            {docInfo.chunk_num} {t('datasets.chunks')}
          </Badge>
        )}
        <div className="flex-1" />
        <a href={downloadUrl} download>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            {t('datasets.download')}
          </Button>
        </a>
      </div>

      {/* Split view: document preview + chunk list with CRUD */}
      <div className="flex-1 overflow-hidden">
        <DocumentPreviewer
          datasetId={datasetId}
          docId={docId}
          fileName={docName}
          downloadUrl={downloadUrl}
          showChunks={true}
          onSelectChunk={(chunk) => setSelectedChunkId(chunk.chunk_id)}
        />
      </div>
    </div>
  )
}

export default ChunkDetailPage
