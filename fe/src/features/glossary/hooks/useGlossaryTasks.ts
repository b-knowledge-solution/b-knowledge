/**
 * @fileoverview Hook for glossary task state management and CRUD operations.
 * Uses TanStack Query for data fetching and mutations.
 * @module features/glossary/hooks/useGlossaryTasks
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    glossaryApi,
    type GlossaryTask,
    type CreateTaskDto,
} from '../api/glossaryApi'
import { globalMessage } from '@/app/App'
import { queryKeys } from '@/lib/queryKeys'

/** @description Form data shape for the task create/edit form. */
export interface TaskFormData {
    name: string
    description: string
    task_instruction_en: string
    task_instruction_ja: string
    task_instruction_vi: string
    context_template: string
    sort_order: number
    is_active: boolean
}

const EMPTY_FORM: TaskFormData = {
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
// Return Type
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
    handleDelete: (task: GlossaryTask) => void
    /** Re-fetch the task list from the server. */
    refresh: () => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Custom hook for managing glossary tasks with TanStack Query.
 * Handles fetching, searching, CRUD operations, and modal state.
 * @returns Task state and handler functions.
 */
export const useGlossaryTasks = (): UseGlossaryTasksReturn => {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    // Local UI state
    const [search, setSearch] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingTask, setEditingTask] = useState<GlossaryTask | null>(null)
    const [formData, setFormData] = useState<TaskFormData>(EMPTY_FORM)

    /**
     * @description Update a single form field.
     * @param key - The field name.
     * @param value - The new value.
     */
    const setFormField = <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }

    // ========================================================================
    // Data Fetching
    // ========================================================================

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

    // ========================================================================
    // Mutations
    // ========================================================================

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

    // ========================================================================
    // Modal Handlers
    // ========================================================================

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
            setFormData(EMPTY_FORM)
        }
        setIsModalOpen(true)
    }

    /** @description Close the modal. */
    const closeModal = () => setIsModalOpen(false)

    // ========================================================================
    // CRUD Handlers
    // ========================================================================

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
    const handleDelete = (task: GlossaryTask) => {
        // Show native confirmation dialog
        if (!window.confirm(t('glossary.task.confirmDeleteMessage', { name: task.name }))) return

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
