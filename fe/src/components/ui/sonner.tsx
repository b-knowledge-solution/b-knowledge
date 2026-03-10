import { Toaster as Sonner } from 'sonner';
import { useSettings } from '@/app/contexts/SettingsContext';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Themed toast notification container.
 * Replaces Ant Design's message API.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useSettings();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
