import deDe from './de-DE.js';
import enUs from './en-US.js';

// ── Add new languages here ────────────────────────────────────────────────
// 1. Import the new language file
// 2. Add an entry to the `translations` object below
// Everything else (i18n.ts, SettingsPage) picks it up automatically.
// ─────────────────────────────────────────────────────────────────────────
export const translations = {
  'de-DE': deDe,
  'en-US': enUs,
} as const;

export type Locale = keyof typeof translations;
export type TranslationKeys = keyof typeof deDe;
