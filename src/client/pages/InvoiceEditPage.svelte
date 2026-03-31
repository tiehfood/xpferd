<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { invoiceApi } from '../lib/api/invoiceApi';
  import { formatIban, fmtDate as formatDateStr } from '../../shared/constants/format';
  import { getSettings } from '../lib/settingsStore.svelte.js';
  import { invoiceTemplateApi, invoiceNumberTemplateApi } from '../lib/api/templateApi';
  import { t } from '../lib/i18n.js';
  import { checkInvoiceWarnings } from '../../shared/utils/invoiceWarnings.js';
  import HeaderSection from '../lib/components/HeaderSection.svelte';
  import PartySection from '../lib/components/PartySection.svelte';
  import PaymentSection from '../lib/components/PaymentSection.svelte';
  import LinesSection from '../lib/components/LinesSection.svelte';
  import TotalsSection from '../lib/components/TotalsSection.svelte';

  let { params = {} }: { params?: { id?: string } } = $props();

  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let isNew = $derived(!params.id);

  let invoice: any = $state(createEmpty());
  let invoiceTemplates: any[] = $state([]);
  let savingTemplate = $state(false);
  let templateNameInput = $state('');
  let showTemplateSaveModal = $state(false);
  let selectedInvNumTemplateId = $state('');
  let liveWarnings = $derived(checkInvoiceWarnings(invoice));

  function createEmpty(): any {
    return {
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      invoiceTypeCode: '380',
      currencyCode: 'EUR',
      dueDate: '',
      buyerReference: '',
      note: '',
      deliveryDate: '',
      orderReference: '',
      contractReference: '',
      seller: {
        name: '', street: '', city: '', postalCode: '', countryCode: 'DE',
        vatId: '', taxNumber: '', contactName: '', contactPhone: '', contactEmail: '',
      },
      buyer: {
        name: '', street: '', city: '', postalCode: '', countryCode: 'DE',
        vatId: '', email: '',
      },
      paymentMeansCode: '58',
      paymentTerms: '',
      iban: '',
      bic: '',
      paymentReference: '',
      accountName: '',
      taxCategoryCode: 'S',
      taxRate: 19,
      kleinunternehmer: false,
      totalNetAmount: 0,
      totalTaxAmount: 0,
      totalGrossAmount: 0,
      prepaidAmount: 0,
      amountDue: 0,
      lines: [{
        lineNumber: 1, quantity: 1, unitCode: 'C62', itemName: '',
        itemDescription: '',
        netPrice: 0, vatCategoryCode: 'S', vatRate: 19, lineNetAmount: 0,
      }],
    };
  }

  onMount(async () => {
    // Check for imported invoice data from ImportPage
    const importData = sessionStorage.getItem('import-invoice');
    if (importData && !params.id) {
      try {
        const imported = JSON.parse(importData);
        invoice = { ...createEmpty(), ...imported, id: undefined };
        if (invoice.iban) invoice.iban = formatIban(invoice.iban);
        recalculate();
      } catch {
        // ignore malformed import data
      } finally {
        sessionStorage.removeItem('import-invoice');
      }
    }

    if (params.id) {
      try {
        invoice = await invoiceApi.get(Number(params.id));
        if (invoice.iban) invoice.iban = formatIban(invoice.iban);
      } catch (e: any) {
        error = e.message;
      }
    }
    try {
      invoiceTemplates = await invoiceTemplateApi.list();
    } catch {
      // templates not critical
    }
    loading = false;
  });

  function recalculate() {
    if (invoice.kleinunternehmer) {
      invoice.taxCategoryCode = 'E';
      invoice.taxRate = 0;
      for (const line of invoice.lines) {
        line.vatCategoryCode = 'E';
        line.vatRate = 0;
      }
    }

    for (const line of invoice.lines) {
      line.lineNetAmount = Math.round(line.quantity * line.netPrice * 100) / 100;
    }
    const net = invoice.lines.reduce((s: number, l: any) => s + l.lineNetAmount, 0);
    invoice.totalNetAmount = Math.round(net * 100) / 100;
    invoice.totalTaxAmount = invoice.kleinunternehmer
      ? 0
      : Math.round(net * invoice.taxRate / 100 * 100) / 100;
    invoice.totalGrossAmount = Math.round((invoice.totalNetAmount + invoice.totalTaxAmount) * 100) / 100;
    invoice.amountDue = Math.round((invoice.totalGrossAmount - (invoice.prepaidAmount || 0)) * 100) / 100;
  }

  async function handleSave() {
    saving = true;
    error = '';
    recalculate();
    try {
      if (isNew) {
        // If using a number template, generate (increment) the actual number now
        if (selectedInvNumTemplateId) {
          const result = await invoiceNumberTemplateApi.generate(Number(selectedInvNumTemplateId));
          invoice.invoiceNumber = result.invoiceNumber;
        }
        const created = await invoiceApi.create(invoice);
        push(`/invoices/${created.id}`);
      } else {
        invoice = await invoiceApi.update(invoice.id, invoice);
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  function handleExport() {
    if (invoice.id) {
      window.open(invoiceApi.exportUrl(invoice.id), '_blank');
    }
  }

  async function applyTemplate(e: Event) {
    const select = e.target as HTMLSelectElement;
    const id = Number(select.value);
    if (!id) return;
    try {
      const tpl = await invoiceTemplateApi.get(id);
      const data = JSON.parse(tpl.data);
      const { invNumTemplateId, ...invoiceData } = data;
      // Keep empty invoice number and today's date, but fill everything else
      invoice = {
        ...createEmpty(),
        ...invoiceData,
        id: undefined,
        invoiceNumber: '',
        invoiceDate: new Date().toISOString().slice(0, 10),
      };
      recalculate();
      // Wait for Svelte to re-render HeaderSection with new invoice data,
      // THEN set the number template so the <select> has its options ready
      await tick();
      if (invNumTemplateId) {
        selectedInvNumTemplateId = String(invNumTemplateId);
        try {
          const result = await invoiceNumberTemplateApi.preview(Number(invNumTemplateId));
          invoice.invoiceNumber = result.invoiceNumber;
        } catch {
          // silently ignore
        }
      }
    } catch (e: any) {
      error = e.message;
    }
    select.value = '';
  }

  function fmtDate(d: string): string {
    if (!d) return '';
    return formatDateStr(d, getSettings().dateFormat);
  }

  function openSaveAsTemplate() {
    templateNameInput = invoice.invoiceNumber || 'Neue Vorlage';
    showTemplateSaveModal = true;
  }

  async function saveAsTemplate() {
    savingTemplate = true;
    error = '';
    try {
      recalculate();
      const { id, createdAt, updatedAt, ...data } = invoice;
      await invoiceTemplateApi.create({
        name: templateNameInput,
        data: JSON.stringify({ ...data, invNumTemplateId: selectedInvNumTemplateId || undefined }),
      });
      showTemplateSaveModal = false;
      invoiceTemplates = await invoiceTemplateApi.list();
    } catch (e: any) {
      error = e.message;
    } finally {
      savingTemplate = false;
    }
  }
</script>

{#if loading}
  <div class="loading-card">
    <div class="loading-pulse"></div>
    <span>{t('invoice_edit.laden')}</span>
  </div>
{:else}
  <div class="editor-header">
    <div class="editor-title-group">
      <button class="back-btn" onclick={() => push('/')} aria-label={t('invoice_edit.zurueck')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <div>
        <h1>{isNew ? t('invoice_edit.neue_rechnung') : invoice.invoiceNumber}</h1>
        {#if !isNew}
          <p class="subtitle">{t('invoice_edit.zuletzt_bearbeitet')} {fmtDate(invoice.updatedAt ?? '')}</p>
        {/if}
      </div>
    </div>
    <div class="header-actions">
      {#if isNew && invoiceTemplates.length > 0}
        <select class="template-select" onchange={applyTemplate}>
          <option value="">{t('invoice_edit.aus_vorlage')}</option>
          {#each invoiceTemplates as tpl}
            <option value={tpl.id}>{tpl.name}</option>
          {/each}
        </select>
      {/if}
      <button class="ghost" onclick={openSaveAsTemplate}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
        </svg>
        {t('invoice_edit.als_vorlage')}
      </button>
      {#if !isNew}
        <button class="ghost" onclick={handleExport}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {t('invoice_edit.xml_export')}
        </button>
      {/if}
      <button class="primary save-btn" onclick={handleSave} disabled={saving}>
        {#if saving}
          <span class="save-spinner"></span>
          {t('invoice_edit.speichern_laufend')}
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {t('invoice_edit.speichern')}
        {/if}
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {error}
    </div>
  {/if}

  {#if liveWarnings.length > 0}
    <div class="warnings-banner">
      <div class="warnings-banner-header">
        <div class="warnings-banner-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {liveWarnings.length} {liveWarnings.length === 1 ? 'Hinweis' : 'Hinweise'}
        </div>
      </div>
      <ul class="warnings-banner-list">
        {#each liveWarnings as w}
          <li>{w.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <HeaderSection bind:invoice bind:selectedInvNumTemplateId onchange={recalculate} />

  <div class="two-col">
    <PartySection title={t('invoice_edit.verkaeufer')} bind:party={invoice.seller} isSeller={true} />
    <PartySection title={t('invoice_edit.kaeufer')} bind:party={invoice.buyer} isSeller={false} />
  </div>

  <PaymentSection bind:invoice />
  <LinesSection bind:lines={invoice.lines} kleinunternehmer={invoice.kleinunternehmer} onchange={recalculate} />
  <TotalsSection bind:invoice onchange={recalculate} />
{/if}

{#if showTemplateSaveModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={() => showTemplateSaveModal = false}>
    <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>{t('invoice_edit.als_vorlage_speichern')}</h2>
        <button class="modal-close" onclick={() => showTemplateSaveModal = false} aria-label={t('invoice_edit.schliessen')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="tpl-name">{t('invoice_edit.vorlagenname')} <span class="required">*</span></label>
          <input id="tpl-name" bind:value={templateNameInput} placeholder={t('invoice_edit.vorlagenname_placeholder')} />
        </div>
      </div>
      <div class="modal-footer">
        <button class="ghost" onclick={() => showTemplateSaveModal = false}>{t('invoice_edit.abbrechen')}</button>
        <button class="primary" onclick={saveAsTemplate} disabled={savingTemplate}>
          {savingTemplate ? t('invoice_edit.speichern_laufend') : t('invoice_edit.speichern')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;
    gap: 1rem;
  }

  .editor-title-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    border-radius: var(--radius);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .back-btn:hover {
    background: var(--surface-alt);
    color: var(--text);
    border-color: var(--border-strong);
  }

  h1 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.65rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.2;
  }

  .subtitle {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
  }

  .header-actions {
    display: flex;
    gap: 0.4rem;
    flex-shrink: 0;
    align-items: center;
  }

  .save-btn {
    padding: 0.5rem 1.25rem;
  }

  .save-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
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
    animation: slideUp 0.2s var(--ease-out);
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;
  }

  .template-select {
    width: auto;
    min-width: 160px;
  }

  .required {
    color: var(--danger);
    font-weight: 700;
  }

  /* --- Modal --- */
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
    max-width: 420px;
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
  }

  .modal-close:hover {
    background: var(--surface-alt);
    color: var(--text);
  }

  .modal-body { padding: 1.35rem; }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    padding: 0.85rem 1.35rem 1.15rem;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 768px) {
    .two-col {
      grid-template-columns: 1fr;
    }

    .editor-header {
      flex-direction: column;
    }
  }

  .warnings-banner {
    background: #fffbeb;
    border: 1px solid #fde68a;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    margin-bottom: 1rem;
    animation: slideUp 0.2s var(--ease-out);
  }

  .warnings-banner-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.35rem;
  }

  .warnings-banner-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #92400e;
  }

  .warnings-banner-title svg {
    color: #d97706;
    flex-shrink: 0;
  }

  .warnings-banner-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .warnings-banner-list li {
    font-size: 0.75rem;
    color: #92400e;
    padding-left: 1.25rem;
    position: relative;
  }

  .warnings-banner-list li::before {
    content: '•';
    position: absolute;
    left: 0.35rem;
    color: #d97706;
  }
</style>
