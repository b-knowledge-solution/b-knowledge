import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getKnowledgeBaseConfig, updateSystemConfig, addSource, updateSource, deleteSource, KnowledgeBaseSource, AccessControl } from '../api/knowledgeBaseService';
import { Save, Plus, ExternalLink, Trash2, Search, MessageSquare, Edit2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SourcePermissionsModal, PermissionsSelector } from '../components/SourcePermissionsModal';
import { useConfirm } from '@/components/ConfirmDialog';
import { teamApi, type Team } from '@/features/teams';
import { userApi } from '@/features/users';
import { User as UserType } from '@/features/auth';
import { useFirstVisit, GuidelineDialog } from '@/features/guideline';
import { toast } from 'sonner';

/**
 * @fileoverview Knowledge Base Configuration Page.
 *
 * Allows administrators to:
 * - Configure separate Chat and Search knowledge base sources.
 * - Set default sources for the system.
 * - Manage access control permissions (Public/Private/Team/User) for each source.
 * - Add/Edit/Delete sources via CRUD operations.
 */
export default function KnowledgeBaseConfigPage() {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'chat' | 'search'>('chat');

    const { isFirstVisit } = useFirstVisit('kb-config');
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        if (isFirstVisit) {
            setShowGuide(true);
        }
    }, [isFirstVisit]);

    // Config (Defaults) Query
    const configQuery = useQuery({
        queryKey: ['knowledgeBaseConfig'],
        queryFn: getKnowledgeBaseConfig,
    });

    // --- Default URL Mutation ---
    const updateConfigMutation = useMutation({
        mutationKey: ['update', 'systemConfig'],
        mutationFn: updateSystemConfig,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['knowledgeBaseConfig'] });
        },
        meta: { successMessage: t('common.saveSuccess') }
    });

    const [defaultSourceId, setDefaultSourceId] = useState('');

    // Sync input with fetched config
    useEffect(() => {
        if (configQuery.data) {
            setDefaultSourceId(activeTab === 'chat' ? configQuery.data.defaultChatSourceId : configQuery.data.defaultSearchSourceId);
        }
    }, [configQuery.data, activeTab]);

    /**
     * Save the default source selection for the current tab (Chat/Search).
     */
    const handleSaveDefault = () => {
        const payload = activeTab === 'chat' ? { defaultChatSourceId: defaultSourceId } : { defaultSearchSourceId: defaultSourceId };
        updateConfigMutation.mutate(payload);
    };

    // --- Source CRUD State ---
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingSource, setEditingSource] = useState<KnowledgeBaseSource | null>(null);
    const [formData, setFormData] = useState({ name: '', url: '', description: '', shareId: '', chatWidgetUrl: '' });

    /**
     * Extract shared_id parameter from a URL.
     */
    const extractShareIdFromUrl = (url: string): string => {
        try {
            const urlObj = new URL(url);
            return urlObj.searchParams.get('shared_id') || '';
        } catch {
            return '';
        }
    };

    const handleUrlChange = (url: string) => {
        const shareId = extractShareIdFromUrl(url);
        setFormData(prev => ({ ...prev, url, shareId }));
    };

    // Permissions state for create/edit dialog
    const [isPublic, setIsPublic] = useState(true);
    const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    // --- Teams and Users Data Fetching ---
    const [teams, setTeams] = useState<Team[]>([]);
    const [users, setUsers] = useState<UserType[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);

    // Fetch teams and users when the create/edit dialog is opened and access is private
    useEffect(() => {
        if (isDialogOpen && !isPublic && teams.length === 0 && users.length === 0) {
            const fetchData = async () => {
                setIsLoadingData(true);
                try {
                    const [teamsList, usersList] = await Promise.all([
                        teamApi.getTeams(),
                        userApi.getUsers()
                    ]);
                    setTeams(teamsList);
                    setUsers(usersList);
                } catch (error) {
                    console.error('[KnowledgeBaseConfigPage] Failed to fetch teams/users:', error);
                } finally {
                    setIsLoadingData(false);
                }
            };
            fetchData();
        }
    }, [isDialogOpen, isPublic, teams.length, users.length]);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(10);

    /**
     * Open the dialog to create a new source.
     */
    const openCreateDialog = () => {
        setEditingSource(null);
        setFormData({ name: '', url: '', description: '', shareId: '', chatWidgetUrl: '' });
        setIsPublic(false);
        setSelectedTeamIds([]);
        setSelectedUserIds([]);
        setIsDialogOpen(true);
    };

    /**
     * Open the dialog to edit an existing source.
     */
    const openEditDialog = (source: KnowledgeBaseSource) => {
        setEditingSource(source);
        setFormData({ name: source.name, url: source.url, description: source.description || '', shareId: source.share_id || '', chatWidgetUrl: source.chat_widget_url || '' });

        const acl = source.access_control || { public: true, team_ids: [], user_ids: [] };
        setIsPublic(acl.public);
        setSelectedTeamIds(acl.team_ids || []);
        setSelectedUserIds(acl.user_ids || []);

        setIsDialogOpen(true);
    };

    // --- Permissions Modal (Key Icon) State ---
    const [isPermModalOpen, setIsPermModalOpen] = useState(false);
    const [permSource, setPermSource] = useState<KnowledgeBaseSource | null>(null);

    const openPermDialog = (source: KnowledgeBaseSource) => {
        setPermSource(source);
        setIsPermModalOpen(true);
    };

    const handleSavePermissions = (id: string, accessControl: AccessControl) => {
        const source = (activeTab === 'chat' ? configQuery.data?.chatSources : configQuery.data?.searchSources)?.find(s => s.id === id);
        if (source) {
            updateMutation.mutate({
                id: source.id,
                name: source.name,
                url: source.url,
                access_control: accessControl
            });
            setIsPermModalOpen(false);
        }
    };

    // --- Mutations ---
    const createMutation = useMutation({
        mutationKey: ['create', 'source'],
        mutationFn: (data: { name: string, url: string, description: string, shareId: string, chatWidgetUrl: string, access_control: AccessControl }) => addSource(activeTab, data.name, data.url, data.access_control, data.shareId, data.description, data.chatWidgetUrl),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['knowledgeBaseConfig'] });
            setIsDialogOpen(false);
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error?.message || t('common.error');
            toast.error(msg);
        },
        meta: { successMessage: t('knowledgeBaseConfig.addSuccess') }
    });

    const updateMutation = useMutation({
        mutationKey: ['update', 'source'],
        mutationFn: (data: { id: string, name: string, url: string, description?: string, shareId?: string, chatWidgetUrl?: string, access_control?: AccessControl }) => updateSource(data.id, data.name, data.url, data.access_control, data.shareId, data.description, data.chatWidgetUrl),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['knowledgeBaseConfig'] });
            setIsDialogOpen(false);
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error?.message || t('common.error');
            toast.error(msg);
        },
        meta: { successMessage: t('knowledgeBaseConfig.updateSuccess') }
    });

    const deleteMutation = useMutation({
        mutationKey: ['delete', 'source'],
        mutationFn: deleteSource,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['knowledgeBaseConfig'] });
        },
        meta: { successMessage: t('knowledgeBaseConfig.deleteSuccess') }
    });

    /**
     * Submit the Create/Edit form.
     */
    const handleSubmitSource = () => {
        if (!formData.name || !formData.url) return;

        const access_control: AccessControl = {
            public: isPublic,
            team_ids: isPublic ? [] : selectedTeamIds,
            user_ids: isPublic ? [] : selectedUserIds,
        };

        if (editingSource) {
            updateMutation.mutate({ id: editingSource.id, ...formData, access_control });
        } else {
            createMutation.mutate({ ...formData, access_control });
        }
    };

    const currentSources = activeTab === 'chat' ? configQuery.data?.chatSources : configQuery.data?.searchSources;
    const totalPages = Math.ceil((currentSources?.length || 0) / pageSize);
    const paginatedSources = (currentSources || []).slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="w-full h-full flex flex-col p-8 overflow-hidden">
            <div className="w-[90%] mx-auto h-full flex flex-col space-y-6 min-h-0">
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={(val: string) => { setActiveTab(val as 'chat' | 'search'); setCurrentPage(1); }} className="h-full flex flex-col">
                    <TabsList className="w-fit shrink-0">
                        <TabsTrigger value="chat" className="flex items-center gap-2">
                            <MessageSquare size={18} />
                            {t('knowledgeBaseConfig.tabs.chat')}
                        </TabsTrigger>
                        <TabsTrigger value="search" className="flex items-center gap-2">
                            <Search size={18} />
                            {t('knowledgeBaseConfig.tabs.search')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value={activeTab} className="flex-1 flex flex-col gap-6 mt-4 min-h-0">
                        {/* Default Configuration Section */}
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 shrink-0">
                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                                {t('knowledgeBaseConfig.defaultUrlLabel', { type: activeTab === 'chat' ? 'Chat' : 'Search' })}
                            </label>
                            <div className="flex gap-4 items-center">
                                <select
                                    value={defaultSourceId}
                                    onChange={(e) => setDefaultSourceId(e.target.value)}
                                    className="flex-1 px-3 py-2 border rounded-md dark:bg-slate-900 dark:border-slate-600 dark:text-white"
                                    disabled={!configQuery.data}
                                >
                                    <option value="">{t('common.select') || 'Select a source'}</option>
                                    {(currentSources || [])
                                        .filter((source: KnowledgeBaseSource) => source.access_control?.public)
                                        .map((source: KnowledgeBaseSource) => (
                                            <option key={source.id} value={source.id}>
                                                {source.name}
                                            </option>
                                        ))}
                                </select>
                                <button
                                    onClick={handleSaveDefault}
                                    disabled={updateConfigMutation.isPending || !defaultSourceId}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50 shrink-0"
                                >
                                    <Save size={18} />
                                    {t('common.save')}
                                </button>
                                {defaultSourceId && configQuery.data && (
                                    (() => {
                                        const list = activeTab === 'chat' ? configQuery.data.chatSources : configQuery.data.searchSources;
                                        const current = list?.find(s => s.id === defaultSourceId);
                                        if (current?.url) {
                                            return (
                                                <a href={current.url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-primary border rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 shrink-0">
                                                    <ExternalLink size={20} />
                                                </a>
                                            );
                                        }
                                        return null;
                                    })()
                                )}
                            </div>
                            <p className="mt-2 text-xs text-orange-500 dark:text-orange-400">
                                {t('knowledgeBaseConfig.publicOnlyNote') || 'Only public sources can be set as system defaults.'}
                            </p>
                        </div>

                        {/* Sources Management Section */}
                        <Card className="dark:bg-slate-800 dark:border-slate-700 flex-1 min-h-0 overflow-hidden flex flex-col">
                            <CardHeader className="flex flex-row items-center justify-between shrink-0 pb-2">
                                <CardTitle className="text-base">{t('knowledgeBaseConfig.sourcesList')}</CardTitle>
                                <Button onClick={openCreateDialog}>
                                    <Plus size={16} className="mr-1" />
                                    {t('knowledgeBaseConfig.addSource')}
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                                {configQuery.isLoading ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <Spinner size={48} />
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex-1 overflow-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>{t('common.name')}</TableHead>
                                                        <TableHead>URL</TableHead>
                                                        <TableHead className="w-[150px]">{t('common.actions')}</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {paginatedSources.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={3} className="text-center py-8 text-slate-500">
                                                                {t('common.noData')}
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : paginatedSources.map((record) => (
                                                        <TableRow key={record.id}>
                                                            <TableCell>
                                                                <span className="font-medium text-gray-900 dark:text-gray-100">{record.name}</span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="text-gray-500 dark:text-gray-400 font-mono text-xs whitespace-normal break-all" title={record.url}>
                                                                    {record.url}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-1">
                                                                    <TooltipProvider>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700" onClick={() => openEditDialog(record)}>
                                                                                    <Edit2 size={16} />
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent>{t('common.edit')}</TooltipContent>
                                                                        </Tooltip>
                                                                    </TooltipProvider>
                                                                    <TooltipProvider>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-purple-600 hover:text-purple-700" onClick={() => openPermDialog(record)}>
                                                                                    <Shield size={16} />
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent>{t('common.permissions') || 'Permissions'}</TooltipContent>
                                                                        </Tooltip>
                                                                    </TooltipProvider>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-destructive"
                                                                        onClick={async () => {
                                                                            const confirmed = await confirm({
                                                                                message: t('common.confirmDelete'),
                                                                                variant: 'danger'
                                                                            });
                                                                            if (confirmed) {
                                                                                deleteMutation.mutate(record.id);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        {totalPages > 1 && (
                                            <div className="flex justify-end p-4 border-t border-slate-200 dark:border-slate-700">
                                                <Pagination
                                                    currentPage={currentPage}
                                                    totalPages={totalPages}
                                                    onPageChange={setCurrentPage}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Add/Edit Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={(v: boolean) => { if (!v) setIsDialogOpen(false) }}>
                    <DialogContent className="max-w-[70vw] h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>{editingSource ? t('knowledgeBaseConfig.editSource') : t('knowledgeBaseConfig.addSource')}</DialogTitle>
                        </DialogHeader>
                    <div className="h-full flex flex-col gap-6">
                        {/* Form Fields - Row 1: Name & URL */}
                        <div className="grid grid-cols-3 gap-4 shrink-0">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('common.name')}</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                    placeholder="e.g., Marketing KB"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">URL</label>
                                <input
                                    type="text"
                                    value={formData.url}
                                    onChange={(e) => handleUrlChange(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                    placeholder="https://..."
                                />
                            </div>
                        </div>

                        {/* Form Fields - Row 2: Share ID & Description */}
                        <div className="grid grid-cols-3 gap-4 shrink-0">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('knowledgeBaseConfig.shareId') || 'Share ID'}</label>
                                <input
                                    type="text"
                                    value={formData.shareId}
                                    onChange={(e) => setFormData({ ...formData, shareId: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white bg-gray-50 dark:bg-slate-700"
                                    placeholder={t('knowledgeBaseConfig.shareIdPlaceholder') || 'Auto-extracted'}
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('knowledgeBaseConfig.shareIdDesc') || 'Auto-extracted from URL'}</p>
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('common.description') || 'Description'}</label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                    placeholder={t('knowledgeBaseConfig.descriptionPlaceholder') || 'Optional description for this source'}
                                />
                            </div>
                        </div>

                        {/* Form Fields - Row 3: Chat Widget URL (Search tab only) */}
                        {activeTab === 'search' && (
                            <div className="shrink-0">
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('knowledgeBaseConfig.chatWidgetUrl') || 'Chat Widget URL'}</label>
                                <input
                                    type="text"
                                    value={formData.chatWidgetUrl}
                                    onChange={(e) => setFormData({ ...formData, chatWidgetUrl: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                    placeholder={t('knowledgeBaseConfig.chatWidgetUrlPlaceholder') || 'https://your-chat-widget-url.com'}
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('knowledgeBaseConfig.chatWidgetUrlDesc') || 'Optional URL for embedding a floating chat widget on the Search page'}</p>
                            </div>
                        )}

                        <div className="border-t dark:border-gray-700 my-2"></div>

                        <div className="flex-1 min-h-0">
                            <PermissionsSelector
                                isPublic={isPublic}
                                setIsPublic={setIsPublic}
                                selectedTeamIds={selectedTeamIds}
                                setSelectedTeamIds={setSelectedTeamIds}
                                selectedUserIds={selectedUserIds}
                                setSelectedUserIds={setSelectedUserIds}
                                teams={teams}
                                users={users}
                                isLoading={isLoadingData}
                            />
                        </div>

                        <DialogFooter className="pt-4 border-t dark:border-gray-700 shrink-0 mt-auto">
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button onClick={handleSubmitSource}>
                                {t('common.save')}
                            </Button>
                        </DialogFooter>
                    </div>
                    </DialogContent>
                </Dialog>

                <SourcePermissionsModal
                    open={isPermModalOpen}
                    onClose={() => setIsPermModalOpen(false)}
                    source={permSource}
                    onSave={handleSavePermissions}
                />
                <GuidelineDialog
                    open={showGuide}
                    onClose={() => setShowGuide(false)}
                    featureId="kb-config"
                />
            </div>
        </div>
    );
}
