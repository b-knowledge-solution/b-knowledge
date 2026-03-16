/**
 * @fileoverview Dataset Overview Tab — displays statistics and processing logs.
 * Adapted from RAGFlow's dataset-overview with B-Knowledge conventions.
 *
 * @module features/datasets/components/DatasetOverviewTab
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText, CheckCircle2, XCircle, Loader2,
  ChevronLeft, ChevronRight, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDatasetOverview, useDatasetLogs } from '../api/datasetQueries'
import type { DatasetLogEntry } from '../types'
import ProcessLogModal from './ProcessLogModal'

/**
 * @description Props for the DatasetOverviewTab component.
 */
interface DatasetOverviewTabProps {
  /** Dataset UUID to display overview for */
  datasetId: string
}

/**
 * @description Stat card component for the overview grid.
 */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border p-4 bg-card shadow-sm">
      <div className={`flex items-center justify-center h-12 w-12 rounded-lg ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  )
}

/**
 * @description Get status badge for a log entry based on progress.
 */
function getLogStatus(progress: number): { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' } {
  if (progress === 1) return { label: 'Done', variant: 'default' }
  if (progress === -1) return { label: 'Failed', variant: 'destructive' }
  if (progress > 0) return { label: 'Running', variant: 'secondary' }
  return { label: 'Pending', variant: 'outline' }
}

/**
 * @description Dataset Overview Tab component.
 * Shows stat cards (total, finished, failed, processing) and a paginated
 * processing logs table with status filtering and log detail modal.
 *
 * @param {DatasetOverviewTabProps} props - Component properties
 * @returns {JSX.Element} Rendered overview tab
 */
const DatasetOverviewTab: React.FC<DatasetOverviewTabProps> = ({ datasetId }) => {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [logDocId, setLogDocId] = useState<string | null>(null)
  const limit = 10

  // Fetch overview stats
  const { data: stats, isLoading: statsLoading } = useDatasetOverview(datasetId)

  // Fetch paginated logs
  const { data: logsData, isLoading: logsLoading } = useDatasetLogs(datasetId, {
    page,
    limit,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
  })

  const logs = logsData?.logs || []
  const total = logsData?.total || 0
  const totalPages = Math.ceil(total / limit)

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label={t('datasets.totalDocuments')}
          value={stats?.total_documents ?? 0}
          color="bg-blue-600"
        />
        <StatCard
          icon={CheckCircle2}
          label={t('datasets.finished')}
          value={stats?.finished ?? 0}
          color="bg-green-600"
        />
        <StatCard
          icon={XCircle}
          label={t('datasets.failed')}
          value={stats?.failed ?? 0}
          color="bg-red-600"
        />
        <StatCard
          icon={Loader2}
          label={t('datasets.processing')}
          value={stats?.processing ?? 0}
          color="bg-amber-500"
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('datasets.processingLogs')}</h3>
        <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('datasets.filterStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="done">{t('datasets.finished')}</SelectItem>
            <SelectItem value="failed">{t('datasets.failed')}</SelectItem>
            <SelectItem value="running">{t('datasets.processing')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs table */}
      {logsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={24} />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState title={t('datasets.noLogs')} />
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">{t('datasets.documentName')}</th>
                  <th className="text-left p-3 font-medium">{t('datasets.taskType')}</th>
                  <th className="text-left p-3 font-medium">{t('datasets.status')}</th>
                  <th className="text-left p-3 font-medium">{t('datasets.startTime')}</th>
                  <th className="text-center p-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: DatasetLogEntry) => {
                  const { label, variant } = getLogStatus(log.progress)
                  return (
                    <tr key={log.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {log.document_name || log.doc_id.slice(0, 12)}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{log.task_type || 'parse'}</Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={variant}>{label}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {log.begin_at || log.create_date || '—'}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setLogDocId(log.doc_id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('common.showing')} {(page - 1) * limit + 1}–{Math.min(page * limit, total)} {t('common.of')} {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">{page} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Process Log Modal */}
      <ProcessLogModal
        open={!!logDocId}
        onClose={() => setLogDocId(null)}
        datasetId={datasetId}
        docId={logDocId}
      />
    </div>
  )
}

export default DatasetOverviewTab
