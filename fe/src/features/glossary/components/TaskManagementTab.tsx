/**
 * @fileoverview Task Management tab component for the Glossary page.
 * Renders the task table with search, CRUD actions, multi-select bulk delete, and the task modal.
 * @module features/glossary/components/TaskManagementTab
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit2, Trash2, Search, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Spinner } from '@/components/ui/spinner'

import { glossaryApi } from '../api/glossaryApi'
import type { UseGlossaryTasksReturn } from '../hooks/useGlossaryTasks'
import { globalMessage } from '@/app/App'

/**
 * Props for the TaskManagementTab component.
 * @description Receives the task hook return and admin flag from the parent.
 */
interface TaskManagementTabProps {
    /** All values and handlers from useGlossaryTasks. */
    taskHook: UseGlossaryTasksReturn
    /** Whether the current user has admin/leader privileges. */
    isAdmin: boolean
    /** Callback to open the bulk import modal. */
    onOpenBulkImport: () => void
}

/**
 * Task Management tab — table with search, CRUD actions, multi-select bulk delete, and a create/edit modal.
 * @param props - Component props.
 * @returns React element.
 */
export const TaskManagementTab: React.FC<TaskManagementTabProps> = ({
    taskHook,
    isAdmin,
    onOpenBulkImport,
}) => {
    const { t } = useTranslation()

    // Row selection state for bulk delete
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [pageSize] = useState(20)
    const [currentPage, setCurrentPage] = useState(1)

    const {
        filteredTasks,
        loading,
        search,
        setSearch,
        isModalOpen,
        editingTask,
        submitting,
        formData,
        setFormField,
        openModal,
        closeModal,
        handleSubmit,
        handleDelete,
    } = taskHook

    // ========================================================================
    // Bulk Delete Handler
    // ========================================================================

    const handleBulkDelete = async () => {
        if (!window.confirm(t('glossary.task.bulkDeleteMessage', { count: selectedRowKeys.length }))) return
        setBulkDeleting(true)
        try {
            for (const id of selectedRowKeys) {
                await glossaryApi.deleteTask(id)
            }
            globalMessage.success(t('glossary.task.bulkDeleteSuccess', { count: selectedRowKeys.length }))
            setSelectedRowKeys([])
            taskHook.refresh()
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
        if (selectedRowKeys.length === filteredTasks.length) {
            setSelectedRowKeys([])
        } else {
            setSelectedRowKeys(filteredTasks.map(t => t.id))
        }
    }

    // ========================================================================
    // Pagination
    // ========================================================================

    const totalPages = Math.ceil(filteredTasks.length / pageSize)
    const paginatedTasks = filteredTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
                        placeholder={t('glossary.task.searchPlaceholder')}
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
                        {bulkDeleting ? '...' : t('glossary.task.deleteSelected', { count: selectedRowKeys.length })}
                    </Button>
                )}
                {isAdmin && (
                    <div className="flex items-center gap-2 ml-auto">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" onClick={onOpenBulkImport}>
                                        <Upload size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('glossary.bulkImport.button')}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <Button onClick={() => openModal()}>
                            <Plus size={16} className="mr-1" />
                            {t('glossary.task.add')}
                        </Button>
                    </div>
                )}
            </div>

            {/* Tasks Table */}
            <Card className="dark:bg-slate-800 dark:border-slate-700 flex-1 min-h-0">
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
                                                        checked={selectedRowKeys.length === filteredTasks.length && filteredTasks.length > 0}
                                                        onChange={toggleAll}
                                                        className="rounded"
                                                    />
                                                </TableHead>
                                            )}
                                            <TableHead className="w-[120px]">{t('glossary.task.name')}</TableHead>
                                            <TableHead className="w-[160px]">{t('glossary.task.taskInstructionEn')}</TableHead>
                                            <TableHead className="w-[160px]">{t('glossary.task.taskInstructionJa')}</TableHead>
                                            <TableHead className="w-[160px]">{t('glossary.task.taskInstructionVi')}</TableHead>
                                            {isAdmin && <TableHead className="w-[60px]">{t('common.actions')}</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedTasks.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={isAdmin ? 6 : 4} className="text-center py-8 text-slate-500">
                                                    {t('common.noData')}
                                                </TableCell>
                                            </TableRow>
                                        ) : paginatedTasks.map((task) => (
                                            <TableRow key={task.id}>
                                                {isAdmin && (
                                                    <TableCell>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRowKeys.includes(task.id)}
                                                            onChange={() => toggleRow(task.id)}
                                                            className="rounded"
                                                        />
                                                    </TableCell>
                                                )}
                                                <TableCell className="font-medium break-words">{task.name}</TableCell>
                                                <TableCell className="break-words whitespace-normal">{task.task_instruction_en}</TableCell>
                                                <TableCell className="break-words whitespace-normal">{task.task_instruction_ja}</TableCell>
                                                <TableCell className="break-words whitespace-normal">{task.task_instruction_vi}</TableCell>
                                                {isAdmin && (
                                                    <TableCell>
                                                        <span className="inline-flex gap-0">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openModal(task)}>
                                                                <Edit2 size={12} />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(task)}>
                                                                <Trash2 size={12} />
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
                                    <span className="text-sm text-slate-500">{filteredTasks.length} items</span>
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

            {/* Task Create/Edit Modal */}
            <Dialog open={isModalOpen} onOpenChange={(open: boolean) => !open && closeModal()}>
                <DialogContent className="sm:max-w-[700px]">
                    <DialogHeader>
                        <DialogTitle>
                            {editingTask ? t('glossary.task.editTitle') : t('glossary.task.createTitle')}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="flex flex-col gap-4">
                        <div>
                            <Label>{t('glossary.task.name')} *</Label>
                            <Input
                                placeholder={t('glossary.task.namePlaceholder')}
                                value={formData.name}
                                onChange={(e) => setFormField('name', e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <Label>{t('glossary.task.description')}</Label>
                            <textarea
                                rows={2}
                                placeholder={t('glossary.task.descriptionPlaceholder')}
                                value={formData.description}
                                onChange={(e) => setFormField('description', e.target.value)}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                        </div>

                        <div>
                            <Label>{t('glossary.task.taskInstructionEn')} *</Label>
                            <textarea
                                rows={2}
                                placeholder={t('glossary.task.taskInstructionPlaceholderEn')}
                                value={formData.task_instruction_en}
                                onChange={(e) => setFormField('task_instruction_en', e.target.value)}
                                required
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                        </div>

                        <div>
                            <Label>{t('glossary.task.taskInstructionJa')}</Label>
                            <textarea
                                rows={2}
                                placeholder={t('glossary.task.taskInstructionPlaceholderJa')}
                                value={formData.task_instruction_ja}
                                onChange={(e) => setFormField('task_instruction_ja', e.target.value)}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                        </div>

                        <div>
                            <Label>{t('glossary.task.taskInstructionVi')}</Label>
                            <textarea
                                rows={2}
                                placeholder={t('glossary.task.taskInstructionPlaceholderVi')}
                                value={formData.task_instruction_vi}
                                onChange={(e) => setFormField('task_instruction_vi', e.target.value)}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
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
        </div>
    )
}
