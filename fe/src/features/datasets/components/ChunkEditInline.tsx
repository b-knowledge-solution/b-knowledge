/**
 * @fileoverview Inline editing textarea for a chunk.
 *
 * @module features/datasets/components/ChunkEditInline
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface ChunkEditInlineProps {
  /** Current chunk text */
  text: string;
  /** Save handler */
  onSave: (text: string) => Promise<void>;
  /** Cancel handler */
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Inline editing for a chunk's text content.
 *
 * @param props - Component props
 * @returns React element
 */
const ChunkEditInline: React.FC<ChunkEditInlineProps> = ({
  text,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(text);
  const [saving, setSaving] = useState(false);

  /**
   * Handle save.
   */
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        className="font-mono text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X size={14} className="mr-1" />
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Check size={14} className="mr-1" />
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
};

export default ChunkEditInline;
