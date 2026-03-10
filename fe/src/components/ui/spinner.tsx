import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  /** Size of the spinner icon */
  size?: number;
  /** Replaces antd Spin's `tip` prop */
  label?: string | undefined;
}

/**
 * Loading spinner component.
 * Replaces Ant Design's Spin component.
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
 * Full-page or container-level loading overlay.
 * Replaces antd's `<Spin spinning={loading}>` wrapper pattern.
 */
export function SpinnerOverlay({ loading, children, label }: { loading: boolean; children: React.ReactNode; label?: string }) {
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
