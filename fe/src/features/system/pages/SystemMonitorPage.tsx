/**
 * @fileoverview System Monitor Page — Modern Dashboard
 *
 * Displays real-time health and performance metrics of the entire B-Knowledge stack.
 * Accessible only to administrators.
 *
 * Sections:
 * 1. Overview banner — aggregate health status at a glance
 * 2. Infrastructure Services — DB, Redis, S3, OpenSearch, Langfuse
 * 3. Workers & Processors — RAG worker + Converter heartbeat status
 * 4. System Resources — Uptime, Memory, CPU, Disk with progress bars
 * 5. Backend Specs — Runtime, CPU model, system memory
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import {
  Activity,
  Server,
  Database,
  HardDrive,
  Cpu,
  Clock,
  RefreshCw,
  Zap,
  AlertCircle,
  CheckCircle2,
  Search,
  Eye,
  Container,
  Cog,
  FileText,
  WifiOff,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getSystemHealth } from '../api/systemToolsApi'
import type { WorkerHeartbeat } from '../api/systemToolsApi'

// ============================================================================
// Constants
// ============================================================================

/** @description Refresh interval options in milliseconds */
const REFRESH_INTERVALS = [
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
  { label: '5m', value: 300000 },
  { label: '10m', value: 600000 },
]

const DEFAULT_INTERVAL = 30000

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * @description Format seconds to human-readable uptime string
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted string like "3d 12h 45m"
 */
const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / (3600 * 24))
  const hours = Math.floor((seconds % (3600 * 24)) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * @description Format bytes to human-readable size string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted string like "1.5 GB"
 */
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * @description Check if a service status represents a healthy state
 * @param {string} status - Service status string
 * @returns {boolean} True if the service is considered healthy
 */
const isHealthy = (status: string): boolean =>
  ['connected', 'ok', 'running', 'enabled'].includes(status)

/**
 * @description Format relative time from ISO string
 * @param {string} isoString - ISO timestamp
 * @returns {string} Relative time string like "5s ago"
 */
const formatRelativeTime = (isoString: string): string => {
  try {
    const diff = (Date.now() - new Date(isoString).getTime()) / 1000
    if (diff < 60) return `${Math.round(diff)}s ago`
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
    return `${Math.round(diff / 86400)}d ago`
  } catch {
    return isoString
  }
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * @description Animated pulse dot indicating live/dead status
 * @param {{ alive: boolean }} props - Whether the service is alive
 * @returns {JSX.Element} Rendered pulse indicator
 */
const PulseIndicator = ({ alive }: { alive: boolean }) => (
  <span className="relative flex h-2.5 w-2.5">
    {alive && (
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
    )}
    <span
      className={`relative inline-flex h-2.5 w-2.5 rounded-full ${alive ? 'bg-green-500' : 'bg-red-500'}`}
    />
  </span>
)

/**
 * @description Service health card for infrastructure services
 * @param {object} props - Service card properties
 * @returns {JSX.Element} Rendered service card
 */
const ServiceHealthCard = ({
  name,
  description,
  icon: Icon,
  status,
  host,
  extra,
}: {
  name: string
  description: string
  icon: React.ElementType
  status: string
  host?: string
  extra?: React.ReactNode
}) => {
  const healthy = isHealthy(status)
  const { t } = useTranslation()

  // Map status to display label
  let statusLabel = status
  switch (status) {
    case 'connected':
    case 'ok':
    case 'running':
    case 'enabled':
      statusLabel = t('systemMonitor.status.healthy')
      break
    case 'disconnected':
    case 'error':
    case 'failed':
      statusLabel = t('systemMonitor.status.error')
      break
    case 'disabled':
      statusLabel = t('systemMonitor.status.disabled')
      break
    case 'not_configured':
      statusLabel = t('systemMonitor.status.notConfigured')
      break
    case 'connecting':
      statusLabel = t('systemMonitor.status.connecting')
      break
  }

  return (
    <Card className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {/* Icon with themed background */}
            <div
              className={`rounded-lg p-2 ${
                healthy
                  ? 'bg-green-50 dark:bg-green-950/30'
                  : status === 'disabled' || status === 'not_configured'
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : 'bg-red-50 dark:bg-red-950/30'
              }`}
            >
              <Icon
                className={`h-5 w-5 ${
                  healthy
                    ? 'text-green-600 dark:text-green-400'
                    : status === 'disabled' || status === 'not_configured'
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-red-600 dark:text-red-400'
                }`}
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
          <PulseIndicator alive={healthy} />
        </div>

        {/* Status badge + host info */}
        <div className="mt-3 flex items-center justify-between">
          <Badge
            variant={healthy ? 'success' : status === 'disabled' || status === 'not_configured' ? 'secondary' : 'destructive'}
            className="text-[10px] uppercase tracking-wider"
          >
            {statusLabel}
          </Badge>
          {host && (
            <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]" title={host}>
              {host}
            </span>
          )}
        </div>

        {/* Extra info (e.g. OpenSearch cluster status) */}
        {extra && <div className="mt-2">{extra}</div>}
      </CardContent>
    </Card>
  )
}

/**
 * @description Resource metric card with progress bar visualization
 * @param {object} props - Metric card properties
 * @returns {JSX.Element} Rendered metric card
 */
const ResourceCard = ({
  title,
  value,
  subtext,
  icon: Icon,
  percent,
  colorClass = 'text-primary',
  barColor = 'bg-primary',
}: {
  title: string
  value: string
  subtext?: string
  icon: React.ElementType
  percent?: number | undefined
  colorClass?: string | undefined
  barColor?: string | undefined
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </div>
      <div className="text-xl font-bold text-foreground">{value}</div>
      {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
      {percent !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percent > 90
                  ? 'bg-red-500'
                  : percent > 70
                    ? 'bg-yellow-500'
                    : barColor
              }`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{percent.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </CardContent>
  </Card>
)

/**
 * @description Worker heartbeat row showing status, last seen, and stats
 * @param {object} props - Worker row properties
 * @returns {JSX.Element} Rendered worker row
 */
const WorkerRow = ({
  worker,
  type,
}: {
  worker: WorkerHeartbeat
  type: 'taskExecutor' | 'converter'
}) => {
  const { t } = useTranslation()
  const isOnline = worker.status === 'online'

  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <PulseIndicator alive={isOnline} />
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground truncate block" title={worker.name}>
            {worker.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {t('systemMonitor.workers.lastSeen')}: {formatRelativeTime(worker.lastSeen)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Task executor specific stats */}
        {type === 'taskExecutor' && worker.details && (
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            {worker.details.pending !== undefined && (
              <span title={t('systemMonitor.workers.pending')}>
                <span className="text-yellow-600 dark:text-yellow-400 font-medium">{worker.details.pending}</span> pending
              </span>
            )}
            {worker.details.done !== undefined && (
              <span title={t('systemMonitor.workers.done')}>
                <span className="text-green-600 dark:text-green-400 font-medium">{worker.details.done}</span> done
              </span>
            )}
            {worker.details.failed !== undefined && worker.details.failed > 0 && (
              <span title={t('systemMonitor.workers.failed')}>
                <span className="text-red-600 dark:text-red-400 font-medium">{worker.details.failed}</span> failed
              </span>
            )}
          </div>
        )}

        {/* Converter specific status */}
        {type === 'converter' && worker.details?.status && (
          <span className="text-xs text-muted-foreground capitalize">
            {t(`systemMonitor.workers.${worker.details.status}`, worker.details.status)}
          </span>
        )}

        <Badge variant={isOnline ? 'success' : 'destructive'} className="text-[10px]">
          {isOnline ? t('systemMonitor.status.online') : t('systemMonitor.status.offline')}
        </Badge>
      </div>
    </div>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

/**
 * @description Skeleton layout while health data is loading
 * @returns {JSX.Element} Rendered skeleton
 */
const MonitorSkeleton = () => (
  <div className="space-y-6">
    {/* Overview skeleton */}
    <Skeleton className="h-16 w-full rounded-lg" />
    {/* Service cards skeleton */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-lg" />
      ))}
    </div>
    {/* Worker + Resource skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Skeleton className="h-48 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-lg" />
      ))}
    </div>
  </div>
)

// ============================================================================
// Main Component
// ============================================================================

/**
 * @description System Monitor dashboard page with real-time health checks for all infrastructure services,
 * worker heartbeat monitoring, and system resource visualization
 * @returns {JSX.Element} Rendered system monitor page
 */
const SystemMonitorPage = () => {
  const { t } = useTranslation()
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL)

  // Fetch health data with auto-polling
  const {
    data: health,
    isLoading,
    error: queryError,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: queryKeys.systemTools.health(),
    queryFn: getSystemHealth,
    refetchInterval: autoRefresh ? intervalMs : false,
  })

  const error = queryError
    ? queryError instanceof Error ? queryError.message : 'Unknown error'
    : null

  // Track last updated time
  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastUpdated(new Date(dataUpdatedAt))
    }
  }, [dataUpdatedAt])

  // Compute aggregate health status for overview banner
  const serviceStatuses = health
    ? [
        health.services.database.status,
        health.services.redis.status,
        health.services.s3.status,
        health.services.opensearch.status,
        health.services.langfuse.status,
      ]
    : []
  const totalServices = serviceStatuses.length
  const healthyCount = serviceStatuses.filter(isHealthy).length
  const allHealthy = healthyCount === totalServices && totalServices > 0

  // Compute memory and disk percentages for progress bars
  const memoryPercent = health?.system.totalMemory
    ? (health.system.memory.rss / health.system.totalMemory) * 100
    : undefined

  const diskPercent = health?.system.disk
    ? ((health.system.disk.total - health.system.disk.available) / health.system.disk.total) * 100
    : undefined

  return (
    <div className="h-full overflow-y-auto">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* ============================================================ */}
        {/* Header & Controls */}
        {/* ============================================================ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
              <Activity className="h-7 w-7 text-primary" />
              {t('systemMonitor.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t('systemMonitor.description')}</p>
          </div>

          {/* Controls bar */}
          <div className="flex flex-wrap items-center gap-2 bg-card p-2 rounded-lg border shadow-sm">
            {/* Auto-refresh toggle */}
            <label className="flex items-center gap-2 px-2 text-sm text-muted-foreground select-none cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              {t('systemMonitor.controls.autoRefresh')}
            </label>

            <div className="w-px h-5 bg-border" />

            {/* Interval selector */}
            <select
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              disabled={!autoRefresh}
              className="bg-muted border-0 rounded text-sm py-1.5 px-2.5 focus:ring-2 focus:ring-primary disabled:opacity-50 text-foreground"
              aria-label={t('systemMonitor.controls.refreshInterval')}
            >
              {REFRESH_INTERVALS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="w-px h-5 bg-border" />

            {/* Manual refresh */}
            <button
              onClick={() => refetch()}
              disabled={isLoading || isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title={t('systemMonitor.controls.refreshNow')}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('systemMonitor.controls.refreshNow')}</span>
            </button>

            {lastUpdated && (
              <span className="text-[11px] text-muted-foreground px-1 tabular-nums">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Error alert */}
        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2.5 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t('systemMonitor.error', { error })}</span>
          </div>
        )}

        {isLoading && !health ? (
          <MonitorSkeleton />
        ) : health ? (
          <div className="space-y-6">
            {/* ============================================================ */}
            {/* Overview Banner */}
            {/* ============================================================ */}
            <Card
              className={`border-l-4 ${
                allHealthy ? 'border-l-green-500' : 'border-l-yellow-500'
              }`}
            >
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {allHealthy ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                  )}
                  <div>
                    <span className="text-sm font-semibold text-foreground">
                      {allHealthy
                        ? t('systemMonitor.overview.allOperational')
                        : t('systemMonitor.overview.someIssues', { count: totalServices - healthyCount })}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {t('systemMonitor.overview.servicesUp', { up: healthyCount, total: totalServices })}
                    </p>
                  </div>
                </div>

                {/* Quick status pills */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'database' as const, status: health.services.database.status, label: undefined as string | undefined },
                    { key: 'redis' as const, status: health.services.redis.status, label: undefined as string | undefined },
                    { key: 's3' as const, status: health.services.s3.status, label: health.services.s3.provider },
                    { key: 'opensearch' as const, status: health.services.opensearch.status, label: undefined as string | undefined },
                    { key: 'langfuse' as const, status: health.services.langfuse.status, label: undefined as string | undefined },
                  ].map(({ key, status, label }) => (
                    <span
                      key={key}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        isHealthy(status)
                          ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                          : status === 'disabled' || status === 'not_configured'
                            ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isHealthy(status) ? 'bg-green-500' : status === 'disabled' || status === 'not_configured' ? 'bg-gray-400' : 'bg-red-500'
                        }`}
                      />
                      {label || t(`systemMonitor.services.${key}`)}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* Infrastructure Services */}
            {/* ============================================================ */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Server className="h-4 w-4" />
                {t('systemMonitor.sections.services')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <ServiceHealthCard
                  name={t('systemMonitor.services.database')}
                  description={t('systemMonitor.services.databaseDesc')}
                  icon={Database}
                  status={health.services.database.status}
                  host={health.services.database.host}
                />
                <ServiceHealthCard
                  name={t('systemMonitor.services.redis')}
                  description={t('systemMonitor.services.redisDesc')}
                  icon={Zap}
                  status={health.services.redis.status}
                  host={health.services.redis.host}
                />
                <ServiceHealthCard
                  name={`${health.services.s3.provider ?? t('systemMonitor.services.s3')}`}
                  description={t('systemMonitor.services.s3Desc')}
                  icon={HardDrive}
                  status={health.services.s3.status}
                  host={health.services.s3.host}
                  extra={
                    isHealthy(health.services.s3.status) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                        <span>
                          <span className="font-medium text-foreground">{formatBytes(health.services.s3.totalSize ?? 0)}</span> {t('systemMonitor.metrics.used')}
                        </span>
                        <span>
                          <span className="font-medium text-foreground">{(health.services.s3.objectCount ?? 0).toLocaleString()}</span> {t('systemMonitor.services.s3Objects')}
                        </span>
                        <span>
                          <span className="font-medium text-foreground">{health.services.s3.bucketCount ?? 0}</span> {t('systemMonitor.services.s3Buckets')}
                        </span>
                      </div>
                    )
                  }
                />
                <ServiceHealthCard
                  name={t('systemMonitor.services.opensearch')}
                  description={t('systemMonitor.services.opensearchDesc')}
                  icon={Search}
                  status={health.services.opensearch.status}
                  host={health.services.opensearch.host}
                  extra={
                    health.services.opensearch.clusterStatus && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                            health.services.opensearch.clusterStatus === 'green'
                              ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                              : health.services.opensearch.clusterStatus === 'yellow'
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                          }`}
                        >
                          Cluster: {health.services.opensearch.clusterStatus}
                        </span>
                        {health.services.opensearch.nodeCount && (
                          <span className="text-muted-foreground">
                            {health.services.opensearch.nodeCount} node(s)
                          </span>
                        )}
                      </div>
                    )
                  }
                />
                <ServiceHealthCard
                  name={t('systemMonitor.services.langfuse')}
                  description={t('systemMonitor.services.langfuseDesc')}
                  icon={Eye}
                  status={health.services.langfuse.status}
                  host={health.services.langfuse.host}
                />
              </div>
            </section>

            {/* ============================================================ */}
            {/* Workers & Processors */}
            {/* ============================================================ */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Cog className="h-4 w-4" />
                {t('systemMonitor.sections.workers')}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* RAG Workers */}
                <Card>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <div className="flex items-center gap-2">
                        <Container className="h-4 w-4 text-primary" />
                        <div>
                          <span className="text-sm font-semibold text-foreground">
                            {t('systemMonitor.workers.taskExecutor')}
                          </span>
                          <p className="text-[10px] text-muted-foreground">
                            {t('systemMonitor.workers.taskExecutorDesc')}
                          </p>
                        </div>
                      </div>
                      <Badge variant={health.workers.taskExecutors.some((w) => w.status === 'online') ? 'success' : 'secondary'}>
                        {health.workers.taskExecutors.filter((w) => w.status === 'online').length} / {health.workers.taskExecutors.length}
                      </Badge>
                    </div>
                    {health.workers.taskExecutors.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                        <WifiOff className="h-5 w-5" />
                        {t('systemMonitor.workers.noWorkers')}
                      </div>
                    ) : (
                      health.workers.taskExecutors.map((worker) => (
                        <WorkerRow key={worker.name} worker={worker} type="taskExecutor" />
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Converter Workers */}
                <Card>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <div>
                          <span className="text-sm font-semibold text-foreground">
                            {t('systemMonitor.workers.converter')}
                          </span>
                          <p className="text-[10px] text-muted-foreground">
                            {t('systemMonitor.workers.converterDesc')}
                          </p>
                        </div>
                      </div>
                      <Badge variant={health.workers.converters.some((w) => w.status === 'online') ? 'success' : 'secondary'}>
                        {health.workers.converters.filter((w) => w.status === 'online').length} / {health.workers.converters.length}
                      </Badge>
                    </div>
                    {health.workers.converters.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                        <WifiOff className="h-5 w-5" />
                        {t('systemMonitor.workers.noWorkers')}
                      </div>
                    ) : (
                      health.workers.converters.map((worker) => (
                        <WorkerRow key={worker.name} worker={worker} type="converter" />
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* ============================================================ */}
            {/* System Resources */}
            {/* ============================================================ */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                {t('systemMonitor.sections.system')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <ResourceCard
                  title={t('systemMonitor.metrics.uptime')}
                  value={formatUptime(health.system.uptime)}
                  icon={Clock}
                  colorClass="text-green-500 dark:text-green-400"
                />
                <ResourceCard
                  title={t('systemMonitor.metrics.memory')}
                  value={formatBytes(health.system.memory.rss)}
                  subtext={t('systemMonitor.metrics.heapUsage', {
                    used: formatBytes(health.system.memory.heapUsed),
                    total: formatBytes(health.system.memory.heapTotal),
                  })}
                  icon={HardDrive}
                  colorClass="text-purple-500 dark:text-purple-400"
                  barColor="bg-purple-500"
                  percent={memoryPercent}
                />
                <ResourceCard
                  title={t('systemMonitor.metrics.cpuLoad')}
                  value={health.system.loadAvg?.[0]?.toFixed(2) || '0.00'}
                  subtext={t('systemMonitor.metrics.loadAvgLabel')}
                  icon={Cpu}
                  colorClass="text-orange-500 dark:text-orange-400"
                  barColor="bg-orange-500"
                  percent={health.system.cpus && health.system.loadAvg?.[0] !== undefined ? (health.system.loadAvg[0] / health.system.cpus) * 100 : undefined}
                />
                <ResourceCard
                  title={t('systemMonitor.metrics.diskStorage')}
                  value={health.system.disk ? formatBytes(health.system.disk.available) : t('systemMonitor.metrics.unknown')}
                  subtext={
                    health.system.disk
                      ? t('systemMonitor.metrics.diskFreeOf', { total: formatBytes(health.system.disk.total) })
                      : t('systemMonitor.metrics.checkFailed')
                  }
                  icon={HardDrive}
                  colorClass="text-blue-500 dark:text-blue-400"
                  barColor="bg-blue-500"
                  percent={diskPercent}
                />
              </div>
            </section>

            {/* ============================================================ */}
            {/* Backend Specifications */}
            {/* ============================================================ */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Server className="h-4 w-4" />
                {t('systemMonitor.sections.backendSpecs')}
              </h2>
              <Card>
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
                    {/* Runtime */}
                    <div className="p-4">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {t('systemMonitor.specs.runtimeEnv')}
                      </span>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-sm font-medium text-foreground">
                          Node.js {health.system.nodeVersion}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {health.system.osType} {health.system.osRelease} &middot; {health.system.platform}/{health.system.arch}
                      </p>
                    </div>

                    {/* CPU */}
                    <div className="p-4">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {t('systemMonitor.specs.cpu')}
                      </span>
                      <div className="mt-1">
                        <span
                          className="text-sm font-medium text-foreground block truncate"
                          title={health.system.cpuModel}
                        >
                          {health.system.cpuModel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('systemMonitor.specs.cores', { count: health.system.cpus })} &middot; {health.system.hostname}
                      </p>
                    </div>

                    {/* System Memory */}
                    <div className="p-4">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {t('systemMonitor.specs.memoryCapacity')}
                      </span>
                      <div className="mt-1">
                        <span className="text-sm font-medium text-foreground">
                          {health.system.totalMemory ? formatBytes(health.system.totalMemory) : t('systemMonitor.metrics.unknown')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('systemMonitor.specs.totalSystemMemory')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default SystemMonitorPage
