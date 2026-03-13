import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Number of page buttons visible around current page */
  siblingCount?: number;
}

/** Generates the range of page numbers to display */
function generatePageRange(current: number, total: number, siblings: number): (number | 'dots')[] {
  const totalNumbers = siblings * 2 + 5; // siblings + boundaries + current + 2 dots

  if (total <= totalNumbers) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(current - siblings, 1);
  const rightSiblingIndex = Math.min(current + siblings, total);

  const showLeftDots = leftSiblingIndex > 2;
  const showRightDots = rightSiblingIndex < total - 1;

  if (!showLeftDots && showRightDots) {
    const leftItemCount = 3 + 2 * siblings;
    const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
    return [...leftRange, 'dots' as const, total];
  }

  if (showLeftDots && !showRightDots) {
    const rightItemCount = 3 + 2 * siblings;
    const rightRange = Array.from({ length: rightItemCount }, (_, i) => total - rightItemCount + i + 1);
    return [1, 'dots' as const, ...rightRange];
  }

  const middleRange = Array.from({ length: rightSiblingIndex - leftSiblingIndex + 1 }, (_, i) => leftSiblingIndex + i);
  return [1, 'dots' as const, ...middleRange, 'dots' as const, total];
}

/**
 * Pagination component.
 * Replaces Ant Design's Pagination.
 */
export function Pagination({ currentPage, totalPages, onPageChange, className, siblingCount = 1 }: PaginationProps) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  const pages = generatePageRange(currentPage, totalPages, siblingCount);

  return (
    <nav className={cn('flex items-center gap-1', className)} aria-label="Pagination">
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

function PaginationButton({ className, ...props }: ButtonProps) {
  return <Button className={cn('h-9 min-w-9 px-3', className)} {...props} />;
}
