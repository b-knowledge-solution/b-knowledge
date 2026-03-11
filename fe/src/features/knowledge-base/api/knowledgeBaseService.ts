/**
 * @fileoverview Service types for Knowledge Base.
 *
 * Provides shared type definitions used by KnowledgeBaseContext
 * and SourcePermissionsModal.
 *
 * @module services/knowledgeBaseService
 */

/**
 * Represents a knowledge base source (chat or search).
 */
export interface KnowledgeBaseSource {
    /** Unique source ID */
    id: string;
    /** Display name of the source */
    name: string;
    /** URL of the source (iframe URL) */
    url: string;
    /** Description of the source */
    description?: string | null;
    /** Share ID extracted from URL (shared_id param) */
    share_id?: string | null;
    /** URL for embedded chat widget on search page */
    chat_widget_url?: string | null;
    /** Type of source: chat or search */
    type?: 'chat' | 'search';
    /** Access control settings */
    access_control?: AccessControl;
}

/**
 * Access control settings for a source.
 */
export interface AccessControl {
    /** Whether the source is public to all authenticated users */
    public: boolean;
    /** List of team IDs allowed access */
    team_ids: string[];
    /** List of user IDs allowed access */
    user_ids: string[];
}

/**
 * Global configuration for the Knowledge Base.
 */
export interface KnowledgeBaseConfig {
    /** ID of the default chat source */
    defaultChatSourceId: string;
    /** ID of the default search source */
    defaultSearchSourceId: string;
    /** List of all available chat sources */
    chatSources: KnowledgeBaseSource[];
    /** List of all available search sources */
    searchSources: KnowledgeBaseSource[];
}

/**
 * Generic paginated response structure.
 */
export interface PaginatedResponse<T> {
    /** Array of items on the current page */
    data: T[];
    /** Total number of items across all pages */
    total: number;
    /** Current page number */
    page: number;
    /** Number of items per page */
    limit: number;
}
