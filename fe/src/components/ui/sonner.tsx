import { Toaster as Sonner } from 'sonner';
import { useSettings } from '@/app/contexts/SettingsContext';

/** @description Props for the Toaster component inherited from Sonner */
type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * @description Themed toast notification container using sonner, replacing Ant Design's message API
 * @param {ToasterProps} props - Sonner toaster configuration
 * @returns {JSX.Element} Rendered toast container that responds to the current theme
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
