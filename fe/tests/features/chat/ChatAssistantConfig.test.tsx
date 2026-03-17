/**
 * @fileoverview Integration tests for ChatAssistantConfig component.
 * Validates section rendering, feature toggle switches, retrieval sliders,
 * LLM preset selector, empty response textarea, and save payload construction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ChatAssistantConfig from '@/features/chat/components/ChatAssistantConfig'

// Mock the public models API used by ModelSelector
vi.mock('@/lib/llmProviderPublicApi', () => ({
  listModels: vi.fn().mockResolvedValue([]),
}))

// Mock searchApi used by SearchAppConfig (not needed here but keeps imports clean)
vi.mock('@/features/search/api/searchApi', () => ({
  searchApi: { listDatasets: vi.fn().mockResolvedValue([]) },
}))

// Mock headlessui Switch used inside ChatVariableForm
vi.mock('@headlessui/react', () => ({
  Switch: ({ checked, onChange, children, ...props }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      {...props}
    >
      {children ?? (checked ? 'On' : 'Off')}
    </button>
  ),
}))

/** @description QueryClient wrapper for rendering components that use useQuery */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

/**
 * @description Helper to render the component inside QueryClientProvider.
 * @param props - Partial props to override defaults
 */
function renderConfig(props: Partial<React.ComponentProps<typeof ChatAssistantConfig>> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    dialog: null,
    datasets: [
      { id: 'kb-1', name: 'Dataset A' },
      { id: 'kb-2', name: 'Dataset B' },
    ],
  }

  const merged = { ...defaultProps, ...props }

  return render(
    <QueryClientProvider client={queryClient}>
      <ChatAssistantConfig {...merged} />
    </QueryClientProvider>,
  )
}

/**
 * @description ChatAssistantConfig integration tests covering rendering,
 * feature toggles, sliders, LLM presets, empty response, and save payload.
 */
describe('ChatAssistantConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  // --------------------------------------------------------------------------
  // Section rendering
  // --------------------------------------------------------------------------

  describe('Section rendering', () => {
    it('should render all 3 sections: Basic Information, Prompt Configuration, LLM Model Settings', () => {
      renderConfig()

      // Section headings are rendered using i18n keys
      expect(screen.getByText('chatSettings.basicInfo')).toBeInTheDocument()
      expect(screen.getByText('chatSettings.promptConfig')).toBeInTheDocument()
      expect(screen.getByText('chatSettings.llmConfig')).toBeInTheDocument()
    })

    it('should render name and description inputs', () => {
      renderConfig()

      // Name field has a required marker
      expect(screen.getByText('common.name')).toBeInTheDocument()
      expect(screen.getByText('common.description')).toBeInTheDocument()
    })

    it('should render knowledge base selection', () => {
      renderConfig()

      expect(screen.getByText('chat.knowledgeBases')).toBeInTheDocument()
      expect(screen.getByText('Dataset A')).toBeInTheDocument()
      expect(screen.getByText('Dataset B')).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // Feature toggle switches
  // --------------------------------------------------------------------------

  describe('Feature toggle switches', () => {
    it('should render Quote/Citation toggle', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.quote')).toBeInTheDocument()
      expect(screen.getByText('chatSettings.quoteDesc')).toBeInTheDocument()
    })

    it('should render Keyword toggle', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.keyword')).toBeInTheDocument()
      expect(screen.getByText('chatSettings.keywordDesc')).toBeInTheDocument()
    })

    it('should render TTS toggle', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.tts')).toBeInTheDocument()
      expect(screen.getByText('chatSettings.ttsDesc')).toBeInTheDocument()
    })

    it('should render TOC Enhance toggle', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.tocEnhance')).toBeInTheDocument()
      expect(screen.getByText('chatSettings.tocEnhanceDesc')).toBeInTheDocument()
    })

    it('should render Reasoning toggle', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.reasoning')).toBeInTheDocument()
      expect(screen.getByText('chatSettings.reasoningDesc')).toBeInTheDocument()
    })

    it('should render Multi-turn Refinement toggle', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.refineMultiturn')).toBeInTheDocument()
      expect(screen.getByText('chatSettings.refineMultiturnDesc')).toBeInTheDocument()
    })

    it('should render Knowledge Graph toggle', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.useKg')).toBeInTheDocument()
      expect(screen.getByText('chatSettings.useKgDesc')).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // Retrieval sliders
  // --------------------------------------------------------------------------

  describe('Retrieval sliders', () => {
    it('should render Similarity Threshold slider', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.similarityThreshold')).toBeInTheDocument()
      // Default value 0.20 rendered as text
      expect(screen.getByText('0.20')).toBeInTheDocument()
    })

    it('should render Vector Weight slider', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.vectorWeight')).toBeInTheDocument()
    })

    it('should render Top N slider', () => {
      renderConfig()

      expect(screen.getByText('chat.topN')).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // LLM Preset selector
  // --------------------------------------------------------------------------

  describe('LLM Preset selector', () => {
    it('should render the preset selector with options', () => {
      renderConfig()

      // The LlmSettingFields component renders the preset label
      expect(screen.getByText('llmSettings.preset')).toBeInTheDocument()

      // Preset options
      expect(screen.getByText('llmSettings.precise')).toBeInTheDocument()
      expect(screen.getByText('llmSettings.balance')).toBeInTheDocument()
      expect(screen.getByText('llmSettings.creative')).toBeInTheDocument()
      expect(screen.getByText('llmSettings.custom')).toBeInTheDocument()
    })

    it('should render LLM model selector', () => {
      renderConfig()

      expect(screen.getByText('llmSettings.llmModel')).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // Empty response textarea
  // --------------------------------------------------------------------------

  describe('Empty response textarea', () => {
    it('should render empty response textarea', () => {
      renderConfig()

      expect(screen.getByText('chatSettings.emptyResponse')).toBeInTheDocument()
      // Find the textarea by placeholder
      expect(screen.getByPlaceholderText('chatSettings.emptyResponsePlaceholder')).toBeInTheDocument()
    })

    it('should allow typing in the empty response textarea', () => {
      renderConfig()

      const textarea = screen.getByPlaceholderText('chatSettings.emptyResponsePlaceholder')
      fireEvent.change(textarea, { target: { value: 'No relevant results found.' } })

      expect(textarea).toHaveValue('No relevant results found.')
    })
  })

  // --------------------------------------------------------------------------
  // Save payload
  // --------------------------------------------------------------------------

  describe('Save payload', () => {
    it('should include all new fields in save payload', async () => {
      const onSave = vi.fn()
      const onClose = vi.fn()
      renderConfig({ onSave, onClose })

      // Fill in required name
      const nameInput = screen.getByPlaceholderText('chat.dialogNamePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'Test Assistant' } })

      // Fill in empty response
      const emptyResponseTextarea = screen.getByPlaceholderText('chatSettings.emptyResponsePlaceholder')
      fireEvent.change(emptyResponseTextarea, { target: { value: 'Nothing found' } })

      // Click save button
      const saveButton = screen.getByText('common.save')
      fireEvent.click(saveButton)

      // Verify the onSave callback was called with the correct payload shape
      expect(onSave).toHaveBeenCalledTimes(1)
      const payload = onSave.mock.calls[0][0]

      // Basic fields
      expect(payload.name).toBe('Test Assistant')
      expect(payload.kb_ids).toEqual([])
      expect(payload.is_public).toBe(false)

      // Prompt config should include feature flags
      expect(payload.prompt_config).toBeDefined()
      expect(payload.prompt_config.quote).toBe(true)
      expect(payload.prompt_config.keyword).toBe(false)
      expect(payload.prompt_config.tts).toBe(false)
      expect(payload.prompt_config.toc_enhance).toBe(false)
      expect(payload.prompt_config.refine_multiturn).toBe(true)
      expect(payload.prompt_config.use_kg).toBe(false)
      expect(payload.prompt_config.reasoning).toBe(false)

      // Retrieval parameters
      expect(payload.prompt_config.similarity_threshold).toBe(0.2)
      expect(payload.prompt_config.vector_similarity_weight).toBe(0.3)
      expect(payload.prompt_config.top_n).toBe(6)
      expect(payload.prompt_config.top_k).toBe(1024)

      // Empty response
      expect(payload.prompt_config.empty_response).toBe('Nothing found')

      // LLM settings
      expect(payload.prompt_config.llm_setting).toBeDefined()
      expect(payload.prompt_config.llm_setting.temperature).toBe(0.1)
      expect(payload.prompt_config.llm_setting.temperatureEnabled).toBe(true)
    })

    it('should not save when name is empty', () => {
      const onSave = vi.fn()
      renderConfig({ onSave })

      // Save button should be disabled with no name
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
      const nameInput = screen.getByPlaceholderText('chat.dialogNamePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'My Assistant' } })

      // Save
      fireEvent.click(screen.getByText('common.save'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should include selected knowledge bases in payload', () => {
      const onSave = vi.fn()
      renderConfig({ onSave })

      // Fill name
      const nameInput = screen.getByPlaceholderText('chat.dialogNamePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'KB Test' } })

      // Select a knowledge base checkbox
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[0])

      // Save
      fireEvent.click(screen.getByText('common.save'))

      const payload = onSave.mock.calls[0][0]
      expect(payload.kb_ids).toEqual(['kb-1'])
    })
  })

  // --------------------------------------------------------------------------
  // Edit mode population
  // --------------------------------------------------------------------------

  describe('Edit mode', () => {
    it('should populate form fields when editing an existing assistant', () => {
      renderConfig({
        dialog: {
          id: 'a-1',
          name: 'Existing Assistant',
          description: 'Test description',
          kb_ids: ['kb-1'],
          llm_id: 'llm-1',
          is_public: true,
          prompt_config: {
            system: 'You are a helpful bot.',
            empty_response: 'No data found',
            quote: false,
            keyword: true,
            tts: true,
            toc_enhance: true,
            refine_multiturn: false,
            use_kg: true,
            reasoning: true,
            top_n: 10,
            similarity_threshold: 0.5,
            vector_similarity_weight: 0.6,
          },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      })

      // Name should be populated
      const nameInput = screen.getByPlaceholderText('chat.dialogNamePlaceholder')
      expect(nameInput).toHaveValue('Existing Assistant')

      // System prompt should be populated
      const systemPrompt = screen.getByPlaceholderText('chat.systemPromptPlaceholder')
      expect(systemPrompt).toHaveValue('You are a helpful bot.')

      // Empty response should be populated
      const emptyResponse = screen.getByPlaceholderText('chatSettings.emptyResponsePlaceholder')
      expect(emptyResponse).toHaveValue('No data found')
    })
  })
})
