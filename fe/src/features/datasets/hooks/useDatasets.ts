import { useState, useEffect, useCallback, useMemo } from 'react';
import { Form, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { datasetApi } from '../api/datasetApi';
import type { Dataset, CreateDatasetDto, Document } from '../types';
import { globalMessage } from '@/app/App';

// ============================================================================
// useDatasets — Dataset list management
// ============================================================================

export interface UseDatasetsReturn {
  datasets: Dataset[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  isModalOpen: boolean;
  editingDataset: Dataset | null;
  submitting: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  openModal: (dataset?: Dataset) => void;
  closeModal: () => void;
  handleSubmit: (values: CreateDatasetDto) => Promise<void>;
  handleDelete: (dataset: Dataset) => void;
  refresh: () => void;
}

export function useDatasets(): UseDatasetsReturn {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await datasetApi.listDatasets();
      setDatasets(data);
    } catch (error) {
      console.error('Error fetching datasets:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const filteredDatasets = useMemo(() => {
    if (!search.trim()) return datasets;
    const query = search.toLowerCase();
    return datasets.filter(
      (ds) =>
        ds.name.toLowerCase().includes(query) ||
        ds.description?.toLowerCase().includes(query),
    );
  }, [datasets, search]);

  const openModal = useCallback(
    (dataset?: Dataset) => {
      if (dataset) {
        setEditingDataset(dataset);
        form.setFieldsValue({
          name: dataset.name,
          description: dataset.description || '',
          language: dataset.language,
          parser_id: dataset.parser_id,
        });
      } else {
        setEditingDataset(null);
        form.resetFields();
      }
      setIsModalOpen(true);
    },
    [form],
  );

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingDataset(null);
    form.resetFields();
  }, [form]);

  const handleSubmit = useCallback(
    async (values: CreateDatasetDto) => {
      setSubmitting(true);
      try {
        if (editingDataset) {
          await datasetApi.updateDataset(editingDataset.id, values);
          globalMessage.success(t('datasets.updateSuccess'));
        } else {
          await datasetApi.createDataset(values);
          globalMessage.success(t('datasets.createSuccess'));
        }
        closeModal();
        await fetchDatasets();
      } catch (error: any) {
        globalMessage.error(error?.message || t('common.error'));
      } finally {
        setSubmitting(false);
      }
    },
    [editingDataset, closeModal, fetchDatasets, t],
  );

  const handleDelete = useCallback(
    (dataset: Dataset) => {
      Modal.confirm({
        title: t('datasets.confirmDelete'),
        content: t('datasets.confirmDeleteMessage', { name: dataset.name }),
        okText: t('common.delete'),
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await datasetApi.deleteDataset(dataset.id);
            globalMessage.success(t('datasets.deleteSuccess'));
            fetchDatasets();
          } catch (error: any) {
            globalMessage.error(error?.message || t('common.error'));
          }
        },
      });
    },
    [fetchDatasets, t],
  );

  return {
    datasets: filteredDatasets,
    loading,
    search,
    setSearch,
    isModalOpen,
    editingDataset,
    submitting,
    form,
    openModal,
    closeModal,
    handleSubmit,
    handleDelete,
    refresh: fetchDatasets,
  };
}

// ============================================================================
// useDocuments — Document list for a specific dataset
// ============================================================================

export interface UseDocumentsReturn {
  documents: Document[];
  loading: boolean;
  uploading: boolean;
  refresh: () => void;
  uploadFiles: (files: File[]) => Promise<void>;
  deleteDocument: (docId: string) => void;
  parseDocument: (docId: string) => Promise<void>;
}

export function useDocuments(datasetId: string | undefined): UseDocumentsReturn {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchDocuments = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const data = await datasetApi.listDocuments(datasetId);
      setDocuments(data);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!datasetId) return;
      setUploading(true);
      try {
        await datasetApi.uploadDocuments(datasetId, files);
        globalMessage.success(t('datasets.uploadSuccess', { count: files.length }));
        await fetchDocuments();
      } catch (error: any) {
        globalMessage.error(error?.message || t('common.error'));
      } finally {
        setUploading(false);
      }
    },
    [datasetId, fetchDocuments, t],
  );

  const deleteDocument = useCallback(
    (docId: string) => {
      if (!datasetId) return;
      Modal.confirm({
        title: t('datasets.confirmDeleteDoc'),
        content: t('datasets.confirmDeleteDocMessage'),
        okText: t('common.delete'),
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await datasetApi.deleteDocument(datasetId, docId);
            globalMessage.success(t('datasets.deleteDocSuccess'));
            fetchDocuments();
          } catch (error: any) {
            globalMessage.error(error?.message || t('common.error'));
          }
        },
      });
    },
    [datasetId, fetchDocuments, t],
  );

  const parseDocument = useCallback(
    async (docId: string) => {
      if (!datasetId) return;
      try {
        await datasetApi.parseDocument(datasetId, docId);
        globalMessage.success(t('datasets.parseStarted'));
        fetchDocuments();
      } catch (error: any) {
        globalMessage.error(error?.message || t('common.error'));
      }
    },
    [datasetId, fetchDocuments, t],
  );

  return {
    documents,
    loading,
    uploading,
    refresh: fetchDocuments,
    uploadFiles,
    deleteDocument,
    parseDocument,
  };
}
