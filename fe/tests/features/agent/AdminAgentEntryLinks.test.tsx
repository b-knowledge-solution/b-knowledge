/**
 * @fileoverview Route regressions for chat/search agent entry links.
 *
 * Protects the hidden `new` pseudo-id contract used by the admin agent canvas
 * create flows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreateChatAssistantAgentLink } from '@/features/chat/components/CreateChatAssistantDialog'
import { CreateSearchAppAgentLink } from '@/features/search/components/CreateSearchAppDialog'

const mockNavigate = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('lucide-react', () => ({
  Workflow: () => null,
}))

describe('AdminAgentEntryLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes chat assistant creation through the admin canvas new pseudo-id', () => {
    render(<CreateChatAssistantAgentLink />)

    fireEvent.click(screen.getByRole('button'))

    expect(mockNavigate).toHaveBeenCalledWith('/admin/agent-studio/agents/new?mode=chat')
  })

  it('routes search app creation through the admin canvas new pseudo-id', () => {
    render(<CreateSearchAppAgentLink />)

    fireEvent.click(screen.getByRole('button'))

    expect(mockNavigate).toHaveBeenCalledWith('/admin/agent-studio/agents/new?mode=search')
  })
})
