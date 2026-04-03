/**
 * @fileoverview Individual chunk result card for retrieval test.
 *
 * @module features/datasets/components/ChunkResultCard
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
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
 * @description Displays a single retrieval test result chunk with rank badge,
 * relevance score, document name, token count, and truncated text preview.
 *
 * @param {ChunkResultCardProps} props - Component properties
 * @returns {JSX.Element} Rendered chunk result card
 */
const ChunkResultCard: React.FC<ChunkResultCardProps> = ({ chunk, index }) => {
  const { t } = useTranslation();

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardContent className="p-4">
        {/* Header with rank and document name */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">#{index}</Badge>
            {chunk.doc_name && (
              <span className="text-xs text-muted-foreground">{chunk.doc_name}</span>
            )}
          </div>
        </div>

        {/* Score breakdown with overall, vector, and term scores */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
          <div className="flex items-center gap-1">
            <span>{t('retrievalTest.overallScore', 'Overall')}:</span>
            <Badge variant="default" className="text-xs">{(chunk.score * 100).toFixed(1)}%</Badge>
          </div>
          {chunk.vector_similarity !== undefined && (
            <div className="flex items-center gap-1">
              <span>{t('retrievalTest.vectorScore', 'Vector')}:</span>
              <Badge variant="secondary" className="text-xs">{(chunk.vector_similarity * 100).toFixed(1)}%</Badge>
            </div>
          )}
          {chunk.term_similarity !== undefined && (
            <div className="flex items-center gap-1">
              <span>{t('retrievalTest.termScore', 'Term')}:</span>
              <Badge variant="outline" className="text-xs">{(chunk.term_similarity * 100).toFixed(1)}%</Badge>
            </div>
          )}
          {chunk.token_count !== undefined && (
            <span>{chunk.token_count} {t('retrievalTest.tokens', 'tokens')}</span>
          )}
        </div>

        {/* Highlighted text — sanitized with DOMPurify (only <mark> tags allowed) to prevent XSS */}
        {chunk.highlight ? (
          <p
            className="text-sm text-slate-700 dark:text-slate-300 mt-2 line-clamp-6"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(chunk.highlight, { ALLOWED_TAGS: ['mark'] }),
            }}
          />
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap mt-2 line-clamp-6">
            {chunk.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ChunkResultCard;
