/**
 * @fileoverview Keyword Management tab component for the Glossary page.
 * Renders the keyword table with search, CRUD actions, multi-select bulk delete, and the keyword modal.
 * @module features/glossary/components/KeywordManagementTab
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit2, Trash2, Search, Tag, Upload } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Spinner } from '@/components/ui/spinner'

import { glossaryApi } from '../api/glossaryApi'
import type { UseGlossaryKeywordsReturn } from '../api/glossaryQueries'
import { KeywordBulkImportModal } from './KeywordBulkImportModal'
import { globalMessage } from '@/app/App'

/**
 * @description Props for the KeywordManagementTab component.
 */
interface KeywordManagementTabProps {
    /** All values and handlers from useGlossaryKeywords */
    keywordHook: UseGlossaryKeywordsReturn
    /** Whether the current user has admin/leader privileges */
    isAdmin: boolean
}

/**
 * @description Keyword Management tab with searchable table, CRUD actions, multi-select bulk delete, and create/edit modal.
 * @param {KeywordManagementTabProps} props - Keyword hook return and admin flag.
 * @returns {JSX.Element} Rendered keyword management tab.
 */
export const KeywordManagementTab: React.FC<KeywordManagementTabProps> = ({
    keywordHook,
    isAdmin,
}) => {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)

    // Row selection state for bulk delete
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [pageSize] = useState(20)
    const [currentPage, setCurrentPage] = useState(1)

    const {
        filteredKeywords,
        loading,
        search,
        setSearch,
        isModalOpen,
        editingKeyword,
        submitting,
        formData,
        setFormField,
        openModal,
        closeModal,
        handleSubmit,
        handleDelete,
    } = keywordHook

    // ========================================================================
    // Bulk Delete Handler
    // ========================================================================

    const handleBulkDelete = async () => {
        // Show styled confirmation dialog before bulk deleting keywords
        const confirmed = await confirm({
            title: t('common.delete'),
            message: t('glossary.keyword.bulkDeleteMessage', { count: selectedRowKeys.length }),
            variant: 'danger',
            confirmText: t('common.delete'),
        })
        if (!confirmed) return
        setBulkDeleting(true)
        try {
            for (const id of selectedRowKeys) {
                await glossaryApi.deleteKeyword(id)
            }
            globalMessage.success(t('glossary.keyword.bulkDeleteSuccess', { count: selectedRowKeys.length }))
            setSelectedRowKeys([])
            keywordHook.refresh()
        } catch (error: any) {
            globalMessage.error(error?.message || t('common.error'))
        } finally {
            setBulkDeleting(false)
        }
    }

    // ========================================================================
    // Row Selection
    // ========================================================================

    const toggleRow = (id: string) => {
        setSelectedRowKeys(prev =>
            prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
        )
    }

    const toggleAll = () => {
        if (selectedRowKeys.length === filteredKeywords.length) {
            setSelectedRowKeys([])
        } else {
            setSelectedRowKeys(filteredKeywords.map(k => k.id))
        }
    }

    // ========================================================================
    // Pagination
    // ========================================================================

    const totalPages = Math.ceil(filteredKeywords.length / pageSize)
    const paginatedKeywords = filteredKeywords.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    // ========================================================================
    // Render
    // ========================================================================

    return (
        <div className="flex flex-col gap-3 h-full">
            {/* Search & Actions toolbar */}
            <div className="flex items-center gap-2">
                <div className="relative max-w-md">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                        placeholder={t('glossary.keyword.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                {/* Bulk delete button — visible when items are selected */}
                {isAdmin && selectedRowKeys.length > 0 && (
                    <Button
                        variant="destructive"
                        size="sm"
                        disabled={bulkDeleting}
                        onClick={handleBulkDelete}
                    >
                        <Trash2 size={16} className="mr-1" />
                        {bulkDeleting ? '...' : t('glossary.keyword.deleteSelected', { count: selectedRowKeys.length })}
                    </Button>
                )}
                {isAdmin && (
                    <div className="flex items-center gap-2 ml-auto">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" onClick={() => setIsBulkImportOpen(true)}>
                                        <Upload size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('glossary.keywordImport.button')}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <Button onClick={() => openModal()}>
                            <Plus size={16} className="mr-1" />
                            {t('glossary.keyword.add')}
                        </Button>
                    </div>
                )}
            </div>

            {/* Keywords Table */}
            <Card className="dark:bg-slate-800 dark:border-slate-700 flex-1 min-h-0 overflow-hidden">
                <CardContent className="p-0 h-full flex flex-col">
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Spinner size={48} />
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {isAdmin && (
                                                <TableHead className="w-10">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedRowKeys.length === filteredKeywords.length && filteredKeywords.length > 0}
                                                        onChange={toggleAll}
                                                        className="rounded"
                                                    />
                                                </TableHead>
                                            )}
                                            <TableHead>{t('glossary.keyword.name')}</TableHead>
                                            <TableHead>{t('glossary.keyword.enKeyword')}</TableHead>
                                            <TableHead>{t('glossary.keyword.description')}</TableHead>
                                            {isAdmin && <TableHead className="w-[100px]">{t('common.actions')}</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedKeywords.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={isAdmin ? 5 : 3} className="text-center py-8 text-slate-500">
                                                    {t('glossary.keyword.empty')}
                                                </TableCell>
                                            </TableRow>
                                        ) : paginatedKeywords.map((kw) => (
                                            <TableRow key={kw.id}>
                                                {isAdmin && (
                                                    <TableCell>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRowKeys.includes(kw.id)}
                                                            onChange={() => toggleRow(kw.id)}
                                                            className="rounded"
                                                        />
                                                    </TableCell>
                                                )}
                                                <TableCell>
                                                    <span className="flex items-center gap-2">
                                                        <Tag size={14} className="text-slate-400 flex-shrink-0" />
                                                        <span className="font-medium">{kw.name}</span>
                                                    </span>
                                                </TableCell>
                                                <TableCell className="truncate max-w-[200px]">{kw.en_keyword}</TableCell>
                                                <TableCell className="truncate max-w-[200px]">{kw.description}</TableCell>
                                                {isAdmin && (
                                                    <TableCell>
                                                        <span className="inline-flex gap-1">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openModal(kw)}>
                                                                <Edit2 size={14} />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(kw)}>
                                                                <Trash2 size={14} />
                                                            </Button>
                                                        </span>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            {totalPages > 1 && (
                                <div className="p-3 border-t flex items-center justify-between">
                                    <span className="text-sm text-slate-500">{filteredKeywords.length} items</span>
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

            {/* Keyword Create/Edit Modal */}
            <Dialog open={isModalOpen} onOpenChange={(open: boolean) => !open && closeModal()}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>
                            {editingKeyword ? t('glossary.keyword.editTitle') : t('glossary.keyword.createTitle')}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="flex flex-col gap-4">
                        <div>
                            <Label>{t('glossary.keyword.name')} *</Label>
                            <Input
                                placeholder={t('glossary.keyword.namePlaceholder')}
                                value={formData.name}
                                onChange={(e) => setFormField('name', e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <Label>{t('glossary.keyword.enKeyword')}</Label>
                            <Input
                                placeholder={t('glossary.keyword.enKeywordPlaceholder')}
                                value={formData.en_keyword}
                                onChange={(e) => setFormField('en_keyword', e.target.value)}
                            />
                        </div>

                        <div>
                            <Label>{t('glossary.keyword.description')}</Label>
                            <textarea
                                rows={2}
                                placeholder={t('glossary.keyword.descriptionPlaceholder')}
                                value={formData.description}
                                onChange={(e) => setFormField('description', e.target.value)}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                        </div>

                        <div className="flex gap-4">
                            <div className="w-32">
                                <Label>{t('glossary.common.sortOrder')}</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={formData.sort_order}
                                    onChange={(e) => setFormField('sort_order', parseInt(e.target.value) || 0)}
                                />
                            </div>
                            <div className="flex items-center gap-2 pt-5">
                                <Switch
                                    checked={formData.is_active}
                                    onCheckedChange={(checked: boolean) => setFormField('is_active', checked)}
                                />
                                <Label>{t('glossary.common.active')}</Label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={closeModal}>{t('common.cancel')}</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? '...' : t('common.save')}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Keyword Bulk Import Modal */}
            <KeywordBulkImportModal
                open={isBulkImportOpen}
                onClose={() => setIsBulkImportOpen(false)}
                onSuccess={() => {
                    keywordHook.refresh()
                    setIsBulkImportOpen(false)
                }}
            />
        </div>
    )
}
