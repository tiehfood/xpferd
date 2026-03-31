<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { invoiceTemplateApi } from '../lib/api/templateApi';
  import { formatIban } from '$shared/constants/format';
  import { t } from '../lib/i18n.js';
  import HeaderSection from '../lib/components/HeaderSection.svelte';
  import PartySection from '../lib/components/PartySection.svelte';
  import PaymentSection from '../lib/components/PaymentSection.svelte';
  import LinesSection from '../lib/components/LinesSection.svelte';
  import TotalsSection from '../lib/components/TotalsSection.svelte';

  let { params = {} }: { params?: { id?: string } } = $props();

  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let templateName = $state('');
  let selectedInvNumTemplateId = $state('');
  let templateId = $derived(params.id ? Number(params.id) : null);

  let invoice: any = $state({
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    invoiceTypeCode: '380',
    currencyCode: 'EUR',
    dueDate: '',
    buyerReference: '',
    seller: { name: '', street: '', city: '', postalCode: '', countryCode: 'DE', vatId: '', taxNumber: '', contactName: '', contactPhone: '', contactEmail: '' },
    buyer: { name: '', street: '', city: '', postalCode: '', countryCode: 'DE', vatId: '', email: '' },
    paymentMeansCode: '58',
    paymentTerms: '',
    iban: '',
    bic: '',
    taxCategoryCode: 'S',
    taxRate: 19,
    kleinunternehmer: false,
    totalNetAmount: 0,
    totalTaxAmount: 0,
    totalGrossAmount: 0,
    lines: [{ lineNumber: 1, quantity: 1, unitCode: 'C62', itemName: '', netPrice: 0, vatCategoryCode: 'S', vatRate: 19, lineNetAmount: 0 }],
  });

  onMount(async () => {
    if (!templateId) { loading = false; return; }
    try {
      const tpl = await invoiceTemplateApi.get(templateId);
      templateName = tpl.name;
      const data = JSON.parse(tpl.data);
      const { invNumTemplateId: savedInvNumTplId, ...invoiceData } = data;
      invoice = {
        ...invoice,
        ...invoiceData,
        iban: formatIban(invoiceData.iban ?? ''),
      };
      if (savedInvNumTplId) {
        selectedInvNumTemplateId = String(savedInvNumTplId);
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
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
  }

  async function handleSave() {
    if (!templateId) return;
    saving = true;
    error = '';
    recalculate();
    try {
      const { id, createdAt, updatedAt, ...data } = invoice;
      await invoiceTemplateApi.update(templateId, {
        name: templateName,
        data: JSON.stringify({ ...data, invNumTemplateId: selectedInvNumTemplateId || undefined }),
      });
      push('/templates/invoices');
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }
</script>

{#if loading}
  <div class="loading-card">
    <div class="loading-pulse"></div>
    <span>{t('invoice_tpl_edit.laden')}</span>
  </div>
{:else}
  <div class="editor-header">
    <div class="editor-title-group">
      <button class="back-btn" onclick={() => push('/templates/invoices')} aria-label={t('invoice_tpl_edit.zurueck')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <div>
        <h1>{t('invoice_tpl_edit.title')}</h1>
        <p class="subtitle">{t('invoice_tpl_edit.subtitle')}</p>
      </div>
    </div>
    <div class="header-actions">
      <button class="primary save-btn" onclick={handleSave} disabled={saving}>
        {#if saving}
          <span class="save-spinner"></span>
          {t('invoice_tpl_edit.speichern_laufend')}
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {t('invoice_tpl_edit.speichern')}
        {/if}
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      {error}
    </div>
  {/if}

  <div class="form-group name-group">
    <label for="tpl-name">{t('invoice_tpl_edit.vorlagenname')} <span class="required">*</span></label>
    <input id="tpl-name" bind:value={templateName} placeholder={t('invoice_tpl_edit.vorlagenname_placeholder')} />
  </div>

  <HeaderSection bind:invoice bind:selectedInvNumTemplateId onchange={recalculate} />
  <PartySection title={t('invoice_edit.verkaeufer')} bind:party={invoice.seller} isSeller={true} />
  <PartySection title={t('invoice_edit.kaeufer')} bind:party={invoice.buyer} isSeller={false} />
  <PaymentSection bind:invoice />
  <LinesSection bind:lines={invoice.lines} kleinunternehmer={invoice.kleinunternehmer} onchange={recalculate} />
  <TotalsSection {invoice} />
{/if}

<style>
  .loading-card {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 2rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .loading-pulse {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }


  .editor-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.75rem;
    flex-wrap: wrap;
  }

  .editor-title-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .back-btn {
    background: var(--surface);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 0.45rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s;
    outline: none;
  }

  .back-btn:hover {
    background: var(--surface-alt);
    border-color: var(--border-strong);
    color: var(--text);
  }

  h1 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.45rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
  }

  .subtitle {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .save-btn {
    min-width: 100px;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .save-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .error-banner {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
    background: #fef2f2;
    border: 1px solid rgba(242,76,61,0.2);
    border-radius: var(--radius-lg);
    color: var(--danger);
    font-size: 0.8125rem;
    margin-bottom: 1.25rem;
  }

  .name-group {
    max-width: 400px;
    margin-bottom: 1rem;
  }

  .required {
    color: var(--danger);
    font-weight: 700;
  }
</style>
