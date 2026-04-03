/**
 * @fileoverview Header Actions Context for passing action buttons to the layout header.
 * 
 * This provides a React 19 compatible alternative to createPortal for injecting
 * page-specific action buttons into the main layout header.
 * 
 * @module components/HeaderActions
 */

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

interface HeaderActionsContextType {
    /** Current header actions content */
    actions: ReactNode | null;
    /** Set header actions for the current page */
    setActions: (actions: ReactNode | null) => void;
}

// ============================================================================
// Context
// ============================================================================

const HeaderActionsContext = createContext<HeaderActionsContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface HeaderActionsProviderProps {
    children: ReactNode;
}

/**
 * @description Provider component for header actions context that manages shared action state
 * @param {HeaderActionsProviderProps} props - Children to wrap with the context
 * @returns {JSX.Element} Context provider wrapping children
 */
export function HeaderActionsProvider({ children }: HeaderActionsProviderProps) {
    const [actions, setActionsState] = useState<ReactNode | null>(null);

    const setActions = useCallback((newActions: ReactNode | null) => {
        setActionsState(newActions);
    }, []);

    return (
        <HeaderActionsContext.Provider value={{ actions, setActions }}>
            {children}
        </HeaderActionsContext.Provider>
    );
}

// ============================================================================
// Consumer Hook
// ============================================================================

/**
 * @description Hook to access the current header actions content for rendering in layout
 * @returns {ReactNode | null} Current header actions or null if none set
 * @throws {Error} If used outside HeaderActionsProvider
 */
export function useHeaderActionsContent() {
    const context = useContext(HeaderActionsContext);
    if (!context) {
        throw new Error('useHeaderActionsContent must be used within HeaderActionsProvider');
    }
    return context.actions;
}

/**
 * @description Hook to set header actions from a page component. Actions are automatically cleared on unmount.
 * @returns {(actions: ReactNode | null) => void} Setter function for header actions
 * @throws {Error} If used outside HeaderActionsProvider
 */
export function useHeaderActions() {
    const context = useContext(HeaderActionsContext);
    if (!context) {
        throw new Error('useHeaderActions must be used within HeaderActionsProvider');
    }
    return context.setActions;
}

// ============================================================================
// Component for setting actions
// ============================================================================

interface HeaderActionsProps {
    children: ReactNode;
}

/**
 * @description Declarative component that sets its children as header actions and cleans up on unmount
 * @param {HeaderActionsProps} props - Children to render as header actions
 * @returns {null} Renders nothing directly; injects children into header via context
 *
 * @example
 * ```tsx
 * <HeaderActions>
 *   <Button onClick={handleAdd}>Add New</Button>
 * </HeaderActions>
 * ```
 */
export function HeaderActions({ children }: HeaderActionsProps) {
    const setActions = useHeaderActions();

    useEffect(() => {
        setActions(children);

        // Cleanup on unmount
        return () => {
            setActions(null);
        };
    }, [children, setActions]);

    // This component doesn't render anything itself
    return null;
}

export default HeaderActions;
