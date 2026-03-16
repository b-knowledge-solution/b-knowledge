/**
 * @fileoverview Advanced settings form for dataset settings drawer.
 *
 * Includes GraphRAG toggle, RAPTOR config, auto_keywords/questions sliders.
 *
 * @module features/datasets/components/AdvancedSettingsForm
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save } from 'lucide-react';
import type { DatasetSettings, GraphRAGConfig, RAPTORConfig } from '../types';

// ============================================================================
// Types
// ============================================================================

interface AdvancedSettingsFormProps {
  /** Current settings */
  settings: DatasetSettings;
  /** Whether saving */
  saving: boolean;
  /** Save handler */
  onSave: (data: Partial<DatasetSettings>) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Advanced settings form with GraphRAG, RAPTOR, and auto-generation sliders.
 *
 * @param props - Component props
 * @returns React element
 */
const AdvancedSettingsForm: React.FC<AdvancedSettingsFormProps> = ({
  settings,
  saving,
  onSave,
}) => {
  const { t } = useTranslation();

  const [graphrag, setGraphrag] = useState<GraphRAGConfig>(
    settings.graphrag || { enabled: false },
  );
  const [raptor, setRaptor] = useState<RAPTORConfig>(
    settings.raptor || { enabled: false },
  );
  const [autoKeywords, setAutoKeywords] = useState(settings.auto_keywords || 0);
  const [autoQuestions, setAutoQuestions] = useState(settings.auto_questions || 0);

  // Reset when settings change
  useEffect(() => {
    setGraphrag(settings.graphrag || { enabled: false });
    setRaptor(settings.raptor || { enabled: false });
    setAutoKeywords(settings.auto_keywords || 0);
    setAutoQuestions(settings.auto_questions || 0);
  }, [settings]);

  /**
   * Handle form submission.
   */
  const handleSave = () => {
    onSave({
      graphrag,
      raptor,
      auto_keywords: autoKeywords,
      auto_questions: autoQuestions,
    });
  };

  return (
    <div className="space-y-6">
      {/* GraphRAG */}
      <div className="space-y-3 p-4 border rounded-lg dark:border-slate-700">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">
            {t('datasetSettings.advanced.graphrag')}
          </Label>
          <Switch
            checked={graphrag.enabled}
            onCheckedChange={(checked: boolean) =>
              setGraphrag((prev) => ({ ...prev, enabled: checked }))
            }
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {t('datasetSettings.advanced.graphragDesc')}
        </p>
        {graphrag.enabled && (
          <div className="space-y-2 pt-2">
            <div className="space-y-1.5">
              <Label>{t('datasetSettings.advanced.entityTypes')}</Label>
              <Input
                value={(graphrag.entity_types || []).join(', ')}
                onChange={(e) =>
                  setGraphrag((prev) => ({
                    ...prev,
                    entity_types: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder={t('datasetSettings.advanced.entityTypesPlaceholder')}
              />
            </div>
          </div>
        )}
      </div>

      {/* RAPTOR */}
      <div className="space-y-3 p-4 border rounded-lg dark:border-slate-700">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">
            {t('datasetSettings.advanced.raptor')}
          </Label>
          <Switch
            checked={raptor.enabled}
            onCheckedChange={(checked: boolean) =>
              setRaptor((prev) => ({ ...prev, enabled: checked }))
            }
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {t('datasetSettings.advanced.raptorDesc')}
        </p>
        {raptor.enabled && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-1.5">
              <Label>{t('datasetSettings.advanced.maxToken')}</Label>
              <Input
                type="number"
                value={raptor.max_token || 256}
                onChange={(e) =>
                  setRaptor((prev) => ({ ...prev, max_token: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('datasetSettings.advanced.threshold')}</Label>
              <Input
                type="number"
                step="0.01"
                value={raptor.threshold || 0.1}
                onChange={(e) =>
                  setRaptor((prev) => ({ ...prev, threshold: Number(e.target.value) }))
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Auto Keywords */}
      <div className="space-y-1.5">
        <Label>{t('datasetSettings.advanced.autoKeywords')}</Label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="10"
            value={autoKeywords}
            onChange={(e) => setAutoKeywords(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm font-medium w-6 text-center">{autoKeywords}</span>
        </div>
      </div>

      {/* Auto Questions */}
      <div className="space-y-1.5">
        <Label>{t('datasetSettings.advanced.autoQuestions')}</Label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="10"
            value={autoQuestions}
            onChange={(e) => setAutoQuestions(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm font-medium w-6 text-center">{autoQuestions}</span>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save size={16} className="mr-1" />
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
};

export default AdvancedSettingsForm;
