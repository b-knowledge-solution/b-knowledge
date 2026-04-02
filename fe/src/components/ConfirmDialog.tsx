/**
 * @fileoverview Promise-based global confirmation dialog provider.
 * 
 * Provides a context and hook to trigger a confirmation modal from anywhere
 * in the application without managing local state for each modal.
 * 
 * @module components/ConfirmDialog
 * @example
 * ```tsx
 * const confirm = useConfirm();
 * const confirmed = await confirm({
 *   title: 'Delete User',
 *   message: 'Are you sure you want to delete this user?',
 *   variant: 'danger'
 * });
 * if (confirmed) {
 *   // Perform deletion
 * }
 * ```
 */
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Options for configuring the confirmation dialog.
 */
interface ConfirmOptions {
    /** Dialog title (optional, defaults to "Confirm Action") */
    title?: string;
    /** The message body to display */
    message: string;
    /** Text for the confirm button */
    confirmText?: string;
    /** Text for the cancel button */
    cancelText?: string;
    /** Visual style of the primary button */
    variant?: 'danger' | 'warning' | 'info';
}

/**
 * Shape of the confirmation context.
 */
interface ConfirmContextType {
    /** Triggers the confirm dialog and returns a promise resolving to user choice */
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

/** Global context for the confirmation service */
const ConfirmContext = createContext<ConfirmContextType | null>(null);

/**
 * @description Hook to access the global confirmation service
 * @returns {(options: ConfirmOptions) => Promise<boolean>} Confirm function that triggers the dialog and resolves to user choice
 * @throws {Error} If used outside a ConfirmProvider
 */
export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context.confirm;
};

/** Props for the ConfirmProvider component */
interface ConfirmProviderProps {
    /** Application children */
    children: ReactNode;
}

/**
 * @description Context provider for the global confirmation dialog, managing shared modal state
 * @param {ConfirmProviderProps} props - Application children to wrap
 * @returns {JSX.Element} Context provider with confirmation dialog overlay
 */
export const ConfirmProvider: React.FC<ConfirmProviderProps> = ({ children }) => {
    const { t } = useTranslation();

    // UI State
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions | null>(null);

    // Promise resolver state
    const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

    /**
     * Trigger the confirmation dialog.
     * 
     * @param opts - Configuration for the dialog appearance
     * @returns Promise resolving to true (confirmed) or false (cancelled)
     */
    const confirm = (opts: ConfirmOptions): Promise<boolean> => {
        setOptions(opts);
        setIsOpen(true);
        // Return a fresh promise that will be resolved by the button handlers
        return new Promise((resolve) => {
            setResolvePromise(() => resolve);
        });
    };

    /** Handles confirm button click */
    const handleConfirm = () => {
        if (resolvePromise) {
            resolvePromise(true);
        }
        setIsOpen(false);
        setOptions(null);
        setResolvePromise(null);
    };

    /** Handles cancel button or backdrop click */
    const handleCancel = () => {
        if (resolvePromise) {
            resolvePromise(false);
        }
        setIsOpen(false);
        setOptions(null);
        setResolvePromise(null);
    };

    /**
     * Map variant to button Tailwind classes.
     * @returns CSS classes for the confirm button
     */
    const getVariantStyles = () => {
        const variant = options?.variant || 'warning';
        switch (variant) {
            case 'danger':
                return 'bg-red-600 hover:bg-red-700 focus:ring-red-500';
            case 'warning':
                return 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500';
            case 'info':
                return 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
            default:
                return 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
        }
    };

    return (
        <ConfirmContext value={{ confirm }}>
            {children}

            {/* Global confirmation modal instance */}
            {isOpen && options && (
                <Dialog open={isOpen} onOpenChange={(v: boolean) => { if (!v) handleCancel() }}>
                    <DialogContent className="max-w-sm z-[100]">
                        <DialogHeader>
                            <DialogTitle>{options.title || t('dialog.confirmTitle')}</DialogTitle>
                        </DialogHeader>
                        <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap py-4">
                            {options.message}
                        </div>
                        <div className="flex flex-row justify-end gap-2 pt-2">
                            {/* Cancel Button */}
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                            >
                                {options.cancelText || t('dialog.cancel')}
                            </button>
                            {/* Confirm Button */}
                            <button
                                onClick={handleConfirm}
                                className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${getVariantStyles()}`}
                                autoFocus
                            >
                                {options.confirmText || t('dialog.confirm')}
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </ConfirmContext>
    );
};
