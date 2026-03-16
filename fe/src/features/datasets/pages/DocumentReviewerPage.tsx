/**
 * @fileoverview Document Reviewer Page — split-panel view with document preview + chunk editing.
 * Similar to RAGFlow's document viewer: document on left, chunks on right.
 *
 * @module features/datasets/pages/DocumentReviewerPage
 */

import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  ArrowLeft, Download, FileText, Image, Code, Table,
  ChevronLeft, ChevronRight, Hash,
} from 'lucide-react'
import { datasetApi } from '../api/datasetApi'
import type { Chunk, ChunksResponse } from '../types'

/**
 * @description Determine viewer type based on file suffix.
 * @param suffix - File extension without dot
 * @returns Viewer type string
 */
function getViewerType(suffix: string): 'pdf' | 'image' | 'text' | 'spreadsheet' | 'unsupported' {
  const s = suffix?.toLowerCase() || ''
  if (['pdf'].includes(s)) return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'webp', 'bmp', 'svg'].includes(s)) return 'image'
  if (['txt', 'md', 'mdx', 'json', 'csv', 'html', 'xml', 'yaml', 'yml', 'py', 'js', 'ts', 'tsx', 'jsx', 'java', 'cpp', 'c', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'bat', 'sql', 'r', 'eml'].includes(s)) return 'text'
  if (['xlsx', 'xls', 'csv'].includes(s)) return 'spreadsheet'
  return 'unsupported'
}

/**
 * @description Get icon for viewer type.
 */
function getViewerIcon(type: string) {
  switch (type) {
    case 'pdf': return FileText
    case 'image': return Image
    case 'text': return Code
    case 'spreadsheet': return Table
    default: return FileText
  }
}

/**
 * @description Document content viewer component.
 * Renders different viewers based on file type.
 */
function DocumentViewer({
  datasetId,
  docId,
  suffix,
  docName,
}: {
  datasetId: string
  docId: string
  suffix: string
  docName: string
}) {
  const { t } = useTranslation()
  const viewerType = getViewerType(suffix)
  const downloadUrl = `/api/rag/datasets/${datasetId}/documents/${docId}/download`

  if (viewerType === 'pdf') {
    return (
      <iframe
        src={downloadUrl}
        className="w-full h-full border-0"
        title={docName}
      />
    )
  }

  if (viewerType === 'image') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/20 p-4">
        <img
          src={downloadUrl}
          alt={docName}
          className="max-w-full max-h-full object-contain rounded-lg shadow-md"
        />
      </div>
    )
  }

  if (viewerType === 'text' || viewerType === 'spreadsheet') {
    return <TextViewer url={downloadUrl} />
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
      <FileText className="h-16 w-16 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{t('datasets.previewNotAvailable')}</p>
      <a href={downloadUrl} download>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-1" />
          {t('datasets.downloadFile')}
        </Button>
      </a>
    </div>
  )
}

/**
 * @description Simple text file viewer that fetches and displays file content.
 */
function TextViewer({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  React.useEffect(() => {
    fetch(url, { credentials: 'include' })
      .then(res => res.text())
      .then(text => { setContent(text); setLoading(false) })
      .catch(() => { setContent('Failed to load file content'); setLoading(false) })
  }, [url])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words text-foreground">
        {content}
      </pre>
    </div>
  )
}

/**
 * @description Chunk card component for the chunks panel.
 */
function ChunkCard({
  chunk,
  index,
  isSelected,
  onClick,
}: {
  chunk: Chunk
  index: number
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <Badge variant="outline" className="text-[10px]">
          #{index + 1}
        </Badge>
        {chunk.score !== undefined && (
          <span className="text-[10px] text-muted-foreground">
            {(chunk.score * 100).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-4">
        {chunk.text}
      </p>
      {chunk.page_num && chunk.page_num.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Hash className="h-3 w-3" />
          Page {chunk.page_num.join(', ')}
        </div>
      )}
    </button>
  )
}

/**
 * @description Document Reviewer Page component.
 * Split-panel layout: document preview on left, chunk list on right.
 */
const DocumentReviewerPage: React.FC = () => {
  const { id: datasetId, docId } = useParams<{ id: string; docId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [chunkPage, setChunkPage] = useState(1)
  const [selectedChunkIdx, setSelectedChunkIdx] = useState<number | null>(null)
  const [docInfo, setDocInfo] = useState<{
    name: string; suffix: string; size: number; chunk_num: number
  } | null>(null)
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [totalChunks, setTotalChunks] = useState(0)
  const [chunksLoading, setChunksLoading] = useState(false)

  // Fetch document info
  React.useEffect(() => {
    if (!datasetId || !docId) return
    datasetApi.getDocumentLogs(datasetId, docId)
      .then(res => {
        const doc = res.document
        setDocInfo({
          name: doc.name,
          suffix: doc.suffix,
          size: doc.size,
          chunk_num: doc.chunk_num,
        })
      })
      .catch(() => { /* ignore */ })
  }, [datasetId, docId])

  // Fetch chunks using direct API
  React.useEffect(() => {
    if (!datasetId || !docId) return
    setChunksLoading(true)
    datasetApi.listChunks(datasetId, { doc_id: docId, page: chunkPage, limit: 20 })
      .then((res: ChunksResponse) => {
        setChunks(res.chunks || [])
        setTotalChunks(res.total || 0)
      })
      .catch(() => {
        setChunks([])
        setTotalChunks(0)
      })
      .finally(() => setChunksLoading(false))
  }, [datasetId, docId, chunkPage])
  const totalPages = Math.ceil(totalChunks / 20)

  if (!datasetId || !docId) {
    return <EmptyState title="Missing parameters" />
  }

  const suffix = docInfo?.suffix || docId?.split('.').pop() || ''
  const ViewerIcon = getViewerIcon(getViewerType(suffix))

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 p-3 border-b bg-background shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ViewerIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm truncate max-w-[400px]">
          {docInfo?.name || docId}
        </span>
        <Badge variant="outline" className="text-xs">
          {suffix?.toUpperCase()}
        </Badge>
        <div className="flex-1" />
        <a
          href={`/api/rag/datasets/${datasetId}/documents/${docId}/download`}
          download
        >
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            {t('datasets.download')}
          </Button>
        </a>
      </div>

      {/* Split panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Document preview */}
        <div className="flex-1 min-w-0 bg-muted/10">
          <DocumentViewer
            datasetId={datasetId}
            docId={docId}
            suffix={suffix}
            docName={docInfo?.name || docId}
          />
        </div>

        {/* Right: Chunks panel */}
        <div className="w-[350px] border-l flex flex-col bg-background shrink-0">
          {/* Chunks header */}
          <div className="p-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('datasets.chunks')}</h3>
              <Badge variant="secondary" className="text-xs">
                {totalChunks} {t('datasets.total')}
              </Badge>
            </div>
          </div>

          {/* Chunks list */}
          <div className="flex-1 overflow-auto">
            <div className="p-3 space-y-2">
              {chunksLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size={20} />
                </div>
              ) : chunks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t('datasets.noChunks')}
                </p>
              ) : (
                chunks.map((chunk: Chunk, idx: number) => (
                  <ChunkCard
                    key={chunk.chunk_id}
                    chunk={chunk}
                    index={(chunkPage - 1) * 20 + idx}
                    isSelected={selectedChunkIdx === idx}
                    onClick={() => setSelectedChunkIdx(idx)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Chunk pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t flex items-center justify-between shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={chunkPage <= 1}
                onClick={() => setChunkPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {chunkPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={chunkPage >= totalPages}
                onClick={() => setChunkPage(p => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DocumentReviewerPage
