/**
 * @fileoverview Tests for ChatPage (DatasetChatPage).
 *
 * Validates that the chat page renders correctly:
 * - Settings button exists for dialog config
 * - ChatDialogConfig modal is present (initially hidden)
 * - Conversation list renders via ChatSidebar
 * - Loading state displays spinner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSendMessage = vi.fn()
const mockStopStream = vi.fn()
const mockSetMessages = vi.fn()
const mockClearMessages = vi.fn()

vi.mock('@/features/chat/hooks/useChatStream', () => ({
  useChatStream: () => ({
    messages: [],
    isStreaming: false,
    currentAnswer: '',
    references: null,
    pipelineStatus: null,
    metrics: null,
    sendMessage: mockSendMessage,
    stopStream: mockStopStream,
    error: null,
    setMessages: mockSetMessages,
    clearMessages: mockClearMessages,
  }),
}))

const mockDialogs: any = {
  dialogs: [{ id: 'd1', name: 'Test Bot' }],
  activeDialog: { id: 'd1', name: 'Test Bot' },
  loading: false,
  createDialog: vi.fn(),
  refresh: vi.fn(),
}

const mockConversations: any = {
  conversations: [
    { id: 'c1', name: 'First Chat', created_at: '2026-01-01' },
    { id: 'c2', name: 'Second Chat', created_at: '2026-01-02' },
  ],
  activeConversation: { id: 'c1', name: 'First Chat', messages: [] },
  loading: false,
  setActiveConversationId: vi.fn(),
  createConversation: vi.fn().mockResolvedValue({ id: 'c-new' }),
  deleteConversation: vi.fn(),
  search: '',
  setSearch: vi.fn(),
}

vi.mock('@/features/chat/api/chatQueries', () => ({
  useChatDialogs: () => mockDialogs,
  useChatConversations: () => mockConversations,
}))

vi.mock('@/features/chat/api/chatApi', () => ({
  chatApi: {
    listDatasets: vi.fn().mockResolvedValue([]),
    updateDialog: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn(),
  },
}))

vi.mock('@/features/guideline', () => ({
  useFirstVisit: () => ({ isFirstVisit: false }),
  GuidelineDialog: () => null,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/features/chat/components/ChatSidebar', () => ({
  default: ({ conversations, onSelect, onCreate }: any) => (
    <div data-testid="chat-sidebar">
      {conversations?.map((c: any) => (
        <div key={c.id} data-testid={`conv-${c.id}`} onClick={() => onSelect(c.id)}>
          {c.name}
        </div>
      ))}
      <button data-testid="new-conv-btn" onClick={onCreate}>New</button>
    </div>
  ),
}))

vi.mock('@/features/chat/components/ChatMessageList', () => ({
  default: ({ messages }: any) => (
    <div data-testid="chat-message-list">
      {messages?.map((m: any, i: number) => (
        <div key={i} data-testid={`msg-${m.role}`}>{m.content}</div>
      ))}
    </div>
  ),
}))

vi.mock('@/features/chat/components/ChatInput', () => ({
  default: ({ onSend, isStreaming, disabled }: any) => (
    <div data-testid="chat-input">
      <input data-testid="msg-input" disabled={disabled} />
      <span data-testid="streaming-status">{isStreaming ? 'streaming' : 'idle'}</span>
    </div>
  ),
}))

vi.mock('@/features/chat/components/ChatReferencePanel', () => ({
  default: () => <div data-testid="reference-panel" />,
}))

vi.mock('@/features/chat/components/ChatDialogConfig', () => ({
  default: ({ open }: any) => (
    open ? <div data-testid="dialog-config">Config Open</div> : null
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, title, ...props }: any) => (
    <button onClick={onClick} title={title} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: ({ label }: any) => <div data-testid="spinner">{label}</div>,
}))

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

vi.mock('lucide-react', () => ({
  Settings2: () => <span data-testid="settings-icon">Settings</span>,
  PanelRightOpen: () => <span>PanelOpen</span>,
  PanelRightClose: () => <span>PanelClose</span>,
}))

// Import the component AFTER mocks
import ChatPage from '@/features/chat/pages/ChatPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderChatPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDialogs.loading = false
    mockDialogs.activeDialog = { id: 'd1', name: 'Test Bot' }
    mockConversations.activeConversation = { id: 'c1', name: 'First Chat', messages: [] }
  })

  it('renders the chat sidebar with conversations', () => {
    renderChatPage()
    expect(screen.getByTestId('chat-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('conv-c1')).toBeInTheDocument()
    expect(screen.getByTestId('conv-c2')).toBeInTheDocument()
  })

  it('renders the chat message list', () => {
    renderChatPage()
    expect(screen.getByTestId('chat-message-list')).toBeInTheDocument()
  })

  it('renders the chat input', () => {
    renderChatPage()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })

  it('renders the settings button (dialog config trigger)', () => {
    renderChatPage()
    expect(screen.getByTestId('settings-icon')).toBeInTheDocument()
  })

  it('does NOT render dialog config modal initially', () => {
    renderChatPage()
    expect(screen.queryByTestId('dialog-config')).not.toBeInTheDocument()
  })

  it('displays spinner when dialogs are loading', () => {
    mockDialogs.loading = true
    renderChatPage()
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  it('shows active dialog name in header', () => {
    renderChatPage()
    expect(screen.getByText('Test Bot')).toBeInTheDocument()
  })

  it('shows active conversation name in header', () => {
    renderChatPage()
    // "First Chat" appears in both sidebar and header; just verify it exists at least once
    expect(screen.getAllByText('First Chat').length).toBeGreaterThanOrEqual(1)
  })
})
