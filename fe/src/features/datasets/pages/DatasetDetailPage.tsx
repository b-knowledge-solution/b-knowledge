import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, RefreshCw } from 'lucide-react';
import { Button, Spin, Card, Descriptions, Tag } from 'antd';
import { useAuth } from '@/features/auth';
import { datasetApi } from '../api/datasetApi';
import { useDocuments } from '../hooks/useDatasets';
import DocumentTable from '../components/DocumentTable';
import FileUploadModal from '../components/FileUploadModal';
import type { Dataset } from '../types';

const DatasetDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'leader';

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

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
        <Spin size="large" />
      </div>
    );
  }

  if (!dataset) return null;

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          type="text"
          icon={<ArrowLeft size={18} />}
          onClick={() => navigate('/datasets')}
        />
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
          <Button
            icon={<RefreshCw size={16} />}
            onClick={refresh}
          >
            {t('datasets.refresh')}
          </Button>
          {isAdmin && (
            <Button
              type="primary"
              icon={<Upload size={16} />}
              onClick={() => setUploadModalOpen(true)}
            >
              {t('datasets.uploadFiles')}
            </Button>
          )}
        </div>
      </div>

      {/* Dataset Info */}
      <Card className="dark:bg-slate-800 dark:border-slate-700 mb-6">
        <Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small">
          <Descriptions.Item label={t('datasets.language')}>
            {dataset.language}
          </Descriptions.Item>
          <Descriptions.Item label={t('datasets.chunkMethod')}>
            <Tag>{dataset.parser_id}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('datasets.docCount')}>
            {dataset.doc_count}
          </Descriptions.Item>
          <Descriptions.Item label={t('datasets.chunkCount')}>
            {dataset.chunk_count}
          </Descriptions.Item>
          <Descriptions.Item label={t('datasets.embeddingModel')}>
            {dataset.embedding_model || t('datasets.systemDefault')}
          </Descriptions.Item>
          <Descriptions.Item label={t('datasets.access')}>
            {dataset.access_control?.public ? (
              <Tag color="green">{t('datasets.public')}</Tag>
            ) : (
              <Tag color="orange">{t('datasets.private')}</Tag>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Documents Table */}
      <Card
        title={t('datasets.documents')}
        className="dark:bg-slate-800 dark:border-slate-700 flex-1"
        styles={{ body: { padding: 0 } }}
      >
        <DocumentTable
          documents={documents}
          loading={loadingDocs}
          isAdmin={isAdmin}
          onParse={parseDocument}
          onDelete={deleteDocument}
        />
      </Card>

      {/* Upload Modal */}
      <FileUploadModal
        open={uploadModalOpen}
        uploading={uploading}
        onUpload={handleUpload}
        onCancel={() => setUploadModalOpen(false)}
      />
    </div>
  );
};

export default DatasetDetailPage;
