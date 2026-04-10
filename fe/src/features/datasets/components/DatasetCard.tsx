import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigateWithLoader } from '@/components/NavigationLoader'
import { Database, FileText, Hash, Edit2, Trash2, Globe, Lock, Shield } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { buildAdminDatasetPath } from '@/app/adminRoutes'
import VersionBadge from './VersionBadge'
import type { Dataset } from '../types'
import { useHasPermission } from '@/lib/permissions'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

/**
 * @description Props for the DatasetCard component.
 */
interface DatasetCardProps {
  /** The dataset to display */
  dataset: Dataset;
  /** Callback when edit button is clicked */
  onEdit: (dataset: Dataset) => void;
  /** Callback when delete button is clicked */
  onDelete: (dataset: Dataset) => void;
  /** Optional callback for manage access button (admin only) */
  onManageAccess?: ((dataset: Dataset) => void) | undefined;
}

/**
 * @description Card component displaying a dataset summary with name, status,
 * document/chunk counts, access level, and admin action buttons (edit, delete, manage access).
 * Clicking the card navigates to the dataset detail page.
 *
 * @param {DatasetCardProps} props - Component properties
 * @returns {JSX.Element} Rendered dataset card
 */
const DatasetCard: React.FC<DatasetCardProps> = ({ dataset, onEdit, onDelete, onManageAccess }) => {
  const isAdmin = useHasPermission(PERMISSION_KEYS.DATASETS_VIEW)
  const { t } = useTranslation();
  const navigate = useNavigateWithLoader();

  /** Navigate to dataset detail page on card click, showing overlay until detail page data loads */
  const handleClick = () => {
    navigate(buildAdminDatasetPath(dataset.id), { waitForReady: true });
  };

  // Map dataset status to Tailwind color classes for the status badge
  const statusColor = dataset.status === 'active'
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';

  return (
    <Card
      className="dark:bg-slate-800 dark:border-slate-700 cursor-pointer group hover:shadow-md transition-shadow"
      onClick={handleClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Database size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {dataset.name}
                </h3>
                {/* Show version badge for version datasets */}
                <VersionBadge versionNumber={dataset.version_number} versionLabel={dataset.version_label} />
              </div>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${statusColor}`}>
                {dataset.status}
              </span>
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              {/* Manage Access button */}
              {onManageAccess && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onManageAccess(dataset)}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-purple-600"
                      >
                        <Shield size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('datasetAccess.manageAccess')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onEdit(dataset)}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600"
                    >
                      <Edit2 size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('common.edit')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onDelete(dataset)}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('common.delete')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        {dataset.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
            {dataset.description}
          </p>
        )}

        {/* Version metadata — shown for version datasets */}
        {dataset.version_number != null && dataset.change_summary && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-1 italic">
            {dataset.change_summary}
          </p>
        )}

        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1">
                  <FileText size={14} />
                  {dataset.doc_count}
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('datasets.docCount')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1">
                  <Hash size={14} />
                  {dataset.chunk_count}
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('datasets.chunkCount')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1">
                  {dataset.access_control?.public ? <Globe size={14} /> : <Lock size={14} />}
                </span>
              </TooltipTrigger>
              <TooltipContent>{dataset.access_control?.public ? t('datasets.public') : t('datasets.private')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
          <span>{dataset.parser_id}</span>
          <span>{new Date(dataset.updated_at).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default DatasetCard;
