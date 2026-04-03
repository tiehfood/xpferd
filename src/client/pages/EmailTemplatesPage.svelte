<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { emailApi } from '../lib/api/emailApi.js';
  import type { EmailTemplateDto } from '$shared/types';
  import RichTextEditor from '../lib/components/RichTextEditor.svelte';
  import { htmlToText } from '$shared/utils/htmlToText.js';

  let templates: EmailTemplateDto[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  // Modal state
  let showModal = $state(false);
  let editingTemplate: EmailTemplateDto | null = $state(null);
  let saving = $state(false);
  let modalError = $state('');
  let showPlatzhalter = $state(false);

  let editForm = $state({
    name: '',
    subject: '',
    body: '',
    bodyHtml: '',
    isDefault: false,
  });

  let bodyType = $state<'text' | 'html'>('text');

  // Textarea ref for cursor-based placeholder insertion (plain text mode)
  let bodyTextarea: HTMLTextAreaElement | undefined = $state();

  // Rich editor insert function — set by RichTextEditor.onReady in HTML mode
  let richEditorInsert: ((text: string) => void) | null = $state(null);

  const PLATZHALTER = [
    { key: '{rechnungsnummer}', label: 'email.platzhalter_rechnungsnummer' },
    { key: '{rechnungsdatum}', label: 'email.platzhalter_rechnungsdatum' },
    { key: '{fälligkeitsdatum}', label: 'email.platzhalter_faelligkeitsdatum' },
    { key: '{betrag_brutto}', label: 'email.platzhalter_betrag_brutto' },
    { key: '{betrag_netto}', label: 'email.platzhalter_betrag_netto' },
    { key: '{währung}', label: 'email.platzhalter_waehrung' },
    { key: '{empfänger}', label: 'email.platzhalter_empfaenger' },
    { key: '{verkäufer}', label: 'email.platzhalter_verkaeufer' },
    { key: '{iban}', label: 'email.platzhalter_iban' },
    { key: '{verwendungszweck}', label: 'email.platzhalter_verwendungszweck' },
  ] as const;

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    try {
      templates = await emailApi.listTemplates();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function openCreateModal() {
    editingTemplate = null;
    editForm = { name: '', subject: '', body: '', bodyHtml: '', isDefault: false };
    bodyType = 'text';
    modalError = '';
    showPlatzhalter = false;
    showModal = true;
  }

  function openEditModal(tpl: EmailTemplateDto) {
    editingTemplate = tpl;
    editForm = {
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
      bodyHtml: tpl.bodyHtml || '',
      isDefault: tpl.isDefault,
    };
    bodyType = tpl.bodyHtml ? 'html' : 'text';
    modalError = '';
    showPlatzhalter = false;
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingTemplate = null;
    richEditorInsert = null;
  }

  async function handleSave() {
    if (!editForm.name.trim()) {
      modalError = t('email.vorlage_name') + ' ist erforderlich';
      return;
    }
    if (!editForm.subject.trim()) {
      modalError = t('email.betreff') + ' ist erforderlich';
      return;
    }

    // Auto-generate plain text body from HTML for multipart email fallback
    if (bodyType === 'html' && editForm.bodyHtml) {
      const tmp = htmlToText(editForm.bodyHtml);
      if (tmp) {
        editForm.body = tmp;
      }
    }

    saving = true;
    modalError = '';
    try {
      const dto = {
        name: editForm.name.trim(),
        subject: editForm.subject.trim(),
        body: editForm.body,
        bodyHtml: editForm.bodyHtml || undefined,
        isDefault: editForm.isDefault,
      };
      if (editingTemplate?.id != null) {
        await emailApi.updateTemplate(editingTemplate.id, dto);
      } else {
        await emailApi.createTemplate(dto);
      }
      closeModal();
      await load();
    } catch (e: any) {
      modalError = e.message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete(tpl: EmailTemplateDto) {
    if (!confirm(t('email.vorlage_loeschen_bestaetigen'))) return;
    try {
      await emailApi.deleteTemplate(tpl.id!);
      await load();
    } catch (e: any) {
      error = e.message;
    }
  }

  function insertPlatzhalter(key: string) {
    if (bodyType === 'html') {
      if (richEditorInsert) {
        richEditorInsert(key);
      } else {
        // Fallback: append to string if editor not yet ready (should not normally happen)
        editForm.bodyHtml = (editForm.bodyHtml || '') + key;
      }
      return;
    } else {
      if (!bodyTextarea) {
        editForm.body += key;
        return;
      }
      const start = bodyTextarea.selectionStart ?? editForm.body.length;
      const end = bodyTextarea.selectionEnd ?? start;
      editForm.body = editForm.body.slice(0, start) + key + editForm.body.slice(end);
      setTimeout(() => {
        if (bodyTextarea) {
          bodyTextarea.selectionStart = start + key.length;
          bodyTextarea.selectionEnd = start + key.length;
          bodyTextarea.focus();
        }
      }, 0);
    }
  }

  // Close modal on Escape
  $effect(() => {
    if (!showModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
</script>

<div class="page-header">
  <div class="page-title-group">
    <h1>{t('email.vorlagen_titel')}</h1>
    <p class="subtitle">
      {templates.length}
      {templates.length === 1 ? t('email.vorlagen_subtitle_singular') : t('email.vorlagen_subtitle_plural')}
    </p>
  </div>
  <button class="primary" onclick={openCreateModal}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    {t('email.vorlage_erstellen')}
  </button>
</div>

{#if error}
  <div class="error-banner">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
    {error}
  </div>
{/if}

{#if loading}
  <div class="loading-card">
    <div class="loading-pulse"></div>
    <span>{t('dashboard.laden')}</span>
  </div>
{:else if templates.length === 0}
  <div class="empty-state">
    <div class="empty-illustration">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
    </div>
    <h2>{t('email.vorlagen_titel')}</h2>
    <p>{t('email.vorlage_erstellen')}</p>
    <button class="primary" onclick={openCreateModal}>{t('email.vorlage_erstellen')}</button>
  </div>
{:else}
  <div class="templates-grid">
    {#each templates as tpl, i}
      <div class="template-card" style="animation-delay: {i * 40}ms">
        <div class="template-name">
          {tpl.name}
          {#if tpl.isDefault}
            <span class="badge badge-success" style="margin-left: 0.5rem; font-size: 0.6rem;">
              Standard
            </span>
          {/if}
          {#if tpl.bodyHtml}
            <span class="badge badge-primary" style="margin-left: 0.35rem; font-size: 0.55rem;">HTML</span>
          {/if}
        </div>
        <div class="template-details">
          <div class="template-detail">
            <span class="detail-key">{t('email.betreff')}</span>
            <span class="detail-val subject-preview">{tpl.subject}</span>
          </div>
        </div>
        <div class="template-actions">
          <button class="ghost" onclick={() => openEditModal(tpl)}>
            {t('recurring.bearbeiten')}
          </button>
          <button class="danger" onclick={() => handleDelete(tpl)}>
            {t('dashboard.loeschen')}
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Create / Edit Modal -->
{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={closeModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>{editingTemplate ? t('email.vorlage_bearbeiten') : t('email.vorlage_erstellen')}</h2>
        <button class="modal-close" onclick={closeModal} aria-label={t('common.schliessen')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {#if modalError}
        <div class="error-banner modal-error">{modalError}</div>
      {/if}

      <div class="modal-body">
        <div class="form-group">
          <label for="tpl-name">{t('email.vorlage_name')}</label>
          <input
            id="tpl-name"
            type="text"
            bind:value={editForm.name}
            placeholder={t('email.vorlage_name')}
          />
        </div>

        <div class="form-group">
          <label for="tpl-subject">{t('email.betreff')}</label>
          <input
            id="tpl-subject"
            type="text"
            bind:value={editForm.subject}
            placeholder={t('email.betreff')}
          />
        </div>

        <div class="form-group">
          <div class="body-type-row">
            <label for="tpl-body">{t('email.body_typ')}</label>
            <div class="body-type-toggle">
              <button
                type="button"
                class="toggle-btn"
                class:active={bodyType === 'text'}
                onclick={() => { bodyType = 'text'; richEditorInsert = null; }}
              >
                {t('email.body_text')}
              </button>
              <button
                type="button"
                class="toggle-btn"
                class:active={bodyType === 'html'}
                onclick={() => bodyType = 'html'}
              >
                {t('email.body_html')}
              </button>
            </div>
          </div>

          {#if bodyType === 'text'}
            <textarea
              id="tpl-body"
              bind:value={editForm.body}
              bind:this={bodyTextarea}
              placeholder={t('email.text')}
              class="body-textarea"
            ></textarea>
          {:else}
            <RichTextEditor
              content={editForm.bodyHtml}
              onUpdate={(html) => { editForm.bodyHtml = html; }}
              onReady={(api) => { richEditorInsert = api.insertText; }}
            />
            <p class="html-hint">{t('email.body_html_hinweis')}</p>
          {/if}
        </div>

        <!-- Placeholders collapsible section -->
        <div class="platzhalter-section">
          <button
            type="button"
            class="platzhalter-toggle"
            onclick={() => { showPlatzhalter = !showPlatzhalter; }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="chevron"
              class:expanded={showPlatzhalter}
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            {t('email.platzhalter')}
          </button>
          {#if showPlatzhalter}
            <div class="platzhalter-grid">
              {#each PLATZHALTER as ph}
                <button
                  type="button"
                  class="platzhalter-chip"
                  onclick={() => insertPlatzhalter(ph.key)}
                  title={t(ph.label)}
                >
                  <span class="ph-key">{ph.key}</span>
                  <span class="ph-label">{t(ph.label)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <label class="checkbox-label" style="margin-top: 0.5rem;">
          <input type="checkbox" bind:checked={editForm.isDefault} />
          {t('email.standard_vorlage')}
        </label>
      </div>

      <div class="modal-footer">
        <button type="button" class="ghost" onclick={closeModal}>{t('common.abbrechen')}</button>
        <button type="button" class="primary" onclick={handleSave} disabled={saving}>
          {#if saving}
            <span class="save-spinner"></span>
            {t('common.speichern_laufend')}
          {:else}
            {t('common.speichern')}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;
  }

  .page-title-group {
    display: flex;
    flex-direction: column;
  }

  h1 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.65rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.2;
    color: var(--text);
  }

  .subtitle {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
  }

  .error-banner {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: var(--danger);
    padding: 0.65rem 1rem;
    border-radius: var(--radius);
    font-size: 0.8125rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .loading-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 3.5rem 2rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .loading-pulse {
    width: 32px;
    height: 32px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .empty-state {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 4rem 2rem;
    text-align: center;
    animation: slideUp 0.4s var(--ease-out);
  }

  .empty-illustration {
    margin-bottom: 1.25rem;
    color: var(--border-strong);
  }

  .empty-state h2 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.4rem;
  }

  .empty-state p {
    color: var(--text-muted);
    font-size: 0.875rem;
    margin-bottom: 1.5rem;
  }

  .templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 0.85rem;
  }

  .template-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.15rem 1.35rem;
    transition: all 0.2s var(--ease-out);
    animation: slideUp 0.3s var(--ease-out) backwards;
  }

  .template-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow);
  }

  .template-name {
    font-family: var(--font-display), sans-serif;
    font-weight: 600;
    font-size: 0.9375rem;
    margin-bottom: 0.6rem;
    color: var(--text);
    display: flex;
    align-items: center;
  }

  .template-details {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.65rem;
  }

  .template-detail {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    padding: 0.15rem 0;
    gap: 0.5rem;
  }

  .detail-key {
    color: var(--text-muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .detail-val {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .subject-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }

  .template-actions {
    display: flex;
    gap: 0.35rem;
    padding-top: 0.65rem;
    border-top: 1px solid var(--border);
  }

  .template-actions button {
    padding: 0.3rem 0.65rem;
    font-size: 0.75rem;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(28,27,24,0.45);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 1rem;
    animation: fadeIn 0.15s var(--ease-out);
  }

  .modal {
    background: var(--surface);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 680px;
    max-height: 90vh;
    overflow-y: auto;
    animation: scaleIn 0.2s var(--ease-out);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.15rem 1.35rem 0.85rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .modal-close {
    background: none;
    border: none;
    padding: 0.3rem;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius);
    transition: all 0.12s;
    height: auto;
  }

  .modal-close:hover {
    background: var(--surface-alt);
    color: var(--text);
  }

  .modal-error {
    margin: 0.85rem 1.35rem 0;
  }

  .modal-body {
    padding: 1.35rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    padding: 0.85rem 1.35rem 1.15rem;
    border-top: 1px solid var(--border);
  }

  .body-textarea {
    min-height: 200px;
    resize: vertical;
  }

  .body-type-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.3rem;
  }

  .body-type-row label {
    margin-bottom: 0;
  }

  .body-type-toggle {
    display: flex;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .toggle-btn {
    background: var(--surface);
    border: none;
    border-radius: 0;
    padding: 0.2rem 0.65rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    height: auto;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transition: all 0.15s;
  }

  .toggle-btn:hover {
    background: var(--surface-alt);
    color: var(--text);
  }

  .toggle-btn.active {
    background: var(--primary);
    color: white;
  }

  .html-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-top: 0.3rem;
    font-style: italic;
  }

  /* Placeholder section */
  .platzhalter-section {
    margin-top: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .platzhalter-toggle {
    background: none;
    border: none;
    height: auto;
    padding: 0.25rem 0.1rem;
    color: var(--text-secondary);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .platzhalter-toggle:hover {
    color: var(--primary);
  }

  .chevron {
    transition: transform 0.15s var(--ease-out);
    flex-shrink: 0;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .platzhalter-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .platzhalter-chip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    padding: 0.3rem 0.6rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.15s;
    height: auto;
    text-align: left;
  }

  .platzhalter-chip:hover {
    border-color: var(--primary);
    background: var(--primary-light);
  }

  .ph-key {
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-size: 0.7rem;
    color: var(--primary);
    font-weight: 600;
  }

  .ph-label {
    font-size: 0.65rem;
    color: var(--text-muted);
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
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    margin: 0;
    cursor: pointer;
  }

  .save-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    display: inline-block;
  }
</style>
