/**
 * @fileoverview Glossary Bulk Import Modal
 *
 * Parses Excel files with columns:
 *   task_name, task_instruction_en, task_instruction_ja, task_instruction_vi
 * Previews data in a table, then sends to the bulk-import API.
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
import { glossaryApi, type BulkImportRow, type BulkImportResult } from '../api/glossaryApi'
import { globalMessage } from '@/app/App'

// ============================================================================
// Props
// ============================================================================

interface GlossaryBulkImportModalProps {
    open: boolean
    onClose: () => void
    onSuccess: () => void
}

// ============================================================================
// Component
// ============================================================================

export const GlossaryBulkImportModal = ({ open, onClose, onSuccess }: GlossaryBulkImportModalProps) => {
    const { t } = useTranslation()

    const [parsedRows, setParsedRows] = useState<BulkImportRow[]>([])
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<BulkImportResult | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    // ========================================================================
    // File Parsing
    // ========================================================================

    /** Parse an Excel file and extract bulk import rows. */
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
                    setParseError(t('glossary.bulkImport.noSheet'))
                    return
                }

                const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)

                if (jsonData.length === 0) {
                    setParseError(t('glossary.bulkImport.emptyFile'))
                    return
                }

                const firstRow = jsonData[0]!
                const requiredCols = ['task_name', 'task_instruction_en']
                const missingCols = requiredCols.filter((col) => !(col in firstRow))
                if (missingCols.length > 0) {
                    setParseError(t('glossary.bulkImport.missingColumns', { cols: missingCols.join(', ') }))
                    return
                }

                const rows: BulkImportRow[] = jsonData
                    .filter((row) => row.task_name)
                    .map((row) => ({
                        task_name: row.task_name?.trim() || '',
                        task_instruction_en: row.task_instruction_en?.trim() || '',
                        task_instruction_ja: row.task_instruction_ja?.trim() || '',
                        task_instruction_vi: row.task_instruction_vi?.trim() || '',
                    }))

                if (rows.length === 0) {
                    setParseError(t('glossary.bulkImport.noValidRows'))
                    return
                }

                setParsedRows(rows)
            } catch (err: any) {
                console.error('Excel parse error:', err)
                setParseError(err.message || t('glossary.bulkImport.parseError'))
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
            setParseError(t('glossary.bulkImport.parseError'))
        }
    }

    // ========================================================================
    // Download Template
    // ========================================================================

    /** Generate and download a sample Excel template with example rows. */
    const downloadTemplate = () => {
        const sampleRows = [
            { task_name: 'Document Search', task_instruction_en: 'Use these terms to improve document search accuracy', task_instruction_ja: 'これらのキーワードを使って文書検索の精度を向上させてください', task_instruction_vi: 'Sử dụng các từ khóa này để cải thiện độ chính xác tìm kiếm tài liệu' },
            { task_name: 'FAQ Generation', task_instruction_en: 'Generate FAQ pairs for common questions', task_instruction_ja: 'よくある質問に対するFAQペアを生成してください', task_instruction_vi: 'Tạo các cặp FAQ cho những câu hỏi phổ biến' },
            { task_name: 'Knowledge Base', task_instruction_en: 'Build and maintain knowledge base entries', task_instruction_ja: 'ナレッジベースのエントリを作成・維持してください', task_instruction_vi: 'Xây dựng và duy trì các mục cơ sở kiến thức' },
        ]
        const ws = XLSX.utils.json_to_sheet(sampleRows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Glossary Import')
        XLSX.writeFile(wb, 'glossary_task_import_template.xlsx')
    }

    // ========================================================================
    // Import
    // ========================================================================

    const handleImport = async () => {
        if (parsedRows.length === 0) return
        setImporting(true)
        setImportResult(null)
        try {
            const result = await glossaryApi.bulkImport(parsedRows)
            setImportResult(result)
            if (result.success) {
                globalMessage.success(t('glossary.bulkImport.success'))
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
                        <span>{t('glossary.bulkImport.title')}</span>
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
                                {t('glossary.bulkImport.selectFile')}
                            </span>
                            <span className="text-xs text-slate-400">
                                {t('glossary.bulkImport.fileFormat')}
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
                            {t('glossary.bulkImport.downloadTemplate')}
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
                                <p>{t('glossary.bulkImport.resultSummary', {
                                    tasks: importResult.tasksCreated,
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
                                        <TableHead className="w-[150px]">{t('glossary.bulkImport.colTaskName')}</TableHead>
                                        <TableHead>{t('glossary.bulkImport.colTaskInstructionEn')}</TableHead>
                                        <TableHead>{t('glossary.bulkImport.colTaskInstructionJa')}</TableHead>
                                        <TableHead>{t('glossary.bulkImport.colTaskInstructionVi')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedRows.map((row, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{row.task_name}</TableCell>
                                            <TableCell className="truncate max-w-[200px]">{row.task_instruction_en}</TableCell>
                                            <TableCell className="truncate max-w-[200px]">{row.task_instruction_ja}</TableCell>
                                            <TableCell className="truncate max-w-[200px]">{row.task_instruction_vi}</TableCell>
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
                            ? t('glossary.bulkImport.rowCount', { count: parsedRows.length })
                            : ''}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleClose}>{t('common.cancel')}</Button>
                        <Button
                            onClick={handleImport}
                            disabled={parsedRows.length === 0 || importing}
                        >
                            {importing ? '...' : t('glossary.bulkImport.import')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
