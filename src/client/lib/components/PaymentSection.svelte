<script lang="ts">
  import { onMount } from 'svelte';
  import { PAYMENT_MEANS_CODES } from '$shared/constants';
  import { paymentTemplateApi } from '../api/templateApi';
  import { formatIban } from '$shared/constants/format';
  import { t } from '../i18n.js';
  import FormSelect from './FormSelect.svelte';

  let { invoice = $bindable() }: { invoice: any } = $props();

  let payTemplates: any[] = $state([]);
  let selectedTemplateId = $state('');

  onMount(async () => {
    try {
      payTemplates = await paymentTemplateApi.list();
      // Match existing invoice payment data back to a template (like PartySection does)
      if (invoice.iban || invoice.bic) {
        const match = payTemplates.find((t: any) =>
          formatIban(t.iban ?? '') === (invoice.iban ?? '') &&
          (t.bic ?? '') === (invoice.bic ?? '')
        );
        if (match) selectedTemplateId = String(match.id);
      }
    } catch {
      // silently ignore
    }
  });

  // Re-match selectedTemplateId when payment data changes (e.g. template applied)
  $effect(() => {
    const iban = invoice.iban;
    const bic = invoice.bic;
    if ((!iban && !bic) || payTemplates.length === 0) return;
    const match = payTemplates.find((t: any) =>
      formatIban(t.iban ?? '') === (iban ?? '') &&
      (t.bic ?? '') === (bic ?? '')
    );
    if (match) {
      selectedTemplateId = String(match.id);
    }
  });

  function handleTemplateSelect() {
    if (!selectedTemplateId) return;
    const found = payTemplates.find((t: any) => String(t.id) === selectedTemplateId);
    if (!found) return;
    invoice.paymentMeansCode = found.paymentMeansCode;
    invoice.iban = formatIban(found.iban ?? '');
    invoice.bic = found.bic ?? '';
    invoice.paymentTerms = found.paymentTerms ?? '';
  }
</script>

<div class="card">
  <div class="card-header">{t('payment.card_title')}</div>

  {#if payTemplates.length > 0}
    <div class="template-selector">
      <label for="pay-template">{t('payment.zahlungsvorlage')}</label>
      <FormSelect
        id="pay-template"
        bind:value={selectedTemplateId}
        onchange={handleTemplateSelect}
        placeholder={t('payment.manuell')}
        items={payTemplates.map(tpl => ({ value: String(tpl.id), name: tpl.name }))}
      />
    </div>
  {/if}

  <div class="form-row">
    <div class="form-group">
      <label for="paymentMeansCode">{t('payment.zahlungsart')} <span class="required">*</span></label>
      <FormSelect
        id="paymentMeansCode"
        bind:value={invoice.paymentMeansCode}
        items={Object.entries(PAYMENT_MEANS_CODES).map(([code]) => ({ value: code, name: `${code} — ${t(('code.payment.' + code) as any)}` }))}
      />
    </div>
    <div class="form-group">
      <label for="iban">IBAN</label>
      <input id="iban" class="iban-input" bind:value={invoice.iban} onblur={(e) => { const f = formatIban(invoice.iban || ''); invoice.iban = f; (e.target as HTMLInputElement).value = f; }} placeholder={t('payment.iban_placeholder')} />
    </div>
    <div class="form-group">
      <label for="bic">BIC</label>
      <input id="bic" bind:value={invoice.bic} placeholder={t('payment.bic_placeholder')} />
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label for="paymentReference">{t('payment.verwendungszweck')}</label>
      <input id="paymentReference" bind:value={invoice.paymentReference} placeholder={t('payment.verwendungszweck_placeholder')} />
    </div>
    <div class="form-group">
      <label for="accountName">{t('payment.kontoinhaber')}</label>
      <input id="accountName" bind:value={invoice.accountName} placeholder={t('payment.kontoinhaber_placeholder')} />
    </div>
  </div>
  <div class="form-group">
    <label for="paymentTerms">{t('payment.zahlungsbedingungen')}</label>
    <textarea id="paymentTerms" rows="2" bind:value={invoice.paymentTerms} placeholder={t('payment.zahlungsbedingungen_placeholder')}></textarea>
  </div>
</div>

<style>
  .required {
    color: var(--danger);
    font-weight: 700;
  }

  .template-selector {
    margin-bottom: 0.85rem;
    padding-bottom: 0.85rem;
    border-bottom: 1px solid var(--border);
  }

  .iban-input {
    min-width: min(22rem, 100%);
    letter-spacing: 0.05em;
  }
</style>
