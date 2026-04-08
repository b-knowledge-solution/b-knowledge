/**
 * @fileoverview Glossary Management Page — thin orchestrator with 2-tab layout.
 *
 * Tab 1: Task Management (via TaskManagementTab component)
 * Tab 2: Keyword Management (via KeywordManagementTab component)
 *
 * All state and business logic is delegated to custom hooks.
 * @module features/glossary/pages/GlossaryPage
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Tag } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth'
import { UserRole } from '@/constants'
import { useGlossaryTasks } from '../api/glossaryQueries'
import { useGlossaryKeywords } from '../api/glossaryQueries'
import { TaskManagementTab } from '../components/TaskManagementTab'
import { KeywordManagementTab } from '../components/KeywordManagementTab'
import { GlossaryBulkImportModal } from '../components/GlossaryBulkImportModal'

// ============================================================================
// Component
// ============================================================================

/**
 * Glossary Management Page — orchestrates two tabs for task and keyword management.
 * @description Delegates all state to useGlossaryTasks and useGlossaryKeywords hooks.
 * @returns React element.
 */
export const GlossaryPage = () => {
    const { t } = useTranslation()
    const { user } = useAuth()

    // Determine admin/leader privileges
    // TODO(perm-codemod): multi-role chain — manual migration required (split into useHasPermission calls per capability)
    const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.LEADER

    // Active tab and bulk import modal state
    const [activeTab, setActiveTab] = useState('tasks')
    const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)

    // Initialize hooks — keyword hook defers fetching until its tab is active
    const taskHook = useGlossaryTasks()
    const keywordHook = useGlossaryKeywords(activeTab === 'keywords')

    // ========================================================================
    // Render
    // ========================================================================

    return (
        <div className="h-full flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className="w-fit">
                    <TabsTrigger value="tasks" className="flex items-center gap-2">
                        <BookOpen size={16} />
                        {t('glossary.tabs.tasks')}
                    </TabsTrigger>
                    <TabsTrigger value="keywords" className="flex items-center gap-2">
                        <Tag size={16} />
                        {t('glossary.tabs.keywords')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="tasks" className="flex-1 mt-0">
                    <TaskManagementTab
                        taskHook={taskHook}
                        onOpenBulkImport={() => setIsBulkImportOpen(true)}
                    />
                </TabsContent>

                <TabsContent value="keywords" className="flex-1 mt-0">
                    <KeywordManagementTab
                        keywordHook={keywordHook}
                    />
                </TabsContent>
            </Tabs>

            {/* Bulk Import Modal — shared across tabs */}
            <GlossaryBulkImportModal
                open={isBulkImportOpen}
                onClose={() => setIsBulkImportOpen(false)}
                onSuccess={() => {
                    taskHook.refresh()
                    if (activeTab === 'keywords') keywordHook.refresh()
                }}
            />
        </div>
    )
}

export default GlossaryPage
