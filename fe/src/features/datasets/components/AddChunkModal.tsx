/**
 * @fileoverview Modal to add a manual chunk to a dataset.
 *
 * @module features/datasets/components/AddChunkModal
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// ============================================================================
// Types
// ============================================================================

interface AddChunkModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Submit handler */
  onSubmit: (text: string) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal for adding a manual text chunk.
 *
 * @param props - Component props
 * @returns React element
 */
const AddChunkModal: React.FC<AddChunkModalProps> = ({ open, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * Handle submit.
   */
  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSubmit(text);
      setText('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('datasetSettings.chunks.addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('datasetSettings.chunks.content')}</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={t('datasetSettings.chunks.contentPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !text.trim()}>
            {t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddChunkModal;
