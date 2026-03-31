/**
 * @fileoverview Feedback CSV export button component.
 * Downloads feedback records as CSV based on current filter state.
 *
 * @module features/histories/components/FeedbackExportButton
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { exportFeedback } from '../api/historiesApi'
import type { FilterState } from '../types/histories.types'

/**
 * Props for the FeedbackExportButton component.
 */
interface FeedbackExportButtonProps {
    /** Current filter state to scope the export. */
    filters: FilterState
}

/**
 * @description Escape a CSV field value by wrapping in double quotes if it contains commas, quotes, or newlines.
 * @param {unknown} value - Field value to escape.
 * @returns {string} Escaped CSV field string.
 */
function escapeCsvField(value: unknown): string {
    const str = String(value ?? '')
    // Wrap in quotes if field contains comma, double quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

/**
 * @description Convert an array of feedback records to a CSV string.
 * @param {any[]} data - Array of feedback records.
 * @returns {string} CSV formatted string.
 */
function convertToCsv(data: any[]): string {
    const headers = ['query', 'answer', 'thumbup', 'comment', 'source', 'user_email', 'created_at']
    const headerRow = headers.join(',')

    const rows = data.map(record => {
        return headers.map(header => {
            const value = record[header]
            return escapeCsvField(value)
        }).join(',')
    })

    return [headerRow, ...rows].join('\n')
}

/**
 * @description Trigger a browser download of a string as a file.
 * @param {string} content - File content.
 * @param {string} filename - Desired filename.
 * @param {string} mimeType - MIME type of the file.
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    // Clean up the temporary link and object URL
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

/**
 * @description Button that exports feedback records as CSV.
 * Shows loading state during export and error toast on failure.
 * @param {FeedbackExportButtonProps} props - Component props.
 * @returns {JSX.Element} Rendered export button.
 */
export const FeedbackExportButton = ({ filters }: FeedbackExportButtonProps) => {
    const { t } = useTranslation()
    const [isExporting, setIsExporting] = useState(false)

    /**
     * @description Handle export button click -- fetch feedback data, convert to CSV, and trigger download.
     */
    const handleExport = async () => {
        setIsExporting(true)
        try {
            // Fetch feedback records from the API
            const data = await exportFeedback(filters)
            // Convert to CSV and trigger browser download
            const csv = convertToCsv(data)
            const timestamp = new Date().toISOString().split('T')[0]
            downloadFile(csv, `feedback-export-${timestamp}.csv`, 'text/csv;charset=utf-8;')
        } catch {
            // Show error toast on failure
            toast.error(t('histories.exportFeedbackError', 'Failed to export feedback. Check your filters and try again.'))
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            aria-busy={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {isExporting ? (
                <>
                    <Loader2 size={16} className="animate-spin" />
                    {t('histories.exportingFeedback', 'Exporting...')}
                </>
            ) : (
                <>
                    <Download size={16} />
                    {t('histories.exportFeedback', 'Export feedback')}
                </>
            )}
        </button>
    )
}
