/**
 * @fileoverview Authentication hook and provider.
 *
 * Provides authentication state management for the application:
 * - Session checking via /api/auth/me endpoint (deduplicated by TanStack Query)
 * - User state with role-based permissions
 * - Automatic redirect to login for unauthenticated users
 * - Logout functionality
 *
 * @module hooks/useAuth
 */

import { createContext, useContext, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

/** Backend API base URL */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ============================================================================
// Types
// ============================================================================

/**
 * @description Authenticated user information interface.
 * Contains profile data from Azure AD and role from database.
 */
export interface User {
  /** Unique user ID (from Azure AD or database) */
  id: string;
  /** User's email address */
  email: string;
  /** User's full name */
  name: string;
  /** Display name (may differ from full name) */
  displayName: string;
  /** Avatar URL (from Azure AD or generated) */
  avatar?: string;
  /** User's role: admin, manager, or user */
  role: 'super-admin' | 'admin' | 'leader' | 'user';
  /** List of granted permissions */
  permissions: string[];
  /** User's department (from Azure AD) */
  department?: string;
  /** User's job title (from Azure AD) */
  job_title?: string;
  /** User's mobile phone (from Azure AD) */
  mobile_phone?: string;
}

/**
 * @description Authentication context value interface.
 * Defines the shape of the data provided by AuthProvider.
 */
interface AuthContextType {
  /** Current authenticated user or null */
  user: User | null;
  /** Whether auth check is in progress */
  isLoading: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Error message if auth check failed */
  error: string | null;
  /** Function to manually check session */
  checkSession: () => Promise<boolean>;
  /** Function to logout user */
  logout: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Paths that do not require authentication */
const PUBLIC_PATHS = ['/login', '/logout', '/403', '/404', '/500'];

// ============================================================================
// Query Function
// ============================================================================

/**
 * @description Fetch the current user session from the backend.
 * Returns user data on success, null on 401, throws on other errors.
 *
 * @returns {Promise<User | null>} User data or null if unauthorized.
 */
async function fetchCurrentUser(): Promise<User | null> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    credentials: 'include',
  });

  // 401 means no active session — return null (not an error)
  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Unexpected response: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Context
// ============================================================================

/**
 * @description React Context for Authentication.
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

/**
 * @description Props for the AuthProvider component.
 */
interface AuthProviderProps {
  /** Child components to wrap with the auth context */
  children: ReactNode;
}

/**
 * @description Authentication provider component.
 * Wraps the application to provide authentication context.
 * Uses TanStack Query for deduplicated session fetching.
 * Automatically redirects to login for unauthenticated users on protected paths.
 *
 * @param {AuthProviderProps} props - Component properties.
 * @returns {JSX.Element} The provider wrapping children.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  // Determine if current path requires authentication
  const isPublicPath = location.pathname === '/' || PUBLIC_PATHS.some(path => location.pathname.startsWith(path));

  /**
   * TanStack Query handles deduplication: even if React.StrictMode
   * double-mounts the component, only one network request is made.
   * Disabled on public paths — no need to check auth for login page etc.
   */
  const {
    data: user = null,
    isLoading: isQueryLoading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: fetchCurrentUser,
    enabled: !isPublicPath,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // On public paths, loading is instantly resolved (no query fires)
  const isLoading = isPublicPath ? false : isQueryLoading;

  /**
   * @description Check if user has a valid session.
   * Re-fetches via TanStack Query and returns whether session is valid.
   * Used after login to verify the new session.
   *
   * @returns {Promise<boolean>} true if session is valid, false otherwise.
   */
  const checkSession = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[Auth] Checking session...');
      // Invalidate + refetch to get fresh data
      const userData = await queryClient.fetchQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: fetchCurrentUser,
        staleTime: 0,
      });
      console.log('[Auth] Session valid:', userData?.email);
      return !!userData;
    } catch (err) {
      console.error('[Auth] Error checking session:', err);
      return false;
    }
  }, [queryClient]);

  /**
   * @description Logout the current user.
   * Clears query cache and redirects to backend logout endpoint.
   */
  const logout = useCallback(() => {
    console.log('[Auth] Logging out...');

    // Clear the cached user data immediately
    queryClient.setQueryData(queryKeys.auth.me(), null);

    // Call the logout endpoint using POST method
    fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
      .then(() => {
        // Redirect to login page after successful logout
        navigate('/login');
      })
      .catch((err) => {
        // Even if the API call fails, redirect to login to ensure client-side logout
        console.error('[Auth] Logout failed:', err);
        navigate('/login');
      });
  }, [navigate, queryClient]);

  /**
   * @description Effect: Redirect unauthenticated users on protected paths.
   *
   * IMPORTANT: Only redirects after the query has settled (not loading)
   * and user is confirmed null. Skips when already on a public path
   * or when user is authenticated.
   */
  useEffect(() => {
    // Skip on public paths or while query is still loading
    if (isPublicPath || isLoading) {
      return;
    }

    // Skip if user is authenticated
    if (user !== null) {
      return;
    }

    // User is null and query has settled — redirect to login
    const redirectUrl = location.pathname + location.search;
    console.log('[Auth] Not authenticated, redirecting to login. Intended destination:', redirectUrl);
    navigate(`/login?redirect=${encodeURIComponent(redirectUrl)}`, { replace: true });
  }, [isPublicPath, isLoading, user, location.pathname, location.search, navigate]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error: queryError ? (queryError instanceof Error ? queryError.message : 'Failed to check session') : null,
    checkSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook to access authentication context.
 * Must be used within an AuthProvider.
 *
 * @returns {AuthContextType} Authentication context with user state and methods.
 * @throws {Error} If used outside of an AuthProvider.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, logout } = useAuth();
 * if (isAuthenticated) {
 *   console.log('Logged in as:', user?.email);
 * }
 * ```
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default useAuth;
