/**
 * @fileoverview System monitoring tools page for administrators.
 * 
 * Admin-only page displaying a grid of system monitoring tools.
 * Tools are configured in system-tools.config.json on the backend.
 * Each tool opens in a new browser tab when clicked.
 * All text is internationalized via i18next.
 * 
 * @module pages/SystemToolsPage
 */

import { AlertCircle, RefreshCw, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getSystemTools } from '../api/systemToolsApi';
import SystemToolCard from '../components/SystemToolCard';
import CronSchedulerSettings from '../components/CronSchedulerSettings';
import { useAuth } from '@/features/auth';

// ============================================================================
// Component
// ============================================================================

/**
 * System monitoring tools page.
 * 
 * Features:
 * - Grid of clickable tool cards
 * - Loading and error states
 * - Retry functionality on error
 * - Empty state when no tools configured
 * - Admin info about configuration file location
 */
const SystemToolsPage = () => {
    const { t } = useTranslation();
    const { user } = useAuth();

    /**
     * Fetch system tools via TanStack Query (deduplicated, cached).
     */
    const {
        data: tools = [],
        isLoading: loading,
        error: queryError,
        refetch: fetchTools,
    } = useQuery({
        queryKey: queryKeys.systemTools.list(),
        queryFn: getSystemTools,
    });

    // Derive error message from query error
    const error = queryError ? (queryError instanceof Error ? queryError.message : t('systemTools.error')) : null;

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
                    <p className="text-gray-600 dark:text-gray-400">{t('systemTools.loading')}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 max-w-md text-center">
                    <AlertCircle className="w-12 h-12 text-red-500" />
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            {t('systemTools.failedToLoad')}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
                        <button
                            onClick={() => fetchTools()}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            {t('systemTools.retry')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col overflow-hidden">
            {/* Scrollable content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex items-center gap-3 mb-2">
                            <Server className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                {t('systemTools.title')}
                            </h1>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400">
                            {t('systemTools.description')}
                        </p>
                    </div>

                    {/* Tools Grid */}
                    {tools.length === 0 ? (
                        <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                            <Server className="w-16 h-16 text-gray-400 dark:text-gray-600 mb-4" />
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                {t('systemTools.noToolsConfigured')}
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
                                {t('systemTools.noToolsDescription')}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {tools.map((tool) => (
                                <SystemToolCard key={tool.id} tool={tool} />
                            ))}
                        </div>
                    )}

                    {/* Parsing Scheduler Section */}
                    <div className="mt-8">
                        <CronSchedulerSettings />
                    </div>

                    {/* Footer info */}
                    {tools.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                                {t('systemTools.toolsAvailable', { count: tools.length })}
                                {user?.role === 'admin' && (
                                    <span className="ml-2">
                                        · {t('systemTools.configInfo')} <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">system-tools.config.json</code>
                                    </span>
                                )}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SystemToolsPage;
