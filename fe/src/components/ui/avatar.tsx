import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';

/**
 * @description Circular avatar container wrapping Radix UI Avatar primitive
 * @param {React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>} props - Avatar root props
 * @returns {JSX.Element} Rendered circular avatar wrapper
 */
const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

/**
 * @description Displays the avatar image, auto-hidden on load error
 * @param {React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>} props - Image props including src and alt
 * @returns {JSX.Element} Rendered avatar image
 */
const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full', className)} {...props} />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

/**
 * @description Fallback content shown when avatar image is unavailable (e.g., initials)
 * @param {React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>} props - Fallback props
 * @returns {JSX.Element} Rendered fallback with muted background
 */
const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
