/**
 * @fileoverview Settings dialog component for user preferences.
 * 
 * Provides UI for configuring:
 * - Language preference (with native names and flags)
 * - Theme preference (light, dark, or system)
 * 
 * Uses Headless UI Dialog via the Dialog component wrapper.
 * Settings are persisted via SettingsContext.
 * 
 * @module components/SettingsDialog
 */

import { useTranslation } from 'react-i18next';
import { useSettings, SUPPORTED_LANGUAGES, Theme } from '@/app/contexts/SettingsContext';
import { LanguageCode } from '../i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup } from './RadioGroup';

// ============================================================================
// Component
// ============================================================================

/**
 * @description Settings dialog for configuring language and theme preferences.
 * Displays when isSettingsOpen is true in SettingsContext. Changes are applied immediately.
 * @returns {JSX.Element} Dialog with language and theme radio group selectors
 */
function SettingsDialog() {
  const { t } = useTranslation();
  const { theme, setTheme, language, setLanguage, isSettingsOpen, closeSettings } = useSettings();

  // Build radio options from supported language config with native names and flag emojis
  const languageOptions = SUPPORTED_LANGUAGES.map(lang => ({
    value: lang.code,
    label: lang.nativeName,
    icon: lang.flag,
  }));

  // Theme options with localized labels and visual icons
  const themeOptions: { value: Theme; label: string; icon: string }[] = [
    { value: 'light', label: t('settings.themeLight'), icon: '☀️' },
    { value: 'dark', label: t('settings.themeDark'), icon: '🌙' },
    { value: 'system', label: t('settings.themeSystem'), icon: '💻' },
  ];

  return (
    <Dialog open={isSettingsOpen} onOpenChange={(v: boolean) => { if (!v) closeSettings() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
            <DialogTitle>{t('settings.title')}</DialogTitle>
        </DialogHeader>
      {/* Language Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          {t('settings.language')}
        </label>
        <RadioGroup
          value={language}
          onChange={(value) => setLanguage(value as LanguageCode)}
          options={languageOptions}
          columns={3}
        />
      </div>

      {/* Theme Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          {t('settings.theme')}
        </label>
        <RadioGroup
          value={theme}
          onChange={(value) => setTheme(value as Theme)}
          options={themeOptions}
          columns={3}
        />
      </div>
      <DialogFooter>
        <button onClick={closeSettings} className="btn btn-primary px-6">
          {t('common.close')}
        </button>
      </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
