/**
 * @fileoverview Document preview drawer for viewing source chunks.
 * @module features/chat/components/ChatDocumentPreviewDrawer
 */

import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog as HeadlessDialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { X } from 'lucide-react'
import type { ChatChunk } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatDocumentPreviewDrawerProps {
  /** Whether the drawer is open */
  open: boolean
  /** Callback to close the drawer */
  onClose: () => void
  /** The chunk to preview */
  chunk: ChatChunk | null
  /** Dataset/knowledge base ID for fetching document */
  datasetId?: string | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Side drawer showing a document chunk preview.
 *
 * @param {ChatDocumentPreviewDrawerProps} props - Component properties
 * @returns {JSX.Element} The rendered drawer
 */
function ChatDocumentPreviewDrawer({
  open,
  onClose,
  chunk,
  datasetId: _datasetId,
}: ChatDocumentPreviewDrawerProps) {
  const { t } = useTranslation()

  return (
    <Transition appear show={open} as={Fragment}>
      <HeadlessDialog className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 dark:bg-black/50" />
        </TransitionChild>

        {/* Drawer panel - slides in from right */}
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <TransitionChild
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <DialogPanel className="pointer-events-auto w-screen max-w-lg">
                  <div className="flex h-full flex-col bg-white dark:bg-slate-800 shadow-xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                      <DialogTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {chunk?.docnm_kwd ?? t('chat.documentPreview')}
                      </DialogTitle>
                      <button
                        className="h-8 w-8 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        onClick={onClose}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                      {chunk ? (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {chunk.content_with_weight}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.noData')}</p>
                      )}
                    </div>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </div>
      </HeadlessDialog>
    </Transition>
  )
}

export default ChatDocumentPreviewDrawer
