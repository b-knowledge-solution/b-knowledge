/**
 * @fileoverview Guideline context provider and hook.
 * Provides a global context for guideline state (currently a placeholder for future extensions).
 * @module features/guideline/hooks/useGuidelineContext
 */
import { createContext, useContext, ReactNode } from 'react';

/**
 * @description Shape of the guideline context value (placeholder for future global state).
 */
interface GuidelineContextType {
    // Placeholder for future global state
    // e.g., activeTourId, restartTour, etc.
}

const GuidelineContext = createContext<GuidelineContextType | undefined>(undefined);

/**
 * @description Provider component that wraps children with guideline context.
 * @param {{ children: ReactNode }} props - Children to wrap.
 * @returns {JSX.Element} Context provider.
 */
export function GuidelineProvider({ children }: { children: ReactNode }) {
    const value = {};

    return <GuidelineContext.Provider value={value}>{children}</GuidelineContext.Provider>;
}

/**
 * @description Hook to access the guideline context. Must be used within a GuidelineProvider.
 * @returns {GuidelineContextType} The guideline context value.
 * @throws {Error} If used outside of a GuidelineProvider.
 */
export function useGuidelineContext() {
    const context = useContext(GuidelineContext);
    // Guard: ensure hook is used within provider boundary
    if (context === undefined) {
        throw new Error('useGuidelineContext must be used within a GuidelineProvider');
    }
    return context;
}
