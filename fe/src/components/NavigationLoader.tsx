/**
 * @fileoverview Navigation loading context and overlay component.
 * 
 * Provides a context to manage navigation loading state across the app.
 * The overlay is triggered IMMEDIATELY on navigation link click, before
 * the route change occurs, to block the screen during lazy loading.
 * 
 * @module components/NavigationLoader
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { useLocation, useNavigate, To, NavigateOptions } from 'react-router-dom';
import NProgress from 'nprogress';
import { useTranslation } from 'react-i18next';
import 'nprogress/nprogress.css';

// Configure NProgress
NProgress.configure({
    showSpinner: false,
    easing: 'ease',
    speed: 400,
    trickleSpeed: 150,
    minimum: 0.1
});

// ============================================================================
// Types
// ============================================================================

interface NavigationContextType {
    /** Whether navigation is in progress */
    isNavigating: boolean;
    /** Start navigation - shows overlay immediately */
    startNavigation: () => void;
    /** Stop navigation - hides overlay */
    stopNavigation: () => void;
    /** Navigate with loading overlay */
    navigateWithLoader: (to: To, options?: NavigateOptions) => void;
}

// ============================================================================
// Context
// ============================================================================

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface NavigationProviderProps {
    children: ReactNode;
}

/**
 * @description Navigation provider that manages the loading overlay state.
 * Shows overlay immediately on startNavigation() and hides it automatically
 * when the route changes or after a safety timeout.
 * @param {NavigationProviderProps} props - Children to wrap with navigation context
 * @returns {JSX.Element} Provider with optional overlay when navigating
 */
export function NavigationProvider({ children }: NavigationProviderProps) {
    const [isNavigating, setIsNavigating] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    // Track the location when navigation started
    const startLocationRef = useRef<string>('');

    /**
     * Start navigation - shows overlay immediately
     */
    const startNavigation = useCallback(() => {
        // Remember the current location so we know when it changes
        startLocationRef.current = location.pathname;
        setIsNavigating(true);
        NProgress.start();
    }, [location.pathname]);

    /**
     * Stop navigation - hides overlay
     */
    const stopNavigation = useCallback(() => {
        setIsNavigating(false);
        NProgress.done();
    }, []);

    /**
     * Navigate with loading overlay
     */
    const navigateWithLoader = useCallback((to: To, options?: NavigateOptions) => {
        startNavigation();
        // Small delay to ensure overlay renders before navigation
        setTimeout(() => {
            navigate(to, options);
        }, 10);
    }, [navigate, startNavigation]);

    /**
     * Effect: Auto-stop navigation when route actually changes.
     * Only stops if we're navigating AND the location is different from when we started.
     */
    useEffect(() => {
        if (isNavigating && startLocationRef.current !== '' && location.pathname !== startLocationRef.current) {
            console.log('[NavigationLoader] Location changed from', startLocationRef.current, 'to', location.pathname, '- stopping navigation');
            // Location has changed, page loaded - hide overlay after small delay
            const timer = setTimeout(() => {
                stopNavigation();
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [location.pathname, isNavigating, stopNavigation]);

    /**
     * Effect: Safety timeout - hide overlay after max 3 seconds
     */
    useEffect(() => {
        if (!isNavigating) return;

        const timer = setTimeout(() => {
            stopNavigation();
        }, 3000);

        return () => clearTimeout(timer);
    }, [isNavigating, stopNavigation]);

    const value: NavigationContextType = {
        isNavigating,
        startNavigation,
        stopNavigation,
        navigateWithLoader,
    };

    return (
        <NavigationContext.Provider value={value}>
            {children}
            {isNavigating && <NavigationOverlay />}
        </NavigationContext.Provider>
    );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook to access navigation loading state and control functions
 * @returns {NavigationContextType} Navigation context with isNavigating state and control functions
 * @throws {Error} If used outside NavigationProvider
 */
export function useNavigation(): NavigationContextType {
    const context = useContext(NavigationContext);
    if (!context) {
        throw new Error('useNavigation must be used within a NavigationProvider');
    }
    return context;
}

// ============================================================================
// Overlay Component
// ============================================================================

/**
 * @description Full-screen loading overlay that blocks user interaction during navigation
 * @returns {JSX.Element} Semi-transparent backdrop with centered loading spinner
 */
function NavigationOverlay() {
    const { t } = useTranslation();

    return (
        <div
            className="fixed inset-0 z-[9999] bg-slate-900/90 dark:bg-black/95 backdrop-blur-sm flex items-center justify-center opacity-0 animate-[fadeIn_0.1s_ease-out_forwards]"
            style={{
                pointerEvents: 'all',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            role="alert"
            aria-busy="true"
            aria-label={t('common.loading')}
        >
            <div className="flex flex-col items-center gap-4 bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-2xl">
                {/* Spinner */}
                <div className="relative">
                    <div className="w-10 h-10 border-4 border-blue-200 dark:border-slate-600 rounded-full"></div>
                    <div className="absolute inset-0 w-10 h-10 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                </div>
                {/* Loading Text */}
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {t('common.loading')}
                </span>
            </div>
        </div>
    );
}

// ============================================================================
// Navigation Link Component
// ============================================================================

interface NavLinkWithLoaderProps {
    to: string;
    className?: string | ((props: { isActive: boolean }) => string);
    title?: string;
    children: ReactNode;
    onClick?: (e: React.MouseEvent) => void;
}

/**
 * @description NavLink wrapper that triggers loading overlay immediately on click before navigation
 * @param {NavLinkWithLoaderProps} props - Route path, styling, and children
 * @returns {JSX.Element} NavLink with integrated loading overlay trigger
 */
export function NavLinkWithLoader({ to, className, title, children, onClick }: NavLinkWithLoaderProps) {
    const { startNavigation } = useNavigation();
    const location = useLocation();

    const handleClick = (e: React.MouseEvent) => {
        // Don't show loader if clicking the current page
        if (location.pathname === to) {
            return;
        }

        // Start the loading overlay immediately
        startNavigation();

        // Call any additional onClick handler
        if (onClick) {
            onClick(e);
        }
    };

    // Import NavLink dynamically to avoid circular dependency
    const { NavLink } = require('react-router-dom');

    return (
        <NavLink
            to={to}
            className={className}
            title={title}
            onClick={handleClick}
        >
            {children}
        </NavLink>
    );
}

export default NavigationProvider;
