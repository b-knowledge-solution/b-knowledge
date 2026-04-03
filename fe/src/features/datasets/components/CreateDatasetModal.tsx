import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Brain, Users, Globe, Lock } from 'lucide-react';
import type { Dataset } from '../types';
import { PARSER_OPTIONS, LANGUAGE_OPTIONS } from '../types';
import type { DatasetFormData } from '../api/datasetQueries';
import { useProviders } from '@/features/llm-provider/api/llmProviderQueries';
import { ModelType } from '@/constants';

/**
 * @description Props for the CreateDatasetModal component.
 */
interface CreateDatasetModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** The dataset being edited, or null for creation mode */
  editingDataset: Dataset | null;
  /** Whether the form is currently submitting */
  submitting: boolean;
  /** Current form field values */
  formData: DatasetFormData;
  /** Callback to update a single form field */
  setFormField: <K extends keyof DatasetFormData>(key: K, value: DatasetFormData[K]) => void;
  /** Callback to submit the form */
  onSubmit: () => Promise<void>;
  /** Callback to cancel and close the modal */
  onCancel: () => void;
}

/**
 * @description Modal dialog for creating or editing a dataset.
 * Includes fields for name, embedding model, parse type, language,
 * page rank, and authorization settings.
 *
 * @param {CreateDatasetModalProps} props - Component properties
 * @returns {JSX.Element} Rendered create/edit dataset modal
 */
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
  // Fetch available LLM providers to populate embedding model dropdown
  const { data: providers } = useProviders();
  // Filter providers to only show embedding-type models
  const embeddingModels = providers?.filter((p) => p.model_type === ModelType.EMBEDDING) || [];

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onCancel()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {editingDataset ? t('datasets.editTitle') : 'Create dataset'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex flex-col gap-6 py-2">
          
          {/* 1. Name */}
          <div className="space-y-1.5">
            <Label className="text-red-500 flex items-center gap-1">
              * <span className="text-foreground">{t('datasets.name')}</span>
            </Label>
            <Input
              placeholder={t('datasets.namePlaceholder') || 'test'}
              value={formData.name}
              onChange={(e) => setFormField('name', e.target.value)}
              maxLength={128}
              required
            />
          </div>

          {/* 2. Embedding Model */}
          <div className="space-y-1.5">
            <Label className="text-red-500 flex items-center gap-1">
              * <span className="text-foreground">{t('datasets.embeddingModel')}</span>
            </Label>
            <Select
              value={formData.embedding_model || 'default'}
              onValueChange={(v: string) => setFormField('embedding_model', v === 'default' ? '' : v)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder={t('datasets.systemDefault')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    {t('datasets.systemDefault')}
                  </div>
                </SelectItem>
                {embeddingModels.map((m) => (
                  <SelectItem key={m.model_name} value={m.model_name}>
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" />
                      {m.model_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. Parse Type */}
          <div className="space-y-3">
            <Label>Parse type</Label>
            <RadioGroup defaultValue="builtin" className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="builtin" id="builtin" />
                <Label htmlFor="builtin" className="font-normal">Built-in</Label>
              </div>
              <div className="flex items-center space-x-2 opacity-50">
                <RadioGroupItem value="pipeline" id="pipeline" disabled />
                <Label htmlFor="pipeline" className="font-normal text-muted-foreground">Choose pipeline</Label>
              </div>
            </RadioGroup>

            {/* Built-in Parser Selector */}
            <div className="space-y-1.5 pt-2">
              <Label className="text-red-500 flex items-center gap-1">
                * <span className="text-foreground">Built-in</span>
              </Label>
              <Select value={formData.parser_id} onValueChange={(v: string) => setFormField('parser_id', v)}>
                <SelectTrigger className="h-10">
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
          
          <div className="grid grid-cols-2 gap-4">
             {/* Language - Optional but keep since it exists */}
             <div className="space-y-1.5">
              <Label>{t('datasets.language')}</Label>
              <Select value={formData.language} onValueChange={(v: string) => setFormField('language', v)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
             {/* Page Rank */}
             <div className="space-y-1.5">
              <Label>Page Rank</Label>
              <Input
                type="number"
                min={0}
                value={formData.pagerank || 0}
                className="h-10"
                onChange={(e) => setFormField('pagerank', Number(e.target.value))}
                placeholder="0"
              />
            </div>
          </div>

          {/* 4. Authorization */}
          {!editingDataset && (
            <div className="space-y-3 pt-2">
              <Label>Authorization</Label>
              <RadioGroup 
                value={formData.permission} 
                onValueChange={(v: 'me' | 'workspace' | 'specific') => setFormField('permission', v)}
                className="flex flex-col gap-3"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="me" id="auth-me" />
                  <Label htmlFor="auth-me" className="flex items-center gap-2 font-normal cursor-pointer">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    Only me
                  </Label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="workspace" id="auth-workspace" />
                  <Label htmlFor="auth-workspace" className="flex items-center gap-2 font-normal cursor-pointer">
                    <Globe className="w-4 h-4 text-green-500" />
                    All workspace members
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="specific" id="auth-specific" />
                  <Label htmlFor="auth-specific" className="flex items-center gap-2 font-normal cursor-pointer">
                    <Users className="w-4 h-4 text-blue-500" />
                    Specific members
                  </Label>
                </div>
              </RadioGroup>
              
              {formData.permission === 'specific' && (
                <div className="pl-7 pt-1 text-sm text-amber-500">
                  You can assign specific users/teams using the "Manage Access" dialog after dataset creation.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
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
