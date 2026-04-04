/**
 * @fileoverview Prompt Builder Modal — Step-by-step prompt creation.
 *
 * Steps:
 *   1. Choose prompt language (EN/JA/VI), defaults to current display language
 *   2. Choose task (searchable across all columns)
 *   3. Choose keywords and input context query
 *
 * Prompt output = 2 lines:
 *   Line 1: task instruction (in selected language)
 *   Line 2: context template with {keyword} replaced by selected keywords
 *
 * Keyword select uses:
 *   - Server-side paginated search (lazy load on scroll)
 *   - Debounced search input (300ms) to reduce API calls
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Sparkles, Send, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
// Module boundary exception (D-04): shared component imports glossary API
// via direct file path to avoid circular dependency through barrel
import {
    glossaryApi,
    type GlossaryTask,
    type GlossaryKeyword,
} from '@/features/glossary/api/glossaryApi'
import { globalMessage } from '@/lib/globalMessage'


// ============================================================================
// Constants
// ============================================================================

/** Number of keywords to fetch per page in the lazy-loaded select */
const KEYWORD_PAGE_SIZE = 20

/** Debounce delay in ms for keyword search input */
const DEBOUNCE_DELAY = 300


// ============================================================================
// Types
// ============================================================================

/** Supported prompt languages */
type PromptLang = 'en' | 'ja' | 'vi'

// ============================================================================
// Props
// ============================================================================

interface PromptBuilderModalProps {
    /** Whether the modal is open */
    open: boolean
    /** Callback when the modal is closed */
    onClose: () => void
    /** Optional callback when user applies prompt (receives the prompt text) */
    onApply?: (prompt: string) => void
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map i18n language code to PromptLang.
 * Falls back to 'en' if the current language is not supported.
 * @param lang - i18n language string
 * @returns Matching PromptLang
 */
const mapI18nLangToPromptLang = (lang: string): PromptLang => {
    if (lang.startsWith('ja')) return 'ja'
    if (lang.startsWith('vi')) return 'vi'
    return 'en'
}

/**
 * Get the task instruction text for a given language, with fallback to EN.
 * @param task - Glossary task
 * @param lang - Selected prompt language
 * @returns Instruction text
 */
const getInstructionByLang = (task: GlossaryTask, lang: PromptLang): string => {
    switch (lang) {
        case 'ja':
            return task.task_instruction_ja || task.task_instruction_en
        case 'vi':
            return task.task_instruction_vi || task.task_instruction_en
        default:
            return task.task_instruction_en
    }
}

// ============================================================================
// Step Indicator Component
// ============================================================================

/** Simple step indicator with numbered circles and dividers. */
const StepIndicator = ({ steps, currentStep }: { steps: string[]; currentStep: number }) => (
    <div className="flex items-center gap-2">
        {steps.map((label, index) => (
            <div key={index} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                    <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                            index <= currentStep
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                        }`}
                    >
                        {index + 1}
                    </div>
                    <span className={`text-xs ${index <= currentStep ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                        {label}
                    </span>
                </div>
                {index < steps.length - 1 && (
                    <div className={`h-px w-6 ${index < currentStep ? 'bg-primary' : 'bg-muted'}`} />
                )}
            </div>
        ))}
    </div>
)

// ============================================================================
// Component
// ============================================================================

/**
 * @description Step-by-step prompt builder modal. Users select a language, task, and keyword
 * to generate a formatted prompt with task instructions and contextual keyword references.
 * @param {PromptBuilderModalProps} props - Modal open state, close handler, and optional apply callback.
 * @returns {JSX.Element} Rendered prompt builder dialog.
 */
export const PromptBuilderModal = ({ open, onClose, onApply }: PromptBuilderModalProps) => {
    const { t, i18n } = useTranslation()

    // ── State ──────────────────────────────────────────────────────────────
    const [tasks, setTasks] = useState<GlossaryTask[]>([])
    const [loading, setLoading] = useState(false)

    // Step 1: language
    const [selectedLang, setSelectedLang] = useState<PromptLang>('en')

    // Step 2: task
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const [taskSearchText, setTaskSearchText] = useState('')

    // Step 3: single keyword + context
    const [selectedKeyword, setSelectedKeyword] = useState<string>('')
    const [keywordSearchText, setKeywordSearchText] = useState('')
    const [contextInput, setContextInput] = useState('')

    // Output
    const [generatedPrompt, setGeneratedPrompt] = useState('')
    const [copied, setCopied] = useState(false)

    // ── Keyword lazy-load state ────────────────────────────────────────────
    const [keywordItems, setKeywordItems] = useState<GlossaryKeyword[]>([])
    const [keywordPage, setKeywordPage] = useState(1)
    const [keywordTotal, setKeywordTotal] = useState(0)
    const [keywordLoading, setKeywordLoading] = useState(false)
    const [keywordDropdownOpen, setKeywordDropdownOpen] = useState(false)

    /** Ref for debounce timer to clear on unmount or new input */
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    /** Ref to track current search term for stale-request prevention */
    const searchTermRef = useRef('')

    /** Ref for the keyword dropdown scroll container */
    const keywordListRef = useRef<HTMLDivElement>(null)

    // ── Keyword Fetch (paginated + server-side search) ─────────────────────

    /**
     * Fetch keywords from server with pagination.
     * @param search - Search query string
     * @param page - Page number (1-indexed)
     * @param append - If true, append results to existing. If false, replace.
     */
    const fetchKeywords = async (search: string, page: number, append: boolean) => {
        setKeywordLoading(true)
        try {
            const result = await glossaryApi.searchKeywords({
                q: search,
                page,
                pageSize: KEYWORD_PAGE_SIZE,
            })

            // Guard against stale responses (search term changed since request)
            if (search !== searchTermRef.current) return

            if (append) {
                // Infinite scroll: append new items to existing list
                setKeywordItems((prev) => [...prev, ...result.data])
            } else {
                // New search: replace items entirely
                setKeywordItems(result.data)
            }
            setKeywordTotal(result.total)
            setKeywordPage(page)
        } catch (error) {
            console.error('Error fetching keywords:', error)
        } finally {
            setKeywordLoading(false)
        }
    }

    // ── Data Fetching ──────────────────────────────────────────────────────

    /** Fetch tasks on open (keywords are lazy-loaded separately) */
    const fetchData = async () => {
        setLoading(true)
        try {
            const tasksData = await glossaryApi.listTasks()
            setTasks(tasksData)
        } catch (error) {
            console.error('Error fetching glossary data:', error)
        } finally {
            setLoading(false)
        }
    }

    /** Reset state and fetch data when modal opens */
    useEffect(() => {
        if (open) {
            fetchData()
            // Default language to current display language
            setSelectedLang(mapI18nLangToPromptLang(i18n.language))
            setSelectedTaskId(null)
            setTaskSearchText('')
            setSelectedKeyword('')
            setKeywordSearchText('')
            setContextInput('')
            setGeneratedPrompt('')
            setCopied(false)
            setKeywordDropdownOpen(false)

            // Reset keyword lazy-load state and fetch first page
            setKeywordItems([])
            setKeywordPage(1)
            setKeywordTotal(0)
            searchTermRef.current = ''
            fetchKeywords('', 1, false)
        }

        // Cleanup debounce timer on close
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
            }
        }
    }, [open, i18n.language])

    // ── Derived Data ───────────────────────────────────────────────────────

    /** Currently selected task */
    const selectedTask = tasks.find((t) => t.id === selectedTaskId)

    /** Current step index for the Steps component */
    const currentStep = !selectedTaskId ? 1 : 2

    /** Whether there are more keyword pages to load */
    const hasMoreKeywords = keywordItems.length < keywordTotal

    // ── Task filtering (client-side, search across all columns) ─────────

    const filteredTasks = (() => {
        if (!taskSearchText.trim()) return tasks
        const s = taskSearchText.toLowerCase()
        return tasks.filter((task) =>
            task.name.toLowerCase().includes(s) ||
            (task.description || '').toLowerCase().includes(s) ||
            task.task_instruction_en.toLowerCase().includes(s) ||
            (task.task_instruction_ja || '').toLowerCase().includes(s) ||
            (task.task_instruction_vi || '').toLowerCase().includes(s)
        )
    })()

    // ── Handlers ───────────────────────────────────────────────────────────

    /** Step 1: Language changed */
    const handleLangChange = (lang: string) => {
        setSelectedLang(lang as PromptLang)
        setGeneratedPrompt('')
    }

    /** Step 2: Task changed */
    const handleTaskChange = (taskId: string) => {
        setSelectedTaskId(taskId)
        setSelectedKeyword('')
        setKeywordSearchText('')
        setGeneratedPrompt('')
    }

    /** Step 3: Keyword selected from dropdown */
    const handleKeywordSelect = (keyword: string) => {
        setSelectedKeyword(keyword)
        setKeywordSearchText('')
        setKeywordDropdownOpen(false)
        setGeneratedPrompt('')
    }

    /**
     * Handle search text change in keyword input — debounced server-side search.
     * Clears previous timer and sets a new one to avoid excessive API calls.
     */
    const handleKeywordSearchChange = (value: string) => {
        setKeywordSearchText(value)
        setSelectedKeyword('')
        setKeywordDropdownOpen(true)

        // Clear any pending debounce timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }

        // Update the ref immediately so stale responses are ignored
        searchTermRef.current = value

        // Debounce the actual API call
        debounceTimerRef.current = setTimeout(() => {
            // Reset to page 1 for new search, replace results
            fetchKeywords(value, 1, false)
        }, DEBOUNCE_DELAY)
    }

    /**
     * Handle infinite scroll: when user scrolls near the bottom of the
     * keyword dropdown, fetch the next page and append results.
     */
    const handleKeywordListScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement
        // Trigger when user is within 20px of the bottom
        const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 20

        if (nearBottom && hasMoreKeywords && !keywordLoading) {
            const nextPage = keywordPage + 1
            fetchKeywords(searchTermRef.current, nextPage, true)
        }
    }

    /**
     * When user presses Enter and no option matched, auto-select the typed text.
     */
    const handleKeywordInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && keywordSearchText.trim()) {
            e.preventDefault()
            handleKeywordSelect(keywordSearchText.trim())
        }
        if (e.key === 'Escape') {
            setKeywordDropdownOpen(false)
        }
    }

    /**
     * On blur, if there's unmatched search text, auto-select it as custom keyword.
     */
    const handleKeywordInputBlur = () => {
        // Delay so click on dropdown item can fire first
        setTimeout(() => {
            if (keywordSearchText.trim() && !selectedKeyword) {
                setSelectedKeyword(keywordSearchText.trim())
                setKeywordSearchText('')
            }
            setKeywordDropdownOpen(false)
        }, 200)
    }

    /**
     * Build prompt client-side from selected task, language, and keyword + context.
     * Line 1: task instruction (in selected language, fallback to EN)
     * Line 2: context with keyword in quotes
     *   - EN/VI: context + "keyword" at end
     *   - JA: 「keyword」 at beginning + context
     */
    const handleGenerate = () => {
        if (!selectedTask || !selectedKeyword) return

        // Line 1: instruction in selected language
        const instruction = getInstructionByLang(selectedTask, selectedLang)

        // Line 2: build context line with quoted keyword based on language
        const context = contextInput.trim()
        let contextLine: string
        if (selectedLang === 'ja') {
            // JA: keyword at beginning with Japanese quotes
            contextLine = context ? `「${selectedKeyword}」${context}` : `「${selectedKeyword}」`
        } else {
            // EN/VI: keyword at end with double quotes
            contextLine = context ? `${context} "${selectedKeyword}"` : `"${selectedKeyword}"`
        }

        setGeneratedPrompt(`${instruction}\n${contextLine}`)
    }

    /** Copy generated prompt to clipboard */
    const handleCopy = async () => {
        if (!generatedPrompt) return
        try {
            await navigator.clipboard.writeText(generatedPrompt)
            setCopied(true)
            globalMessage.success(t('glossary.promptBuilder.copied'))
            setTimeout(() => setCopied(false), 2000)
        } catch {
            globalMessage.error(t('common.error'))
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={(v: boolean) => !v && onClose()}>
            <DialogContent className="sm:max-w-[700px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles size={18} className="text-blue-500" />
                        <span>{t('glossary.promptBuilder.title')}</span>
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <Spinner size={48} />
                    </div>
                ) : tasks.length === 0 ? (
                    <EmptyState title={t('common.noData')} />
                ) : (
                    <div className="flex flex-col gap-5">
                        {/* Progress indicator */}
                        <StepIndicator
                            steps={[
                                t('glossary.promptBuilder.stepLanguage'),
                                t('glossary.promptBuilder.stepTask'),
                                t('glossary.promptBuilder.stepKeyword'),
                            ]}
                            currentStep={currentStep}
                        />

                        {/* Step 1: Choose Prompt Language */}
                        <div>
                            <label className="text-sm font-medium mb-1 block">
                                {t('glossary.promptBuilder.selectLanguage')}
                            </label>
                            <Select value={selectedLang} onValueChange={handleLangChange}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="en">{t('settings.languageEn')} (EN)</SelectItem>
                                    <SelectItem value="ja">{t('settings.languageJa')} (JA)</SelectItem>
                                    <SelectItem value="vi">{t('settings.languageVi')} (VI)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Step 2: Choose Task (search across all columns) */}
                        <div>
                            <label className="text-sm font-medium mb-1 block">
                                {t('glossary.promptBuilder.selectTask')}
                            </label>
                            {/* Search input for task filtering */}
                            <div className="relative mb-2">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder={t('glossary.promptBuilder.selectTask')}
                                    value={taskSearchText}
                                    onChange={(e) => setTaskSearchText(e.target.value)}
                                    className="pl-8 h-8 text-sm"
                                />
                            </div>
                            {/* Scrollable task list */}
                            <div className="max-h-[180px] overflow-auto border rounded-md divide-y">
                                {filteredTasks.length === 0 ? (
                                    <div className="py-3 text-center text-sm text-muted-foreground">{t('common.noData')}</div>
                                ) : filteredTasks.map((task) => (
                                    <button
                                        key={task.id}
                                        type="button"
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
                                            selectedTaskId === task.id ? 'bg-accent' : ''
                                        }`}
                                        onClick={() => handleTaskChange(task.id)}
                                    >
                                        <div className="font-medium">{task.name}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {getInstructionByLang(task, selectedLang)}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            {/* Show selected task instruction preview */}
                            {selectedTask && (
                                <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800 rounded text-xs text-slate-600 dark:text-slate-300 border dark:border-slate-700">
                                    <span className="font-medium">{t('glossary.promptBuilder.instructionPreview')}:</span>{' '}
                                    {getInstructionByLang(selectedTask, selectedLang)}
                                </div>
                            )}
                        </div>

                        {/* Step 3: Choose Keyword + Context */}
                        {selectedTaskId && (
                            <div>
                                <label className="text-sm font-medium mb-1 block">
                                    {t('glossary.promptBuilder.selectKeyword')}
                                </label>

                                {/* Keyword combobox: input + dropdown */}
                                <div className="relative">
                                    <Input
                                        placeholder={t('glossary.promptBuilder.selectKeyword')}
                                        value={selectedKeyword || keywordSearchText}
                                        onChange={(e) => handleKeywordSearchChange(e.target.value)}
                                        onFocus={() => setKeywordDropdownOpen(true)}
                                        onBlur={handleKeywordInputBlur}
                                        onKeyDown={handleKeywordInputKeyDown}
                                    />

                                    {/* Keyword dropdown */}
                                    {keywordDropdownOpen && (
                                        <div
                                            ref={keywordListRef}
                                            className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[200px] overflow-auto bg-popover border rounded-md shadow-md"
                                            onScroll={handleKeywordListScroll}
                                        >
                                            {keywordItems.length === 0 && !keywordLoading && keywordSearchText.trim() ? (
                                                <div className="text-xs text-muted-foreground py-2 text-center">
                                                    {t('glossary.promptBuilder.pressEnterToUse', { keyword: keywordSearchText.trim() })}
                                                </div>
                                            ) : (
                                                <>
                                                    {keywordItems.map((k) => (
                                                        <button
                                                            key={k.id}
                                                            type="button"
                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault()
                                                                handleKeywordSelect(k.name)
                                                            }}
                                                        >
                                                            <div className="font-medium">{k.name}</div>
                                                            {(k.en_keyword || k.description) && (
                                                                <div className="text-xs text-muted-foreground truncate">
                                                                    {k.en_keyword && <span className="mr-2">{k.en_keyword}</span>}
                                                                    {k.description && <span>— {k.description}</span>}
                                                                </div>
                                                            )}
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                            {keywordLoading && (
                                                <div className="flex justify-center py-2">
                                                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Context input */}
                                <div className="mt-3">
                                    <label className="text-sm font-medium mb-1 block">
                                        {t('glossary.promptBuilder.contextLabel')}
                                    </label>
                                    <textarea
                                        placeholder={t('glossary.promptBuilder.contextPlaceholder')}
                                        value={contextInput}
                                        onChange={(e) => { setContextInput(e.target.value); setGeneratedPrompt('') }}
                                        rows={2}
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Generate Button */}
                        {selectedTaskId && selectedKeyword && (
                            <Button onClick={handleGenerate} className="self-start">
                                <Sparkles size={16} className="mr-1" />
                                {t('glossary.promptBuilder.generate')}
                            </Button>
                        )}

                        {/* Generated Prompt (2 lines: instruction + context) */}
                        {generatedPrompt && (
                            <>
                                <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-800 dark:border-slate-600">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">
                                            {t('glossary.promptBuilder.generatedPrompt')}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleCopy}
                                            className={copied ? 'text-green-500' : ''}
                                        >
                                            {copied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
                                            {copied ? t('glossary.promptBuilder.copied') : t('glossary.promptBuilder.copy')}
                                        </Button>
                                    </div>
                                    <textarea
                                        value={generatedPrompt}
                                        onChange={(e) => setGeneratedPrompt(e.target.value)}
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px]"
                                        rows={3}
                                    />
                                </div>

                                {/* Apply to Chat button */}
                                <Button
                                    onClick={() => {
                                        if (onApply) onApply(generatedPrompt)
                                        globalMessage.success(t('glossary.promptBuilder.appliedToChat'))
                                        onClose()
                                    }}
                                    className="self-start"
                                >
                                    <Send size={16} className="mr-1" />
                                    {t('glossary.promptBuilder.applyToChat')}
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

export default PromptBuilderModal
