<script lang="ts">
  import { onMount } from 'svelte';
  import { t, translations } from '../lib/i18n.js';
  import { loadSettings, saveSettings } from '../lib/settingsStore.svelte.js';
  import type { AppSettingsDto } from '$shared/types';
  import type { Locale } from '../lib/i18n.js';

  let form = $state<AppSettingsDto>({
    locale: 'de-DE',
    dateFormat: 'DD.MM.YYYY',
    numberFormat: 'de-DE',
  });

  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state('');

  // Today's date for format preview
  const TODAY = new Date();
  const todayDD = String(TODAY.getDate()).padStart(2, '0');
  const todayMM = String(TODAY.getMonth() + 1).padStart(2, '0');
  const todayYYYY = String(TODAY.getFullYear());

  const DATE_OPTIONS: { value: string; label: string }[] = [
    { value: 'DD.MM.YYYY', label: `${todayDD}.${todayMM}.${todayYYYY} (TT.MM.JJJJ)` },
    { value: 'DD/MM/YYYY', label: `${todayDD}/${todayMM}/${todayYYYY} (TT/MM/JJJJ)` },
    { value: 'DD-MM-YYYY', label: `${todayDD}-${todayMM}-${todayYYYY} (TT-MM-JJJJ)` },
    { value: 'YYYY-MM-DD', label: `${todayYYYY}-${todayMM}-${todayDD} (JJJJ-MM-TT)` },
    { value: 'MM/DD/YYYY', label: `${todayMM}/${todayDD}/${todayYYYY} (MM/TT/JJJJ)` },
  ];

  const NUMBER_OPTIONS: { value: string; label: string }[] = [
    { value: 'de-DE', label: `1.000,00 (${t('settings.deutsch')})` },
    { value: 'en-US', label: `1,000.00 (${t('settings.englisch')})` },
  ];

  // Automatically derived from available translations – no manual update needed
  const LOCALE_OPTIONS: { value: Locale; label: string }[] = (
    Object.keys(translations) as Locale[]
  ).map((loc) => ({
    value: loc,
    label: translations[loc]['settings.locale.name'] ?? loc,
  }));

  onMount(async () => {
    try {
      const s = await loadSettings();
      form = { ...s };
    } catch {
      // form already has defaults
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    saving = true;
    saved = false;
    error = '';
    try {
      await saveSettings(form);
      saved = true;
      setTimeout(() => { saved = false; }, 3000);
    } catch (e: any) {
      error = e.message ?? 'Fehler beim Speichern';
    } finally {
      saving = false;
    }
  }
</script>

<div class="settings-page">
  <div class="page-header">
    <h1 class="page-title">{t('settings.title')}</h1>
    <p class="page-subtitle">{t('settings.subtitle')}</p>
  </div>

  {#if loading}
    <div class="loading-state">Einstellungen werden geladen...</div>
  {:else}
    <div class="settings-card">
      <div class="settings-section">
        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-label-text">{t('settings.sprache')}</span>
          </div>
          <div class="settings-control">
            <select bind:value={form.locale} class="settings-select">
              {#each LOCALE_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-label-text">{t('settings.datumsformat')}</span>
          </div>
          <div class="settings-control">
            <select bind:value={form.dateFormat} class="settings-select">
              {#each DATE_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-label-text">{t('settings.zahlenformat')}</span>
          </div>
          <div class="settings-control">
            <select bind:value={form.numberFormat} class="settings-select">
              {#each NUMBER_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        {#if error}
          <span class="settings-error">{error}</span>
        {/if}
        {#if saved}
          <span class="settings-success">{t('settings.gespeichert')}</span>
        {/if}
        <button
          class="btn-primary"
          onclick={handleSave}
          disabled={saving}
        >
          {saving ? t('settings.speichern_laufend') : t('settings.speichern')}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .settings-page {
    padding: 2rem 2.5rem;
    max-width: 760px;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-title {
    font-family: var(--font-display), sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text);
    margin: 0 0 0.25rem;
    letter-spacing: -0.02em;
  }

  .page-subtitle {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin: 0;
  }

  .loading-state {
    color: var(--text-muted);
    font-size: 0.875rem;
    padding: 1rem 0;
  }

  .settings-card {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    max-width: 680px;
  }

  .settings-card::before {
    content: '';
    display: block;
    height: 3px;
    background: var(--primary);
  }

  .settings-section {
    padding: 0.5rem 0;
  }

  .settings-row {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 1.125rem 1.75rem;
  }

  .settings-divider {
    height: 1px;
    background: var(--border);
    margin: 0 1.75rem;
    opacity: 0.6;
  }

  .settings-label {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .settings-label-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
  }

  .settings-control {
    flex-shrink: 0;
    width: 280px;
  }

  .settings-select {
    width: 100%;
    padding: 0.5rem 2rem 0.5rem 0.75rem;
    font-size: 0.8125rem;
    font-family: var(--font-body), sans-serif;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .settings-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .settings-select:hover:not(:disabled) {
    border-color: #c8c5c0;
  }

  .settings-select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(166, 47, 36, 0.12);
  }

  .settings-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    padding: 1.25rem 1.75rem;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .settings-error {
    font-size: 0.8125rem;
    color: var(--danger);
  }

  .settings-success {
    font-size: 0.8125rem;
    color: #2d7a3a;
    font-weight: 500;
  }

  .btn-primary {
    padding: 0.55rem 1.25rem;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: var(--radius);
    font-size: 0.8125rem;
    font-weight: 600;
    font-family: var(--font-body), sans-serif;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
