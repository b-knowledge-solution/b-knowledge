/**
 * @fileoverview Hook for dataset settings CRUD operations.
 *
 * @module features/datasets/hooks/useDatasetSettings
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { datasetApi } from '../api/datasetApi';
import { globalMessage } from '@/app/App';
import type { DatasetSettings } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseDatasetSettingsReturn {
  /** Current settings */
  settings: DatasetSettings | null;
  /** Whether settings are loading */
  loading: boolean;
  /** Whether settings are saving */
  saving: boolean;
  /** Fetch settings */
  refresh: () => Promise<void>;
  /** Update settings */
  updateSettings: (data: Partial<DatasetSettings>) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing dataset settings.
 *
 * @param datasetId - Dataset ID
 * @returns Settings state and operations
 */
export function useDatasetSettings(datasetId: string | undefined): UseDatasetSettingsReturn {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<DatasetSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Fetch settings from API. */
  const fetchSettings = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const data = await datasetApi.getDatasetSettings(datasetId);
      setSettings(data);
    } catch (err) {
      console.error('Failed to load dataset settings:', err);
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /** Update settings. */
  const updateSettings = useCallback(
    async (data: Partial<DatasetSettings>) => {
      if (!datasetId) return;
      setSaving(true);
      try {
        const updated = await datasetApi.updateDatasetSettings(datasetId, data);
        setSettings(updated);
        globalMessage.success(t('datasetSettings.saveSuccess'));
      } catch (err: any) {
        globalMessage.error(err?.message || t('common.error'));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [datasetId, t],
  );

  return {
    settings,
    loading,
    saving,
    refresh: fetchSettings,
    updateSettings,
  };
}
