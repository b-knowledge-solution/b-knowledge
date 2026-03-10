import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, RefreshCw, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/features/auth';
import { datasetApi } from '../api/datasetApi';
import { useDocuments } from '../hooks/useDatasets';
import DocumentTable from '../components/DocumentTable';
import FileUploadModal from '../components/FileUploadModal';
import DatasetAccessDialog from '../components/DatasetAccessDialog';
import { DocumentPreviewer } from '@/components/DocumentPreviewer';
import type { Dataset, Document } from '../types';

const DatasetDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'leader';

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  // State for access control dialog
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);

  const handleViewDocument = useCallback((doc: Document) => {
    setPreviewDoc(doc);
  }, []);

  const { documents, loading: loadingDocs, uploading, refresh, uploadFiles, deleteDocument, parseDocument } = useDocuments(id);

  useEffect(() => {
    if (!id) return;
    setLoadingDataset(true);
    datasetApi
      .getDataset(id)
      .then(setDataset)
      .catch(() => navigate('/datasets'))
      .finally(() => setLoadingDataset(false));
  }, [id, navigate]);

  const handleUpload = async (files: File[]) => {
    await uploadFiles(files);
    setUploadModalOpen(false);
    // Refresh dataset to update counts
    if (id) {
      const updated = await datasetApi.getDataset(id);
      setDataset(updated);
    }
  };

  if (loadingDataset) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={48} />
      </div>
    );
  }

  if (!dataset) return null;

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/datasets')}
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            {dataset.name}
          </h2>
          {dataset.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {dataset.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCw size={16} className="mr-1" />
            {t('datasets.refresh')}
          </Button>
          {isAdmin && (
            <>
              {/* Manage Access button */}
              <Button variant="outline" onClick={() => setAccessDialogOpen(true)}>
                <Shield size={16} className="mr-1" />
                {t('datasetAccess.manageAccess')}
              </Button>
              <Button onClick={() => setUploadModalOpen(true)}>
                <Upload size={16} className="mr-1" />
                {t('datasets.uploadFiles')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Dataset Info — replaces antd Descriptions */}
      <Card className="dark:bg-slate-800 dark:border-slate-700 mb-6">
        <CardContent className="p-4">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('datasets.language')}</dt>
              <dd className="font-medium mt-0.5">{dataset.language}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('datasets.chunkMethod')}</dt>
              <dd className="mt-0.5"><Badge variant="secondary">{dataset.parser_id}</Badge></dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('datasets.docCount')}</dt>
              <dd className="font-medium mt-0.5">{dataset.doc_count}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('datasets.chunkCount')}</dt>
              <dd className="font-medium mt-0.5">{dataset.chunk_count}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('datasets.embeddingModel')}</dt>
              <dd className="font-medium mt-0.5">{dataset.embedding_model || t('datasets.systemDefault')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('datasets.access')}</dt>
              <dd className="mt-0.5">
                {dataset.access_control?.public ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t('datasets.public')}</Badge>
                ) : (
                  <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{t('datasets.private')}</Badge>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card className="dark:bg-slate-800 dark:border-slate-700 flex-1">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">{t('datasets.documents')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DocumentTable
            documents={documents}
            loading={loadingDocs}
            isAdmin={isAdmin}
            onParse={parseDocument}
            onDelete={deleteDocument}
            onView={handleViewDocument}
          />
        </CardContent>
      </Card>

      {/* Access Control Dialog */}
      <DatasetAccessDialog
        open={accessDialogOpen}
        onClose={() => setAccessDialogOpen(false)}
        dataset={dataset}
      />

      {/* Upload Modal */}
      <FileUploadModal
        open={uploadModalOpen}
        uploading={uploading}
        onUpload={handleUpload}
        onCancel={() => setUploadModalOpen(false)}
      />

      {/* Document Preview — replaces antd Drawer with shadcn Sheet */}
      <Sheet open={!!previewDoc} onOpenChange={(v: boolean) => !v && setPreviewDoc(null)}>
        <SheetContent side="right" className="w-[85vw] sm:max-w-[85vw] p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>{previewDoc?.name || t('datasets.viewDocument', 'Document Preview')}</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-65px)] overflow-hidden">
            {previewDoc && id && (
              <DocumentPreviewer
                datasetId={id}
                docId={previewDoc.id}
                fileName={previewDoc.name}
                downloadUrl={datasetApi.getDocumentDownloadUrl(id, previewDoc.id)}
                showChunks={previewDoc.chunk_count > 0}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default DatasetDetailPage;
