/**
 * @fileoverview Chunking settings form for dataset settings drawer.
 *
 * Includes chunk method selector and dynamic config per parser.
 *
 * @module features/datasets/components/ChunkingSettingsForm
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Save } from 'lucide-react';
import type { DatasetSettings } from '../types';
import { PARSER_OPTIONS } from '../types';

// ============================================================================
// Types
// ============================================================================

interface ChunkingSettingsFormProps {
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
 * Chunking method selector with dynamic config fields.
 *
 * @param props - Component props
 * @returns React element
 */
const ChunkingSettingsForm: React.FC<ChunkingSettingsFormProps> = ({
  settings,
  saving,
  onSave,
}) => {
  const { t } = useTranslation();
  const [parserId, setParserId] = useState(settings.parser_id);
  const [parserConfig, setParserConfig] = useState<Record<string, unknown>>(
    settings.parser_config || {},
  );

  // Reset when settings change
  useEffect(() => {
    setParserId(settings.parser_id);
    setParserConfig(settings.parser_config || {});
  }, [settings]);

  /**
   * Update a parser config field.
   *
   * @param key - Config key
   * @param value - Config value
   */
  const updateConfig = (key: string, value: unknown) => {
    setParserConfig((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Handle form submission.
   */
  const handleSave = () => {
    onSave({ parser_id: parserId, parser_config: parserConfig });
  };

  return (
    <div className="space-y-4">
      {/* Chunk method selector */}
      <div className="space-y-1.5">
        <Label>{t('datasetSettings.chunking.method')}</Label>
        <Select value={parserId} onValueChange={setParserId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARSER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dynamic config fields based on parser */}
      {(parserId === 'naive' || parserId === 'book' || parserId === 'manual') && (
        <>
          <div className="space-y-1.5">
            <Label>{t('datasetSettings.chunking.chunkSize')}</Label>
            <Input
              type="number"
              value={String(parserConfig.chunk_token_num || 128)}
              onChange={(e) => updateConfig('chunk_token_num', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('datasetSettings.chunking.delimiter')}</Label>
            <Input
              value={String(parserConfig.delimiter || '\\n')}
              onChange={(e) => updateConfig('delimiter', e.target.value)}
              placeholder="\n"
            />
          </div>
        </>
      )}

      {parserId === 'qa' && (
        <div className="text-sm text-muted-foreground">
          {t('datasetSettings.chunking.qaHint')}
        </div>
      )}

      {parserId === 'table' && (
        <div className="text-sm text-muted-foreground">
          {t('datasetSettings.chunking.tableHint')}
        </div>
      )}

      {/* Layout recognition toggle for naive parser */}
      {parserId === 'naive' && (
        <div className="space-y-1.5">
          <Label>{t('datasetSettings.chunking.layoutRecognition')}</Label>
          <Select
            value={String(parserConfig.layout_recognize ?? true)}
            onValueChange={(v: string) => updateConfig('layout_recognize', v === 'true')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">{t('common.on')}</SelectItem>
              <SelectItem value="false">{t('common.off')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

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

export default ChunkingSettingsForm;
