import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RerankSelector } from '@/components/rerank-selector/RerankSelector'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

vi.mock('@/lib/llmProviderPublicApi', () => ({
  listModels: vi.fn().mockResolvedValue([
    { id: 'r1', factory_name: 'Jina', model_type: 'rerank', model_name: 'jina-reranker-v2', max_tokens: null, is_default: true },
  ]),
}))

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}>
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
  </QueryClientProvider>
)

describe('RerankSelector', () => {
  it('shows Top K slider only when rerank model is selected', async () => {
    const { rerender } = render(wrap(
      <RerankSelector rerankId="" topK={1024} onRerankChange={vi.fn()} onTopKChange={vi.fn()} />
    ))
    // Top K slider should NOT be visible when no rerank model
    expect(screen.queryByText(/Top K/i)).not.toBeInTheDocument()

    // Select a rerank model
    rerender(wrap(
      <RerankSelector rerankId="r1" topK={1024} onRerankChange={vi.fn()} onTopKChange={vi.fn()} />
    ))
    expect(screen.getByText(/Top K/i)).toBeInTheDocument()
  })
})
