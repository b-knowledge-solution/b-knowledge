/**
 * @fileoverview Hook for glossary task state management and CRUD operations.
 * Encapsulates task list, search, modal state, and API interactions.
 * @module features/glossary/hooks/useGlossaryTasks
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
    glossaryApi,
    type GlossaryTask,
    type CreateTaskDto,
} from '../api/glossaryApi'
import { globalMessage } from '@/app/App'

/** Form data shape for the task create/edit form. */
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

/**
 * Return type for the useGlossaryTasks hook.
 * @description Exposes state values and handler functions for task management.
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

/**
 * Custom hook for managing glossary tasks.
 * @description Handles fetching, searching, CRUD operations, and modal state.
 * @returns Task state and handler functions.
 */
export const useGlossaryTasks = (): UseGlossaryTasksReturn => {
    const { t } = useTranslation()

    // List state
    const [tasks, setTasks] = useState<GlossaryTask[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingTask, setEditingTask] = useState<GlossaryTask | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [formData, setFormData] = useState<TaskFormData>(EMPTY_FORM)

    /** Update a single form field. */
    const setFormField = useCallback(<K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }, [])

    /**
     * Fetch all tasks from the API.
     * @description Called on mount and after any CRUD operation.
     */
    const fetchTasks = useCallback(async () => {
        setLoading(true)
        try {
            const data = await glossaryApi.listTasks()
            setTasks(data)
        } catch (error) {
            console.error('Error fetching tasks:', error)
            globalMessage.error(t('common.error'))
        } finally {
            setLoading(false)
        }
    }, [t])

    // Load tasks on mount
    useEffect(() => {
        fetchTasks()
    }, [fetchTasks])

    /** Filter tasks by search term (client-side). */
    const filteredTasks = tasks.filter((task) =>
        task.name.toLowerCase().includes(search.toLowerCase())
    )

    /**
     * Open task create/edit modal.
     * @param task - Task to edit, or undefined for create mode.
     */
    const openModal = (task?: GlossaryTask) => {
        setEditingTask(task || null)
        if (task) {
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
            setFormData(EMPTY_FORM)
        }
        setIsModalOpen(true)
    }

    /** Close the modal. */
    const closeModal = () => setIsModalOpen(false)

    /**
     * Handle task form submit (create or update).
     */
    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            globalMessage.error(t('glossary.task.nameRequired'))
            return
        }
        if (!formData.task_instruction_en.trim()) {
            globalMessage.error(t('glossary.task.taskInstructionRequired'))
            return
        }
        setSubmitting(true)
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
                await glossaryApi.updateTask(editingTask.id, payload)
                globalMessage.success(t('glossary.task.updateSuccess'))
            } else {
                await glossaryApi.createTask(payload)
                globalMessage.success(t('glossary.task.createSuccess'))
            }
            setIsModalOpen(false)
            fetchTasks()
        } catch (error: any) {
            const msg = error?.response?.data?.error || error?.message || t('common.error')
            globalMessage.error(msg)
        } finally {
            setSubmitting(false)
        }
    }

    /**
     * Confirm and delete a task.
     * @param task - The task to delete.
     */
    const handleDelete = (task: GlossaryTask) => {
        if (!window.confirm(t('glossary.task.confirmDeleteMessage', { name: task.name }))) return
        glossaryApi.deleteTask(task.id)
            .then(() => {
                globalMessage.success(t('glossary.task.deleteSuccess'))
                fetchTasks()
            })
            .catch((error: any) => {
                globalMessage.error(error?.message || t('common.error'))
            })
    }

    return {
        tasks,
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
        refresh: fetchTasks,
    }
}
