/**
 * @fileoverview Markdown content renderer with citation integration.
 *
 * Renders markdown with:
 * - GFM (tables, checklists, strikethrough)
 * - Syntax highlighting for code blocks with copy button, language label, line numbers
 * - Mermaid diagram rendering for `mermaid` code blocks
 * - Collapsible long code blocks (>20 lines)
 * - Math/LaTeX via remark-math + rehype-katex
 * - DOMPurify sanitization for all HTML content
 * - Inline citation rendering via custom rehype plugin (RAGFlow pattern)
 * - Think/reasoning block collapsible sections
 * - Custom text highlighting
 *
 * Citations are rendered INSIDE the markdown pipeline (not by splitting content),
 * so they never break markdown formatting like bold, lists, or tables.
 *
 * @module components/MarkdownRenderer
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import DOMPurify from 'dompurify'
import reactStringReplace from 'react-string-replace'
import { visitParents } from 'unist-util-visit-parents'
import { FileText, FileImage, FileSpreadsheet, FileCode, File, Presentation, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { getExtension } from '@/utils/document-util'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import type { ChatReference, ChatChunk } from '@/features/chat/types/chat.types'

import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

// ============================================================================
// File type icon mapping
// ============================================================================

/** Map file extensions to lucide icon components for document display */
const FILE_ICON_MAP: Record<string, typeof FileText> = {
    pdf: FileText,
    doc: FileText, docx: FileText, odt: FileText, rtf: FileText,
    xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet,
    ppt: Presentation, pptx: Presentation,
    png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage, svg: FileImage, webp: FileImage,
    ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode, py: FileCode, java: FileCode,
    html: FileCode, css: FileCode, json: FileCode, xml: FileCode, yaml: FileCode, yml: FileCode,
}

/**
 * @description Get the appropriate lucide icon for a document filename.
 * @param {string} docName - Document filename
 * @returns {typeof FileText} Lucide icon component
 */
function getFileIcon(docName: string): typeof FileText {
    const ext = getExtension(docName)
    return FILE_ICON_MAP[ext] || File
}

// ============================================================================
// Citation marker regex — supports both old (##n$$) and new (##ID:n$) formats
// ============================================================================

/** Current format: [ID:0], [ID:1], etc. (normalized from all other formats) */
const CITATION_REG = /\[ID:(\d+)\]/g

/**
 * @description Normalize all citation marker formats to [ID:n].
 * MUST run before remark-math to prevent $$ in markers being interpreted as LaTeX.
 *
 * Supported formats (order matters — most specific first):
 *   ##ID:0$$  → [ID:0]  (B-Knowledge backend format — double $$)
 *   ##ID:0$   → [ID:0]  (single $ variant)
 *   ##0$$     → [ID:0]  (old RAGFlow format)
 *
 * @param {string} text - Raw text with citation markers
 * @returns {string} Text with normalized [ID:n] markers
 */
function normalizeCitationMarkers(text: string): string {
    // Order matters: match double $$ before single $ to avoid partial matches
    let result = text.replace(/##ID:(\d+)\$\$/g, '[ID:$1]')
    result = result.replace(/##ID:(\d+)\$/g, '[ID:$1]')
    result = result.replace(/##(\d+)\$\$/g, '[ID:$1]')
    return result
}

/**
 * @description Convert <think> tags to collapsible <details> sections.
 * @param {string} text - Text potentially containing <think> blocks
 * @returns {string} Text with <details> sections
 */
function replaceThinkBlocks(text: string): string {
    return text
        .replace(/<think>/gi, '<details class="think-block"><summary>Thinking...</summary>')
        .replace(/<\/think>/gi, '</details>')
}

/**
 * @description Preprocess LaTeX delimiters for remark-math compatibility.
 * Converts \\[ \\] and \\( \\) to $$ $$ and $ $ respectively.
 * @param {string} text - Text with LaTeX delimiters
 * @returns {string} Text with remark-math compatible delimiters
 */
function preprocessLaTeX(text: string): string {
    // Convert \[ ... \] to $$ ... $$
    let result = text.replace(/\\\[([\\s\\S]*?)\\\]/g, '$$$$1$$')
    // Convert \( ... \) to $ ... $
    result = result.replace(/\\\(([\\s\\S]*?)\\\)/g, '$$$1$')
    return result
}

// ============================================================================
// Custom rehype plugin — wraps text nodes for citation rendering
// ============================================================================

/**
 * @description Rehype plugin that wraps text nodes in <custom-typography> tags,
 * enabling the custom component to render citation markers as HoverCards.
 * Skips code blocks and existing custom-typography tags.
 */
function rehypeWrapReference() {
    return function wrapTextTransform(tree: any) {
        visitParents(tree, 'text', (node: any, ancestors: any[]) => {
            const latestAncestor = ancestors[ancestors.length - 1]
            // Skip if already wrapped or inside code blocks
            if (
                latestAncestor?.tagName === 'custom-typography' ||
                latestAncestor?.tagName === 'code' ||
                latestAncestor?.tagName === 'pre'
            ) {
                return
            }
            node.type = 'element'
            node.tagName = 'custom-typography'
            node.properties = {}
            node.children = [{ type: 'text', value: node.value }]
        })
    }
}

// ============================================================================
// Code block sub-components
// ============================================================================

/** Max lines before code block is collapsed with "Show more" */
const COLLAPSE_THRESHOLD = 20
/** Min lines before line numbers are shown */
const LINE_NUMBER_THRESHOLD = 5

/** Map of common language aliases to display names */
const LANGUAGE_DISPLAY_MAP: Record<string, string> = {
    js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX',
    py: 'Python', rb: 'Ruby', rs: 'Rust', go: 'Go', cs: 'C#',
    cpp: 'C++', c: 'C', java: 'Java', kt: 'Kotlin', swift: 'Swift',
    sh: 'Shell', bash: 'Bash', zsh: 'Zsh', ps1: 'PowerShell',
    sql: 'SQL', graphql: 'GraphQL', html: 'HTML', css: 'CSS',
    scss: 'SCSS', less: 'LESS', json: 'JSON', yaml: 'YAML',
    yml: 'YAML', xml: 'XML', md: 'Markdown', dockerfile: 'Dockerfile',
    makefile: 'Makefile', toml: 'TOML', ini: 'INI', diff: 'Diff',
    plaintext: 'Text', text: 'Text', txt: 'Text',
}

/**
 * @description Extract raw language from highlight.js className.
 * The className follows the pattern "hljs language-xxx" or "language-xxx".
 * @param {string | undefined} className - ClassName from code element
 * @returns {string} Extracted language or empty string
 */
function extractLanguage(className?: string): string {
    if (!className) return ''
    const match = className.match(/language-(\S+)/)
    return match ? match[1]! : ''
}

/**
 * @description Get a display-friendly language name.
 * @param {string} lang - Raw language identifier
 * @returns {string} Display name (e.g., "TypeScript" instead of "ts")
 */
function getLanguageDisplayName(lang: string): string {
    const lower = lang.toLowerCase()
    return LANGUAGE_DISPLAY_MAP[lower] || lang.charAt(0).toUpperCase() + lang.slice(1)
}

/**
 * @description Extract plain text from React children tree for copy and line counting.
 * @param {React.ReactNode} children - React node tree
 * @returns {string} Plain text content
 */
function extractTextFromChildren(children: React.ReactNode): string {
    if (typeof children === 'string') return children
    if (typeof children === 'number') return String(children)
    if (!children) return ''
    if (Array.isArray(children)) return children.map(extractTextFromChildren).join('')
    if (typeof children === 'object' && children !== null && 'props' in children) {
        return extractTextFromChildren((children as React.ReactElement<{ children?: React.ReactNode }>).props.children)
    }
    return ''
}

/**
 * @description Mermaid diagram renderer. Lazily loads mermaid on first render.
 * Renders the diagram as inline SVG with dark mode support.
 *
 * @param {{ code: string }} props - The raw mermaid code to render
 * @returns {JSX.Element} Rendered SVG diagram or raw code fallback
 */
function MermaidBlock({ code }: { code: string }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [svg, setSvg] = useState<string>('')
    const [error, setError] = useState<string>('')

    // Detect dark mode from document class
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

    useEffect(() => {
        let cancelled = false

        const renderDiagram = async () => {
            try {
                // Lazy-load mermaid to avoid bundling it for users who don't need it
                const mermaid = (await import('mermaid')).default
                mermaid.initialize({
                    startOnLoad: false,
                    theme: isDark ? 'dark' : 'default',
                    securityLevel: 'loose',
                    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                })

                // Generate a unique ID for this diagram
                const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                const { svg: renderedSvg } = await mermaid.render(id, code.trim())

                if (!cancelled) {
                    setSvg(renderedSvg)
                    setError('')
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to render diagram')
                }
            }
        }

        renderDiagram()
        return () => { cancelled = true }
    }, [code, isDark])

    // Show loading placeholder while rendering
    if (!svg && !error) {
        return (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                Rendering diagram...
            </div>
        )
    }

    // Error fallback: show raw mermaid code
    if (error) {
        return (
            <div className="space-y-2">
                <div className="text-xs text-amber-600 dark:text-amber-400 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                    Diagram render error: {error}
                </div>
                <pre className="!bg-slate-900 !border-slate-800 rounded-lg p-4 overflow-x-auto">
                    <code className="text-xs text-slate-300">{code}</code>
                </pre>
            </div>
        )
    }

    // Success: render SVG inline
    return (
        <div
            ref={containerRef}
            className="my-4 flex justify-center overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    )
}

/**
 * @description Enhanced code block with header (language label + copy button),
 * optional line numbers, and collapsible sections for long code.
 *
 * @param {{ language: string; children: React.ReactNode }} props
 * @returns {JSX.Element} Styled code block
 */
function CodeBlock({ language, children }: { language: string; children: React.ReactNode }) {
    const [copied, setCopied] = useState(false)
    const [collapsed, setCollapsed] = useState(true)

    // Extract raw text for copy and line counting
    const rawText = extractTextFromChildren(children)
    const lineCount = rawText.split('\n').length
    const isLong = lineCount > COLLAPSE_THRESHOLD
    const showLineNumbers = lineCount >= LINE_NUMBER_THRESHOLD
    const displayLang = language ? getLanguageDisplayName(language) : ''

    /**
     * @description Copy code block content to clipboard with temporary ✓ feedback.
     */
    const handleCopy = async () => {
        await navigator.clipboard.writeText(rawText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="group/code relative my-3 rounded-lg overflow-hidden border border-slate-700/50">
            {/* Header bar: language label + copy button */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700/50 text-xs">
                <span className="text-slate-400 font-medium select-none">
                    {displayLang || 'Code'}
                </span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-700/50"
                    title="Copy code"
                >
                    {copied ? (
                        <>
                            <Check className="h-3 w-3 text-green-400" />
                            <span className="text-green-400">Copied!</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-3 w-3" />
                            <span>Copy</span>
                        </>
                    )}
                </button>
            </div>

            {/* Code content with optional line numbers */}
            <div className={`relative ${isLong && collapsed ? 'max-h-[300px] overflow-hidden' : ''}`}>
                <pre className="!my-0 !rounded-none !border-0 !bg-slate-900 overflow-x-auto">
                    {showLineNumbers ? (
                        <code className="block">
                            <table className="w-full border-collapse">
                                <tbody>
                                    {rawText.split('\n').map((line, i) => (
                                        <tr key={i} className="leading-relaxed">
                                            {/* Line number gutter — non-selectable */}
                                            <td className="text-right pr-3 pl-3 text-slate-600 select-none w-[1%] whitespace-nowrap align-top text-xs tabular-nums">
                                                {i + 1}
                                            </td>
                                            {/* Line content */}
                                            <td className="pr-4">
                                                <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(line) || '&nbsp;' }} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </code>
                    ) : (
                        <code>{children}</code>
                    )}
                </pre>

                {/* Gradient fade for collapsed long code */}
                {isLong && collapsed && (
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />
                )}
            </div>

            {/* Show more / Show less toggle for long code blocks */}
            {isLong && (
                <button
                    onClick={() => setCollapsed((v) => !v)}
                    className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/80 border-t border-slate-700/50 transition-colors"
                >
                    {collapsed ? (
                        <>
                            <ChevronDown className="h-3 w-3" />
                            Show more ({lineCount} lines)
                        </>
                    ) : (
                        <>
                            <ChevronUp className="h-3 w-3" />
                            Show less
                        </>
                    )}
                </button>
            )}
        </div>
    )
}

// ============================================================================
// Props
// ============================================================================

interface MarkdownRendererProps {
    /** Raw markdown string to render */
    children: string
    /** Additional CSS classes for the container */
    className?: string
    /** Text to automatically highlight with <mark> tags */
    highlightText?: string
    /** Reference data for rendering inline citation hover cards */
    reference?: ChatReference | undefined
    /** Callback when a citation is clicked to open document preview */
    onCitationClick?: ((chunk: ChatChunk) => void) | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Markdown renderer with integrated citation hover cards, math/LaTeX,
 * DOMPurify sanitization, and think block support. Citations are rendered inline
 * within the markdown pipeline so they never break formatting.
 *
 * @param {MarkdownRendererProps} props - Component properties
 * @returns {JSX.Element} Rendered markdown content with interactive citations
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
    children,
    className,
    highlightText,
    reference,
    onCitationClick,
}) => {
    const chunks = reference?.chunks ?? []

    // Preprocess content: sanitize, normalize citations, handle think blocks, LaTeX
    const processedContent = useMemo(() => {
        let text = children || ''

        // Sanitize HTML with DOMPurify (allow think/section/details/summary/mark tags)
        text = DOMPurify.sanitize(text, {
            ADD_TAGS: ['think', 'section', 'details', 'summary', 'mark'],
            ADD_ATTR: ['class'],
        })

        // Normalize citation marker formats
        text = normalizeCitationMarkers(text)

        // Convert <think> to collapsible <details>
        text = replaceThinkBlocks(text)

        // Preprocess LaTeX delimiters
        text = preprocessLaTeX(text)

        // Apply text highlighting if requested
        if (highlightText?.trim()) {
            try {
                const escaped = highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const regex = new RegExp(`(${escaped})`, 'gi')
                text = text.replace(
                    regex,
                    '<mark class="bg-yellow-200 dark:bg-yellow-900/50 text-slate-900 dark:text-slate-100 rounded-sm px-0.5">$1</mark>',
                )
            } catch {
                // Fallback to original on regex error
            }
        }

        return text
    }, [children, highlightText])

    /**
     * @description Render citation hover cards within text nodes.
     * Uses react-string-replace to find [ID:n] markers and replace them
     * with interactive HoverCard components showing chunk previews on hover.
     */
    const renderCitations = useCallback(
        (text: string) => {
            return reactStringReplace(text, CITATION_REG, (match, i) => {
                const chunkIndex = Number(match)
                const chunk = chunks[chunkIndex]

                if (!chunk) {
                    return (
                        <span
                            key={`cite-${i}`}
                            className="inline-flex items-center text-[10px] bg-muted rounded-full px-1.5 mx-0.5 align-super"
                        >
                            [{chunkIndex + 1}]
                        </span>
                    )
                }

                // All chunk content is sanitized by DOMPurify before rendering
                const sanitizedContent = DOMPurify.sanitize(chunk.content_with_weight || '')

                return (
                    <HoverCard key={`cite-${i}`} openDelay={200} closeDelay={100}>
                        <HoverCardTrigger asChild>
                            <span
                                className="inline-flex items-center text-[10px] font-semibold bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full px-1.5 mx-0.5 align-super cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                                onClick={() => onCitationClick?.(chunk)}
                            >
                                [{chunkIndex + 1}]
                            </span>
                        </HoverCardTrigger>
                        <HoverCardContent className="max-w-[40vw] w-auto max-h-80 overflow-y-auto" side="top">
                            <div className="flex gap-3">
                                {/* Image thumbnail if chunk has an image */}
                                {chunk.img_id && (
                                    <HoverCard openDelay={300}>
                                        <HoverCardTrigger asChild>
                                            <img
                                                src={`/api/rag/images/${chunk.img_id}`}
                                                alt=""
                                                className="w-24 h-24 object-cover rounded border border-border/50 shrink-0 cursor-pointer"
                                                loading="lazy"
                                            />
                                        </HoverCardTrigger>
                                        <HoverCardContent className="w-auto max-w-[60vw] p-1" side="left">
                                            <img
                                                src={`/api/rag/images/${chunk.img_id}`}
                                                alt=""
                                                className="max-w-[55vw] max-h-[50vh] object-contain rounded"
                                            />
                                        </HoverCardContent>
                                    </HoverCard>
                                )}
                                <div className="space-y-2 flex-1 min-w-0">
                                    {/* Chunk content preview — sanitized with DOMPurify */}
                                    <div
                                        className="text-xs text-foreground/80 whitespace-pre-wrap line-clamp-[8]"
                                        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                                    />
                                    {/* Document footer with file-type icon */}
                                    {(() => {
                                        const DocIcon = getFileIcon(chunk.docnm_kwd || '')
                                        return (
                                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t pt-2">
                                                <DocIcon className="h-4 w-4 shrink-0 text-primary/60" />
                                                <button
                                                    className="truncate font-medium text-primary/80 hover:text-primary hover:underline text-left"
                                                    onClick={() => onCitationClick?.(chunk)}
                                                >
                                                    {chunk.docnm_kwd}
                                                </button>
                                                {chunk.page_num_int > 0 && (
                                                    <span className="ml-auto shrink-0">p.{chunk.page_num_int}</span>
                                                )}
                                                {chunk.score != null && (
                                                    <span className="ml-2 shrink-0 tabular-nums">{Math.round(chunk.score * 100)}%</span>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>
                        </HoverCardContent>
                    </HoverCard>
                )
            })
        },
        [chunks, onCitationClick],
    )

    return (
        <div
            className={`prose prose-sm dark:prose-invert max-w-none
                prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                prose-p:leading-relaxed prose-pre:bg-transparent prose-pre:border-0 prose-pre:p-0
                prose-code:text-violet-600 dark:prose-code:text-violet-400 prose-code:bg-slate-100 dark:prose-code:bg-slate-800/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                ${className || ''}`}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeWrapReference, rehypeKatex, rehypeHighlight, rehypeRaw]}
                components={
                    {
                        // Enhanced pre block — delegates to CodeBlock or MermaidBlock
                        pre: ({ children: preChildren }: any) => {
                            // Extract the code element and its props
                            const codeChild = React.Children.toArray(preChildren).find(
                                (child: any) => child?.type === 'code' || child?.props?.node?.tagName === 'code'
                            ) as React.ReactElement | undefined

                            if (codeChild?.props) {
                                const codeProps = codeChild.props as { className?: string; children?: React.ReactNode }
                                const lang = extractLanguage(codeProps.className)

                                // Mermaid code blocks → render as diagrams
                                if (lang === 'mermaid') {
                                    const code = extractTextFromChildren(codeProps.children)
                                    return <MermaidBlock code={code} />
                                }

                                // Regular code blocks → enhanced CodeBlock with header
                                return (
                                    <CodeBlock language={lang}>
                                        {codeProps.children}
                                    </CodeBlock>
                                )
                            }

                            // Fallback for non-code pre blocks
                            return <pre className="!bg-slate-900 !border !border-slate-800 rounded-lg overflow-x-auto">{preChildren}</pre>
                        },
                        // Inline code — keep default prose styling (no CodeBlock wrapper)
                        code: ({ node, className: codeClassName, children: codeChildren, ...rest }: any) => {
                            // Only inline code reaches here (fenced code is caught by pre override)
                            return (
                                <code className={codeClassName} {...rest}>
                                    {codeChildren}
                                </code>
                            )
                        },
                        // Render citation markers within text nodes via custom-typography
                        'custom-typography': ({ children: textChildren }: { children: string }) =>
                            renderCitations(textChildren),
                        // Links open in new tab
                        a: ({ node, ...props }: any) => (
                            <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" />
                        ),
                        // Tables with overflow wrapper
                        table: ({ node, ...props }: any) => (
                            <div className="overflow-x-auto my-4 border rounded-lg border-slate-200 dark:border-slate-700">
                                <table {...props} className="w-full text-sm text-left border-collapse" />
                            </div>
                        ),
                        thead: ({ node, ...props }: any) => (
                            <thead {...props} className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-700 dark:text-slate-300 font-semibold" />
                        ),
                        tbody: ({ node, ...props }: any) => (
                            <tbody {...props} className="divide-y divide-slate-200 dark:divide-slate-700" />
                        ),
                        tr: ({ node, ...props }: any) => (
                            <tr {...props} className="bg-white dark:bg-slate-900 even:bg-slate-50 dark:even:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" />
                        ),
                        th: ({ node, ...props }: any) => (
                            <th {...props} className="px-4 py-3 border-b border-slate-200 dark:border-slate-700" />
                        ),
                        td: ({ node, ...props }: any) => (
                            <td {...props} className="px-4 py-3" />
                        ),
                        // Headings
                        h1: ({ node, ...props }: any) => <h1 {...props} className="text-3xl font-bold mt-8 mb-4 text-slate-900 dark:text-white border-b pb-2 border-slate-200 dark:border-slate-800" />,
                        h2: ({ node, ...props }: any) => <h2 {...props} className="text-2xl font-bold mt-6 mb-3 text-slate-900 dark:text-white" />,
                        h3: ({ node, ...props }: any) => <h3 {...props} className="text-xl font-bold mt-5 mb-2 text-slate-900 dark:text-white" />,
                        h4: ({ node, ...props }: any) => <h4 {...props} className="text-lg font-bold mt-4 mb-2 text-slate-900 dark:text-white" />,
                        h5: ({ node, ...props }: any) => <h5 {...props} className="text-base font-bold mt-4 mb-1 text-slate-900 dark:text-white" />,
                        h6: ({ node, ...props }: any) => <h6 {...props} className="text-sm font-bold mt-4 mb-1 text-slate-900 dark:text-white uppercase tracking-wide" />,
                        // Think blocks rendered as collapsible details
                        details: ({ node, ...props }: any) => (
                            <details {...props} className="my-2 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden" />
                        ),
                        summary: ({ node, ...props }: any) => (
                            <summary {...props} className="cursor-pointer px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800" />
                        ),
                    } as any
                }
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    )
}
