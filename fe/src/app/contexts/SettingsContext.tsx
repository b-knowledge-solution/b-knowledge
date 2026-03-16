/**
 * @fileoverview Settings context for theme and language preferences.
 * 
 * Provides application-wide settings management:
 * - Theme: light, dark, or system (auto-detect)
 * - Language: English, Vietnamese, Japanese
 * - Settings dialog open/close state
 * 
 * Settings are persisted to localStorage for consistency across sessions.
 * 
 * @module contexts/SettingsContext
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { LanguageCode, SUPPORTED_LANGUAGES } from '@/i18n';

// ============================================================================
// Types
// ============================================================================

/**
 * @description Theme preference options: explicit light/dark or automatic system detection
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Settings context value type.
 */
interface SettingsContextType {
  /** Current theme setting */
  theme: Theme;
  /** Update theme setting */
  setTheme: (theme: Theme) => void;
  /** Current language code */
  language: LanguageCode;
  /** Update language setting */
  setLanguage: (lang: LanguageCode) => void;
  /** Whether dark mode is currently active */
  isDarkMode: boolean;
  /** Resolved theme (light or dark, after system preference applied) */
  resolvedTheme: 'light' | 'dark';
  /** Whether the settings dialog is open */
  isSettingsOpen: boolean;
  /** Open the settings dialog */
  openSettings: () => void;
  /** Close the settings dialog */
  closeSettings: () => void;
}

// ============================================================================
// Context & Constants
// ============================================================================

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

/** localStorage key for theme preference */
const STORAGE_KEY_THEME = 'kb-theme';
/** localStorage key for language preference */
const STORAGE_KEY_LANGUAGE = 'kb-language';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect system color scheme preference.
 * @returns 'dark' if user prefers dark mode, 'light' otherwise
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * Get stored theme from localStorage.
 * @returns Stored theme or 'system' as default
 */
function getStoredTheme(): Theme {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY_THEME);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  }
  return 'system';
}

/**
 * Get stored language from localStorage.
 * @returns Stored language code or 'en' as default
 */
function getStoredLanguage(): LanguageCode {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY_LANGUAGE);
    if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
      return stored as LanguageCode;
    }
  }
  return 'en';
}

// ============================================================================
// Provider
// ============================================================================

interface SettingsProviderProps {
  children: ReactNode;
}

/**
 * @description Manages theme, language, and settings dialog state with localStorage persistence
 * @param {SettingsProviderProps} props - Provider props containing children to wrap
 * @returns {JSX.Element} Context provider wrapping children with settings state
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  const { i18n } = useTranslation();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [language, setLanguageState] = useState<LanguageCode>(getStoredLanguage);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  /** Open settings dialog */
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  /** Close settings dialog */
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  /**
   * Effect: Apply dark mode based on theme setting.
   * Listens for system preference changes when theme is 'system'.
   */
  useEffect(() => {
    const updateDarkMode = () => {
      const shouldBeDark = theme === 'dark' || (theme === 'system' && getSystemTheme() === 'dark');
      setIsDarkMode(shouldBeDark);

      // Apply dark class to document root for Tailwind
      if (shouldBeDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    updateDarkMode();

    // Listen for system theme changes when using 'system' theme for real-time updates
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => updateDarkMode();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  /**
   * Effect: Sync language with i18n library on change.
   */
  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  /** 
   * Update theme and persist to localStorage.
   * Also triggers class toggle on document element.
   */
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY_THEME, newTheme);
  }, []);

  /** 
   * Update language and persist to localStorage.
   * Also updates i18n instance.
   */
  const setLanguage = useCallback((newLang: LanguageCode) => {
    setLanguageState(newLang);
    localStorage.setItem(STORAGE_KEY_LANGUAGE, newLang);
    i18n.changeLanguage(newLang);
  }, [i18n]);

  return (
    <SettingsContext.Provider
      value={{
        theme,
        setTheme,
        language,
        setLanguage,
        isDarkMode,
        resolvedTheme: isDarkMode ? 'dark' : 'light',
        isSettingsOpen,
        openSettings,
        closeSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Accesses the settings context for theme, language, and dialog controls
 * @returns {SettingsContextType} Settings context value
 * @throws {Error} If used outside of a SettingsProvider
 *
 * @example
 * ```tsx
 * const { theme, setTheme, isDarkMode } = useSettings();
 * ```
 */
export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export { SUPPORTED_LANGUAGES };
