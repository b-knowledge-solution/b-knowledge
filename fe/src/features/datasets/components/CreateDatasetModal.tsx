import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Dataset } from '../types';
import { PARSER_OPTIONS, LANGUAGE_OPTIONS } from '../types';
import type { DatasetFormData } from '../api/datasetQueries';

interface CreateDatasetModalProps {
  open: boolean;
  editingDataset: Dataset | null;
  submitting: boolean;
  formData: DatasetFormData;
  setFormField: <K extends keyof DatasetFormData>(key: K, value: DatasetFormData[K]) => void;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}

const CreateDatasetModal: React.FC<CreateDatasetModalProps> = ({
  open,
  editingDataset,
  submitting,
  formData,
  setFormField,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onCancel()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {editingDataset ? t('datasets.editTitle') : t('datasets.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex flex-col gap-4">
          <div>
            <Label>{t('datasets.name')} *</Label>
            <Input
              placeholder={t('datasets.namePlaceholder')}
              value={formData.name}
              onChange={(e) => setFormField('name', e.target.value)}
              maxLength={128}
              required
            />
          </div>

          <div>
            <Label>{t('datasets.description')}</Label>
            <textarea
              rows={2}
              placeholder={t('datasets.descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => setFormField('description', e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('datasets.language')}</Label>
              <Select value={formData.language} onValueChange={(v: string) => setFormField('language', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('datasets.chunkMethod')}</Label>
              <Select value={formData.parser_id} onValueChange={(v: string) => setFormField('parser_id', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARSER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '...' : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateDatasetModal;
