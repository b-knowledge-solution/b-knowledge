import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, LayoutGrid, List } from 'lucide-react';
import { Input, Button, Empty, Spin, Segmented } from 'antd';
import { useAuth } from '@/features/auth';
import { useDatasets } from '../hooks/useDatasets';
import DatasetCard from '../components/DatasetCard';
import CreateDatasetModal from '../components/CreateDatasetModal';

const DatasetsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'leader';
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const {
    datasets,
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
  } = useDatasets();

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6">
        <Input
          placeholder={t('datasets.searchPlaceholder')}
          allowClear
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          prefix={<Search size={16} className="text-slate-400" />}
          className="max-w-sm"
        />

        <Segmented
          value={viewMode}
          onChange={(v: string | number) => setViewMode(v as 'grid' | 'list')}
          options={[
            { value: 'grid', icon: <LayoutGrid size={16} /> },
            { value: 'list', icon: <List size={16} /> },
          ]}
        />

        <div className="flex-1" />

        {isAdmin && (
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={() => openModal()}
          >
            {t('datasets.add')}
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spin size="large" />
        </div>
      ) : datasets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Empty
            description={search ? t('datasets.noResults') : t('datasets.empty')}
          />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {datasets.map((dataset) => (
            <DatasetCard
              key={dataset.id}
              dataset={dataset}
              onEdit={openModal}
              onDelete={handleDelete}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {datasets.map((dataset) => (
            <DatasetCard
              key={dataset.id}
              dataset={dataset}
              onEdit={openModal}
              onDelete={handleDelete}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <CreateDatasetModal
        open={isModalOpen}
        editingDataset={editingDataset}
        submitting={submitting}
        form={form}
        onSubmit={handleSubmit}
        onCancel={closeModal}
      />
    </div>
  );
};

export default DatasetsPage;
