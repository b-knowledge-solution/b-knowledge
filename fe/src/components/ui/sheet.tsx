import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

/** @description Root sheet state container using Radix Dialog under the hood */
const Sheet = DialogPrimitive.Root;
/** @description Element that triggers the sheet open state */
const SheetTrigger = DialogPrimitive.Trigger;
/** @description Button that closes the sheet */
const SheetClose = DialogPrimitive.Close;
/** @description Portal for rendering sheet outside the DOM tree */
const SheetPortal = DialogPrimitive.Portal;

/**
 * @description Semi-transparent backdrop overlay behind the sheet
 * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>} props - Overlay props
 * @returns {JSX.Element} Rendered overlay with fade animation
 */
const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** @description Side-dependent slide animation variants for sheet positioning (top, bottom, left, right) */
const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom: 'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right: 'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
      },
    },
    defaultVariants: { side: 'right' },
  }
);

/** @description Props for SheetContent combining dialog content with side variant */
interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  className?: string;
  children?: React.ReactNode;
}

/**
 * @description Slide-in panel from a specified side with overlay and close button
 * @param {SheetContentProps} props - Sheet content props including side direction
 * @returns {JSX.Element} Rendered sheet panel
 */
const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, ...props }, ref) => {
  const { t } = useTranslation();

  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
        {/* Default hidden title + description to satisfy Radix accessibility.
            Consumers that render their own SheetTitle/SheetDescription will
            naturally override these visually, but both DOM nodes coexist.  */}
        <DialogPrimitive.Title className="sr-only">Panel</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">Panel</DialogPrimitive.Description>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="h-4 w-4" />
          <span className="sr-only">{t('common.close')}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = DialogPrimitive.Content.displayName;

/**
 * @description Sheet header layout with vertical spacing
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div attributes
 * @returns {JSX.Element} Rendered sheet header
 */
const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';

/**
 * @description Sheet footer layout with responsive flex direction for action buttons
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard div attributes
 * @returns {JSX.Element} Rendered sheet footer
 */
const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
);
SheetFooter.displayName = 'SheetFooter';

/**
 * @description Sheet title text with semibold styling
 * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>} props - Title props
 * @returns {JSX.Element} Rendered sheet title
 */
const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-foreground', className)} {...props} />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

/**
 * @description Sheet description text with muted foreground color
 * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>} props - Description props
 * @returns {JSX.Element} Rendered sheet description
 */
const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription };
