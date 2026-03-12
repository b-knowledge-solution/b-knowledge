/**
 * @fileoverview Admin page for managing broadcast messages.
 */

import React, { useState } from 'react';
import { HeaderActions } from '@/components/HeaderActions';
import { useTranslation } from 'react-i18next';
import { broadcastMessageService } from '../api/broadcastMessageService';
import { BroadcastMessage } from '../types';
import { Plus, CheckCircle, Trash2, Edit2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useFirstVisit, GuidelineDialog } from '@/features/guideline';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Spinner } from '@/components/ui/spinner';

/**
 * @description Admin dashboard page for creating, editing, and deleting broadcast messages.
 * Uses React Query for data fetching and mutations.
 *
 * @returns {JSX.Element} The Broadcast Message management page.
 */
const BroadcastMessagePage: React.FC = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingMessage, setEditingMessage] = useState<Partial<BroadcastMessage> | null>(null);

    const { isFirstVisit } = useFirstVisit('broadcast');
    const [showGuide, setShowGuide] = useState(false);

    React.useEffect(() => {
        if (isFirstVisit) {
            setShowGuide(true);
        }
    }, [isFirstVisit]);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(10);

    // Fetch Messages Query
    const { data: messages = [], isLoading } = useQuery({
        queryKey: queryKeys.broadcast.list(),
        queryFn: broadcastMessageService.getAllMessages
    });

    // Save Mutation (Create or Update)
    const saveMutation = useMutation({
        mutationKey: ['save', 'broadcastMessage'],
        mutationFn: (msg: Partial<BroadcastMessage>) => {
            if (msg.id) {
                return broadcastMessageService.updateMessage(msg.id, msg);
            } else {
                return broadcastMessageService.createMessage(msg as any);
            }
        },
        onSuccess: () => {
            setIsDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.broadcast.list() });
        },
        meta: { successMessage: t('admin.broadcast.saveSuccess') }
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationKey: ['delete', 'broadcastMessage'],
        mutationFn: broadcastMessageService.deleteMessage,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.broadcast.list() });
        },
        meta: { successMessage: t('admin.broadcast.deleteSuccess') }
    });

    /**
     * @description Validation and submission handler for saving a message.
     */
    const handleSave = async () => {
        if (!editingMessage?.message || !editingMessage?.starts_at || !editingMessage?.ends_at) {
            alert(t('common.fillRequiredFields'));
            return;
        }
        saveMutation.mutate(editingMessage);
    };

    /**
     * @description Handler for deleting a message after confirmation.
     * @param {string} id - ID of message to delete.
     */
    const handleDelete = async (id: string) => {
        if (!confirm(t('common.confirmDelete'))) return;
        deleteMutation.mutate(id);
    };

    /**
     * @description Renders the "Add" button into the header portal.
     */
    const renderHeaderActions = () => {
        return (
            <HeaderActions>
                <Button
                    onClick={() => {
                        setEditingMessage({
                            message: '',
                            starts_at: new Date().toISOString().slice(0, 16),
                            ends_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
                            color: '#4043e7ff',
                            font_color: '#FFFFFF',
                            is_active: true,
                            is_dismissible: true,
                        });
                        setIsDialogOpen(true);
                    }}
                    className="flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    {t('common.add')}
                </Button>
            </HeaderActions>
        );
    };

    // Pagination
    const totalPages = Math.ceil((messages || []).length / pageSize);
    const paginatedMessages = (messages || []).slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="p-6 h-full flex flex-col">
            {renderHeaderActions()}
            <Card className="dark:bg-slate-800 dark:border-slate-700 flex-1 min-h-0 overflow-hidden">
                <CardContent className="p-0 h-full flex flex-col">
                    {isLoading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Spinner size={48} />
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-auto p-4">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('common.message')}</TableHead>
                                            <TableHead className="w-[380px]">{t('common.period')}</TableHead>
                                            <TableHead className="w-[150px]">{t('common.status')}</TableHead>
                                            <TableHead className="w-[120px] text-right">{t('common.actions')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedMessages.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                                                    {t('common.noData')}
                                                </TableCell>
                                            </TableRow>
                                        ) : paginatedMessages.map((record) => (
                                            <TableRow key={record.id}>
                                                <TableCell>
                                                    <div className="flex items-start gap-2 max-w-[500px]">
                                                        <div
                                                            className="w-4 h-4 rounded-full border border-slate-200 mt-1 shrink-0"
                                                            style={{ backgroundColor: record.color }}
                                                        />
                                                        <span className="text-sm text-slate-900 dark:text-white leading-relaxed break-all">
                                                            {record.message}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm text-slate-500 whitespace-nowrap">
                                                        {record.starts_at ? new Date(record.starts_at).toLocaleString() : '-'}
                                                        <span className="mx-2">-</span>
                                                        {record.ends_at ? new Date(record.ends_at).toLocaleString() : '-'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="whitespace-nowrap">
                                                        {record.is_active ? (
                                                            <Badge variant="success" className="inline-flex items-center gap-1">
                                                                <CheckCircle className="w-3 h-3" />
                                                                {t('common.active')}
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="secondary" className="inline-flex items-center gap-1">
                                                                <XCircle className="w-3 h-3" />
                                                                {t('common.inactive')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8"
                                                                        onClick={() => {
                                                                            setEditingMessage(record);
                                                                            setIsDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        <Edit2 className="w-4 h-4 text-blue-600" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>{t('common.edit')}</TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-destructive"
                                                                        onClick={() => handleDelete(record.id)}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>{t('common.delete')}</TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
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

            <Dialog open={isDialogOpen} onOpenChange={(v: boolean) => { if (!v) setIsDialogOpen(false) }}>
                <DialogContent className="max-w-[60vw]">
                    <DialogHeader>
                        <DialogTitle>{editingMessage?.id ? t('common.edit') : t('common.add')}</DialogTitle>
                    </DialogHeader>
                <div className="space-y-4 py-2">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium">{t('common.message')}</label>
                            <span className={`text-xs ${((editingMessage?.message?.length || 0) > 1900) ? 'text-red-500 font-bold' : 'text-slate-500'}`}>
                                {editingMessage?.message?.length || 0} / 2000 {t('common.characters')}
                            </span>
                        </div>
                        <textarea
                            className="w-full input"
                            value={editingMessage?.message || ''}
                            onChange={(e) => setEditingMessage({ ...editingMessage, message: e.target.value })}
                            rows={4}
                            maxLength={2000}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">{t('common.startDate')}</label>
                            <input
                                type="datetime-local"
                                className="w-full px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white text-sm"
                                value={editingMessage?.starts_at ? editingMessage.starts_at.slice(0, 16) : ''}
                                onChange={(e) => setEditingMessage({ ...editingMessage, starts_at: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                                max={editingMessage?.ends_at ? editingMessage.ends_at.slice(0, 16) : undefined}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">{t('common.endDate')}</label>
                            <input
                                type="datetime-local"
                                className="w-full px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-600 dark:text-white text-sm"
                                value={editingMessage?.ends_at ? editingMessage.ends_at.slice(0, 16) : ''}
                                onChange={(e) => setEditingMessage({ ...editingMessage, ends_at: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                                min={editingMessage?.starts_at ? editingMessage.starts_at.slice(0, 16) : undefined}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">{t('common.backgroundColor')}</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={(editingMessage?.color || '#4043e7ff').slice(0, 7)}
                                    onChange={(e) => setEditingMessage({ ...editingMessage, color: e.target.value })}
                                    className="h-9 w-12 rounded border border-gray-300 dark:border-slate-600 cursor-pointer"
                                />
                                <span className="text-sm text-slate-500 font-mono">{editingMessage?.color || '#4043e7ff'}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">{t('common.fontColor')}</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={(editingMessage?.font_color || '#FFFFFF').slice(0, 7)}
                                    onChange={(e) => setEditingMessage({ ...editingMessage, font_color: e.target.value })}
                                    className="h-9 w-12 rounded border border-gray-300 dark:border-slate-600 cursor-pointer"
                                />
                                <span className="text-sm text-slate-500 font-mono">{editingMessage?.font_color || '#FFFFFF'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={editingMessage?.is_active || false}
                                onChange={(e) => setEditingMessage({ ...editingMessage, is_active: e.target.checked })}
                            />
                            {t('common.active')}
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={editingMessage?.is_dismissible || false}
                                onChange={(e) => setEditingMessage({ ...editingMessage, is_dismissible: e.target.checked })}
                            />
                            {t('common.dismissible')}
                        </label>
                    </div>
                </div>
                    <DialogFooter>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t('common.cancel')}</Button>
                            <Button onClick={handleSave}>{t('common.save')}</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <GuidelineDialog
                open={showGuide}
                onClose={() => setShowGuide(false)}
                featureId="broadcast"
            />
        </div>
    );
};

export default BroadcastMessagePage;
