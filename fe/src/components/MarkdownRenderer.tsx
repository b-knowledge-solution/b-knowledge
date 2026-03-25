/**
 * @fileoverview Markdown content renderer with citation integration.
 *
 * Renders markdown with:
 * - GFM (tables, checklists, strikethrough)
 * - Syntax highlighting for code blocks
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
import React, { useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import DOMPurify from 'dompurify'
import reactStringReplace from 'react-string-replace'
import { visitParents } from 'unist-util-visit-parents'
import { FileText, FileImage, FileSpreadsheet, FileCode, File, Presentation } from 'lucide-react'
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
    let result = text.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$1$$')
    // Convert \( ... \) to $ ... $
    result = result.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$')
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
                prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800
                prose-code:text-violet-600 dark:prose-code:text-violet-400 prose-code:bg-slate-100 dark:prose-code:bg-slate-800/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                ${className || ''}`}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeWrapReference, rehypeKatex, rehypeHighlight, rehypeRaw]}
                components={
                    {
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
