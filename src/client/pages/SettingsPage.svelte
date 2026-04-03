<script lang="ts">
  import { onMount } from 'svelte';
  import { t, translations } from '../lib/i18n.js';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import { loadSettings, saveSettings } from '../lib/settingsStore.svelte.js';
  import { emailApi } from '../lib/api/emailApi.js';
  import type { AppSettingsDto, EmailSettingsDto } from '$shared/types';
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

  // ── SMTP state ──────────────────────────────────────────────────────────────
  let smtpForm = $state<EmailSettingsDto>({
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    fromAddress: '',
    fromName: '',
    replyTo: '',
  });
  let smtpLoading = $state(true);
  let smtpSaving = $state(false);
  let smtpSaved = $state(false);
  let smtpError = $state('');
  let passwordChanged = $state(false); // track if user edited password
  let testingConnection = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);

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

    // Load SMTP settings
    try {
      const smtp = await emailApi.getSettings();
      smtpForm = { ...smtp };
    } catch {
      // SMTP not yet configured — keep defaults
    } finally {
      smtpLoading = false;
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

  async function handleSmtpSave() {
    smtpSaving = true;
    smtpSaved = false;
    smtpError = '';
    testResult = null;
    try {
      // Only send password if user actually changed it
      const dto: EmailSettingsDto = {
        ...smtpForm,
        smtpPass: passwordChanged ? smtpForm.smtpPass : '',
      };
      await emailApi.updateSettings(dto);
      smtpSaved = true;
      passwordChanged = false;
      setTimeout(() => { smtpSaved = false; }, 3000);
    } catch (e: any) {
      smtpError = e.message ?? 'Fehler beim Speichern';
    } finally {
      smtpSaving = false;
    }
  }

  async function handleTestConnection() {
    testingConnection = true;
    testResult = null;
    smtpError = '';
    try {
      const result = await emailApi.testConnection();
      testResult = {
        success: result.success,
        message: result.success
          ? t('email.verbindung_erfolgreich')
          : (result.error ?? t('email.verbindung_fehlgeschlagen')),
      };
    } catch (e: any) {
      testResult = { success: false, message: e.message };
    } finally {
      testingConnection = false;
    }
  }
</script>

<div class="settings-page">
  <div class="page-header">
    <h1 class="page-title">{t('settings.title')}</h1>
    <p class="page-subtitle">{t('settings.subtitle')}</p>
  </div>

  {#if loading}
    <div class="loading-state">{t('dashboard.laden')}</div>
  {:else}
    <div class="settings-card">
      <div class="settings-section">
        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-label-text">{t('settings.sprache')}</span>
          </div>
          <div class="settings-control">
            <FormSelect
              bind:value={form.locale}
              class="settings-select"
              items={LOCALE_OPTIONS.map(opt => ({ value: opt.value, name: opt.label }))}
            />
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-label-text">{t('settings.datumsformat')}</span>
          </div>
          <div class="settings-control">
            <FormSelect
              bind:value={form.dateFormat}
              class="settings-select"
              items={DATE_OPTIONS.map(opt => ({ value: opt.value, name: opt.label }))}
            />
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-row">
          <div class="settings-label">
            <span class="settings-label-text">{t('settings.zahlenformat')}</span>
          </div>
          <div class="settings-control">
            <FormSelect
              bind:value={form.numberFormat}
              class="settings-select"
              items={NUMBER_OPTIONS.map(opt => ({ value: opt.value, name: opt.label }))}
            />
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

    <!-- SMTP Card -->
    <div class="settings-card smtp-card">
      <div class="smtp-card-header">
        <div>
          <div class="smtp-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            {t('email.smtp_titel')}
          </div>
          <p class="smtp-desc">{t('email.smtp_beschreibung')}</p>
        </div>
      </div>

      {#if smtpLoading}
        <div class="smtp-loading">{t('dashboard.laden')}</div>
      {:else}
        <div class="smtp-body">
          <div class="form-row">
            <div class="form-group" style="grid-column: span 2;">
              <label for="smtp-host">{t('email.smtp_host')}</label>
              <input id="smtp-host" type="text" bind:value={smtpForm.smtpHost} placeholder="smtp.beispiel.de" />
            </div>
            <div class="form-group">
              <label for="smtp-port">{t('email.smtp_port')}</label>
              <input id="smtp-port" type="number" bind:value={smtpForm.smtpPort} min="1" max="65535" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="smtp-user">{t('email.smtp_user')}</label>
              <input id="smtp-user" type="text" bind:value={smtpForm.smtpUser} placeholder="benutzer@beispiel.de" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="smtp-pass">{t('email.smtp_pass')}</label>
              <input
                id="smtp-pass"
                type="password"
                bind:value={smtpForm.smtpPass}
                oninput={() => { passwordChanged = true; }}
                placeholder="••••••••"
                autocomplete="new-password"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="smtp-from">{t('email.smtp_from_address')}</label>
              <input id="smtp-from" type="email" bind:value={smtpForm.fromAddress} placeholder="rechnung@beispiel.de" />
            </div>
            <div class="form-group">
              <label for="smtp-from-name">{t('email.smtp_from_name')}</label>
              <input id="smtp-from-name" type="text" bind:value={smtpForm.fromName} placeholder="Mein Unternehmen" />
            </div>
          </div>

          <div class="form-group">
            <label for="smtp-reply-to">{t('email.smtp_reply_to')}</label>
            <input id="smtp-reply-to" type="email" bind:value={smtpForm.replyTo} placeholder="antwort@beispiel.de" />
          </div>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={smtpForm.smtpSecure} />
            {t('email.smtp_secure')}
            <span class="smtp-hint">{t('email.smtp_secure_hint')}</span>
          </label>
        </div>

        <div class="smtp-footer">
          {#if smtpError}
            <span class="settings-error">{smtpError}</span>
          {/if}
          {#if smtpSaved}
            <span class="settings-success">{t('settings.gespeichert')}</span>
          {/if}
          {#if testResult}
            <span class={testResult.success ? 'settings-success' : 'settings-error'}>
              {testResult.message}
            </span>
          {/if}
          <button class="btn-ghost" onclick={handleTestConnection} disabled={testingConnection}>
            {testingConnection ? '...' : t('email.verbindung_testen')}
          </button>
          <button class="btn-primary" onclick={handleSmtpSave} disabled={smtpSaving}>
            {smtpSaving ? t('settings.speichern_laufend') : t('settings.speichern')}
          </button>
        </div>
      {/if}
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

  /* .settings-select is forwarded to the FormSelect wrapper div via the class prop */
  .settings-control :global(.settings-select) {
    width: 100%;
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

  .smtp-card {
    margin-top: 1.5rem;
    max-width: 680px;
  }

  .smtp-card-header {
    padding: 1.15rem 1.75rem 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .smtp-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-display), sans-serif;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.2rem;
  }

  .smtp-desc {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin: 0;
  }

  .smtp-loading {
    padding: 1.25rem 1.75rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .smtp-body {
    padding: 1.15rem 1.75rem 0;
  }

  .smtp-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.75rem 1.25rem;
    border-top: 1px solid var(--border);
    background: var(--bg);
    margin-top: 1.15rem;
  }

  .btn-ghost {
    padding: 0.5rem 1rem;
    background: var(--surface);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.8125rem;
    font-weight: 600;
    font-family: var(--font-body), sans-serif;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
  }

  .btn-ghost:hover:not(:disabled) {
    background: var(--surface-alt);
    border-color: var(--border-strong);
  }

  .btn-ghost:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.7rem;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    margin: 0;
    cursor: pointer;
  }

  .smtp-hint {
    font-size: 0.65rem;
    font-weight: 400;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: normal;
    margin-left: 0.2rem;
  }

  :global(.form-row) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 0.7rem;
    margin-bottom: 0;
  }

  :global(.form-group) {
    margin-bottom: 0.7rem;
  }
</style>
