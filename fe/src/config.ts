import { EnvBoolString } from '@/constants'

/**
 * @fileoverview Application configuration module.
 * 
 * Centralizes access to environment variables and feature flags.
 * All feature toggles are controlled via VITE_* environment variables.
 * 
 * Environment Variables:
 * - VITE_ENABLE_AI_CHAT: Enable AI Chat feature (default: true)
 * - VITE_ENABLE_AI_SEARCH: Enable AI Search feature (default: true)
 * - VITE_ENABLE_HISTORY: Enable chat history feature (default: true)
 * 
 * @module config
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * @description Parses a boolean environment variable, returning the default if the value is not explicitly 'true' or 'false'
 * @param {string} key - Environment variable key (VITE_* prefix)
 * @param {boolean} defaultValue - Default value if not set or invalid
 * @returns {boolean} Parsed boolean value
 */
const getBoolEnv = (key: string, defaultValue: boolean): boolean => {
    const value = import.meta.env[key];
    // Only accept explicit string booleans
    if (value === EnvBoolString.TRUE) return true;
    if (value === EnvBoolString.FALSE) return false;
    return defaultValue;
};

// ============================================================================
// Configuration Export
// ============================================================================

/**
 * Application configuration object.
 * Centralizes feature flags and environment-specific settings.
 * 
 * Used throughout the app to conditionally render features or 
 * configure service endpoints.
 */
export const config = {
    /** Feature toggles for conditional rendering based on environment */
    features: {
        /** Enable AI Chat page and its associated navigation links */
        enableAiChat: getBoolEnv('VITE_ENABLE_AI_CHAT', true),
        /** Enable AI Search page and its associated navigation links */
        enableAiSearch: getBoolEnv('VITE_ENABLE_AI_SEARCH', true),
        /** Enable chat history page and its associated navigation links */
        enableHistory: getBoolEnv('VITE_ENABLE_HISTORY', true),
    },
    /** 
     * Base URL for the backend API.
     * Proxied in development, absolute in production.
     */
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
};
