/**
 * @fileoverview Individual chunk result card for retrieval test.
 *
 * @module features/datasets/components/ChunkResultCard
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { RetrievalChunk } from '../types';

// ============================================================================
// Types
// ============================================================================

interface ChunkResultCardProps {
  /** The chunk result to display */
  chunk: RetrievalChunk;
  /** 1-based index */
  index: number;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Displays a single retrieval test result chunk.
 *
 * @param props - Component props
 * @returns React element
 */
const ChunkResultCard: React.FC<ChunkResultCardProps> = ({ chunk, index }) => {
  const { t } = useTranslation();

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardContent className="p-4">
        {/* Header with rank and score */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">#{index}</Badge>
            {chunk.doc_name && (
              <span className="text-xs text-muted-foreground">{chunk.doc_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {t('datasetSettings.retrieval.score')}: {(chunk.score * 100).toFixed(1)}%
            </Badge>
            {chunk.token_count != null && (
              <span className="text-xs text-muted-foreground">
                {chunk.token_count} tokens
              </span>
            )}
          </div>
        </div>

        {/* Chunk text */}
        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-6">
          {chunk.text}
        </p>
      </CardContent>
    </Card>
  );
};

export default ChunkResultCard;
