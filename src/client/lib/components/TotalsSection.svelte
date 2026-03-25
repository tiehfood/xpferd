<script lang="ts">
  import { fmtCurrency } from '$shared/constants/format';
  import { getSettings } from '../settingsStore.svelte';
  import { t } from '../i18n.js';

  let { invoice = $bindable(), onchange = () => {} }: { invoice: any; onchange?: () => void } = $props();
</script>

<div class="card totals-card">
  <div class="card-header">{t('totals.card_title')}</div>
  <div class="totals">
    <div class="total-row">
      <span class="total-label">{t('totals.nettobetrag')}</span>
      <span class="total-value mono">{fmtCurrency(invoice.totalNetAmount, invoice.currencyCode, getSettings().numberFormat)}</span>
    </div>

    {#if !invoice.kleinunternehmer}
      <div class="total-row">
        <span class="total-label">{t('totals.ust')} {invoice.taxRate}%</span>
        <span class="total-value mono">{fmtCurrency(invoice.totalTaxAmount, invoice.currencyCode, getSettings().numberFormat)}</span>
      </div>
    {:else}
      <div class="total-row exempt-row">
        <span class="total-label">
          <span class="badge-sm">§19</span>
          {t('totals.umsatzsteuer_entfaellt')}
        </span>
        <span class="total-value mono">{fmtCurrency(0, invoice.currencyCode, getSettings().numberFormat)}</span>
      </div>
    {/if}

    <div class="total-row grand-total">
      <span class="total-label">{t('totals.gesamtbetrag')}</span>
      <span class="total-value mono">{fmtCurrency(invoice.totalGrossAmount, invoice.currencyCode, getSettings().numberFormat)}</span>
    </div>

    <div class="total-row prepaid-row">
      <span class="total-label">{t('totals.anzahlung')}</span>
      <input type="number" step="0.01" min="0" class="prepaid-input mono"
        bind:value={invoice.prepaidAmount} oninput={onchange} placeholder="0,00" />
    </div>

    {#if invoice.prepaidAmount > 0}
      <div class="total-row amount-due">
        <span class="total-label">{t('totals.zahlbetrag')}</span>
        <span class="total-value mono">{fmtCurrency(invoice.totalGrossAmount - (invoice.prepaidAmount || 0), invoice.currencyCode, getSettings().numberFormat)}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .totals-card {
    max-width: 440px;
    margin-left: auto;
    border-left: 3px solid var(--primary);
  }

  .totals {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0;
    font-size: 0.875rem;
  }

  .total-label {
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .total-value {
    font-weight: 500;
    letter-spacing: -0.01em;
  }

  .exempt-row {
    color: var(--text-muted);
    font-style: italic;
  }

  .exempt-row .total-value {
    font-weight: 400;
  }

  .badge-sm {
    display: inline-flex;
    align-items: center;
    padding: 0.1rem 0.35rem;
    background: var(--amber);
    color: white;
    border-radius: 4px;
    font-size: 0.6rem;
    font-weight: 700;
    font-style: normal;
    letter-spacing: 0.02em;
  }

  .grand-total {
    border-top: 2px solid var(--text);
    margin-top: 0.5rem;
    padding-top: 0.65rem;
    font-size: 1.05rem;
  }

  .grand-total .total-label {
    color: var(--text);
    font-weight: 700;
    font-family: var(--font-display), sans-serif;
  }

  .grand-total .total-value {
    font-weight: 800;
    font-size: 1.1rem;
    color: var(--primary);
  }

  .prepaid-input {
    width: 120px;
    text-align: right;
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    height: auto;
  }

  .prepaid-row {
    border-top: 1px dashed var(--border);
    padding-top: 0.5rem;
    margin-top: 0.25rem;
  }

  .amount-due {
    padding-top: 0.35rem;
  }

  .amount-due .total-label {
    color: var(--text);
    font-weight: 600;
  }

  .amount-due .total-value {
    font-weight: 700;
    color: var(--primary);
  }
</style>
