import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * @description Responsive table wrapper with horizontal scroll overflow
 * @param {React.HTMLAttributes<HTMLTableElement>} props - Standard table attributes
 * @returns {JSX.Element} Rendered table inside a scrollable container
 */
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
);
Table.displayName = 'Table';

/**
 * @description Table header section with bottom border on rows
 * @param {React.HTMLAttributes<HTMLTableSectionElement>} props - Standard thead attributes
 * @returns {JSX.Element} Rendered thead element
 */
const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  )
);
TableHeader.displayName = 'TableHeader';

/**
 * @description Table body section with border removed from last row
 * @param {React.HTMLAttributes<HTMLTableSectionElement>} props - Standard tbody attributes
 * @returns {JSX.Element} Rendered tbody element
 */
const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  )
);
TableBody.displayName = 'TableBody';

/**
 * @description Table footer section with muted background
 * @param {React.HTMLAttributes<HTMLTableSectionElement>} props - Standard tfoot attributes
 * @returns {JSX.Element} Rendered tfoot element
 */
const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />
  )
);
TableFooter.displayName = 'TableFooter';

/**
 * @description Table row with hover highlight and selected state support
 * @param {React.HTMLAttributes<HTMLTableRowElement>} props - Standard tr attributes
 * @returns {JSX.Element} Rendered tr element
 */
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />
  )
);
TableRow.displayName = 'TableRow';

/**
 * @description Table header cell with muted text styling
 * @param {React.ThHTMLAttributes<HTMLTableCellElement>} props - Standard th attributes
 * @returns {JSX.Element} Rendered th element
 */
const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)} {...props} />
  )
);
TableHead.displayName = 'TableHead';

/**
 * @description Table data cell with vertical alignment
 * @param {React.TdHTMLAttributes<HTMLTableCellElement>} props - Standard td attributes
 * @returns {JSX.Element} Rendered td element
 */
const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)} {...props} />
  )
);
TableCell.displayName = 'TableCell';

/**
 * @description Table caption with muted text below the table
 * @param {React.HTMLAttributes<HTMLTableCaptionElement>} props - Standard caption attributes
 * @returns {JSX.Element} Rendered caption element
 */
const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
  )
);
TableCaption.displayName = 'TableCaption';

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
