import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

/** @description Configuration props for the Pagination component */
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Number of page buttons visible around current page */
  siblingCount?: number;
}

/**
 * @description Generates the range of page numbers to display with ellipsis dots
 * @param {number} current - Current active page number
 * @param {number} total - Total number of pages
 * @param {number} siblings - Number of sibling pages to show around current
 * @returns {(number | 'dots')[]} Array of page numbers and 'dots' placeholders
 */
function generatePageRange(current: number, total: number, siblings: number): (number | 'dots')[] {
  // Total visible slots: siblings on each side + first + last + current + 2 dot slots
  const totalNumbers = siblings * 2 + 5;

  // Show all pages when total fits within available slots
  if (total <= totalNumbers) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(current - siblings, 1);
  const rightSiblingIndex = Math.min(current + siblings, total);

  const showLeftDots = leftSiblingIndex > 2;
  const showRightDots = rightSiblingIndex < total - 1;

  // Near the start: show left pages + dots + last page
  if (!showLeftDots && showRightDots) {
    const leftItemCount = 3 + 2 * siblings;
    const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
    return [...leftRange, 'dots' as const, total];
  }

  // Near the end: show first page + dots + right pages
  if (showLeftDots && !showRightDots) {
    const rightItemCount = 3 + 2 * siblings;
    const rightRange = Array.from({ length: rightItemCount }, (_, i) => total - rightItemCount + i + 1);
    return [1, 'dots' as const, ...rightRange];
  }

  // In the middle: first + dots + siblings + dots + last
  const middleRange = Array.from({ length: rightSiblingIndex - leftSiblingIndex + 1 }, (_, i) => leftSiblingIndex + i);
  return [1, 'dots' as const, ...middleRange, 'dots' as const, total];
}

/**
 * @description Page navigation with prev/next buttons and numbered page links
 * @param {PaginationProps} props - Pagination configuration including currentPage and totalPages
 * @returns {JSX.Element | null} Rendered pagination nav or null when totalPages <= 1
 */
export function Pagination({ currentPage, totalPages, onPageChange, className, siblingCount = 1 }: PaginationProps) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  const pages = generatePageRange(currentPage, totalPages, siblingCount);

  return (
    <nav className={cn('flex items-center gap-1', className)} aria-label={t('common.pagination')}>
      <PaginationButton
        variant="outline"
        size="icon"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label={t('common.previousPage')}
      >
        <ChevronLeft className="h-4 w-4" />
      </PaginationButton>

      {pages.map((page, idx) =>
        page === 'dots' ? (
          <span key={`dots-${idx}`} className="flex h-9 w-9 items-center justify-center">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </span>
        ) : (
          <PaginationButton
            key={page}
            variant={page === currentPage ? 'default' : 'outline'}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </PaginationButton>
        )
      )}

      <PaginationButton
        variant="outline"
        size="icon"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label={t('common.nextPage')}
      >
        <ChevronRight className="h-4 w-4" />
      </PaginationButton>
    </nav>
  );
}

/**
 * @description Compact button styled for pagination controls
 * @param {ButtonProps} props - Button props
 * @returns {JSX.Element} Rendered pagination button
 */
function PaginationButton({ className, ...props }: ButtonProps) {
  return <Button className={cn('h-9 min-w-9 px-3', className)} {...props} />;
}
