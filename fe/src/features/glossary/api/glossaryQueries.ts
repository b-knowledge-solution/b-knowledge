/**
 * @fileoverview TanStack Query hooks for glossary keywords and tasks.
 * Handles CRUD operations, filtering, and form state for both entities.
 * @module features/glossary/api/glossaryQueries
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useConfirm } from '@/components/ConfirmDialog'
import { glossaryApi } from './glossaryApi'
import type { GlossaryKeyword, CreateKeywordDto, GlossaryTask, CreateTaskDto } from './glossaryApi'
import type { KeywordFormData, TaskFormData } from '../types/glossary.types'
import { globalMessage } from '@/app/App'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Constants
// ============================================================================

const EMPTY_KEYWORD_FORM: KeywordFormData = {
    name: '',
    en_keyword: '',
    description: '',
    sort_order: 0,
    is_active: true,
}

const EMPTY_TASK_FORM: TaskFormData = {
    name: '',
    description: '',
    task_instruction_en: '',
    task_instruction_ja: '',
    task_instruction_vi: '',
    context_template: '',
    sort_order: 0,
    is_active: true,
}

// ============================================================================
// Keyword Query Hook
// ============================================================================

/**
 * @description Return type for the useGlossaryKeywords hook.
 */
export interface UseGlossaryKeywordsReturn {
    /** Filtered list of keywords matching the current search. */
    filteredKeywords: GlossaryKeyword[]
    /** Whether data is being loaded. */
    loading: boolean
    /** Current search text. */
    search: string
    /** Set the search text. */
    setSearch: (value: string) => void
    /** Whether the create/edit modal is open. */
    isModalOpen: boolean
    /** The keyword being edited (null for create). */
    editingKeyword: GlossaryKeyword | null
    /** Whether a form submission is in progress. */
    submitting: boolean
    /** Current form data for the keyword modal. */
    formData: KeywordFormData
    /** Update a single field in the form data. */
    setFormField: <K extends keyof KeywordFormData>(key: K, value: KeywordFormData[K]) => void
    /** Open the modal for creating or editing a keyword. */
    openModal: (keyword?: GlossaryKeyword) => void
    /** Close the modal. */
    closeModal: () => void
    /** Handle form submission (create or update). */
    handleSubmit: () => Promise<void>
    /** Handle keyword deletion with confirmation. */
    handleDelete: (keyword: GlossaryKeyword) => Promise<void>
    /** Refresh the keyword list. */
    refresh: () => void
}

/**
 * @description Hook for managing glossary keywords with TanStack Query.
 * @param enabled - Whether to fetch keywords (set false to defer).
 * @returns {UseGlossaryKeywordsReturn} Object with keyword state and handlers.
 */
export function useGlossaryKeywords(enabled = true): UseGlossaryKeywordsReturn {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const queryClient = useQueryClient()

    // Local UI state
    const [search, setSearch] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingKeyword, setEditingKeyword] = useState<GlossaryKeyword | null>(null)
    const [formData, setFormData] = useState<KeywordFormData>(EMPTY_KEYWORD_FORM)

    /**
     * @description Update a single form field.
     * @param key - The field name.
     * @param value - The new value.
     */
    const setFormField = <K extends keyof KeywordFormData>(key: K, value: KeywordFormData[K]) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }

    // Fetch all keywords via TanStack Query
    const keywordsQuery = useQuery({
        queryKey: queryKeys.glossary.keywords(),
        queryFn: () => glossaryApi.listKeywords(),
        enabled,
    })

    // Resolved keywords list
    const keywords = keywordsQuery.data ?? []

    /** @description Filter keywords by search text (matches name, en_keyword, description). */
    const filteredKeywords = (() => {
        if (!search.trim()) return keywords
        const query = search.toLowerCase()
        return keywords.filter((kw) =>
            kw.name.toLowerCase().includes(query) ||
            kw.en_keyword?.toLowerCase().includes(query) ||
            kw.description?.toLowerCase().includes(query)
        )
    })()

    // Create keyword mutation
    const createMutation = useMutation({
        mutationKey: ['create', 'glossary', 'keyword'],
        mutationFn: (payload: CreateKeywordDto) => glossaryApi.createKeyword(payload),
        onSuccess: () => {
            globalMessage.success(t('glossary.keyword.createSuccess'))
            // Refetch keywords after creation
            queryClient.invalidateQueries({ queryKey: queryKeys.glossary.keywords() })
        },
    })

    // Update keyword mutation
    const updateMutation = useMutation({
        mutationKey: ['update', 'glossary', 'keyword'],
        mutationFn: ({ id, payload }: { id: string; payload: CreateKeywordDto }) =>
            glossaryApi.updateKeyword(id, payload),
        onSuccess: () => {
            globalMessage.success(t('glossary.keyword.updateSuccess'))
            // Refetch keywords after update
            queryClient.invalidateQueries({ queryKey: queryKeys.glossary.keywords() })
        },
    })

    // Delete keyword mutation
    const deleteMutation = useMutation({
        mutationKey: ['delete', 'glossary', 'keyword'],
        mutationFn: (id: string) => glossaryApi.deleteKeyword(id),
        onSuccess: () => {
            globalMessage.success(t('glossary.keyword.deleteSuccess'))
            // Refetch keywords after deletion
            queryClient.invalidateQueries({ queryKey: queryKeys.glossary.keywords() })
        },
    })

    /**
     * @description Open the create/edit modal.
     * @param keyword - If provided, opens in edit mode.
     */
    const openModal = (keyword?: GlossaryKeyword) => {
        if (keyword) {
            // Edit mode — populate form with existing data
            setEditingKeyword(keyword)
            setFormData({
                name: keyword.name,
                en_keyword: keyword.en_keyword || '',
                description: keyword.description || '',
                sort_order: keyword.sort_order ?? 0,
                is_active: keyword.is_active ?? true,
            })
        } else {
            // Create mode — reset form
            setEditingKeyword(null)
            setFormData(EMPTY_KEYWORD_FORM)
        }
        setIsModalOpen(true)
    }

    /** @description Close the modal and reset form. */
    const closeModal = () => {
        setIsModalOpen(false)
        setEditingKeyword(null)
        setFormData(EMPTY_KEYWORD_FORM)
    }

    /**
     * @description Handle form submission — create or update.
     */
    const handleSubmit = async () => {
        const payload: CreateKeywordDto = {
            name: formData.name,
            en_keyword: formData.en_keyword,
            description: formData.description,
            sort_order: formData.sort_order,
            is_active: formData.is_active,
        }
        try {
            if (editingKeyword) {
                // Update existing keyword
                await updateMutation.mutateAsync({ id: editingKeyword.id, payload })
            } else {
                // Create new keyword
                await createMutation.mutateAsync(payload)
            }
            closeModal()
        } catch (error: any) {
            globalMessage.error(error?.message || t('common.error'))
        }
    }

    /**
     * @description Handle keyword deletion with confirmation dialog.
     * @param keyword - The keyword to delete.
     */
    const handleDelete = async (keyword: GlossaryKeyword) => {
        // Show styled confirmation dialog before deleting keyword
        const confirmed = await confirm({
            title: t('common.delete'),
            message: t('glossary.keyword.deleteConfirm', { name: keyword.name }),
            variant: 'danger',
            confirmText: t('common.delete'),
        })
        if (!confirmed) return

        deleteMutation.mutate(keyword.id, {
            onError: (error: any) => {
                globalMessage.error(error?.message || t('common.error'))
            },
        })
    }

    /** @description Manually refresh the keyword list. */
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.glossary.keywords() })
    }

    return {
        filteredKeywords,
        loading: keywordsQuery.isLoading,
        search,
        setSearch,
        isModalOpen,
        editingKeyword,
        submitting: createMutation.isPending || updateMutation.isPending,
        formData,
        setFormField,
        openModal,
        closeModal,
        handleSubmit,
        handleDelete,
        refresh,
    }
}

// ============================================================================
// Task Query Hook
// ============================================================================

/**
 * @description Return type for the useGlossaryTasks hook.
 * Exposes state values and handler functions for task management.
 */
export interface UseGlossaryTasksReturn {
    /** All fetched tasks (unfiltered). Shared with keyword tab for dropdown. */
    tasks: GlossaryTask[]
    /** Tasks filtered by search term. */
    filteredTasks: GlossaryTask[]
    /** Whether the task list is loading. */
    loading: boolean
    /** Current search input value. */
    search: string
    /** Update the search input value. */
    setSearch: (value: string) => void
    /** Whether the create/edit modal is open. */
    isModalOpen: boolean
    /** The task being edited, or null for create mode. */
    editingTask: GlossaryTask | null
    /** Whether the form is submitting. */
    submitting: boolean
    /** Current form data for the task modal. */
    formData: TaskFormData
    /** Update a single field in the form data. */
    setFormField: <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) => void
    /** Open the modal for creating or editing a task. */
    openModal: (task?: GlossaryTask) => void
    /** Close the modal. */
    closeModal: () => void
    /** Handle form submission (create or update). */
    handleSubmit: () => Promise<void>
    /** Confirm and delete a task. */
    handleDelete: (task: GlossaryTask) => Promise<void>
    /** Re-fetch the task list from the server. */
    refresh: () => void
}

/**
 * @description Custom hook for managing glossary tasks with TanStack Query.
 * Handles fetching, searching, CRUD operations, and modal state.
 * @returns {UseGlossaryTasksReturn} Task state and handler functions.
 */
export const useGlossaryTasks = (): UseGlossaryTasksReturn => {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const queryClient = useQueryClient()

    // Local UI state
    const [search, setSearch] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingTask, setEditingTask] = useState<GlossaryTask | null>(null)
    const [formData, setFormData] = useState<TaskFormData>(EMPTY_TASK_FORM)

    /**
     * @description Update a single form field.
     * @param key - The field name.
     * @param value - The new value.
     */
    const setFormField = <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }

    // Fetch all tasks via TanStack Query
    const tasksQuery = useQuery({
        queryKey: queryKeys.glossary.tasks(),
        queryFn: () => glossaryApi.listTasks(),
    })

    // Resolved tasks list
    const tasks = tasksQuery.data ?? []

    /** @description Filter tasks by search term (client-side). */
    const filteredTasks = tasks.filter((task) =>
        task.name.toLowerCase().includes(search.toLowerCase())
    )

    // Create task mutation
    const createMutation = useMutation({
        mutationKey: ['create', 'glossary', 'task'],
        mutationFn: (payload: CreateTaskDto & { sort_order?: number; is_active?: boolean }) =>
            glossaryApi.createTask(payload),
        onSuccess: () => {
            globalMessage.success(t('glossary.task.createSuccess'))
            // Refetch tasks after creation
            queryClient.invalidateQueries({ queryKey: queryKeys.glossary.tasks() })
        },
    })

    // Update task mutation
    const updateMutation = useMutation({
        mutationKey: ['update', 'glossary', 'task'],
        mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateTaskDto> & { sort_order?: number; is_active?: boolean } }) =>
            glossaryApi.updateTask(id, payload),
        onSuccess: () => {
            globalMessage.success(t('glossary.task.updateSuccess'))
            // Refetch tasks after update
            queryClient.invalidateQueries({ queryKey: queryKeys.glossary.tasks() })
        },
    })

    // Delete task mutation
    const deleteMutation = useMutation({
        mutationKey: ['delete', 'glossary', 'task'],
        mutationFn: (id: string) => glossaryApi.deleteTask(id),
        onSuccess: () => {
            globalMessage.success(t('glossary.task.deleteSuccess'))
            // Refetch tasks after deletion
            queryClient.invalidateQueries({ queryKey: queryKeys.glossary.tasks() })
        },
    })

    /**
     * @description Open task create/edit modal.
     * @param task - Task to edit, or undefined for create mode.
     */
    const openModal = (task?: GlossaryTask) => {
        setEditingTask(task || null)
        if (task) {
            // Populate form with existing task data
            setFormData({
                name: task.name,
                description: task.description || '',
                task_instruction_en: task.task_instruction_en || '',
                task_instruction_ja: task.task_instruction_ja || '',
                task_instruction_vi: task.task_instruction_vi || '',
                context_template: task.context_template || '',
                sort_order: task.sort_order ?? 0,
                is_active: task.is_active ?? true,
            })
        } else {
            // Reset form for create mode
            setFormData(EMPTY_TASK_FORM)
        }
        setIsModalOpen(true)
    }

    /** @description Close the modal. */
    const closeModal = () => setIsModalOpen(false)

    /**
     * @description Handle task form submit (create or update).
     */
    const handleSubmit = async () => {
        // Validate required fields
        if (!formData.name.trim()) {
            globalMessage.error(t('glossary.task.nameRequired'))
            return
        }
        if (!formData.task_instruction_en.trim()) {
            globalMessage.error(t('glossary.task.taskInstructionRequired'))
            return
        }
        try {
            const payload: CreateTaskDto & { sort_order?: number; is_active?: boolean } = {
                name: formData.name,
                description: formData.description,
                task_instruction_en: formData.task_instruction_en,
                task_instruction_ja: formData.task_instruction_ja,
                task_instruction_vi: formData.task_instruction_vi,
                context_template: formData.context_template,
                sort_order: formData.sort_order,
                is_active: formData.is_active,
            }
            if (editingTask) {
                // Update existing task
                await updateMutation.mutateAsync({ id: editingTask.id, payload })
            } else {
                // Create new task
                await createMutation.mutateAsync(payload)
            }
            setIsModalOpen(false)
        } catch (error: any) {
            const msg = error?.response?.data?.error || error?.message || t('common.error')
            globalMessage.error(msg)
        }
    }

    /**
     * @description Confirm and delete a task.
     * @param task - The task to delete.
     */
    const handleDelete = async (task: GlossaryTask) => {
        // Show styled confirmation dialog before deleting task
        const confirmed = await confirm({
            title: t('common.delete'),
            message: t('glossary.task.confirmDeleteMessage', { name: task.name }),
            variant: 'danger',
            confirmText: t('common.delete'),
        })
        if (!confirmed) return

        deleteMutation.mutate(task.id, {
            onError: (error: any) => {
                globalMessage.error(error?.message || t('common.error'))
            },
        })
    }

    /** @description Manually refresh the task list. */
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.glossary.tasks() })
    }

    return {
        tasks,
        filteredTasks,
        loading: tasksQuery.isLoading,
        search,
        setSearch,
        isModalOpen,
        editingTask,
        submitting: createMutation.isPending || updateMutation.isPending,
        formData,
        setFormField,
        openModal,
        closeModal,
        handleSubmit,
        handleDelete,
        refresh,
    }
}
