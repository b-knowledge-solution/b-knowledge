import React from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { Document } from '../types';

interface DocumentTableProps {
  documents: Document[];
  loading: boolean;
  isAdmin: boolean;
  onParse: (docId: string) => void;
  onDelete: (docId: string) => void;
  onView?: (doc: Document) => void;
}

const statusVariantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  parsing: 'outline',
  completed: 'default',
  failed: 'destructive',
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  loading,
  isAdmin,
  onParse,
  onDelete,
  onView,
}) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('datasets.docName')}</TableHead>
            <TableHead className="w-[100px]">{t('datasets.docSize')}</TableHead>
            <TableHead className="w-[140px]">{t('datasets.docStatus')}</TableHead>
            <TableHead className="w-[100px] text-right">{t('datasets.chunkCount')}</TableHead>
            <TableHead className="w-[140px]">{t('datasets.docUploadDate')}</TableHead>
            {isAdmin && <TableHead className="w-[120px]">{t('common.actions')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">
                {t('common.noData')}
              </TableCell>
            </TableRow>
          ) : documents.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell className="max-w-[300px] truncate">
                {doc.status === 'completed' && onView ? (
                  <button
                    className="font-medium text-primary hover:underline text-left"
                    onClick={() => onView(doc)}
                  >
                    {doc.name}
                  </button>
                ) : (
                  <span className="font-medium">{doc.name}</span>
                )}
              </TableCell>
              <TableCell>{formatFileSize(doc.size)}</TableCell>
              <TableCell>
                <div>
                  <Badge variant={statusVariantMap[doc.status] || 'secondary'}>{doc.status}</Badge>
                  {doc.status === 'parsing' && (
                    <Progress value={Math.round(doc.progress * 100)} className="mt-1 h-1.5" />
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">{doc.chunk_count}</TableCell>
              <TableCell>{new Date(doc.created_at).toLocaleDateString()}</TableCell>
              {isAdmin && (
                <TableCell>
                  <div className="flex gap-1">
                    {doc.status === 'completed' && onView && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onView(doc)}>
                              <Eye size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('datasets.viewDocument', 'View')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {doc.status === 'pending' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onParse(doc.id)}>
                              <Play size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('datasets.parse')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(doc.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('common.delete')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default DocumentTable;
