/**
 * @fileoverview Admin sidebar with chat/search/agent runs tab switcher, search, filter, and session list.
 * Shows user email badges and feedback count indicators on each item -- admin-specific.
 *
 * @module features/histories/components/AdminSessionListSidebar
 */
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Filter,
    Search,
    MessageSquare,
    ChevronRight,
    PanelLeftClose,
    RefreshCw,
    User,
    Bot,
    ThumbsUp,
    ThumbsDown,
} from 'lucide-react'

import { HighlightMatch } from '@/features/histories/components/HighlightMatch'
import type {
    ChatSessionSummary,
    SearchSessionSummary,
    AgentRunSessionSummary,
    HistoriesTab,
} from '../types/histories.types'

/** Union type for any selectable session/run item. */
type SelectableItem = ChatSessionSummary | SearchSessionSummary | AgentRunSessionSummary

/**
 * Props for the AdminSessionListSidebar component.
 */
interface AdminSessionListSidebarProps {
    /** Whether the sidebar is open. */
    isOpen: boolean
    /** Close the sidebar. */
    onClose: () => void
    /** Active tab. */
    activeTab: HistoriesTab
    /** Switch tab. */
    onSwitchTab: (tab: HistoriesTab) => void
    /** Current search input value. */
    searchQuery: string
    /** Update search input. */
    onSearchChange: (value: string) => void
    /** Handle search form submission. */
    onSearch: (e: React.FormEvent) => void
    /** Executed search query (for highlighting). */
    executedSearchQuery: string
    /** Whether refresh is in progress. */
    isRefreshing: boolean
    /** Handle refresh action. */
    onRefresh: () => void
    /** Whether the filter is active. */
    isFiltered: boolean
    /** Open filter dialog. */
    onFilterClick: () => void
    /** Whether the list is loading. */
    isLoading: boolean
    /** The data items to render. */
    items: SelectableItem[]
    /** Currently selected session. */
    selectedSession: SelectableItem | null
    /** Handle item click. */
    onItemClick: (item: SelectableItem) => void
    /** Ref for infinite scroll sentinel. */
    loadMoreRef: RefObject<HTMLDivElement | null>
    /** Reset search state on tab switch. */
    onResetSearch: () => void
}

/**
 * @description Admin sidebar with tab switcher (chat/search/agent runs), search bar,
 * filter button, and session list items showing user email badges and feedback indicators.
 * @param {AdminSessionListSidebarProps} props - Component props.
 * @returns {JSX.Element} Rendered admin sidebar.
 */
export const AdminSessionListSidebar = ({
    isOpen,
    onClose,
    activeTab,
    onSwitchTab,
    searchQuery,
    onSearchChange,
    onSearch,
    executedSearchQuery,
    isRefreshing,
    onRefresh,
    isFiltered,
    onFilterClick,
    isLoading,
    items,
    selectedSession,
    onItemClick,
    loadMoreRef,
    onResetSearch,
}: AdminSessionListSidebarProps) => {
    const { t } = useTranslation()

    /**
     * @description Get display text from an item based on active tab.
     * @param {SelectableItem} item - Session or run item.
     * @returns {string} Display text.
     */
    const getItemText = (item: SelectableItem): string => {
        if (activeTab === 'agentRuns') return (item as AgentRunSessionSummary).agent_name || ''
        return activeTab === 'chat'
            ? (item as ChatSessionSummary).user_prompt
            : (item as SearchSessionSummary).search_input
    }

    /**
     * @description Get the unique ID for an item based on active tab.
     * @param {SelectableItem} item - Session or run item.
     * @returns {string} Unique identifier.
     */
    const getItemId = (item: SelectableItem): string => {
        if ('run_id' in item) return item.run_id
        return item.session_id
    }

    /**
     * @description Check if a given item is currently selected.
     * @param {SelectableItem} item - Item to check.
     * @returns {boolean} Whether the item is selected.
     */
    const isItemSelected = (item: SelectableItem): boolean => {
        if (!selectedSession) return false
        return getItemId(item) === getItemId(selectedSession)
    }

    /**
     * @description Handle tab switch with search reset.
     * @param {HistoriesTab} tab - Target tab.
     */
    const handleTabSwitch = (tab: HistoriesTab) => {
        onSwitchTab(tab)
        onResetSearch()
    }

    /**
     * @description Render feedback count badges for a session/run item.
     * Only displays if there are any positive or negative feedback counts.
     * @param {SelectableItem} item - Session or run item.
     * @returns {JSX.Element | null} Feedback badge or null.
     */
    const renderFeedbackBadge = (item: SelectableItem) => {
        const pos = (item as any).positive_count || 0
        const neg = (item as any).negative_count || 0
        // Only show badge if there is any feedback
        if (pos === 0 && neg === 0) return null

        return (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {pos > 0 && (
                    <span className="flex items-center gap-0.5">
                        <ThumbsUp className="h-3 w-3 text-green-500" />
                        <span>{pos}</span>
                    </span>
                )}
                {neg > 0 && (
                    <span className="flex items-center gap-0.5">
                        <ThumbsDown className="h-3 w-3 text-red-500" />
                        <span>{neg}</span>
                    </span>
                )}
            </span>
        )
    }

    /**
     * @description Render an agent run item card with status badge and duration.
     * @param {AgentRunSessionSummary} item - Agent run item.
     * @param {boolean} isSelected - Whether this item is selected.
     * @returns {JSX.Element} Rendered agent run card content.
     */
    const renderAgentRunItem = (item: AgentRunSessionSummary, isSelected: boolean) => {
        // Format duration in human-readable form
        const durationSec = item.duration_ms ? Math.round(item.duration_ms / 1000) : null

        // Map status to color
        const statusColors: Record<string, string> = {
            completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
            cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
        }

        return (
            <div className="pl-2 space-y-2">
                <div className="flex justify-between items-start gap-2">
                    <h3 className={`font-semibold text-sm leading-snug line-clamp-2 transition-colors ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                        <HighlightMatch text={item.agent_name || 'Unknown Agent'} query={executedSearchQuery} />
                    </h3>
                    <span className="text-[10px] font-mono whitespace-nowrap text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {item.started_at ? new Date(item.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                    </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                        {/* Status badge */}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusColors[item.status] || statusColors.pending}`}>
                            {item.status}
                        </span>
                        {/* Duration */}
                        {durationSec !== null && (
                            <span className="text-slate-400 font-medium">{durationSec}s</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-300">
                        {renderFeedbackBadge(item)}
                        <ChevronRight size={12} className={`transition-transform duration-300 ${isSelected ? 'translate-x-1 text-primary' : 'opacity-0 group-hover:opacity-100'}`} />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            className={`border-r border-slate-200/60 dark:border-slate-800/60 flex flex-col bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl shadow-2xl z-20 transition-all duration-300 ease-in-out ${isOpen ? 'w-[360px] translate-x-0' : 'w-0 -translate-x-full opacity-0 overflow-hidden border-none'}`}
        >
            {/* Header */}
            <div className="p-5 space-y-4 border-b border-slate-100 dark:border-slate-800/50 relative group/sidebar-header">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-2 top-2 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all opacity-0 group-hover/sidebar-header:opacity-100 focus:opacity-100"
                    title={t('common.close')}
                >
                    <PanelLeftClose size={18} />
                </button>

                {/* Tab Switcher -- 3 tabs: Chat, Search, Agent Runs */}
                <div className="bg-slate-100/50 dark:bg-slate-900/50 p-1 rounded-xl flex shadow-inner mt-4">
                    <button
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'chat'
                            ? 'bg-white dark:bg-slate-800 text-primary dark:text-blue-400 shadow-sm ring-1 ring-black/5 dark:ring-white/5'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white'
                            }`}
                        onClick={() => handleTabSwitch('chat')}
                    >
                        <MessageSquare size={16} className={activeTab === 'chat' ? 'fill-current opacity-20' : ''} />
                        {t('histories.chatTab')}
                    </button>
                    <button
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'search'
                            ? 'bg-white dark:bg-slate-800 text-blue-500 dark:text-blue-400 shadow-sm ring-1 ring-black/5 dark:ring-white/5'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white'
                            }`}
                        onClick={() => handleTabSwitch('search')}
                    >
                        <Search size={16} className={activeTab === 'search' ? 'text-blue-500' : ''} />
                        {t('histories.searchTab')}
                    </button>
                    <button
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'agentRuns'
                            ? 'bg-white dark:bg-slate-800 text-violet-500 dark:text-violet-400 shadow-sm ring-1 ring-black/5 dark:ring-white/5'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white'
                            }`}
                        onClick={() => handleTabSwitch('agentRuns')}
                    >
                        <Bot size={16} className={activeTab === 'agentRuns' ? 'text-violet-500' : ''} />
                        {t('histories.tabs.agentRuns')}
                    </button>
                </div>

                {/* Search + Refresh + Filter */}
                <form onSubmit={onSearch} className="flex gap-2">
                    <div className="relative flex-1 group">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300 group-focus-within:text-primary dark:group-focus-within:text-blue-400 transition-colors" />
                        <input
                            type="text"
                            placeholder={t('histories.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border-none ring-1 ring-slate-200 dark:ring-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:bg-white dark:focus:bg-slate-900 transition-all text-sm font-medium"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className={`p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all ${isRefreshing ? 'animate-spin' : ''}`}
                        title={t('common.refresh')}
                    >
                        <RefreshCw size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={onFilterClick}
                        className={`p-2.5 rounded-xl border transition-all duration-200 ${isFiltered
                            ? 'bg-primary/10 border-primary/20 text-primary'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                    >
                        <Filter size={18} />
                    </button>
                </form>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 bg-slate-50/30 dark:bg-black/20">
                {isLoading && items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                        <span className="text-sm font-medium animate-pulse">{t('histories.loading')}</span>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                        {activeTab === 'chat'
                            ? <MessageSquare size={48} className="opacity-30" />
                            : activeTab === 'search'
                                ? <Search size={48} className="opacity-30" />
                                : <Bot size={48} className="opacity-30" />
                        }
                        <span className="text-sm font-medium">{t('histories.noSessions', 'No sessions found')}</span>
                    </div>
                ) : (
                    <div className="p-3 space-y-2">
                        {items.map((item) => {
                            const isSelected = isItemSelected(item)
                            const itemId = getItemId(item)
                            return (
                                <div
                                    key={itemId || Math.random().toString()}
                                    onClick={() => onItemClick(item)}
                                    className={`group relative p-4 rounded-xl cursor-pointer transition-all duration-300 border ${isSelected
                                        ? 'bg-white dark:bg-slate-800 shadow-lg shadow-primary/5 border-primary/20 dark:border-primary/20 translate-x-1'
                                        : 'bg-white/50 dark:bg-slate-900/40 border-transparent hover:bg-white dark:hover:bg-slate-800 hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700'
                                        }`}
                                >
                                    {isSelected && (
                                        <div className="absolute left-0 top-3 bottom-3 w-1 bg-primary rounded-r-full" />
                                    )}

                                    {/* Render agent run items with their own layout */}
                                    {activeTab === 'agentRuns' ? (
                                        renderAgentRunItem(item as AgentRunSessionSummary, isSelected)
                                    ) : (
                                        <div className="pl-2 space-y-2">
                                            <div className="flex justify-between items-start gap-2">
                                                <h3 className={`font-semibold text-sm leading-snug line-clamp-2 transition-colors ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                                    <HighlightMatch text={getItemText(item)} query={executedSearchQuery} />
                                                </h3>
                                                <span className="text-[10px] font-mono whitespace-nowrap text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                    {new Date((item as ChatSessionSummary | SearchSessionSummary).created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                                                    {(item as ChatSessionSummary | SearchSessionSummary).source_name && (
                                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-50/50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/30">
                                                            <span className="truncate max-w-[100px] font-bold text-[10px] text-violet-600 dark:text-violet-400 uppercase tracking-wide">{(item as ChatSessionSummary | SearchSessionSummary).source_name}</span>
                                                        </div>
                                                    )}
                                                    {item.user_email ? (
                                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                                                            <User size={10} className="text-blue-500" />
                                                            <span className="truncate max-w-[100px] font-medium text-blue-600 dark:text-blue-400">{item.user_email}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="italic text-slate-400">{t('histories.anonymous', 'Anonymous')}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-300">
                                                    {/* Feedback count badges */}
                                                    {renderFeedbackBadge(item)}
                                                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium text-[10px]">
                                                        {(item as ChatSessionSummary | SearchSessionSummary).message_count} msgs
                                                    </span>
                                                    <ChevronRight size={12} className={`transition-transform duration-300 ${isSelected ? 'translate-x-1 text-primary' : 'opacity-0 group-hover:opacity-100'}`} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        <div ref={loadMoreRef} className="h-4" />
                    </div>
                )}
            </div>
        </div>
    )
}
