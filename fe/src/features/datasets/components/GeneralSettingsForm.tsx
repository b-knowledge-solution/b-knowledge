/**
 * @fileoverview General settings form for dataset settings drawer.
 *
 * Includes name, description, language, embedding model, and permission.
 *
 * @module features/datasets/components/GeneralSettingsForm
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Save } from 'lucide-react';
import type { DatasetSettings } from '../types';
import { LANGUAGE_OPTIONS } from '../types';

// ============================================================================
// Types
// ============================================================================

interface GeneralSettingsFormProps {
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
 * General settings form for name, description, language, etc.
 *
 * @param props - Component props
 * @returns React element
 */
const GeneralSettingsForm: React.FC<GeneralSettingsFormProps> = ({
  settings,
  saving,
  onSave,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState(settings.name);
  const [description, setDescription] = useState(settings.description || '');
  const [language, setLanguage] = useState(settings.language);
  const [embeddingModel, setEmbeddingModel] = useState(settings.embedding_model || '');
  const [permission, setPermission] = useState(settings.permission || 'me');
  const [pagerank, setPagerank] = useState(settings.pagerank || 0);

  // Reset form when settings change
  useEffect(() => {
    setName(settings.name);
    setDescription(settings.description || '');
    setLanguage(settings.language);
    setEmbeddingModel(settings.embedding_model || '');
    setPermission(settings.permission || 'me');
    setPagerank(settings.pagerank || 0);
  }, [settings]);

  /**
   * Handle form submission.
   */
  const handleSave = () => {
    onSave({
      name,
      description,
      language,
      embedding_model: embeddingModel || null,
      permission,
      pagerank,
    });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-1.5">
        <Label>{t('datasetSettings.general.name')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label>{t('datasetSettings.general.description')}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <Label>{t('datasetSettings.general.language')}</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Embedding Model */}
      <div className="space-y-1.5">
        <Label>{t('datasetSettings.general.embeddingModel')}</Label>
        <Input
          value={embeddingModel}
          onChange={(e) => setEmbeddingModel(e.target.value)}
          placeholder={t('datasets.embeddingModelPlaceholder')}
        />
      </div>

      {/* Permission */}
      <div className="space-y-1.5">
        <Label>{t('datasetSettings.general.permission')}</Label>
        <Select value={permission} onValueChange={setPermission}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="me">{t('datasetSettings.general.permissionMe')}</SelectItem>
            <SelectItem value="team">{t('datasetSettings.general.permissionTeam')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Page Rank */}
      <div className="space-y-1.5">
        <Label>Page Rank (0 - 1000)</Label>
        <Input
          type="number"
          min={0}
          value={pagerank}
          onChange={(e) => setPagerank(Number(e.target.value))}
          placeholder="0"
        />
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

export default GeneralSettingsForm;
