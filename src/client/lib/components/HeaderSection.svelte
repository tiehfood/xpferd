<script lang="ts">
  import { onMount } from 'svelte';
  import AppBadge from './AppBadge.svelte';
  import { INVOICE_TYPE_CODES, CURRENCY_CODES, CURRENCY_SYMBOLS, VAT_CATEGORY_CODES } from '../../../shared/constants/codeLists';
  import { invoiceNumberTemplateApi } from '../api/templateApi';
  import { t } from '../i18n.js';
  import DatePicker from './DatePicker.svelte';
  import FormSelect from './FormSelect.svelte';

  let { invoice = $bindable(), selectedInvNumTemplateId = $bindable(''), onchange = () => {} }: {
    invoice: any;
    selectedInvNumTemplateId?: string;
    onchange?: () => void;
  } = $props();

  let invNumTemplates: any[] = $state([]);
  let previewing = $state(false);
  let showMore = $state(false);

  // Auto-expand if any additional field has a value
  $effect(() => {
    if (invoice.note || invoice.deliveryDate || invoice.orderReference || invoice.contractReference) {
      showMore = true;
    }
  });

  onMount(async () => {
    try {
      invNumTemplates = await invoiceNumberTemplateApi.list();
    } catch {
      // silently ignore
    }
  });

  async function previewFromTemplate() {
    if (!selectedInvNumTemplateId) {
      invoice.invoiceNumber = '';
      return;
    }
    previewing = true;
    try {
      const result = await invoiceNumberTemplateApi.preview(Number(selectedInvNumTemplateId));
      invoice.invoiceNumber = result.invoiceNumber;
    } catch {
      // silently ignore
    } finally {
      previewing = false;
    }
  }

  // Auto-preview when selectedInvNumTemplateId is set programmatically (e.g. from template)
  let prevInvNumTplId = '';
  $effect(() => {
    const current = selectedInvNumTemplateId;
    const ready = invNumTemplates.length > 0;
    if (current && current !== prevInvNumTplId && ready) {
      prevInvNumTplId = current;
      previewFromTemplate();
    } else if (!current) {
      prevInvNumTplId = '';
    }
  });

  function handleKleinunternehmerToggle() {
    if (invoice.kleinunternehmer) {
      invoice.taxCategoryCode = 'E';
      invoice.taxRate = 0;
    } else {
      invoice.taxCategoryCode = 'S';
      invoice.taxRate = 19;
    }
    onchange();
  }
</script>

<div class="card">
  <div class="card-header">{t('header.card_title')}</div>

  <!-- Kleinunternehmer Toggle -->
  <div class="kleinunternehmer-row">
    <label class="toggle-label">
      <input
        type="checkbox"
        bind:checked={invoice.kleinunternehmer}
        onchange={handleKleinunternehmerToggle}
      />
      <span class="toggle-track">
        <span class="toggle-thumb"></span>
      </span>
      <span class="toggle-text">{t('header.kleinunternehmer_toggle')}</span>
    </label>
    {#if invoice.kleinunternehmer}
      <div class="kleinunternehmer-notice">
        <AppBadge variant="amber-solid">§19 UStG</AppBadge>
        {t('code.kleinunternehmer_note')}
      </div>
    {/if}
  </div>

  <div class="form-row invnum-row">
    <div class="form-group invnum-group">
      <label for="invoiceNumber">{t('header.rechnungsnummer')} <span class="required">*</span></label>
      <input id="invoiceNumber" bind:value={invoice.invoiceNumber} placeholder="RE-2024-001" />
      {#if invNumTemplates.length > 0}
        <div class="invnum-template-row">
          <FormSelect
            class="template-select"
            bind:value={selectedInvNumTemplateId}
            onchange={previewFromTemplate}
            placeholder={t('header.nummernvorlage_placeholder')}
            items={invNumTemplates.map(tpl => ({ value: String(tpl.id), name: `${tpl.name} (${t('code.next')}: ${tpl.prefix}${String(tpl.nextNumber).padStart(tpl.digits, '0')})` }))}
          />
        </div>
        {#if selectedInvNumTemplateId && invoice.invoiceNumber}
          <div class="invnum-preview-hint">{t('header.wird_beim_speichern_vergeben')}</div>
        {/if}
      {/if}
    </div>
    <div class="form-group">
      <label for="invoiceDate">{t('header.rechnungsdatum')} <span class="required">*</span></label>
      <DatePicker id="invoiceDate" bind:value={invoice.invoiceDate} />
    </div>
    <div class="form-group">
      <label for="dueDate">{t('header.faelligkeitsdatum')}</label>
      <DatePicker id="dueDate" bind:value={invoice.dueDate} />
    </div>
    <div class="form-group">
      <label for="buyerReference">{t('header.kaeuferreferenz')}</label>
      <input id="buyerReference" bind:value={invoice.buyerReference} placeholder={t('header.kaeuferreferenz_placeholder')} />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="invoiceTypeCode">{t('header.rechnungsart')} <span class="required">*</span></label>
      <FormSelect
        id="invoiceTypeCode"
        bind:value={invoice.invoiceTypeCode}
        items={Object.entries(INVOICE_TYPE_CODES).map(([code]) => ({ value: code, name: `${code} — ${t(('code.invoice_type.' + code) as any)}` }))}
      />
    </div>
    <div class="form-group">
      <label for="currencyCode">{t('header.waehrung')} <span class="required">*</span></label>
      <FormSelect
        id="currencyCode"
        bind:value={invoice.currencyCode}
        items={Object.entries(CURRENCY_CODES).map(([code]) => ({ value: code, name: `${CURRENCY_SYMBOLS[code] ?? code} — ${t(('code.currency.' + code) as any)}` }))}
      />
    </div>
  </div>

  {#if !invoice.kleinunternehmer}
    <div class="form-row">
      <div class="form-group">
        <label for="taxCategoryCode">{t('header.ust_kategorie')} <span class="required">*</span></label>
        <FormSelect
          id="taxCategoryCode"
          bind:value={invoice.taxCategoryCode}
          items={Object.entries(VAT_CATEGORY_CODES).map(([code]) => ({ value: code, name: `${code} — ${t(('code.vat.' + code) as any)}` }))}
        />
      </div>
      <div class="form-group">
        <label for="taxRate">{t('header.ust_satz')} <span class="required">*</span></label>
        <input id="taxRate" type="number" step="0.01" bind:value={invoice.taxRate} oninput={onchange} />
      </div>
    </div>
  {/if}

  <div class="additional-section">
    <button class="section-toggle" type="button" onclick={() => showMore = !showMore}>
      <svg class="chevron" class:expanded={showMore} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      {t('header.weitere_angaben')}
    </button>
    {#if showMore}
      <div class="form-group" style="margin-top: 0.85rem;">
        <label for="note">{t('header.bemerkung')}</label>
        <textarea id="note" rows="3" bind:value={invoice.note} placeholder={t('header.bemerkung_placeholder')}></textarea>
      </div>
      <div class="form-row additional-row">
        <div class="form-group">
          <label for="deliveryDate">{t('header.leistungsdatum')}</label>
          <DatePicker id="deliveryDate" bind:value={invoice.deliveryDate} />
        </div>
        <div class="form-group">
          <label for="orderReference">{t('header.bestellnummer')}</label>
          <input id="orderReference" bind:value={invoice.orderReference} placeholder={t('header.bestellnummer_placeholder')} />
        </div>
        <div class="form-group">
          <label for="contractReference">{t('header.vertragsnummer')}</label>
          <input id="contractReference" bind:value={invoice.contractReference} placeholder={t('header.vertragsnummer_placeholder')} />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .kleinunternehmer-row {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .toggle-label {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text);
    margin-bottom: 0;
  }

  .toggle-label input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    position: relative;
    width: 38px;
    height: 22px;
    background: var(--border-strong);
    border-radius: 11px;
    transition: background 0.25s var(--ease-out);
    flex-shrink: 0;
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    transition: transform 0.25s var(--ease-out);
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }

  .toggle-label input:checked + .toggle-track {
    background: var(--primary);
  }

  .toggle-label input:checked + .toggle-track .toggle-thumb {
    transform: translateX(16px);
  }

  .kleinunternehmer-notice {
    margin-top: 0.65rem;
    padding: 0.6rem 0.85rem;
    background: var(--amber-bg);
    border: 1px solid var(--amber-border);
    border-radius: var(--radius);
    font-size: 0.8rem;
    color: var(--amber);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    animation: fadeIn 0.2s var(--ease-out);
  }

  .invnum-row {
    grid-template-columns: minmax(280px, 2fr) 1fr 1fr 1fr;
  }

  .invnum-template-row {
    display: flex;
    gap: 0.35rem;
    margin-top: 0.5rem;
  }

  /* .template-select is forwarded to the FormSelect wrapper div via the class prop */
  .invnum-template-row :global(.template-select) {
    flex: 1;
    min-width: 0;
  }

  .invnum-preview-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
    font-style: italic;
  }

  .required {
    color: var(--danger);
    font-weight: 700;
  }

  .additional-section {
    margin-top: 1rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--border);
  }

  .section-toggle {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    background: none;
    border: none;
    padding: 0.25rem 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.15s;
    font-family: var(--font-body), sans-serif;
    outline: none;
  }

  .section-toggle:hover {
    color: var(--text);
  }

  .chevron {
    transition: transform 0.2s var(--ease-out);
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .additional-row {
    grid-template-columns: 1fr 1fr 1fr;
  }
</style>
