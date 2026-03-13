/**
 * @fileoverview Knowledge Base configuration context.
 * 
 * Manages Knowledge Base iframe configuration and source selection:
 * - Fetches iframe URLs from backend /api/knowledge-base/config (deduplicated by TanStack Query)
 * - Manages selected chat and search sources
 * - Persists source preferences per user via IndexedDB
 * 
 * @module contexts/KnowledgeBaseContext
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { userPreferences } from '@/features/users/api/userPreferences';
import { queryKeys } from '@/lib/queryKeys';

// ============================================================================
// Types
// ============================================================================

/**
 * Knowledge Base data source configuration.
 * Represents a single chat or search source.
 */
interface KnowledgeBaseSource {
    /** Unique source identifier */
    id: string;
    /** Display name for the source */
    name: string;
    /** Iframe URL for the source */
    url: string;
    /** Description of the source */
    description?: string | null;
    /** URL for embedded chat widget on search page */
    chat_widget_url?: string | null;
}

/**
 * Complete Knowledge Base configuration from backend.
 */
interface KnowledgeBaseConfig {
    /** Default Chat Source ID */
    defaultChatSourceId: string;
    /** Default Search Source ID */
    defaultSearchSourceId: string;
    /** Available chat sources */
    chatSources: KnowledgeBaseSource[];
    /** Available search sources */
    searchSources: KnowledgeBaseSource[];
    /** Effective prompt permission level */
    promptPermission: number;
    /** Base URL for document links */
    kbBaseUrl: string;
}

/**
 * Knowledge Base context value type.
 */
interface KnowledgeBaseContextType {
    /** Current configuration or null if loading */
    config: KnowledgeBaseConfig | null;
    /** Currently selected chat source ID */
    selectedChatSourceId: string;
    /** Currently selected search source ID */
    selectedSearchSourceId: string;
    /** Update selected chat source */
    setSelectedChatSource: (id: string) => void;
    /** Update selected search source */
    setSelectedSearchSource: (id: string) => void;
    /** Whether configuration is loading */
    isLoading: boolean;
    /** Error message if config fetch failed */
    error: string | null;
}

// ============================================================================
// Context
// ============================================================================

const KnowledgeBaseContext = createContext<KnowledgeBaseContextType | undefined>(undefined);

// ============================================================================
// Query Function
// ============================================================================

/**
 * Fetch Knowledge Base configuration from backend.
 * @returns Knowledge Base configuration with source URLs
 */
async function fetchKnowledgeBaseConfig(): Promise<KnowledgeBaseConfig> {
    const response = await fetch('/api/knowledge-base/config', {
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error('Failed to fetch Knowledge Base config');
    }
    return response.json();
}

// ============================================================================
// Provider
// ============================================================================

interface KnowledgeBaseProviderProps {
    children: ReactNode;
}

/**
 * Knowledge Base provider component.
 * Fetches configuration (deduplicated via TanStack Query) and manages source selection.
 * 
 * @param children - Child components to wrap
 */
export function KnowledgeBaseProvider({ children }: KnowledgeBaseProviderProps) {
    const { user } = useAuth();
    const [selectedChatSourceId, setSelectedChatSourceId] = useState<string>('');
    const [selectedSearchSourceId, setSelectedSearchSourceId] = useState<string>('');

    /**
     * TanStack Query handles deduplication: even if React.StrictMode
     * double-mounts the component, only one network request is made.
     * Enabled only when user is authenticated.
     */
    const {
        data: config = null,
        isLoading,
        error: queryError,
    } = useQuery({
        queryKey: queryKeys.knowledgeBase.config(),
        queryFn: fetchKnowledgeBaseConfig,
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000,
    });

    /**
     * Effect: Restore saved source preferences from IndexedDB once config loads.
     * Sets default sources from config if no user preference is saved.
     */
    useEffect(() => {
        if (!config || !user?.id) return;

        const restorePreferences = async () => {
            // Initialize chat source with saved preference or default or first available
            if (config.chatSources.length > 0) {
                let chatSourceId = config.defaultChatSourceId || config.chatSources[0]?.id || '';
                const savedChat = await userPreferences.get<string>(user.id, 'knowledge_base_source_chat');
                if (savedChat && config.chatSources.some(s => s.id === savedChat)) {
                    chatSourceId = savedChat;
                }
                setSelectedChatSourceId(chatSourceId);
            }

            // Initialize search source with saved preference or default or first available
            if (config.searchSources.length > 0) {
                let searchSourceId = config.defaultSearchSourceId || config.searchSources[0]?.id || '';
                const savedSearch = await userPreferences.get<string>(user.id, 'knowledge_base_source_search');
                if (savedSearch && config.searchSources.some(s => s.id === savedSearch)) {
                    searchSourceId = savedSearch;
                }
                setSelectedSearchSourceId(searchSourceId);
            }
        };

        restorePreferences();
    }, [config, user?.id]);

    /**
     * Update selected chat source and persist preference.
     * @param id - The ID of the chat source to select.
     */
    const setSelectedChatSource = useCallback(async (id: string) => {
        setSelectedChatSourceId(id);
        if (user?.id) {
            await userPreferences.set(user.id, 'knowledge_base_source_chat', id);
        }
    }, [user?.id]);

    /**
     * Update selected search source and persist preference.
     * @param id - The ID of the search source to select.
     */
    const setSelectedSearchSource = useCallback(async (id: string) => {
        setSelectedSearchSourceId(id);
        if (user?.id) {
            await userPreferences.set(user.id, 'knowledge_base_source_search', id);
        }
    }, [user?.id]);

    return (
        <KnowledgeBaseContext
            value={{
                config,
                selectedChatSourceId,
                selectedSearchSourceId,
                setSelectedChatSource,
                setSelectedSearchSource,
                isLoading,
                error: queryError ? 'Failed to load Knowledge Base configuration' : null,
            }}
        >
            {children}
        </KnowledgeBaseContext>
    );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access Knowledge Base configuration context.
 * Must be used within a KnowledgeBaseProvider.
 * 
 * @returns Knowledge Base context with config and source selection
 * @throws Error if used outside KnowledgeBaseProvider
 * 
 * @example
 * ```tsx
 * const { config, selectedChatSourceId, setSelectedChatSource } = useKnowledgeBase();
 * ```
 */
export function useKnowledgeBase(): KnowledgeBaseContextType {
    const context = useContext(KnowledgeBaseContext);
    if (context === undefined) {
        throw new Error('useKnowledgeBase must be used within a KnowledgeBaseProvider');
    }
    return context;
}
