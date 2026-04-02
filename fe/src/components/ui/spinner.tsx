import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** @description Configuration props for the Spinner component */
interface SpinnerProps {
  className?: string;
  /** Size of the spinner icon */
  size?: number;
  /** Replaces antd Spin's `tip` prop */
  label?: string | undefined;
}

/**
 * @description Animated loading spinner with optional text label
 * @param {SpinnerProps} props - Spinner configuration including size and label
 * @returns {JSX.Element} Rendered spinning loader icon
 */
export function Spinner({ className, size = 24, label }: SpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2', className)}>
      <Loader2 className="animate-spin text-primary" style={{ width: size, height: size }} />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}

/**
 * @description Full-page or container-level loading overlay that dims content while loading
 * @param {{ loading: boolean; children: React.ReactNode; label?: string }} props - Overlay configuration
 * @returns {JSX.Element} Rendered children with optional spinner overlay
 */
export function SpinnerOverlay({ loading, children, label }: { loading: boolean; children: React.ReactNode; label?: string }) {
  // Skip overlay when not loading to avoid unnecessary DOM nesting
  if (!loading) return <>{children}</>;

  return (
    <div className="relative">
      <div className="opacity-50 pointer-events-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/50">
        <Spinner label={label} />
      </div>
    </div>
  );
}
