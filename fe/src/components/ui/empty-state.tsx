import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface EmptyStateProps {
  className?: string;
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

/**
 * Empty state placeholder.
 * Replaces Ant Design's Empty component.
 */
export function EmptyState({ className, icon, title, description, children }: EmptyStateProps) {
  const { t } = useTranslation();
  const displayTitle = title ?? t('common.noData');

  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="text-muted-foreground mb-3">
        {icon || <Inbox className="h-12 w-12 mx-auto" strokeWidth={1} />}
      </div>
      <h3 className="text-sm font-medium text-muted-foreground">{displayTitle}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground/70">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
