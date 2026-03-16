/**
 * @fileoverview Reference panel showing retrieved document chunks.
 * @module features/chat/components/ChatReferencePanel
 */

import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { ChatReference } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatReferencePanelProps {
  /** CSS class name */
  className?: string
  /** Reference data to display */
  reference: ChatReference | null
  /** Callback to close the panel */
  onClose: () => void
  /** Callback when a document is clicked */
  onDocumentClick: (docId: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Panel displaying retrieved document references and chunks.
 *
 * @param {ChatReferencePanelProps} props - Component properties
 * @returns {JSX.Element} The rendered reference panel
 */
function ChatReferencePanel({
  className = '',
  reference,
  onClose,
  onDocumentClick,
}: ChatReferencePanelProps) {
  const { t } = useTranslation()

  return (
    <div className={`flex flex-col border-l border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('chat.references')}</h3>
        <button
          className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!reference ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('chat.noReferences')}</p>
        ) : (
          <>
            {reference.doc_aggs.map((doc) => (
              <div
                key={doc.doc_id}
                className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                onClick={() => onDocumentClick(doc.doc_id)}
              >
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{doc.doc_name}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {doc.count} {t('chat.chunks')}
                </p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default ChatReferencePanel
