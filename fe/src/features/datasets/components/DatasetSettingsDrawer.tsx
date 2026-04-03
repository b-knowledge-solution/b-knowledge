/**
 * @fileoverview Dataset settings drawer (Sheet) with tabs.
 *
 * Tabs: General | Chunking | Advanced | Retrieval Test
 *
 * @module features/datasets/components/DatasetSettingsDrawer
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { useDatasetSettings } from '../api/datasetQueries';
import GeneralSettingsForm from './GeneralSettingsForm';
import RetrievalTestPanel from './RetrievalTestPanel';

// ============================================================================
// Types
// ============================================================================

interface DatasetSettingsDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Dataset ID */
  datasetId: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Right-side sheet drawer for dataset settings with tabbed panels.
 * Contains Configuration (GeneralSettingsForm) and Retrieval Test tabs.
 * Only fetches settings when the drawer is open.
 *
 * @param {DatasetSettingsDrawerProps} props - Component properties
 * @returns {JSX.Element} Rendered settings drawer
 */
const DatasetSettingsDrawer: React.FC<DatasetSettingsDrawerProps> = ({
  open,
  onClose,
  datasetId,
}) => {
  const { t } = useTranslation();
  const { settings, loading, saving, updateSettings } = useDatasetSettings(
    open ? datasetId : undefined,
  );

  return (
    <Sheet open={open} onOpenChange={(v: boolean) => !v && onClose()}>
      <SheetContent side="right" className="w-[70vw] sm:max-w-[70vw] p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>{t('datasetSettings.title')}</SheetTitle>
        </SheetHeader>

        <div className="h-[calc(100%-65px)] overflow-auto px-6 py-4">
          {loading || !settings ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size={32} />
            </div>
          ) : (
            <Tabs defaultValue="general">
              <TabsList className="mb-4">
                <TabsTrigger value="general">
                  Configuration
                </TabsTrigger>
                <TabsTrigger value="retrieval">
                  {t('datasetSettings.tabs.retrievalTest')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <GeneralSettingsForm
                  settings={settings}
                  saving={saving}
                  onSave={updateSettings}
                />
              </TabsContent>

              <TabsContent value="retrieval">
                <RetrievalTestPanel datasetId={datasetId} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DatasetSettingsDrawer;
