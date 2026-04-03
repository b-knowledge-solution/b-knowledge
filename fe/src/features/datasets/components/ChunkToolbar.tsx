/**
 * @fileoverview Toolbar for the chunk detail page with chunk count, search,
 * sort, and add chunk controls.
 *
 * @module features/datasets/components/ChunkToolbar
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import AddChunkModal from './AddChunkModal'

/**
 * @description Props for the ChunkToolbar component.
 */
interface ChunkToolbarProps {
  /** Dataset ID for the add chunk modal */
  datasetId: string
  /** Document ID for the add chunk modal */
  docId: string
  /** Total number of chunks */
  chunkCount: number
  /** Callback when search query changes */
  onSearch: (query: string) => void
  /** Callback when sort order changes */
  onSortChange: (sort: string) => void
  /** Callback to add a new chunk */
  onAddChunk: (data: { content: string; important_keywords?: string[]; question_keywords?: string[] }) => Promise<void>
}

/**
 * @description Compact toolbar with chunk count badge, search input, sort select, and add chunk button
 * @param {ChunkToolbarProps} props - Toolbar configuration
 * @returns {JSX.Element} Rendered toolbar row
 */
const ChunkToolbar: React.FC<ChunkToolbarProps> = ({
  datasetId: _datasetId,
  docId: _docId,
  chunkCount,
  onSearch,
  onSortChange,
  onAddChunk,
}) => {
  const { t } = useTranslation()
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  /** Handle search input changes with debounce-friendly callback */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
    onSearch(e.target.value)
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b bg-background">
      {/* Chunk count badge */}
      <Badge variant="secondary" className="text-xs shrink-0">
        {chunkCount} {t('datasets.chunks')}
      </Badge>

      {/* Search input */}
      <div className="relative flex-1 max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('datasetSettings.chunks.searchPlaceholder', 'Search chunks...')}
          value={searchValue}
          onChange={handleSearchChange}
          className="pl-8 h-7 text-xs"
        />
      </div>

      {/* Sort select */}
      <Select defaultValue="position" onValueChange={onSortChange}>
        <SelectTrigger className="w-[120px] h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="position">{t('datasets.sortByPosition', 'Position')}</SelectItem>
          <SelectItem value="relevance">{t('datasets.sortByRelevance', 'Relevance')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Add chunk button */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setAddModalOpen(true)}
      >
        <Plus size={14} className="mr-1" />
        {t('datasets.addChunk', 'Add Chunk')}
      </Button>

      {/* Add chunk modal */}
      <AddChunkModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={onAddChunk}
      />
    </div>
  )
}

export default ChunkToolbar
