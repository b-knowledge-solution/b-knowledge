/**
 * @fileoverview Reusable category sidebar component for the knowledge base detail page.
 *
 * Renders a scrollable list of categories within a tab, with active highlight,
 * context menu for edit/delete, and a "New Category" button pinned at the bottom.
 *
 * @module features/knowledge-base/components/CategorySidebar
 */

import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DocumentCategory, DocumentCategoryType } from '../api/knowledgeBaseApi'

// ============================================================================
// Types
// ============================================================================

interface CategorySidebarProps {
  /** List of categories to display */
  categories: DocumentCategory[]
  /** Currently selected category ID (null if none) */
  activeCategoryId: string | null
  /** Callback when a category is selected */
  onSelectCategory: (id: string) => void
  /** Callback to open the create category modal */
  onCreateCategory: () => void
  /** Callback to open the edit modal for a category */
  onEditCategory: (category: DocumentCategory) => void
  /** Callback to delete a category by ID */
  onDeleteCategory: (id: string) => void
  /** The category type for this sidebar (used for empty state messaging) */
  categoryType: DocumentCategoryType
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Sidebar listing categories within a tab, with active highlight, context actions, and "New Category" CTA
 * @param {CategorySidebarProps} props - Sidebar configuration and event handlers
 * @returns {JSX.Element} Rendered category sidebar with scrollable list
 */
const CategorySidebar = ({
  categories,
  activeCategoryId,
  onSelectCategory,
  onCreateCategory,
  onEditCategory,
  onDeleteCategory,
  categoryType: _categoryType,
}: CategorySidebarProps) => {
  const { t } = useTranslation()

  return (
    <div className="w-60 shrink-0 border-r border-border flex flex-col h-full">
      {/* Header with title */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          {t('knowledgeBase.categories.title')}
        </h3>
      </div>

      {/* Scrollable category list */}
      <ScrollArea className="flex-1">
        {categories.length === 0 ? (
          // Empty state per UI-SPEC copywriting contract
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {t('knowledgeBase.emptyCategoryTitle', 'No categories')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('knowledgeBase.emptyCategoryDescription', 'Create a category to start adding files.')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {categories.map((cat) => {
              // Determine if this category is the active one
              const isActive = cat.id === activeCategoryId

              return (
                <div
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer text-sm transition-colors
                    ${isActive
                      ? 'bg-accent border-l-2 border-primary font-medium'
                      : 'hover:bg-muted border-l-2 border-transparent'
                    }`}
                >
                  {/* Category name with truncation */}
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="truncate text-foreground">{cat.name}</p>
                    {/* Truncated description if present */}
                    {cat.description && (
                      <p className="truncate text-xs text-muted-foreground mt-0.5">
                        {cat.description}
                      </p>
                    )}
                  </div>

                  {/* Context menu for edit/delete */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                      >
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e: MouseEvent<HTMLDivElement>) => {
                          e.stopPropagation()
                          onEditCategory(cat)
                        }}
                      >
                        <Pencil size={14} className="mr-2" />
                        {t('knowledgeBase.categories.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e: MouseEvent<HTMLDivElement>) => {
                          e.stopPropagation()
                          onDeleteCategory(cat.id)
                        }}
                      >
                        <Trash2 size={14} className="mr-2" />
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>

      {/* "New Category" button pinned at bottom */}
      <div className="p-3 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onCreateCategory}
        >
          <Plus size={14} className="mr-1.5" />
          {t('knowledgeBase.newCategory', 'New Category')}
        </Button>
      </div>
    </div>
  )
}

export default CategorySidebar
