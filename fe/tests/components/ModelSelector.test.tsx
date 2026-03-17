import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModelSelector } from '@/components/model-selector/ModelSelector'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the public API
vi.mock('@/lib/llmProviderPublicApi', () => ({
  listModels: vi.fn().mockResolvedValue([
    { id: '1', factory_name: 'OpenAI', model_type: 'chat', model_name: 'gpt-4o', max_tokens: 128000, is_default: true },
    { id: '2', factory_name: 'Anthropic', model_type: 'chat', model_name: 'claude-3.5-sonnet', max_tokens: 8192, is_default: false },
  ]),
}))

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
)

describe('ModelSelector', () => {
  it('renders placeholder when no value selected', () => {
    render(wrap(<ModelSelector modelType="chat" value="" onChange={vi.fn()} placeholder="Select model" />))
    expect(screen.getByText('Select model')).toBeInTheDocument()
  })

  it('shows model options after loading', async () => {
    render(wrap(<ModelSelector modelType="chat" value="" onChange={vi.fn()} placeholder="Select" />))
    // Wait for async options to load
    expect(await screen.findByText(/gpt-4o/)).toBeInTheDocument()
    expect(await screen.findByText(/claude-3.5-sonnet/)).toBeInTheDocument()
  })
})
