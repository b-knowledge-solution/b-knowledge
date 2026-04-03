/**
 * @fileoverview Admin agent runs detail view component.
 * Displays agent run details with read-only feedback indicators (not writable).
 * Per D-08: feedback "appears in" admin Histories as a display/review context, not a submission context.
 *
 * @module features/histories/components/AdminAgentRunsDetailView
 */
import { useTranslation } from 'react-i18next'
import { Bot, Clock, ThumbsUp, ThumbsDown, ChevronDown, PanelLeft, Activity } from 'lucide-react'

import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { AgentRunSessionSummary, ExternalAgentRunDetail } from '../types/histories.types'

/**
 * Props for the AdminAgentRunsDetailView component.
 */
interface AdminAgentRunsDetailViewProps {
    /** The selected agent run summary from the sidebar. */
    run: AgentRunSessionSummary
    /** Detailed run data including steps and feedback records. */
    details: ExternalAgentRunDetail | undefined
    /** Whether details are loading. */
    isLoadingDetails: boolean
    /** Whether the sidebar is open. */
    isSidebarOpen: boolean
    /** Open the sidebar. */
    onOpenSidebar: () => void
}

/**
 * @description Admin agent runs detail view showing run info, steps, and read-only feedback indicators.
 * Does NOT use FeedbackCommentPopover -- this is a review-only display per D-08.
 * @param {AdminAgentRunsDetailViewProps} props - Component props.
 * @returns {JSX.Element} Rendered agent run detail view.
 */
export const AdminAgentRunsDetailView = ({
    run,
    details,
    isLoadingDetails,
    isSidebarOpen,
    onOpenSidebar,
}: AdminAgentRunsDetailViewProps) => {
    const { t } = useTranslation()

    // Map status to visual style
    const statusColors: Record<string, string> = {
        completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
        cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    }

    // Format duration in human-readable form
    const durationSec = run.duration_ms ? Math.round(run.duration_ms / 1000) : null

    return (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 pb-12 px-0">
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 px-8 py-4 shadow-sm">
                <div className="mx-auto">
                    <div className="flex items-center gap-4 mb-2">
                        {!isSidebarOpen && (
                            <button
                                onClick={onOpenSidebar}
                                className="p-2 mr-2 rounded-lg text-slate-500 hover:text-violet-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                                title={t('nav.expandMenu')}
                            >
                                <PanelLeft size={20} />
                            </button>
                        )}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-violet-500/25">
                            <Bot size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                                {run.agent_name || 'Agent Run'}
                            </h2>
                            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-300 mt-0.5">
                                {/* Status badge */}
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusColors[run.status] || statusColors.pending}`}>
                                    {run.status}
                                </span>
                                {/* Timestamp */}
                                {run.started_at && (
                                    <span className="flex items-center gap-1">
                                        <Clock size={12} />
                                        {new Date(run.started_at).toLocaleString()}
                                    </span>
                                )}
                                {/* Duration */}
                                {durationSec !== null && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                                        <span className="font-mono opacity-70">{durationSec}s</span>
                                    </>
                                )}
                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                                <span className="font-mono opacity-70">ID: {run.run_id}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mx-auto space-y-8 px-8 pt-8">
                {isLoadingDetails ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                        <div className="w-10 h-10 border-4 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
                        <p className="text-sm font-medium">{t('histories.loadingDetails', 'Restoring context...')}</p>
                    </div>
                ) : (
                    <>
                        {/* Input Section */}
                        {run.input && (
                            <div className="space-y-2">
                                <div className="flex justify-end pl-12">
                                    <div className="relative max-w-[90%]">
                                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl rounded-tr-sm shadow-sm border border-slate-100 dark:border-slate-800">
                                            <div className="text-slate-800 dark:text-slate-200 leading-relaxed">
                                                <MarkdownRenderer>{run.input}</MarkdownRenderer>
                                            </div>
                                        </div>
                                        <div className="absolute -right-2 top-0 w-2 h-2 bg-white dark:bg-slate-800 [clip-path:polygon(0_0,0%_100%,100%_0)]" />
                                        <div className="mt-2 flex justify-end gap-2 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{t('histories.user', 'User')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Output Section */}
                        {run.output && (
                            <div className="flex gap-5 pr-12">
                                <div className="flex-shrink-0">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20 flex items-center justify-center ring-1 ring-inset ring-violet-500/20">
                                        <Bot size={16} className="text-violet-500 dark:text-violet-300" />
                                    </div>
                                </div>
                                <div className="flex-1 space-y-4">
                                    <div className="bg-transparent text-slate-700 dark:text-slate-300 leading-relaxed overflow-hidden">
                                        <MarkdownRenderer>{run.output}</MarkdownRenderer>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Steps Section */}
                        {details?.steps && details.steps.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-slate-400 mb-2">
                                    <Activity size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wider">{t('histories.agentRuns.executionSteps', 'Execution Steps')}</span>
                                </div>
                                <div className="space-y-2">
                                    {details.steps.map((step, idx) => (
                                        <div key={step.id || idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                    {step.node_type}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColors[step.status] || 'bg-slate-100 text-slate-600'}`}>
                                                    {step.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Read-only feedback section */}
                        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-2 text-slate-400 mb-2">
                                <ThumbsUp size={14} />
                                <span className="text-xs font-bold uppercase tracking-wider">{t('feedback.label', 'Feedback')}</span>
                            </div>

                            {details?.feedback && details.feedback.length > 0 ? (
                                <div className="space-y-3">
                                    {details.feedback.map((fb, idx) => (
                                        <div key={fb.id || idx} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                            {/* Read-only thumb icon */}
                                            <span className="mt-0.5">
                                                {fb.thumbup
                                                    ? <ThumbsUp className="h-4 w-4 text-green-500" />
                                                    : <ThumbsDown className="h-4 w-4 text-red-500" />
                                                }
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                {fb.comment ? (
                                                    <Collapsible>
                                                        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                                            <ChevronDown className="h-3 w-3" />
                                                            {t('histories.viewFeedbackComment')}
                                                        </CollapsibleTrigger>
                                                        <CollapsibleContent>
                                                            <p className="text-sm text-muted-foreground border-l-2 border-primary pl-3 mt-1">
                                                                {fb.comment}
                                                            </p>
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        {fb.thumbup ? t('feedback.positive', 'Positive') : t('feedback.negative', 'Negative')} {t('feedback.label', 'feedback')}
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-slate-400 block mt-1">
                                                    {new Date(fb.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">{t('agents.runs.noFeedback', 'No feedback yet')}</p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
