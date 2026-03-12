/**
 * @fileoverview Custom hook for glossary keyword management.
 * Uses TanStack Query for data fetching and mutations.
 * Handles CRUD operations, filtering, and form state.
 * Keywords are standalone entities (not linked to tasks).
 * @module features/glossary/hooks/useGlossaryKeywords
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { glossaryApi, type GlossaryKeyword, type CreateKeywordDto } from '../api/glossaryApi'
import { globalMessage } from '@/app/App'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Form data type
// ============================================================================

/** @description Form data shape for the keyword create/edit form. */
export interface KeywordFormData {
    name: string
    en_keyword: string
    description: string
    sort_order: number
    is_active: boolean
}

const EMPTY_FORM: KeywordFormData = {
    name: '',
    en_keyword: '',
    description: '',
    sort_order: 0,
    is_active: true,
}

// ============================================================================
// Return type
// ============================================================================

/** @description Return type for the useGlossaryKeywords hook. */
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
    handleDelete: (keyword: GlossaryKeyword) => void
    /** Refresh the keyword list. */
    refresh: () => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook for managing glossary keywords with TanStack Query.
 * @param enabled - Whether to fetch keywords (set false to defer).
 * @returns Object with keyword state and handlers.
 */
export function useGlossaryKeywords(enabled = true): UseGlossaryKeywordsReturn {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    // Local UI state
    const [search, setSearch] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingKeyword, setEditingKeyword] = useState<GlossaryKeyword | null>(null)
    const [formData, setFormData] = useState<KeywordFormData>(EMPTY_FORM)

    /**
     * @description Update a single form field.
     * @param key - The field name.
     * @param value - The new value.
     */
    const setFormField = <K extends keyof KeywordFormData>(key: K, value: KeywordFormData[K]) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }

    // ========================================================================
    // Data Fetching
    // ========================================================================

    // Fetch all keywords via TanStack Query
    const keywordsQuery = useQuery({
        queryKey: queryKeys.glossary.keywords(),
        queryFn: () => glossaryApi.listKeywords(),
        enabled,
    })

    // Resolved keywords list
    const keywords = keywordsQuery.data ?? []

    // ========================================================================
    // Filtering
    // ========================================================================

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

    // ========================================================================
    // Mutations
    // ========================================================================

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

    // ========================================================================
    // Modal Handlers
    // ========================================================================

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
            setFormData(EMPTY_FORM)
        }
        setIsModalOpen(true)
    }

    /** @description Close the modal and reset form. */
    const closeModal = () => {
        setIsModalOpen(false)
        setEditingKeyword(null)
        setFormData(EMPTY_FORM)
    }

    // ========================================================================
    // CRUD Handlers
    // ========================================================================

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
    const handleDelete = (keyword: GlossaryKeyword) => {
        // Show native confirmation dialog
        if (!confirm(t('glossary.keyword.deleteConfirm', { name: keyword.name }))) return

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

    // ========================================================================
    // Return
    // ========================================================================

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
