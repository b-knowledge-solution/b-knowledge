/**
 * @fileoverview Modal dialog for creating/editing a code category.
 *
 * Separate from CategoryModal — code categories configure code-graph-specific
 * settings rather than document chunking:
 * - Category name
 * - Embedding model
 * - Primary language (auto-detected, but can be overridden)
 * - Code graph toggle (enable AST extraction → Memgraph)
 * - Max function length for chunking
 * - Include tests toggle
 * - Include comments/docstrings toggle
 *
 * @module features/projects/components/CodeCategoryModal
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, Code2, Network, FileCode } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

import { useProviders } from '@/features/llm-provider/api/llmProviderQueries'

// ============================================================================
// Constants
// ============================================================================

/** Languages supported by the code graph parser (from advance-rag SupportedLanguage enum) */
const CODE_LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'c_sharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'lua', label: 'Lua' },
  { value: 'scala', label: 'Scala' },
]

/** Default max tokens per code chunk */
const CODE_CHUNK_MAX_DEFAULT = 1024
const CODE_CHUNK_MIN = 128
const CODE_CHUNK_MAX = 4096
const CODE_CHUNK_STEP = 64

// ============================================================================
// Types
// ============================================================================

/** Shape of the code-specific dataset configuration */
interface CodeDatasetConfig {
  language: string
  embedding_model: string
  chunk_method: 'code'
  parser_config: {
    /** Primary language override — 'auto' means detect from file extension */
    code_language: string
    /** Whether to generate code graph (AST → Memgraph) */
    enable_code_graph: boolean
    /** Max token count per code chunk */
    chunk_token_num: number
    /** Whether to include test files in parsing */
    include_tests: boolean
    /** Whether to include comments and docstrings in chunks */
    include_comments: boolean
    /** Whether to extract import/dependency relationships */
    extract_imports: boolean
    /** Auto-generate keywords per chunk */
    auto_keywords: number
    /** Auto-generate questions per chunk */
    auto_questions: number
  }
}

/** Full form data shape */
interface CodeCategoryFormData {
  name: string
  dataset_config: CodeDatasetConfig
}

/** Initial form state */
const INITIAL_FORM_DATA: CodeCategoryFormData = {
  name: '',
  dataset_config: {
    language: 'English',
    embedding_model: '',
    chunk_method: 'code',
    parser_config: {
      code_language: 'auto',
      enable_code_graph: true,
      chunk_token_num: CODE_CHUNK_MAX_DEFAULT,
      include_tests: false,
      include_comments: true,
      extract_imports: true,
      auto_keywords: 0,
      auto_questions: 0,
    },
  },
}

interface CodeCategoryModalProps {
  /** Whether the modal is visible */
  open: boolean
  /** Whether the submit action is in progress */
  saving: boolean
  /** Whether in edit mode (vs create) */
  editMode?: boolean
  /** Pre-fill data for edit mode */
  initialData?: { name: string; dataset_config?: Record<string, any> } | null
  /** Callback with form values on confirm */
  onOk: (data: { name: string; dataset_config: Record<string, any> }) => void
  /** Callback on cancel */
  onCancel: () => void
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Slider field with range input and numeric input for code config values
 */
const SliderField: React.FC<{
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  tooltip?: string
}> = ({ label, value, onChange, min = 0, max = 10, step = 1, tooltip }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs">{label}</Label>
        {tooltip && (
          <span title={tooltip} className="text-muted-foreground cursor-help">
            <Info className="w-3 h-3" />
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">{min} – {max}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary h-1.5"
        />
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={(e) => onChange(clamp(Number(e.target.value)))}
          className="w-16 h-7 text-center text-xs"
        />
      </div>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal dialog for creating/editing a code category with code-graph-specific config.
 * Shows code language selection, code graph toggle, chunk size, and parsing options.
 * Right panel shows a code-graph pipeline overview illustration.
 *
 * @param {CodeCategoryModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
 */
const CodeCategoryModal = ({ open, saving, editMode, initialData, onOk, onCancel }: CodeCategoryModalProps) => {
  const { t } = useTranslation()
  const { data: providers } = useProviders()
  const embeddingModels = providers?.filter((p) => p.model_type === 'embedding') || []
  const [formData, setFormData] = useState<CodeCategoryFormData>(INITIAL_FORM_DATA)
  const [nameError, setNameError] = useState('')

  // Reset or pre-fill form data when modal opens
  useEffect(() => {
    if (open && initialData) {
      const dc = initialData.dataset_config || {}
      const pc = dc.parser_config || {}
      setFormData({
        name: initialData.name || '',
        dataset_config: {
          language: dc.language || 'English',
          embedding_model: dc.embedding_model || '',
          chunk_method: 'code',
          parser_config: {
            code_language: pc.code_language || 'auto',
            enable_code_graph: pc.enable_code_graph ?? true,
            chunk_token_num: pc.chunk_token_num ?? CODE_CHUNK_MAX_DEFAULT,
            include_tests: pc.include_tests ?? false,
            include_comments: pc.include_comments ?? true,
            extract_imports: pc.extract_imports ?? true,
            auto_keywords: pc.auto_keywords ?? 0,
            auto_questions: pc.auto_questions ?? 0,
          },
        },
      })
    } else if (open && !initialData) {
      setFormData(INITIAL_FORM_DATA)
    }
    setNameError('')
  }, [open, initialData])

  /** Update a parser_config field */
  const updateParserConfig = (field: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      dataset_config: {
        ...prev.dataset_config,
        parser_config: { ...prev.dataset_config.parser_config, [field]: value },
      },
    }))
  }

  /** Validate and submit the form */
  const handleOk = () => {
    // Validate required name field
    if (!formData.name.trim()) {
      setNameError(t('projects.codeCategoryNameRequired', 'Category name is required'))
      return
    }
    setNameError('')
    onOk(formData)
  }

  const pc = formData.dataset_config.parser_config

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onCancel() }}>
      <DialogContent className="max-w-[680px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-emerald-600" />
            {editMode
              ? t('projects.editCodeCategory', 'Edit Code Category')
              : t('projects.createCodeCategory', 'Create Code Category')
            }
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 flex-1 overflow-hidden mt-2">
          {/* ===== LEFT: Form Fields ===== */}
          <div className="flex-1 space-y-5 overflow-y-auto pr-2 min-w-0" style={{ maxHeight: '65vh' }}>
            {/* ── Category Name ── */}
            <div>
              <Label className="mb-1">
                {t('projectManagement.categories.name')} <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder={t('projects.codeCategoryPlaceholder', 'e.g. Backend API, Frontend App')}
                value={formData.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                  if (nameError) setNameError('')
                }}
                className={nameError ? 'border-red-500' : ''}
              />
              {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
            </div>

            {/* ── SECTION: Basic ── */}
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground font-medium">Basic</span>
              <Separator className="flex-1" />
            </div>

            {/* Embedding Model */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <Label className="text-sm text-red-500">*Embedding model</Label>
              <Select
                value={formData.dataset_config.embedding_model || 'default'}
                onValueChange={(v: string) => setFormData((prev) => ({
                  ...prev,
                  dataset_config: { ...prev.dataset_config, embedding_model: v === 'default' ? '' : v },
                }))}
              >
                <SelectTrigger><SelectValue placeholder="System default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">System default</SelectItem>
                  {embeddingModels.map((m) => (
                    <SelectItem key={m.model_name} value={m.model_name}>{m.model_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── SECTION: Code Parsing ── */}
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <FileCode className="h-3.5 w-3.5" />
                Code Parsing
              </span>
              <Separator className="flex-1" />
            </div>

            {/* Primary language */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm">Language</Label>
                <span title="Primary language for AST parsing. Auto-detect infers from file extensions." className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <Select
                value={pc.code_language}
                onValueChange={(v: string) => updateParserConfig('code_language', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CODE_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Chunk size */}
            <SliderField
              label="Max tokens per chunk"
              value={pc.chunk_token_num}
              onChange={(v) => updateParserConfig('chunk_token_num', v)}
              min={CODE_CHUNK_MIN}
              max={CODE_CHUNK_MAX}
              step={CODE_CHUNK_STEP}
              tooltip="Maximum token count per code chunk. Larger values preserve more context per function."
            />

            {/* Include tests */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm">Include tests</Label>
                <span title="Parse and index test files (*.test.*, *.spec.*)" className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <Switch
                checked={pc.include_tests}
                onCheckedChange={(checked: boolean) => updateParserConfig('include_tests', checked)}
              />
            </div>

            {/* Include comments */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm">Include comments</Label>
                <span title="Include comments and docstrings in code chunks for richer semantic search" className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <Switch
                checked={pc.include_comments}
                onCheckedChange={(checked: boolean) => updateParserConfig('include_comments', checked)}
              />
            </div>

            {/* Extract imports */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm">Extract imports</Label>
                <span title="Parse import/require statements to build dependency relationships" className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <Switch
                checked={pc.extract_imports}
                onCheckedChange={(checked: boolean) => updateParserConfig('extract_imports', checked)}
              />
            </div>

            {/* ── SECTION: Code Graph ── */}
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Network className="h-3.5 w-3.5" />
                Code Graph
              </span>
              <Separator className="flex-1" />
            </div>

            {/* Enable code graph */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm font-medium">Enable graph</Label>
                <span title="Extract AST nodes (functions, classes, methods) and call relationships into Memgraph for code navigation" className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={pc.enable_code_graph}
                  onCheckedChange={(checked: boolean) => updateParserConfig('enable_code_graph', checked)}
                />
                {pc.enable_code_graph && (
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px]">
                    AST → Memgraph
                  </Badge>
                )}
              </div>
            </div>

            {/* Graph description when enabled */}
            {pc.enable_code_graph && (
              <div className="ml-4 border-l-2 border-emerald-500/30 pl-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t('projects.codeGraphDescription', 'Code files will be parsed using Tree-sitter AST to extract functions, classes, methods, and their call relationships. The graph is stored in Memgraph and can be explored visually.')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {['Functions', 'Classes', 'Methods', 'Calls', 'Imports'].map((label) => (
                    <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-keywords */}
            <SliderField
              label="Auto-keyword"
              value={pc.auto_keywords}
              onChange={(v) => updateParserConfig('auto_keywords', v)}
              min={0}
              max={32}
              tooltip="Automatically extract N keywords per code chunk"
            />

            {/* Auto-questions */}
            <SliderField
              label="Auto-question"
              value={pc.auto_questions}
              onChange={(v) => updateParserConfig('auto_questions', v)}
              min={0}
              max={10}
              tooltip="Automatically generate N questions per code chunk"
            />
          </div>

          {/* ===== RIGHT: Pipeline Overview ===== */}
          <div className="hidden lg:block w-[220px] shrink-0">
            <div className="sticky top-0 rounded-lg border border-border bg-card p-4 space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Code2 className="h-4 w-4" />
                Code RAG Pipeline
              </h4>

              {/* Pipeline steps */}
              <div className="space-y-2">
                {[
                  { icon: '1', label: 'Upload code files', desc: 'ZIP, individual files, or git sync' },
                  { icon: '2', label: 'AST parsing', desc: 'Tree-sitter extracts definitions' },
                  { icon: '3', label: 'Chunk generation', desc: 'Function-level semantic chunks' },
                  { icon: '4', label: 'Embedding', desc: 'Vector embeddings for search' },
                  ...(pc.enable_code_graph
                    ? [{ icon: '5', label: 'Graph extraction', desc: 'Call graph → Memgraph' }]
                    : []),
                ].map((step) => (
                  <div key={step.icon} className="flex items-start gap-2">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold shrink-0 mt-0.5">
                      {step.icon}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-foreground">{step.label}</p>
                      <p className="text-[10px] text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Supported languages summary */}
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-1.5">Supported languages</p>
                <div className="flex flex-wrap gap-1">
                  {CODE_LANGUAGES.filter(l => l.value !== 'auto').map((lang) => (
                    <Badge key={lang.value} variant="outline" className="text-[9px] px-1 py-0">
                      {lang.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleOk} disabled={saving}>
            {saving ? t('common.saving', 'Saving...') : t('common.ok', 'OK')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CodeCategoryModal
