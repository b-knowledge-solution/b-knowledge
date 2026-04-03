/**
 * @fileoverview Keyword Bulk Import Modal
 *
 * Parses Excel files with columns: name, en_keyword, description
 * Previews data, then sends to the keyword bulk-import API.
 * @module features/glossary/components/KeywordBulkImportModal
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FileSpreadsheet, AlertCircle, Download, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    glossaryApi,
    type BulkImportKeywordRow,
    type BulkImportKeywordResult,
} from '../api/glossaryApi'
import { globalMessage } from '@/app/App'

// ============================================================================
// Props
// ============================================================================

/** Props for the KeywordBulkImportModal component. */
interface KeywordBulkImportModalProps {
    /** Whether the modal is visible. */
    open: boolean
    /** Callback to close the modal. */
    onClose: () => void
    /** Callback invoked after a successful import. */
    onSuccess: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal for bulk importing keywords via Excel file.
 * @description User uploads an Excel file with columns (name, en_keyword, description),
 * previews the data, then imports keywords.
 * @param props - Component props.
 * @returns React element.
 */
export const KeywordBulkImportModal = ({ open, onClose, onSuccess }: KeywordBulkImportModalProps) => {
    const { t } = useTranslation()

    // State
    const [parsedRows, setParsedRows] = useState<BulkImportKeywordRow[]>([])
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<BulkImportKeywordResult | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    // ========================================================================
    // File Parsing
    // ========================================================================

    /** Parse an Excel file and extract keyword rows. */
    const processFile = (file: File) => {
        setParseError(null)
        setImportResult(null)
        setParsedRows([])

        const reader = new FileReader()
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer)
                const workbook = XLSX.read(data, { type: 'array' })
                const sheet = workbook.Sheets[workbook.SheetNames[0]!]
                if (!sheet) {
                    setParseError(t('glossary.keywordImport.noSheet'))
                    return
                }

                const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)

                if (jsonData.length === 0) {
                    setParseError(t('glossary.keywordImport.emptyFile'))
                    return
                }

                const firstRow = jsonData[0]!
                if (!('name' in firstRow)) {
                    setParseError(t('glossary.keywordImport.missingColumns', { cols: 'name' }))
                    return
                }

                const rows: BulkImportKeywordRow[] = jsonData
                    .filter((row) => row.name && row.name.trim())
                    .map((row) => {
                        const mapped: BulkImportKeywordRow = { name: row.name?.trim() || '' }
                        if (row.en_keyword?.trim()) mapped.en_keyword = row.en_keyword.trim()
                        if (row.description?.trim()) mapped.description = row.description.trim()
                        return mapped
                    })

                if (rows.length === 0) {
                    setParseError(t('glossary.keywordImport.noValidRows'))
                    return
                }

                setParsedRows(rows)
            } catch (err: any) {
                console.error('Excel parse error:', err)
                setParseError(err.message || t('glossary.keywordImport.parseError'))
            }
        }
        reader.readAsArrayBuffer(file)
    }

    /** Handle file input change. */
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        processFile(file)
        e.target.value = ''
    }

    // ========================================================================
    // Drag & Drop
    // ========================================================================

    /** Counter to track nested drag enter/leave events from child elements. */
    const dragCounter = useRef(0)

    /** Prevent default to allow drop. */
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    /** Increment counter and show highlight. */
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current++
        if (dragCounter.current === 1) setIsDragging(true)
    }

    /** Decrement counter and hide highlight when fully left. */
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current--
        if (dragCounter.current === 0) setIsDragging(false)
    }

    /** Process dropped file and reset counter. */
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current = 0
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
            processFile(file)
        } else {
            setParseError(t('glossary.keywordImport.parseError'))
        }
    }

    // ========================================================================
    // Download Template
    // ========================================================================

    /** Generate and download a sample Excel template with example keyword rows. */
    const downloadTemplate = () => {
        const sampleRows = [
            { name: '契約書', en_keyword: 'Contract', description: 'Legal binding agreement document' },
            { name: '仕様書', en_keyword: 'Specification', description: 'Technical specification document' },
            { name: 'マニュアル', en_keyword: 'Manual', description: 'User or operation manual' },
            { name: '報告書', en_keyword: 'Report', description: 'Business or technical report' },
            { name: '設計書', en_keyword: 'Design Document', description: 'System or software design document' },
        ]
        const ws = XLSX.utils.json_to_sheet(sampleRows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Keyword Import')
        XLSX.writeFile(wb, 'glossary_keyword_import_template.xlsx')
    }

    // ========================================================================
    // Import
    // ========================================================================

    /**
     * Send parsed rows to the keyword bulk-import API.
     */
    const handleImport = async () => {
        if (parsedRows.length === 0) return
        setImporting(true)
        setImportResult(null)
        try {
            const result = await glossaryApi.bulkImportKeywords(parsedRows)
            setImportResult(result)
            if (result.success) {
                globalMessage.success(t('glossary.keywordImport.success'))
                onSuccess()
                handleClose()
            }
        } catch (error: any) {
            globalMessage.error(error?.message || t('common.error'))
        } finally {
            setImporting(false)
        }
    }

    // ========================================================================
    // Reset & Close
    // ========================================================================

    /**
     * Reset all state and close the modal.
     */
    const handleClose = () => {
        setParsedRows([])
        setImportResult(null)
        setParseError(null)
        onClose()
    }

    // ========================================================================
    // Render
    // ========================================================================

    return (
        <Dialog open={open} onOpenChange={(v: boolean) => !v && handleClose()}>
            <DialogContent className="sm:max-w-[70vw] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet size={20} />
                        <span>{t('glossary.keywordImport.title')}</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 flex-1 overflow-auto">
                    {/* File Upload Area — supports click and drag & drop */}
                    <div
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                            isDragging
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-slate-300 dark:border-slate-600'
                        }`}
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <label className="cursor-pointer flex flex-col items-center gap-2">
                            <Upload size={32} className="text-slate-400" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                                {t('glossary.keywordImport.selectFile')}
                            </span>
                            <span className="text-xs text-slate-400">
                                {t('glossary.keywordImport.fileFormat')}
                            </span>
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                        </label>
                        <Button
                            variant="link"
                            size="sm"
                            onClick={downloadTemplate}
                            className="mt-2"
                        >
                            <Download size={14} className="mr-1" />
                            {t('glossary.keywordImport.downloadTemplate')}
                        </Button>
                    </div>

                    {/* Parse Error */}
                    {parseError && (
                        <Alert variant="destructive">
                            <AlertCircle size={16} />
                            <AlertDescription className="flex items-center justify-between">
                                <span>{parseError}</span>
                                <button onClick={() => setParseError(null)} className="ml-2">
                                    <X size={14} />
                                </button>
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Import Result */}
                    {importResult && (
                        <Alert variant={importResult.success ? 'success' : 'warning'}>
                            <AlertDescription>
                                <p>{t('glossary.keywordImport.resultSummary', {
                                    created: importResult.created,
                                    skipped: importResult.skipped,
                                })}</p>
                                {importResult.errors.length > 0 && (
                                    <ul className="mt-1 text-sm">
                                        {importResult.errors.map((err, i) => (
                                            <li key={i}>• {err}</li>
                                        ))}
                                    </ul>
                                )}
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Preview Table */}
                    {parsedRows.length > 0 && (
                        <div className="max-h-[400px] overflow-auto border rounded">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[200px]">{t('glossary.keyword.name')}</TableHead>
                                        <TableHead className="w-[200px]">{t('glossary.keyword.enKeyword')}</TableHead>
                                        <TableHead>{t('glossary.keyword.description')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedRows.map((row, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{row.name}</TableCell>
                                            <TableCell>{row.en_keyword || ''}</TableCell>
                                            <TableCell className="truncate max-w-[300px]">{row.description || ''}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex justify-between items-center sm:justify-between">
                    <span className="text-sm text-slate-500">
                        {parsedRows.length > 0
                            ? t('glossary.keywordImport.rowCount', { count: parsedRows.length })
                            : ''}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleClose}>{t('common.cancel')}</Button>
                        <Button
                            onClick={handleImport}
                            disabled={parsedRows.length === 0 || importing}
                        >
                            {importing ? '...' : t('glossary.keywordImport.import')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
