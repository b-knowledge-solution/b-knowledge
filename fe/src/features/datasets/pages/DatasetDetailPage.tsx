import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, RefreshCw, Shield, Settings, Database, BarChart3, Network, Tags, Globe, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth';
import { datasetApi } from '../api/datasetApi';
import { useDocuments, useChangeDocumentParser, useWebCrawl } from '../api/datasetQueries';
import DocumentTable from '../components/DocumentTable';
import FileUploadModal from '../components/FileUploadModal';
import DatasetAccessDialog from '../components/DatasetAccessDialog';
import DatasetSettingsDrawer from '../components/DatasetSettingsDrawer';
import DatasetOverviewTab from '../components/DatasetOverviewTab';
import KnowledgeGraphTab from '../components/KnowledgeGraphTab';
import MetadataManageDialog from '../components/MetadataManageDialog';
import ChangeParserDialog from '../components/ChangeParserDialog';
import WebCrawlDialog from '../components/WebCrawlDialog';
import { DocumentPreviewer } from '@/components/DocumentPreviewer';
import type { Dataset, Document } from '../types';

/**
 * @description Dataset detail page with tabbed interface for Documents, Overview,
 * and Knowledge Graph. Includes header with dataset info, admin actions
 * (upload, access control, settings, metadata), and document preview sheet.
 *
 * @returns {JSX.Element} Rendered dataset detail page
 */
const DatasetDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Grant admin privileges to admin and leader roles for write operations
  const isAdmin = user?.role === 'admin' || user?.role === 'leader';

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  // State for access control dialog
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  // State for settings drawer
  const [settingsOpen, setSettingsOpen] = useState(false);
  // State for active tab
  const [activeTab, setActiveTab] = useState<'documents' | 'overview' | 'graph'>('documents');
  // State for metadata dialog
  const [metadataOpen, setMetadataOpen] = useState(false);
  // State for change parser dialog
  const [parserDialogOpen, setParserDialogOpen] = useState(false);
  const [parserDialogDoc, setParserDialogDoc] = useState<Document | null>(null);
  // State for web crawl dialog
  const [webCrawlOpen, setWebCrawlOpen] = useState(false);




  // Fetch documents for this dataset with all CRUD operations
  const { documents, loading: loadingDocs, uploading, refresh, uploadFiles, deleteDocument, parseDocument, toggleAvailability, bulkParse, bulkDelete } = useDocuments(id);

  // Mutation hooks for parser change and web crawl
  const changeParserMutation = useChangeDocumentParser(id ?? '')
  const webCrawlMutation = useWebCrawl(id ?? '')

  /** Open change parser dialog for a specific document */
  const handleOpenChangeParser = (doc: Document) => {
    setParserDialogDoc(doc)
    setParserDialogOpen(true)
  }

  /** Confirm parser change and close the dialog */
  const handleConfirmChangeParser = async (docId: string, parserId: string, parserConfig?: Record<string, unknown>) => {
    const payload: { docId: string; parser_id: string; parser_config?: Record<string, unknown> } = { docId, parser_id: parserId }
    if (parserConfig) payload.parser_config = parserConfig
    await changeParserMutation.mutateAsync(payload)
    setParserDialogOpen(false)
    setParserDialogDoc(null)
  }

  /** Submit web crawl and close the dialog */
  const handleWebCrawlSubmit = async (data: { url: string; name?: string; auto_parse?: boolean }) => {
    await webCrawlMutation.mutateAsync(data)
    setWebCrawlOpen(false)
  }

  // Fetch dataset details on mount; redirect to list on failure (e.g. 404)
  useEffect(() => {
    if (!id) return;
    setLoadingDataset(true);
    datasetApi
      .getDataset(id)
      .then(setDataset)
      .catch(() => navigate('/data-studio/datasets'))
      .finally(() => setLoadingDataset(false));
  }, [id, navigate]);

  /** Upload files and refresh dataset counts on success */
  const handleUpload = async (files: File[]) => {
    try {
      await uploadFiles(files);
      setUploadModalOpen(false);
      // Refresh dataset to update document and chunk counts in the header
      if (id) {
        const updated = await datasetApi.getDataset(id);
        setDataset(updated);
      }
    } catch {
      // Modal stays open on error; toast is shown by the mutation's onError
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
          onClick={() => navigate('/data-studio/datasets')}
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

        <TooltipProvider>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}>
                  <Settings size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('datasets.settings')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={refresh}>
                  <RefreshCw size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('datasets.refresh')}</TooltipContent>
            </Tooltip>
            {isAdmin && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={() => setMetadataOpen(true)}>
                      <Tags size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('datasets.metadata')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={() => setAccessDialogOpen(true)}>
                      <Shield size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('datasetAccess.manageAccess')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={() => setWebCrawlOpen(true)}>
                      <Globe size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('datasets.webCrawl')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" onClick={() => setUploadModalOpen(true)}>
                      <Upload size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('datasets.uploadFiles')}</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </TooltipProvider>
      </div>

      {/* Dataset Info — collapsible panel, defaults to collapsed */}
      <Collapsible defaultOpen={false} className="mb-6">
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg group">
              <span className="text-sm font-semibold text-foreground">{t('datasets.datasetInfo')}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-4 pb-4 pt-0">
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
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-4 border-b">
        {[
          { key: 'documents' as const, label: t('datasets.documents'), icon: Database },
          { key: 'overview' as const, label: t('datasets.overview'), icon: BarChart3 },
          { key: 'graph' as const, label: t('datasets.knowledgeGraph'), icon: Network },
        ].map(tab => (
          <button
            key={tab.key}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab.key
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'documents' && (
        <Card className="dark:bg-slate-800 dark:border-slate-700 flex-1">
          <CardHeader className="pb-0">
            <CardTitle className="text-base">{t('datasets.documents')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DocumentTable
              datasetId={id!}
              documents={documents}
              loading={loadingDocs}
              isAdmin={isAdmin}
              onParse={parseDocument}
              onDelete={deleteDocument}
              onToggleAvailability={toggleAvailability}
              onBulkParse={bulkParse}
              onBulkDelete={bulkDelete}
              onChangeParser={handleOpenChangeParser}
            />
          </CardContent>
        </Card>
      )}

      {activeTab === 'overview' && id && (
        <DatasetOverviewTab datasetId={id} dataset={dataset ?? undefined} />
      )}

      {activeTab === 'graph' && id && (
        <KnowledgeGraphTab datasetId={id} />
      )}

      {/* Settings Drawer */}
      {id && (
        <DatasetSettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          datasetId={id}
        />
      )}

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

      {/* Metadata Dialog */}
      {id && (
        <MetadataManageDialog
          open={metadataOpen}
          onClose={() => setMetadataOpen(false)}
          datasetId={id}
        />
      )}

      {/* Change Parser Dialog */}
      <ChangeParserDialog
        open={parserDialogOpen}
        onClose={() => { setParserDialogOpen(false); setParserDialogDoc(null) }}
        document={parserDialogDoc}
        submitting={changeParserMutation.isPending}
        onConfirm={handleConfirmChangeParser}
      />

      {/* Web Crawl Dialog */}
      <WebCrawlDialog
        open={webCrawlOpen}
        onClose={() => setWebCrawlOpen(false)}
        submitting={webCrawlMutation.isPending}
        onSubmit={handleWebCrawlSubmit}
      />
    </div>
  );
};

export default DatasetDetailPage;
