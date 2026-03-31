/**
 * @fileoverview Type definitions for the Histories (admin) feature.
 * @module features/histories/types/histories.types
 */

/**
 * Filter state for admin history queries.
 * Includes email, sourceName, and feedbackFilter fields not present in user-level history.
 */
export interface FilterState {
    /** Filter by user email. */
    email: string
    /** Filter start date (ISO string). */
    startDate: string
    /** Filter end date (ISO string). */
    endDate: string
    /** Filter by source/knowledge base name. */
    sourceName?: string
    /** Filter by feedback status. */
    feedbackFilter?: 'all' | 'positive' | 'negative' | 'any' | 'none'
}

/**
 * Summary of a chat session, used for the admin list view.
 */
export interface ChatSessionSummary {
    /** Unique session identifier. */
    session_id: string
    /** User email if authenticated, otherwise undefined/null. */
    user_email?: string
    /** First prompt of the session, used as title. */
    user_prompt: string
    /** Timestamp of the latest activity in the session. */
    created_at: string
    /** Total number of messages in the session. */
    message_count: string | number
    /** Source name if available. */
    source_name?: string
    /** Count of positive feedback in this session. */
    positive_count?: number
    /** Count of negative feedback in this session. */
    negative_count?: number
}

/**
 * Summary of a search session, used for the admin list view.
 */
export interface SearchSessionSummary {
    /** Unique session identifier. */
    session_id: string
    /** User email if authenticated. */
    user_email?: string
    /** The search query. */
    search_input: string
    /** Timestamp of the search. */
    created_at: string
    /** Number of related activities/messages. */
    message_count: string | number
    /** Source name if available. */
    source_name?: string
    /** Count of positive feedback in this session. */
    positive_count?: number
    /** Count of negative feedback in this session. */
    negative_count?: number
}

/**
 * Summary of an agent run, used for the admin agent runs list view.
 */
export interface AgentRunSessionSummary {
    /** Unique run identifier. */
    run_id: string
    /** Name of the agent. */
    agent_name: string
    /** UUID of the agent. */
    agent_id: string
    /** Execution status. */
    status: string
    /** User input text. */
    input: string
    /** Agent output text. */
    output: string
    /** When the run started. */
    started_at: string
    /** When the run completed. */
    completed_at: string
    /** Duration in milliseconds. */
    duration_ms: number
    /** Email of the user who triggered the run. */
    user_email?: string
    /** Count of positive feedback for this run. */
    positive_count?: number
    /** Count of negative feedback for this run. */
    negative_count?: number
}

/**
 * Detailed agent run record with steps and feedback.
 */
export interface ExternalAgentRunDetail {
    /** The agent run record. */
    run: AgentRunSessionSummary & {
        /** Error message if failed. */
        error?: string
        /** Total nodes in the workflow. */
        total_nodes: number
        /** Completed nodes. */
        completed_nodes: number
    }
    /** Steps executed during the run. */
    steps: Array<{
        id: string
        node_id: string
        node_type: string
        status: string
        input: string
        output: string
        started_at: string
        completed_at: string
    }>
    /** Feedback records associated with this run. */
    feedback: Array<{
        id: string
        thumbup: boolean
        comment: string | null
        created_at: string
    }>
}

/**
 * Detailed chat history record.
 */
export interface ExternalChatHistory {
    id: string
    session_id: string
    user_email?: string
    user_prompt: string
    llm_response: string
    citations: any[]
    created_at: string
}

/**
 * Detailed search history record.
 */
export interface ExternalSearchHistory {
    id: string
    session_id: string
    user_email?: string
    search_input: string
    ai_summary: string
    file_results: any[]
    created_at: string
}

/** Active tab type for the histories page. */
export type HistoriesTab = 'chat' | 'search' | 'agentRuns'
