<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../i18n.js';
  import { emailApi } from '../api/emailApi.js';
  import { pdfTemplateApi } from '../api/pdfTemplateApi.js';
  import { invoiceApi } from '../api/invoiceApi.js';
  import type { EmailTemplateDto, PdfTemplateDto } from '$shared/types';
  import { htmlToText } from '$shared/utils/htmlToText.js';

  let {
    invoiceId,
    buyerEmail = '',
    onClose = () => {},
    onSent = () => {},
  }: {
    invoiceId: number;
    buyerEmail?: string;
    onClose?: () => void;
    onSent?: () => void;
  } = $props();

  // Form state — initialized from prop, then updated when invoice loads
  let recipientEmail = $state('');
  let showCcBcc = $state(false);
  let cc = $state('');
  let bcc = $state('');
  let selectedTemplateId = $state<number | null>(null);
  let attachmentType = $state<'zugferd' | 'xml' | 'zugferd+xml'>('zugferd');
  let selectedPdfTemplateId = $state<number | null>(null);

  // Data
  let emailTemplates = $state<EmailTemplateDto[]>([]);
  let pdfTemplates = $state<PdfTemplateDto[]>([]);
  let invoice = $state<any>(null);

  // UI state
  let loading = $state(true);
  let sending = $state(false);
  let error = $state('');
  let sent = $state(false);

  // Computed preview
  let selectedTemplate = $derived(
    emailTemplates.find(tpl => tpl.id === selectedTemplateId) ?? null
  );

  let previewSubject = $derived(
    selectedTemplate ? renderTemplate(selectedTemplate.subject) : ''
  );

  let previewBody = $derived(
    selectedTemplate
      ? (selectedTemplate.bodyHtml && renderTemplate(selectedTemplate.body).trim().length < 10
          ? htmlToText(renderTemplate(selectedTemplate.bodyHtml))
          : renderTemplate(selectedTemplate.body))
      : ''
  );

  let previewBodyHtml = $derived(
    selectedTemplate?.bodyHtml ? renderTemplate(selectedTemplate.bodyHtml) : ''
  );

  let needsPdfTemplate = $derived(
    attachmentType === 'zugferd' || attachmentType === 'zugferd+xml'
  );

  function renderTemplate(text: string): string {
    if (!invoice) return text;
    const fmtCurr = (n: number) =>
      n != null ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

    return text
      .replace(/\{rechnungsnummer\}/g, invoice.invoiceNumber ?? '')
      .replace(/\{rechnungsdatum\}/g, formatDate(invoice.invoiceDate))
      .replace(/\{fälligkeitsdatum\}/g, formatDate(invoice.dueDate))
      .replace(/\{betrag_brutto\}/g, fmtCurr(invoice.totalGrossAmount))
      .replace(/\{betrag_netto\}/g, fmtCurr(invoice.totalNetAmount))
      .replace(/\{währung\}/g, invoice.currencyCode ?? '')
      .replace(/\{empfänger\}/g, invoice.buyer?.name ?? '')
      .replace(/\{verkäufer\}/g, invoice.seller?.name ?? '')
      .replace(/\{iban\}/g, invoice.iban ?? '')
      .replace(/\{verwendungszweck\}/g, invoice.paymentReference ?? '');
  }

  function formatDate(d: string | undefined): string {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}.${m}.${y}`;
  }

  onMount(async () => {
    loading = true;
    error = '';
    // Set initial email from prop
    recipientEmail = buyerEmail;
    try {
      const [templates, pdftemplates, inv] = await Promise.all([
        emailApi.listTemplates(),
        pdfTemplateApi.list(),
        invoiceApi.get(invoiceId),
      ]);
      emailTemplates = templates;
      pdfTemplates = pdftemplates;
      invoice = inv;

      // Pre-select buyer email from invoice if not provided by prop
      if (!recipientEmail && inv.buyer?.email) {
        recipientEmail = inv.buyer.email;
      }

      // Auto-select default template
      const defaultTpl = templates.find(tpl => tpl.isDefault);
      if (defaultTpl?.id != null) {
        selectedTemplateId = defaultTpl.id;
      } else if (templates.length > 0 && templates[0].id != null) {
        selectedTemplateId = templates[0].id;
      }

      // Auto-select first PDF template
      if (pdftemplates.length > 0 && pdftemplates[0].id != null) {
        selectedPdfTemplateId = pdftemplates[0].id;
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  });

  async function handleSend() {
    if (!recipientEmail.trim()) {
      error = t('email.kein_empfaenger');
      return;
    }
    if (!selectedTemplateId) {
      error = t('email.vorlage') + ' ist erforderlich';
      return;
    }
    if (needsPdfTemplate && !selectedPdfTemplateId) {
      error = t('email.pdf_vorlage_erforderlich');
      return;
    }

    sending = true;
    error = '';
    try {
      await emailApi.sendEmail(invoiceId, {
        recipientEmail: recipientEmail.trim(),
        templateId: selectedTemplateId,
        attachmentType,
        pdfTemplateId: needsPdfTemplate ? (selectedPdfTemplateId ?? undefined) : undefined,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
      });
      sent = true;
      onSent();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e: any) {
      error = e.message;
    } finally {
      sending = false;
    }
  }

  // Close on Escape
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" role="presentation" onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <h2>{t('email.senden_titel')}</h2>
      <button class="modal-close" onclick={onClose} aria-label={t('common.schliessen')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    {#if error}
      <div class="error-banner modal-error">{error}</div>
    {/if}

    {#if sent}
      <div class="success-banner modal-success">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        {t('email.gesendet')}
      </div>
    {/if}

    <div class="modal-body">
      {#if loading}
        <div class="dialog-loading">
          <div class="loading-pulse"></div>
          <span>{t('dashboard.laden')}</span>
        </div>
      {:else}
        <div class="form-group">
          <label for="send-to">{t('email.empfaenger')}</label>
          <input
            id="send-to"
            type="email"
            bind:value={recipientEmail}
            placeholder="empfaenger@beispiel.de"
          />
        </div>

        <div class="cc-toggle-row">
          <button
            type="button"
            class="cc-toggle"
            onclick={() => { showCcBcc = !showCcBcc; }}
          >
            {showCcBcc ? '▾' : '▸'} {t('email.cc')} / {t('email.bcc')}
          </button>
        </div>

        {#if showCcBcc}
          <div class="form-group">
            <label for="send-cc">{t('email.cc')}</label>
            <input id="send-cc" type="email" bind:value={cc} placeholder="cc@beispiel.de" />
          </div>
          <div class="form-group">
            <label for="send-bcc">{t('email.bcc')}</label>
            <input id="send-bcc" type="email" bind:value={bcc} placeholder="bcc@beispiel.de" />
          </div>
        {/if}

        <div class="form-group">
          <label for="send-tpl">{t('email.vorlage')}</label>
          <select
            id="send-tpl"
            bind:value={selectedTemplateId}
          >
            {#if emailTemplates.length === 0}
              <option value={null}>{t('email.vorlagen_titel')}...</option>
            {/if}
            {#each emailTemplates as tpl}
              <option value={tpl.id}>{tpl.name}{tpl.isDefault ? ' ★' : ''}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <span class="form-label-text">{t('email.anhang_typ')}</span>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" bind:group={attachmentType} value="zugferd" />
              {t('email.anhang_zugferd')}
            </label>
            <label class="radio-option">
              <input type="radio" bind:group={attachmentType} value="xml" />
              {t('email.anhang_xml')}
            </label>
            <label class="radio-option">
              <input type="radio" bind:group={attachmentType} value="zugferd+xml" />
              {t('email.anhang_zugferd_xml')}
            </label>
          </div>
        </div>

        {#if needsPdfTemplate}
          <div class="form-group">
            <label for="send-pdf-tpl">{t('email.pdf_vorlage')}</label>
            <select id="send-pdf-tpl" bind:value={selectedPdfTemplateId}>
              {#if pdfTemplates.length === 0}
                <option value={null}>—</option>
              {/if}
              {#each pdfTemplates as ptpl}
                <option value={ptpl.id}>{ptpl.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        {#if selectedTemplate}
          <div class="section-divider">{t('email.vorschau_betreff')}</div>
          <div class="preview-box">
            <span class="preview-value">{previewSubject}</span>
          </div>

          {#if previewBodyHtml}
            <div class="section-divider">{t('email.vorschau_text')} (HTML)</div>
            <div class="html-preview">
              {@html previewBodyHtml}
            </div>

            <div class="section-divider">{t('email.vorschau_text')} ({t('email.body_text')})</div>
            <div class="body-preview">{previewBody}</div>
          {:else}
            <div class="section-divider">{t('email.vorschau_text')}</div>
            <div class="body-preview">{previewBody}</div>
          {/if}
        {/if}
      {/if}
    </div>

    <div class="modal-footer">
      <button class="ghost" onclick={onClose}>{t('common.abbrechen')}</button>
      <button
        class="primary"
        onclick={handleSend}
        disabled={sending || sent || loading}
      >
        {#if sending}
          <span class="save-spinner"></span>
          {t('email.wird_gesendet')}
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          {t('email.senden')}
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
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
    max-width: 560px;
    max-height: 92vh;
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

  .error-banner {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: var(--danger);
    padding: 0.65rem 1rem;
    border-radius: var(--radius);
    font-size: 0.8125rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .modal-error {
    margin: 0.85rem 1.35rem 0;
  }

  .success-banner {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
    padding: 0.65rem 1rem;
    border-radius: var(--radius);
    font-size: 0.8125rem;
    margin: 0.85rem 1.35rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    animation: fadeIn 0.2s var(--ease-out);
  }

  .modal-success {
    margin: 0.85rem 1.35rem 0;
  }

  .dialog-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .loading-pulse {
    width: 28px;
    height: 28px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .cc-toggle-row {
    margin-bottom: 0.5rem;
  }

  .cc-toggle {
    background: none;
    border: none;
    height: auto;
    padding: 0;
    color: var(--text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition: color 0.15s;
  }

  .cc-toggle:hover {
    color: var(--primary);
  }

  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.3rem;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 400;
    color: var(--text);
    text-transform: none;
    letter-spacing: normal;
  }

  .radio-option input[type="radio"] {
    width: auto;
    height: auto;
    margin: 0;
  }

  .form-label-text {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.3rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .section-divider {
    font-family: var(--font-display), sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin: 0.85rem 0 0.6rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .section-divider::before {
    content: '';
    width: 3px;
    height: 12px;
    background: var(--amber);
    border-radius: 2px;
  }

  .preview-box {
    margin-bottom: 0.5rem;
    padding: 0.65rem 0.9rem;
    background: var(--primary-light);
    border: 1px solid rgba(166, 47, 36, 0.12);
    border-radius: var(--radius);
  }

  .preview-value {
    font-family: var(--font-display), sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--primary);
  }

  .body-preview {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem;
    font-size: 0.8125rem;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
    line-height: 1.5;
  }

  .html-preview {
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem;
    font-size: 0.8125rem;
    max-height: 250px;
    overflow-y: auto;
    line-height: 1.5;
  }

  .html-preview :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius);
  }

  .html-preview :global(h1),
  .html-preview :global(h2),
  .html-preview :global(h3) {
    font-family: var(--font-display), sans-serif;
    font-weight: 600;
    margin: 0.5em 0 0.25em;
  }

  .html-preview :global(h2) {
    font-size: 1.1rem;
  }

  .html-preview :global(h3) {
    font-size: 0.95rem;
  }

  .html-preview :global(ul),
  .html-preview :global(ol) {
    padding-left: 1.5em;
    margin: 0.3em 0;
  }

  .html-preview :global(li) {
    margin-bottom: 0.15em;
  }

  .html-preview :global(a) {
    color: var(--primary);
    text-decoration: underline;
  }

  .html-preview :global(p) {
    margin: 0 0 0.5em;
  }

  .html-preview :global(p:last-child) {
    margin-bottom: 0;
  }

  .html-preview :global(strong) {
    font-weight: 600;
  }

  .html-preview :global(blockquote) {
    border-left: 3px solid var(--border-strong);
    padding-left: 0.75em;
    margin: 0.5em 0;
    color: var(--text-secondary);
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
