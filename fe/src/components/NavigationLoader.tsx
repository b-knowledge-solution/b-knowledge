/**
 * @fileoverview Navigation loading context, overlay, and hooks.
 *
 * Two loading modes:
 * 1. **Route-change mode** (default): overlay shows on navigation start,
 *    hides automatically when the route changes (lazy chunk loaded).
 * 2. **Data-ready mode**: overlay stays visible until the destination page
 *    explicitly calls `stopNavigation()` after its data has loaded.
 *    Enable by passing `{ waitForReady: true }` to `navigateWithLoader`.
 *
 * Usage:
 * - Sidebar links: call `startNavigation()` on click (existing behaviour).
 * - Programmatic nav: use `useNavigateWithLoader()` hook — drop-in for
 *   `useNavigate()` but with automatic preloader.
 * - Destination page: call `usePageReady(loading)` to auto-signal readiness.
 *
 * @module components/NavigationLoader
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react'
import { useLocation, useNavigate, To, NavigateOptions } from 'react-router-dom'
import NProgress from 'nprogress'
import { useTranslation } from 'react-i18next'
import 'nprogress/nprogress.css'

// Configure NProgress — thin bar at the top of the viewport
NProgress.configure({
  showSpinner: false,
  easing: 'ease',
  speed: 400,
  trickleSpeed: 150,
  minimum: 0.1,
})

// ============================================================================
// Types
// ============================================================================

interface NavigationContextType {
  /** Whether navigation is in progress */
  isNavigating: boolean
  /** Start navigation — shows overlay immediately */
  startNavigation: (opts?: { waitForReady?: boolean }) => void
  /** Stop navigation — hides overlay (called by page when data is ready) */
  stopNavigation: () => void
  /** Navigate to a route with loading overlay */
  navigateWithLoader: (to: To, options?: NavigateOptions & { waitForReady?: boolean }) => void
}

// ============================================================================
// Context
// ============================================================================

const NavigationContext = createContext<NavigationContextType | undefined>(undefined)

// ============================================================================
// Provider
// ============================================================================

interface NavigationProviderProps {
  children: ReactNode
}

/**
 * @description Navigation provider that manages the loading overlay state.
 * Shows overlay immediately on startNavigation() and hides it when:
 * - The route changes AND waitForReady is false (default), OR
 * - The destination page calls stopNavigation() (waitForReady mode), OR
 * - The safety timeout (5s) fires.
 * @param {NavigationProviderProps} props - Children to wrap with navigation context
 * @returns {JSX.Element} Provider with conditional overlay when navigating
 */
export function NavigationProvider({ children }: NavigationProviderProps) {
  const [isNavigating, setIsNavigating] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Track the location when navigation started
  const startLocationRef = useRef<string>('')
  // Whether to wait for the page to signal readiness before hiding overlay
  const waitForReadyRef = useRef(false)

  /**
   * @description Start navigation — shows overlay immediately
   * @param {{ waitForReady?: boolean }} opts - If true, overlay stays until stopNavigation()
   */
  const startNavigation = useCallback((opts?: { waitForReady?: boolean }) => {
    // Remember the current location so we know when it changes
    startLocationRef.current = location.pathname
    waitForReadyRef.current = opts?.waitForReady ?? false
    setIsNavigating(true)
    NProgress.start()
  }, [location.pathname])

  /**
   * @description Stop navigation — hides overlay. Called by pages when data is loaded.
   */
  const stopNavigation = useCallback(() => {
    setIsNavigating(false)
    waitForReadyRef.current = false
    NProgress.done()
  }, [])

  /**
   * @description Navigate with loading overlay. Drop-in replacement for navigate().
   * @param {To} to - Route path or location descriptor
   * @param {NavigateOptions & { waitForReady?: boolean }} options - Navigation options
   */
  const navigateWithLoader = useCallback((to: To, options?: NavigateOptions & { waitForReady?: boolean }) => {
    const { waitForReady, ...navOptions } = options || {}
    startNavigation({ waitForReady })
    // Small delay to ensure overlay renders before navigation
    setTimeout(() => {
      navigate(to, navOptions)
    }, 10)
  }, [navigate, startNavigation])

  /**
   * Effect: Auto-stop navigation when route changes (only if NOT in waitForReady mode).
   * In waitForReady mode, the overlay stays until the page explicitly calls stopNavigation().
   */
  useEffect(() => {
    if (
      isNavigating &&
      startLocationRef.current !== '' &&
      location.pathname !== startLocationRef.current &&
      !waitForReadyRef.current
    ) {
      // Route changed and not waiting for page ready — hide overlay after brief delay
      const timer = setTimeout(() => {
        stopNavigation()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [location.pathname, isNavigating, stopNavigation])

  /**
   * Effect: Safety timeout — hide overlay after max 5 seconds to prevent stuck states
   */
  useEffect(() => {
    if (!isNavigating) return

    const timer = setTimeout(() => {
      stopNavigation()
    }, 5000)

    return () => clearTimeout(timer)
  }, [isNavigating, stopNavigation])

  const value: NavigationContextType = {
    isNavigating,
    startNavigation,
    stopNavigation,
    navigateWithLoader,
  }

  return (
    <NavigationContext.Provider value={value}>
      {children}
      {isNavigating && <NavigationOverlay />}
    </NavigationContext.Provider>
  )
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * @description Hook to access navigation loading state and control functions
 * @returns {NavigationContextType} Navigation context with isNavigating state and control functions
 * @throws {Error} If used outside NavigationProvider
 */
export function useNavigation(): NavigationContextType {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return context
}

/**
 * @description Drop-in replacement for useNavigate() that automatically shows the
 * loading overlay during page transitions. Accepts an optional `waitForReady` flag
 * in the options to keep the overlay until the destination page signals readiness.
 *
 * @example
 * const navigate = useNavigateWithLoader()
 * // Simple navigation — overlay hides on route change
 * navigate('/projects')
 * // Wait for data — overlay hides when page calls stopNavigation()
 * navigate(`/projects/${id}`, { waitForReady: true })
 *
 * @returns {(to: To, options?: NavigateOptions & { waitForReady?: boolean }) => void} Navigate function with preloader
 */
export function useNavigateWithLoader() {
  const { navigateWithLoader } = useNavigation()
  return navigateWithLoader
}

/**
 * @description Call this in a destination page to signal when the page is ready.
 * While `loading` is true and a navigation is in progress, the overlay stays visible.
 * Once `loading` becomes false, the overlay is dismissed.
 *
 * @example
 * const [data, setData] = useState(null)
 * const [loading, setLoading] = useState(true)
 * usePageReady(loading)
 * useEffect(() => { fetchData().then(d => { setData(d); setLoading(false) }) }, [])
 *
 * @param {boolean} loading - Whether the page is still loading data
 */
export function usePageReady(loading: boolean) {
  const { isNavigating, stopNavigation } = useNavigation()

  useEffect(() => {
    // When data finishes loading and overlay is still showing, dismiss it
    if (!loading && isNavigating) {
      stopNavigation()
    }
  }, [loading, isNavigating, stopNavigation])
}

// ============================================================================
// Overlay Component
// ============================================================================

/**
 * @description Full-screen loading overlay that blocks user interaction during navigation.
 * Uses NProgress bar at top + centered spinner card.
 * @returns {JSX.Element} Semi-transparent backdrop with centered loading spinner
 */
function NavigationOverlay() {
  const { t } = useTranslation()

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-900/90 dark:bg-black/95 backdrop-blur-sm flex items-center justify-center opacity-0 animate-[fadeIn_0.1s_ease-out_forwards]"
      style={{ pointerEvents: 'all' }}
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
          <div className="w-10 h-10 border-4 border-blue-200 dark:border-slate-600 rounded-full" />
          <div className="absolute inset-0 w-10 h-10 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" />
        </div>
        {/* Loading Text */}
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('common.loading')}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// Navigation Link Component
// ============================================================================

interface NavLinkWithLoaderProps {
  to: string
  className?: string | ((props: { isActive: boolean }) => string)
  title?: string
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
}

/**
 * @description NavLink wrapper that triggers loading overlay immediately on click before navigation
 * @param {NavLinkWithLoaderProps} props - Route path, styling, and children
 * @returns {JSX.Element} NavLink with integrated loading overlay trigger
 */
export function NavLinkWithLoader({ to, className, title, children, onClick }: NavLinkWithLoaderProps) {
  const { startNavigation } = useNavigation()
  const location = useLocation()

  const handleClick = (e: React.MouseEvent) => {
    // Don't show loader if clicking the current page
    if (location.pathname === to) {
      return
    }

    // Start the loading overlay immediately
    startNavigation()

    // Call any additional onClick handler
    if (onClick) {
      onClick(e)
    }
  }

  // Import NavLink dynamically to avoid circular dependency
  const { NavLink } = require('react-router-dom')

  return (
    <NavLink
      to={to}
      className={className}
      title={title}
      onClick={handleClick}
    >
      {children}
    </NavLink>
  )
}

export default NavigationProvider
