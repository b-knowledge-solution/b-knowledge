/**
 * @fileoverview Unit tests for the FeedbackExportButton component.
 *
 * Tests rendering, export API call, CSV conversion, download trigger,
 * loading state, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback || key,
    }),
}))

// Mock sonner toast
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
    toast: {
        error: (...args: any[]) => mockToastError(...args),
    },
}))

// Mock the exportFeedback API function
const mockExportFeedback = vi.fn()
vi.mock('@/features/histories/api/historiesApi', () => ({
    exportFeedback: (...args: any[]) => mockExportFeedback(...args),
}))

import { FeedbackExportButton } from '../../../src/features/histories/components/FeedbackExportButton'
import type { FilterState } from '../../../src/features/histories/types/histories.types'

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

const defaultFilters: FilterState = {
    email: '',
    startDate: '',
    endDate: '',
    sourceName: '',
    feedbackFilter: 'all',
}

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn()
Object.defineProperty(URL, 'createObjectURL', { value: mockCreateObjectURL })
Object.defineProperty(URL, 'revokeObjectURL', { value: mockRevokeObjectURL })

describe('FeedbackExportButton', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should render export button with correct label', () => {
        render(<FeedbackExportButton filters={defaultFilters} />)

        const button = screen.getByRole('button')
        expect(button).toBeInTheDocument()
        expect(button).toHaveTextContent('Export feedback')
    })

    it('should call exportFeedback API when clicked', async () => {
        // Return mock data from the export API
        mockExportFeedback.mockResolvedValueOnce([
            { query: 'test', answer: 'response', thumbup: true, comment: '', source: 'chat', user_email: 'a@b.com', created_at: '2024-01-01' },
        ])

        render(<FeedbackExportButton filters={defaultFilters} />)

        const button = screen.getByRole('button')
        fireEvent.click(button)

        await waitFor(() => {
            expect(mockExportFeedback).toHaveBeenCalledWith(defaultFilters)
        })
    })

    it('should convert returned data to CSV and trigger download', async () => {
        // Mock document.createElement to capture download link
        const mockClick = vi.fn()
        const mockLink = {
            href: '',
            download: '',
            click: mockClick,
        }
        const originalCreateElement = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            if (tag === 'a') return mockLink as any
            return originalCreateElement(tag)
        })
        vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any)
        vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any)

        mockExportFeedback.mockResolvedValueOnce([
            { query: 'q1', answer: 'a1', thumbup: true, comment: '', source: 'chat', user_email: 'u@e.com', created_at: '2024-01-01' },
        ])

        render(<FeedbackExportButton filters={defaultFilters} />)

        fireEvent.click(screen.getByRole('button'))

        await waitFor(() => {
            // Verify download link was created and clicked
            expect(mockClick).toHaveBeenCalled()
            expect(mockLink.download).toContain('feedback-export-')
            expect(mockCreateObjectURL).toHaveBeenCalled()
        })
    })

    it('should show loading spinner while exporting', async () => {
        // Create a never-resolving promise to keep loading state active
        let resolveExport: any
        mockExportFeedback.mockReturnValue(
            new Promise((resolve) => { resolveExport = resolve })
        )

        render(<FeedbackExportButton filters={defaultFilters} />)

        const button = screen.getByRole('button')
        fireEvent.click(button)

        // Button should show loading text and be disabled
        await waitFor(() => {
            expect(screen.getByRole('button')).toBeDisabled()
            expect(screen.getByRole('button')).toHaveTextContent('Exporting...')
        })

        // Clean up by resolving
        resolveExport([])
    })

    it('should show error toast on API failure', async () => {
        mockExportFeedback.mockRejectedValueOnce(new Error('Network error'))

        render(<FeedbackExportButton filters={defaultFilters} />)

        fireEvent.click(screen.getByRole('button'))

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith(
                'Failed to export feedback. Check your filters and try again.'
            )
        })
    })
})
