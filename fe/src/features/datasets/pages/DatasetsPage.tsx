import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { useHasPermission } from '@/lib/permissions'
import { PERMISSION_KEYS } from '@/constants/permission-keys'
import { useDatasets } from '../api/datasetQueries'
import DatasetCard from '../components/DatasetCard'
import CreateDatasetModal from '../components/CreateDatasetModal'
import DatasetAccessDialog from '../components/DatasetAccessDialog'
import type { Dataset } from '../types'

/**
 * @description Datasets listing page with search, grid/list view toggle,
 * dataset creation modal, and access control dialog.
 * Admin users can create, edit, delete datasets and manage access.
 *
 * @returns {JSX.Element} Rendered datasets page
 */
const DatasetsPage: React.FC = () => {
  const { t } = useTranslation();
  // Catalog-driven gate replacing legacy admin/leader role check (Plan 4.4 manual migration)
  const isAdmin = useHasPermission(PERMISSION_KEYS.DATASETS_VIEW);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // State for access control dialog
  const [accessDataset, setAccessDataset] = useState<Dataset | null>(null);

  const {
    datasets,
    loading,
    search,
    setSearch,
    isModalOpen,
    editingDataset,
    submitting,
    formData,
    setFormField,
    openModal,
    closeModal,
    handleSubmit,
    handleDelete,
  } = useDatasets();

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={t('datasets.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* View mode toggle (replaces antd Segmented) */}
        <div className="flex border rounded-md overflow-hidden">
          <button
            className={`p-2 ${viewMode === 'grid' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            className={`p-2 ${viewMode === 'list' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
            onClick={() => setViewMode('list')}
          >
            <List size={16} />
          </button>
        </div>

        <div className="flex-1" />

        {isAdmin && (
          <Button onClick={() => openModal()}>
            <Plus size={16} className="mr-1" />
            {t('datasets.add')}
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size={48} />
        </div>
      ) : datasets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title={search ? t('datasets.noResults') : t('datasets.empty')}
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
              onManageAccess={isAdmin ? (d: Dataset) => setAccessDataset(d) : undefined}
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
              onManageAccess={isAdmin ? (d: Dataset) => setAccessDataset(d) : undefined}
            />
          ))}
        </div>
      )}

      {/* Access Control Dialog */}
      <DatasetAccessDialog
        open={!!accessDataset}
        onClose={() => setAccessDataset(null)}
        dataset={accessDataset}
      />

      {/* Create/Edit Modal */}
      <CreateDatasetModal
        open={isModalOpen}
        editingDataset={editingDataset}
        submitting={submitting}
        formData={formData}
        setFormField={setFormField}
        onSubmit={handleSubmit}
        onCancel={closeModal}
      />
    </div>
  );
};

export default DatasetsPage;
