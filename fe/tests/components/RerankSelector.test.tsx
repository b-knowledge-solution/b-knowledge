import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RerankSelector } from '@/components/rerank-selector/RerankSelector'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/llmProviderPublicApi', () => ({
  listModels: vi.fn().mockResolvedValue([
    { id: 'r1', factory_name: 'Jina', model_type: 'rerank', model_name: 'jina-reranker-v2', max_tokens: null, is_default: true },
  ]),
}))

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
)

/**
 * @description Tests for the RerankSelector component with conditional Top K slider.
 */
describe('RerankSelector', () => {
  it('hides Top K slider when no rerank model selected', () => {
    render(wrap(
      <RerankSelector rerankId="" topK={1024} onRerankChange={vi.fn()} onTopKChange={vi.fn()} />
    ))
    // Top K label should NOT be visible when no rerank model
    expect(screen.queryByText(/llmSettings.topK/)).not.toBeInTheDocument()
  })

  it('shows Top K slider when rerank model is selected', () => {
    render(wrap(
      <RerankSelector rerankId="r1" topK={1024} onRerankChange={vi.fn()} onTopKChange={vi.fn()} />
    ))
    // Top K label should be visible (i18n mock returns the key)
    expect(screen.getByText(/llmSettings.topK/)).toBeInTheDocument()
  })
})
