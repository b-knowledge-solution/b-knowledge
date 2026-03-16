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
import { TagEditor } from '@/components/ui/tag-editor';

// ============================================================================
// Types
// ============================================================================

interface AddChunkModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Submit handler with content, keywords, and questions */
  onSubmit: (data: { content: string; important_keywords?: string[]; question_keywords?: string[] }) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal dialog for adding a manual text chunk to a dataset.
 * Provides a textarea for entering chunk content with save/cancel controls.
 *
 * @param {AddChunkModalProps} props - Component properties
 * @returns {JSX.Element} Rendered modal dialog
 */
const AddChunkModal: React.FC<AddChunkModalProps> = ({ open, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  /**
   * @description Submit the chunk text and close the modal on success.
   */
  const handleSubmit = async () => {
    // Guard against empty content submission
    if (!text.trim()) return;
    setSaving(true);
    try {
      // Build payload with content and optional keyword/question arrays
      await onSubmit({
        content: text,
        ...(keywords.length > 0 ? { important_keywords: keywords } : {}),
        ...(questions.length > 0 ? { question_keywords: questions } : {}),
      });
      setText('');
      setKeywords([]);
      setQuestions([]);
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
          <TagEditor
            value={keywords}
            onChange={setKeywords}
            label={t('datasetSettings.chunks.keywords')}
            placeholder={t('datasetSettings.chunks.keywordsPlaceholder')}
            variant="secondary"
          />
          <TagEditor
            value={questions}
            onChange={setQuestions}
            label={t('datasetSettings.chunks.questions')}
            placeholder={t('datasetSettings.chunks.questionsPlaceholder')}
            variant="outline"
          />
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
