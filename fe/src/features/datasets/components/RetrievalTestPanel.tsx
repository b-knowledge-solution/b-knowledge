/**
 * @fileoverview Retrieval test panel for dataset settings drawer.
 *
 * Query input, method selector, and results list.
 *
 * @module features/datasets/components/RetrievalTestPanel
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Search } from 'lucide-react';
import { useRetrievalTest } from '../hooks/useRetrievalTest';
import ChunkResultCard from './ChunkResultCard';

// ============================================================================
// Types
// ============================================================================

interface RetrievalTestPanelProps {
  /** Dataset ID */
  datasetId: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Panel for running retrieval tests.
 *
 * @param props - Component props
 * @returns React element
 */
const RetrievalTestPanel: React.FC<RetrievalTestPanelProps> = ({ datasetId }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('hybrid');
  const [topK, setTopK] = useState(5);

  const { results, testing, runTest } = useRetrievalTest(datasetId);

  /**
   * Handle running the test.
   */
  const handleTest = () => {
    if (!query.trim()) return;
    runTest({ query, method, top_k: topK });
  };

  return (
    <div className="space-y-4">
      {/* Query input */}
      <div className="space-y-1.5">
        <Label>{t('datasetSettings.retrieval.query')}</Label>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('datasetSettings.retrieval.queryPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && handleTest()}
          />
          <Button onClick={handleTest} disabled={testing || !query.trim()}>
            <Search size={16} className="mr-1" />
            {t('datasetSettings.retrieval.run')}
          </Button>
        </div>
      </div>

      {/* Config row */}
      <div className="flex gap-4">
        <div className="space-y-1.5 flex-1">
          <Label>{t('datasetSettings.retrieval.method')}</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hybrid">{t('search.method.hybrid')}</SelectItem>
              <SelectItem value="semantic">{t('search.method.semantic')}</SelectItem>
              <SelectItem value="fulltext">{t('search.method.fulltext')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 w-24">
          <Label>{t('datasetSettings.retrieval.topK')}</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Results */}
      <div className="space-y-3 pt-2">
        {testing ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={32} />
          </div>
        ) : results.length > 0 ? (
          results.map((chunk, idx) => (
            <ChunkResultCard key={chunk.chunk_id} chunk={chunk} index={idx + 1} />
          ))
        ) : query ? (
          <EmptyState title={t('datasetSettings.retrieval.noResults')} />
        ) : (
          <div className="text-center text-sm text-muted-foreground py-8">
            {t('datasetSettings.retrieval.hint')}
          </div>
        )}
      </div>
    </div>
  );
};

export default RetrievalTestPanel;
