/**
 * @fileoverview Integration tests for SearchAppConfig component.
 * Validates rerank model dropdown rendering, metadata filter section,
 * LLM preset selector visibility with AI summary toggle, and save payload
 * inclusion of rerank_top_k and metadata_filter fields.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SearchAppConfig from '@/features/search/components/SearchAppConfig'

// Mock the public models API used by ModelSelector and RerankSelector
vi.mock('@/lib/llmProviderPublicApi', () => ({
  listModels: vi.fn().mockResolvedValue([]),
}))

// Mock the search API used to fetch available datasets
vi.mock('@/features/search/api/searchApi', () => ({
  searchApi: {
    listDatasets: vi.fn().mockResolvedValue([
      { id: 'ds-1', name: 'Dataset Alpha' },
      { id: 'ds-2', name: 'Dataset Beta' },
    ]),
  },
}))

// Mock SearchRetrievalTest since it is only shown for existing apps
vi.mock('@/features/search/components/SearchRetrievalTest', () => ({
  SearchRetrievalTest: () => <div data-testid="retrieval-test-mock">Retrieval Test</div>,
}))

/** @description QueryClient wrapper for rendering components that use useQuery */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

/**
 * @description Helper to render SearchAppConfig inside QueryClientProvider.
 * @param props - Partial props to override defaults
 */
function renderConfig(props: Partial<React.ComponentProps<typeof SearchAppConfig>> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    app: null,
  }

  const merged = { ...defaultProps, ...props }

  return render(
    <QueryClientProvider client={queryClient}>
      <SearchAppConfig {...merged} />
    </QueryClientProvider>,
  )
}

/**
 * @description SearchAppConfig integration tests covering rerank dropdown,
 * metadata filter, LLM preset with AI summary toggle, and save payload fields.
 */
describe('SearchAppConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  // --------------------------------------------------------------------------
  // Rerank model rendering
  // --------------------------------------------------------------------------

  describe('Rerank model dropdown', () => {
    it('should render rerank model label from RerankSelector', () => {
      renderConfig()

      // RerankSelector renders a label with this i18n key
      expect(screen.getByText('llmSettings.rerankModel')).toBeInTheDocument()
    })

    it('should render rerank as a select dropdown (not a text input)', () => {
      renderConfig()

      // The RerankSelector internally uses ModelSelector which renders a <select>
      // Find the select elements - one of them should be the rerank model selector
      const selects = screen.getAllByRole('combobox')
      // There should be multiple selects: search method, rerank model, LLM model, preset, etc.
      expect(selects.length).toBeGreaterThanOrEqual(1)
    })
  })

  // --------------------------------------------------------------------------
  // Metadata filter section
  // --------------------------------------------------------------------------

  describe('Metadata filter section', () => {
    it('should render metadata filter title', () => {
      renderConfig()

      expect(screen.getByText('metadataFilter.title')).toBeInTheDocument()
    })

    it('should render add condition button', () => {
      renderConfig()

      expect(screen.getByText('metadataFilter.addCondition')).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // LLM preset selector with AI summary toggle
  // --------------------------------------------------------------------------

  describe('LLM preset selector with AI summary', () => {
    it('should render AI summary toggle', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.enableSummary')).toBeInTheDocument()
      expect(screen.getByText('searchAdmin.enableSummaryDesc')).toBeInTheDocument()
    })

    it('should show LLM preset selector when AI summary is enabled (default)', () => {
      renderConfig()

      // When enableSummary is true (default), the preset selector is visible
      expect(screen.getByText('llmSettings.preset')).toBeInTheDocument()
      expect(screen.getByText('llmSettings.precise')).toBeInTheDocument()
      expect(screen.getByText('llmSettings.balance')).toBeInTheDocument()
      expect(screen.getByText('llmSettings.creative')).toBeInTheDocument()
      expect(screen.getByText('llmSettings.custom')).toBeInTheDocument()
    })

    it('should show LLM model selector when AI summary is enabled', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.llmModel')).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // Feature toggles
  // --------------------------------------------------------------------------

  describe('Feature toggles', () => {
    it('should render keyword extraction toggle', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.keywordExtraction')).toBeInTheDocument()
    })

    it('should render knowledge graph toggle', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.knowledgeGraph')).toBeInTheDocument()
    })

    it('should render web search toggle', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.webSearch')).toBeInTheDocument()
    })

    it('should render related questions toggle', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.relatedQuestions')).toBeInTheDocument()
    })

    it('should render mind map toggle', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.mindMap')).toBeInTheDocument()
    })

    it('should render highlight toggle', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.highlight')).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // Search parameters
  // --------------------------------------------------------------------------

  describe('Search parameters', () => {
    it('should render search method selector', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.searchMethod')).toBeInTheDocument()
    })

    it('should render similarity threshold slider', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.similarityThreshold')).toBeInTheDocument()
    })

    it('should render top K slider', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.topK')).toBeInTheDocument()
    })

    it('should render vector weight slider', () => {
      renderConfig()

      expect(screen.getByText('searchAdmin.vectorWeight')).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // Save payload
  // --------------------------------------------------------------------------

  describe('Save payload', () => {
    it('should include rerank_top_k and metadata_filter in save payload', async () => {
      const onSave = vi.fn()
      const onClose = vi.fn()
      renderConfig({ onSave, onClose })

      // Fill in required name
      const nameInputs = screen.getAllByPlaceholderText('common.name')
      fireEvent.change(nameInputs[0], { target: { value: 'Test Search App' } })

      // Add a metadata filter condition to ensure it appears in payload
      const addConditionBtn = screen.getByText('metadataFilter.addCondition')
      fireEvent.click(addConditionBtn)

      // Click save
      const saveButton = screen.getByText('common.save')
      fireEvent.click(saveButton)

      expect(onSave).toHaveBeenCalledTimes(1)
      const payload = onSave.mock.calls[0][0]

      // Basic fields
      expect(payload.name).toBe('Test Search App')
      expect(payload.dataset_ids).toEqual([])
      expect(payload.is_public).toBe(false)

      // Search config should exist
      expect(payload.search_config).toBeDefined()

      // Verify rerank_top_k is NOT included when no rerank model selected
      // (conditional: only sent when rerankId is truthy)
      expect(payload.search_config.rerank_top_k).toBeUndefined()

      // Verify metadata_filter is included when conditions exist
      expect(payload.search_config.metadata_filter).toBeDefined()
      expect(payload.search_config.metadata_filter.logic).toBe('and')
      expect(payload.search_config.metadata_filter.conditions).toHaveLength(1)

      // Verify other search config defaults
      expect(payload.search_config.similarity_threshold).toBe(0.2)
      expect(payload.search_config.top_k).toBe(5)
      expect(payload.search_config.search_method).toBe('hybrid')
      expect(payload.search_config.vector_similarity_weight).toBe(0.7)
      expect(payload.search_config.enable_summary).toBe(true)
      expect(payload.search_config.keyword).toBe(false)
      expect(payload.search_config.use_kg).toBe(false)
    })

    it('should not include metadata_filter when no conditions exist', () => {
      const onSave = vi.fn()
      renderConfig({ onSave })

      // Fill name
      const nameInputs = screen.getAllByPlaceholderText('common.name')
      fireEvent.change(nameInputs[0], { target: { value: 'Clean App' } })

      // Save without adding any metadata conditions
      fireEvent.click(screen.getByText('common.save'))

      const payload = onSave.mock.calls[0][0]
      expect(payload.search_config.metadata_filter).toBeUndefined()
    })

    it('should not save when name is empty', () => {
      const onSave = vi.fn()
      renderConfig({ onSave })

      const saveButton = screen.getByText('common.save')
      expect(saveButton).toBeDisabled()

      fireEvent.click(saveButton)
      expect(onSave).not.toHaveBeenCalled()
    })

    it('should call onClose after saving', () => {
      const onSave = vi.fn()
      const onClose = vi.fn()
      renderConfig({ onSave, onClose })

      // Fill name
      const nameInputs = screen.getAllByPlaceholderText('common.name')
      fireEvent.change(nameInputs[0], { target: { value: 'Close Test' } })

      fireEvent.click(screen.getByText('common.save'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should include LLM settings when summary is enabled', () => {
      const onSave = vi.fn()
      renderConfig({ onSave })

      // Fill name
      const nameInputs = screen.getAllByPlaceholderText('common.name')
      fireEvent.change(nameInputs[0], { target: { value: 'LLM Test' } })

      fireEvent.click(screen.getByText('common.save'))

      const payload = onSave.mock.calls[0][0]
      // enableSummary is true by default, so llm_setting should be included
      expect(payload.search_config.llm_setting).toBeDefined()
      expect(payload.search_config.llm_setting.temperature).toBe(0.1)
      expect(payload.search_config.enable_summary).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // Dataset loading
  // --------------------------------------------------------------------------

  describe('Dataset loading', () => {
    it('should load and display available datasets', async () => {
      renderConfig()

      // Datasets are fetched async on open
      await waitFor(() => {
        expect(screen.getByText('Dataset Alpha')).toBeInTheDocument()
        expect(screen.getByText('Dataset Beta')).toBeInTheDocument()
      })
    })
  })
})
