import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Edit2, Trash2, Check, X } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Chunk } from '@/features/datasets/types';

interface ChunkCardProps {
  chunk: Chunk;
  index: number;
  isSelected?: boolean | undefined;
  onClick?: ((chunk: Chunk) => void) | undefined;
  onUpdate?: ((chunkId: string, text: string) => Promise<void>) | undefined;
  onDelete?: ((chunkId: string) => Promise<void>) | undefined;
}

const ChunkCard: React.FC<ChunkCardProps> = ({ chunk, index, isSelected, onClick, onUpdate, onDelete }) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(chunk.text);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdate || !editText.trim()) return;
    setSaving(true);
    try {
      await onUpdate(chunk.chunk_id, editText);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditText(chunk.text);
    setIsEditing(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm group flex flex-col ${
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-400'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
      onClick={() => onClick?.(chunk)}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400">
          {index + 1}
        </span>
        {chunk.page_num && chunk.page_num.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <FileText size={12} />
            p.{chunk.page_num.join(', ')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onUpdate && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-500 hover:text-primary-600"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              <Edit2 size={12} />
            </Button>
          )}
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
      {isEditing ? (
        <div className="flex flex-col gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[100px] text-sm"
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
        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-4 whitespace-pre-wrap break-words mt-1">
          {chunk.text}
        </p>
      )}
    </div>
  );
};

export default ChunkCard;
