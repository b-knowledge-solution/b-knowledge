/**
 * @fileoverview Tests for the useRagflowIframe hook.
 *
 * Validates URL building, availability checking, error handling,
 * reload/reset session behaviour, and fullscreen toggle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/app/contexts/SettingsContext', () => ({
  useSettings: () => ({ resolvedTheme: 'light' }),
}))

vi.mock('@/features/users', () => ({
  useSharedUser: () => ({ user: { email: 'user@test.com' }, isLoading: false }),
}))

const defaultConfig = {
  chatSources: [{ id: 'c1', url: 'https://chat.example.com/' }],
  searchSources: [{ id: 's1', url: 'https://search.example.com/' }],
  defaultChatSourceId: 'c1',
  defaultSearchSourceId: 's1',
}

const mockKB = vi.fn(() => ({
  isLoading: false,
  error: null,
  config: defaultConfig,
  selectedChatSourceId: 'c1',
  selectedSearchSourceId: 's1',
}))

vi.mock('@/features/knowledge-base/context/KnowledgeBaseContext', () => ({
  useKnowledgeBase: () => mockKB(),
}))

vi.mock('@/features/guideline', () => ({
  useFirstVisit: () => ({ isFirstVisit: false }),
  GuidelineDialog: () => null,
}))

import { useRagflowIframe } from '../../../src/features/ai/hooks/useRagflowIframe'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRagflowIframe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockKB.mockImplementation(() => ({
      isLoading: false,
      error: null,
      config: defaultConfig,
      selectedChatSourceId: 'c1',
      selectedSearchSourceId: 's1',
    }))
    global.fetch = vi.fn(() => Promise.resolve(new Response(null))) as any
  })

  it('builds iframe URL with locale, email, and theme params', async () => {
    const { result } = renderHook(() => useRagflowIframe('chat'))

    await waitFor(() => {
      expect(result.current.iframeSrc).toContain('chat.example.com')
      expect(result.current.iframeSrc).toContain('locale=en')
      expect(result.current.iframeSrc).toContain('email=user%40test.com')
      expect(result.current.iframeSrc).toContain('theme=light')
    })
  })

  it('reports kbLoading when knowledge base is loading', () => {
    mockKB.mockReturnValue({ isLoading: true, error: null, config: null, selectedChatSourceId: '', selectedSearchSourceId: '' })

    const { result } = renderHook(() => useRagflowIframe('chat'))

    expect(result.current.kbLoading).toBe(true)
  })

  it('reports kbError when knowledge base has error', () => {
    mockKB.mockReturnValue({ isLoading: false, error: 'KB failed', config: null, selectedChatSourceId: '', selectedSearchSourceId: '' })

    const { result } = renderHook(() => useRagflowIframe('chat'))

    expect(result.current.kbError).toBe('KB failed')
  })

  it('toggles fullscreen', async () => {
    const { result } = renderHook(() => useRagflowIframe('chat'))

    expect(result.current.isFullScreen).toBe(false)

    act(() => { result.current.toggleFullScreen() })

    expect(result.current.isFullScreen).toBe(true)

    act(() => { result.current.toggleFullScreen() })

    expect(result.current.isFullScreen).toBe(false)
  })

  it('handles network error during URL check', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Failed to fetch')))

    const { result } = renderHook(() => useRagflowIframe('chat'))

    await waitFor(() => {
      expect(result.current.iframeError).not.toBeNull()
      expect(result.current.iframeError?.type).toBe('network')
    })
  })

  it('handles AbortError (timeout) during URL check', async () => {
    const err = new Error('timeout')
    err.name = 'AbortError'
    global.fetch = vi.fn(() => Promise.reject(err))

    const { result } = renderHook(() => useRagflowIframe('chat'))

    await waitFor(() => {
      expect(result.current.iframeError?.type).toBe('network')
    })
  })

  it('handles REAUTH_REQUIRED error', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('REAUTH_REQUIRED')))

    const { result } = renderHook(() => useRagflowIframe('chat'))

    await waitFor(() => {
      expect(result.current.iframeError?.type).toBe('forbidden')
    })
  })

  it('sets iframeError when no source is configured', async () => {
    mockKB.mockReturnValue({
      isLoading: false,
      error: null,
      config: { chatSources: [], searchSources: [], defaultChatSourceId: '', defaultSearchSourceId: '' },
      selectedChatSourceId: '',
      selectedSearchSourceId: '',
    })

    const { result } = renderHook(() => useRagflowIframe('chat'))

    await waitFor(() => {
      expect(result.current.iframeError).not.toBeNull()
    })
  })

  it('uses search sources when path is search', async () => {
    const { result } = renderHook(() => useRagflowIframe('search'))

    await waitFor(() => {
      expect(result.current.iframeSrc).toContain('search.example.com')
    })
  })

  it('handleIframeLoad clears loading and error', async () => {
    const { result } = renderHook(() => useRagflowIframe('chat'))

    await waitFor(() => expect(result.current.urlChecked).toBe(true))

    act(() => { result.current.handleIframeLoad() })

    expect(result.current.iframeLoading).toBe(false)
    expect(result.current.iframeError).toBeNull()
  })

  it('handleResetSession updates sessionKey triggering URL rebuild', async () => {
    const { result } = renderHook(() => useRagflowIframe('chat'))

    await waitFor(() => expect(result.current.urlChecked).toBe(true))

    const prevSrc = result.current.iframeSrc

    act(() => { result.current.handleResetSession() })

    // urlChecked should be reset
    expect(result.current.urlChecked).toBe(false)
    expect(result.current.iframeLoading).toBe(true)
  })
})
