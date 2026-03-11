/**
 * @fileoverview Chunk table with content preview, source doc, and actions.
 *
 * @module features/datasets/components/ChunkTable
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2 } from 'lucide-react';
import type { Chunk } from '../types';
import ChunkEditInline from './ChunkEditInline';

// ============================================================================
// Types
// ============================================================================

interface ChunkTableProps {
  /** List of chunks */
  chunks: Chunk[];
  /** Whether loading */
  loading: boolean;
  /** Update chunk handler */
  onUpdate: (chunkId: string, text: string) => Promise<void>;
  /** Delete chunk handler */
  onDelete: (chunkId: string) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Table displaying dataset chunks with inline edit and delete.
 *
 * @param props - Component props
 * @returns React element
 */
const ChunkTable: React.FC<ChunkTableProps> = ({
  chunks,
  loading,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('common.loading')}
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('datasetSettings.chunks.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {chunks.map((chunk) => (
        <div
          key={chunk.chunk_id}
          className="border rounded-lg p-3 dark:border-slate-700"
        >
          {editingId === chunk.chunk_id ? (
            <ChunkEditInline
              text={chunk.text}
              onSave={async (text) => {
                await onUpdate(chunk.chunk_id, text);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              {/* Chunk header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {chunk.doc_name && (
                    <Badge variant="secondary" className="text-xs">
                      {chunk.doc_name}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditingId(chunk.chunk_id)}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => {
                      if (window.confirm(t('datasetSettings.chunks.confirmDelete'))) {
                        onDelete(chunk.chunk_id);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>

              {/* Chunk text preview */}
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">
                {chunk.text}
              </p>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default ChunkTable;
