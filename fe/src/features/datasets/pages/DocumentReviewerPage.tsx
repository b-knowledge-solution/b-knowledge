/**
 * @fileoverview Document Reviewer Page — full-page split-panel view with document preview + chunk editing.
 * Reuses the shared DocumentPreviewer component which provides file-type routing,
 * PDF highlight overlays, and a full-featured ChunkList with search, CRUD, and pagination.
 *
 * @module features/datasets/pages/DocumentReviewerPage
 */

import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import { DocumentPreviewer } from '@/components/DocumentPreviewer'
import { datasetApi } from '../api/datasetApi'
import { queryKeys } from '@/lib/queryKeys'
import { getExtension } from '@/utils/document-util'

/**
 * @description Document Reviewer Page component.
 * Full-page split-panel layout reusing the shared DocumentPreviewer for file preview
 * and chunk management. Adds a top bar with navigation, file info, and download button.
 */
const DocumentReviewerPage: React.FC = () => {
  const { id: datasetId, docId } = useParams<{ id: string; docId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  // Fetch document info for the top bar (name, suffix, chunk count)
  const { data: docLogs, isLoading } = useQuery({
    queryKey: queryKeys.datasets.documentLogs(datasetId ?? '', docId ?? ''),
    queryFn: () => datasetApi.getDocumentLogs(datasetId!, docId!),
    enabled: !!datasetId && !!docId,
  })

  const docInfo = docLogs?.document
  const docName = docInfo?.name || ''
  const suffix = docInfo?.suffix || getExtension(docName)
  const downloadUrl = `/api/rag/datasets/${datasetId}/documents/${docId}/download`

  // Guard: require both params
  if (!datasetId || !docId) {
    return <EmptyState title="Missing parameters" />
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
          onClick={() => navigate(-1)}
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

      {/* Reuse shared DocumentPreviewer — provides file preview + full ChunkList with CRUD */}
      <div className="flex-1 overflow-hidden">
        <DocumentPreviewer
          datasetId={datasetId}
          docId={docId}
          fileName={docName}
          downloadUrl={downloadUrl}
          showChunks={true}
        />
      </div>
    </div>
  )
}

export default DocumentReviewerPage
