import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Database, FileText, Hash, Edit2, Trash2, Globe, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Dataset } from '../types';

interface DatasetCardProps {
  dataset: Dataset;
  onEdit: (dataset: Dataset) => void;
  onDelete: (dataset: Dataset) => void;
  isAdmin: boolean;
}

const DatasetCard: React.FC<DatasetCardProps> = ({ dataset, onEdit, onDelete, isAdmin }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/datasets/${dataset.id}`);
  };

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
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">
                {dataset.name}
              </h3>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${statusColor}`}>
                {dataset.status}
              </span>
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
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
