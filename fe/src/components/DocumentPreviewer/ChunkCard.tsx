/**
 * @fileoverview Individual chunk card component for the document previewer.
 * Displays chunk text with inline editing and deletion capabilities.
 *
 * @module components/DocumentPreviewer/ChunkCard
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Edit2, Trash2, Check, X } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { TagEditor } from '@/components/ui/tag-editor';
import { cn } from '@/lib/utils';
import type { Chunk } from '@/features/datasets/types';

/**
 * @description Props for the ChunkCard component.
 */
interface ChunkCardProps {
  /** Chunk data including text, page numbers, and ID */
  chunk: Chunk;
  /** Zero-based display index for numbering */
  index: number;
  /** Whether this chunk is currently selected */
  isSelected?: boolean | undefined;
  /** Callback when the card is clicked */
  onClick?: ((chunk: Chunk) => void) | undefined;
  /** Callback to update chunk content, keywords, and questions (enables edit mode) */
  onUpdate?: ((chunkId: string, data: { content?: string; important_keywords?: string[]; question_keywords?: string[] }) => Promise<void>) | undefined;
  /** Callback to delete a chunk (enables delete button) */
  onDelete?: ((chunkId: string) => Promise<void>) | undefined;
  /** Callback to toggle chunk availability (enables switch) */
  onToggle?: ((chunkId: string, available: boolean) => Promise<void>) | undefined;
}

/**
 * @description Displays a single chunk card with text preview, inline editing, and delete actions
 * @param {ChunkCardProps} props - Chunk data, index, selection state, and action callbacks
 * @returns {JSX.Element} Rendered chunk card with hover actions
 */
const ChunkCard: React.FC<ChunkCardProps> = ({ chunk, index, isSelected, onClick, onUpdate, onDelete, onToggle }) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(chunk.text);
  const [editKeywords, setEditKeywords] = useState<string[]>(chunk.important_kwd ?? []);
  const [editQuestions, setEditQuestions] = useState<string[]>(chunk.question_kwd ?? []);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  /** Toggle chunk availability via the onToggle callback */
  const handleToggle = async (checked: boolean) => {
    if (!onToggle || toggling) return;
    setToggling(true);
    try {
      await onToggle(chunk.chunk_id, checked);
    } finally {
      setToggling(false);
    }
  };

  /** Reset edit state from current chunk props and enter edit mode */
  const handleStartEdit = () => {
    setEditText(chunk.text);
    setEditKeywords(chunk.important_kwd ?? []);
    setEditQuestions(chunk.question_kwd ?? []);
    setIsEditing(true);
  };

  /** Save edited chunk text via the onUpdate callback */
  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Guard: skip save if no handler or text is empty
    if (!onUpdate || !editText.trim()) return;
    setSaving(true);
    try {
      // Send content and keyword/question updates together
      await onUpdate(chunk.chunk_id, {
        content: editText,
        important_keywords: editKeywords,
        question_keywords: editQuestions,
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  /** Cancel editing and revert all fields to original values */
  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditText(chunk.text);
    setEditKeywords(chunk.important_kwd ?? []);
    setEditQuestions(chunk.question_kwd ?? []);
    setIsEditing(false);
  };

  /** Delete chunk after user confirmation */
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Guard: skip if no delete handler provided
    if (!onDelete) return;
    // Show styled confirmation dialog before deleting chunk
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('common.confirmDelete', 'Are you sure you want to delete this item?'),
      variant: 'danger',
      confirmText: t('common.delete'),
    });
    if (confirmed) {
      await onDelete(chunk.chunk_id);
    }
  };

  return (
    <div
      // Highlight the card border when selected; dim disabled chunks
      className={cn(
        'p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm group flex flex-col',
        isSelected
          ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/30'
          : 'border-border hover:border-primary/50',
        chunk.available === false && 'opacity-50',
      )}
      onClick={() => onClick?.(chunk)}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400">
          {index + 1}
        </span>
        {/* Display page number badges when available */}
        {chunk.page_num && chunk.page_num.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <FileText size={12} />
            p.{chunk.page_num.join(', ')}
          </span>
        )}
        {/* Action buttons visible on hover */}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Toggle chunk availability when onToggle is provided */}
          {onToggle && !isEditing && (
            <div onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={chunk.available !== false}
                disabled={toggling}
                onCheckedChange={handleToggle}
                className="scale-75"
              />
            </div>
          )}
          {/* Show edit button only when onUpdate handler is provided and not already editing */}
          {onUpdate && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-500 hover:text-primary-600"
              onClick={(e) => {
                e.stopPropagation();
                handleStartEdit();
              }}
            >
              <Edit2 size={12} />
            </Button>
          )}
          {/* Show delete button only when onDelete handler is provided and not editing */}
          {onDelete && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-500 hover:text-red-600"
              onClick={handleDelete}
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      </div>
      {/* Toggle between edit textarea and read-only text display */}
      {isEditing ? (
        <div className="flex flex-col gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[100px] text-sm"
          />
          <TagEditor
            value={editKeywords}
            onChange={setEditKeywords}
            label={t('datasetSettings.chunks.keywords')}
            placeholder={t('datasetSettings.chunks.keywordsPlaceholder')}
            variant="secondary"
          />
          <TagEditor
            value={editQuestions}
            onChange={setEditQuestions}
            label={t('datasetSettings.chunks.questions')}
            placeholder={t('datasetSettings.chunks.questionsPlaceholder')}
            variant="outline"
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
              <X size={14} className="mr-1" />
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !editText.trim()}>
              <Check size={14} className="mr-1" />
              {t('common.save', 'Save')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-4 whitespace-pre-wrap break-words mt-1">
            {chunk.text}
          </p>
          {/* Display keyword and question badges in view mode */}
          {(chunk.important_kwd?.length || chunk.question_kwd?.length) ? (
            <div className="flex flex-wrap gap-1 mt-2">
              {chunk.important_kwd?.map((kw, i) => (
                <Badge key={`kw-${i}`} variant="secondary" className="text-xs">{kw}</Badge>
              ))}
              {chunk.question_kwd?.map((q, i) => (
                <Badge key={`q-${i}`} variant="outline" className="text-xs">{q}</Badge>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default ChunkCard;
