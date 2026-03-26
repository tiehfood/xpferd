import { translations, type Locale, type TranslationKeys } from '../../shared/i18n/index.js';
import { getSettings } from './settingsStore.svelte.js';

export type { Locale };
export { translations };

/**
 * Returns the translated string for the given key.
 * Reads the locale from the reactive settings store ($state),
 * so any {t('key')} in a Svelte template re-evaluates when the locale changes.
 */
export function t(key: TranslationKeys): string {
  const locale = (getSettings().locale || 'de-DE') as Locale;
  return (translations[locale] ?? translations['de-DE'])[key] ?? key;
}
