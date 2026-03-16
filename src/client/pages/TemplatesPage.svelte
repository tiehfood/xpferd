<script lang="ts">
  import { router, push } from 'svelte-spa-router';
  import { invoiceNumberTemplateApi, paymentTemplateApi, lineItemTemplateApi, invoiceTemplateApi } from '../lib/api/templateApi';
  import { PAYMENT_MEANS_CODES, UNIT_CODES, VAT_CATEGORY_CODES } from '$shared/constants';
  import { formatIban, fmtCurrency } from '../../shared/constants/format';
  import { getSettings } from '../lib/settingsStore.svelte.js';
  import { t } from '../lib/i18n.js';

  let activeTab: 'invoice-numbers' | 'payments' | 'line-items' | 'invoices' = $state('invoice-numbers');
  let loading = $state(true);
  let error = $state('');

  // Invoice Number Templates
  let invNumTemplates: any[] = $state([]);
  let editingInvNum: any = $state(null);

  // Payment Templates
  let payTemplates: any[] = $state([]);
  let editingPay: any = $state(null);

  // Line Item Templates
  let lineTemplates: any[] = $state([]);
  let editingLine: any = $state(null);

  // Invoice Templates
  let invTemplates: any[] = $state([]);

  let saving = $state(false);
  let editError = $state('');

  $effect(() => {
    const val = router.location;
    if (val === '/templates/payments') activeTab = 'payments';
    else if (val === '/templates/line-items') activeTab = 'line-items';
    else if (val === '/templates/invoices') activeTab = 'invoices';
    else activeTab = 'invoice-numbers';
    load();
  });

  async function load() {
    loading = true;
    error = '';
    try {
      if (activeTab === 'invoice-numbers') {
        invNumTemplates = await invoiceNumberTemplateApi.list();
      } else if (activeTab === 'payments') {
        payTemplates = await paymentTemplateApi.list();
      } else if (activeTab === 'line-items') {
        lineTemplates = await lineItemTemplateApi.list();
      } else if (activeTab === 'invoices') {
        invTemplates = await invoiceTemplateApi.list();
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // --- Invoice Number Templates ---
  function startCreateInvNum() {
    editingInvNum = { name: '', prefix: 'RE-', digits: 4, nextNumber: 1 };
    editError = '';
  }
  function startEditInvNum(t: any) {
    editingInvNum = { ...t };
    editError = '';
  }
  async function saveInvNum() {
    saving = true; editError = '';
    try {
      if (editingInvNum.id) {
        await invoiceNumberTemplateApi.update(editingInvNum.id, editingInvNum);
      } else {
        await invoiceNumberTemplateApi.create(editingInvNum);
      }
      editingInvNum = null;
      await load();
    } catch (e: any) { editError = e.message; } finally { saving = false; }
  }
  async function deleteInvNum(id: number) {
    if (!confirm(t('templates.confirm_vorlage_loeschen'))) return;
    try { await invoiceNumberTemplateApi.delete(id); await load(); } catch (e: any) { error = e.message; }
  }

  // --- Payment Templates ---
  function startCreatePay() {
    editingPay = { name: '', paymentMeansCode: '58', iban: '', bic: '', paymentTerms: '' };
    editError = '';
  }
  function startEditPay(t: any) {
    editingPay = {
      ...t,
      paymentMeansCode: t.paymentMeansCode || '58',
      iban: formatIban(t.iban ?? ''),
      bic: t.bic ?? '',
      paymentTerms: t.paymentTerms ?? '',
    };
    editError = '';
  }
  async function savePay() {
    saving = true; editError = '';
    try {
      if (editingPay.id) {
        await paymentTemplateApi.update(editingPay.id, editingPay);
      } else {
        await paymentTemplateApi.create(editingPay);
      }
      editingPay = null;
      await load();
    } catch (e: any) { editError = e.message; } finally { saving = false; }
  }
  async function deletePay(id: number) {
    if (!confirm(t('templates.confirm_vorlage_loeschen'))) return;
    try { await paymentTemplateApi.delete(id); await load(); } catch (e: any) { error = e.message; }
  }

  // --- Line Item Templates ---
  function startCreateLine() {
    editingLine = { name: '', unitCode: 'C62', netPrice: 0, vatCategoryCode: 'S', vatRate: 19 };
    editError = '';
  }
  function startEditLine(t: any) {
    editingLine = { ...t };
    editError = '';
  }
  async function saveLine() {
    saving = true; editError = '';
    try {
      if (editingLine.id) {
        await lineItemTemplateApi.update(editingLine.id, editingLine);
      } else {
        await lineItemTemplateApi.create(editingLine);
      }
      editingLine = null;
      await load();
    } catch (e: any) { editError = e.message; } finally { saving = false; }
  }
  async function deleteLine(id: number) {
    if (!confirm(t('templates.confirm_vorlage_loeschen'))) return;
    try { await lineItemTemplateApi.delete(id); await load(); } catch (e: any) { error = e.message; }
  }

  // --- Invoice Templates ---
  async function deleteInvTpl(id: number) {
    if (!confirm(t('templates.confirm_rechnungsvorlage_loeschen'))) return;
    try { await invoiceTemplateApi.delete(id); await load(); } catch (e: any) { error = e.message; }
  }

  function getInvTplSummary(t: any): { buyer: string; lines: number; currency: string; total: number | null } {
    try {
      const d = JSON.parse(t.data);
      // Use stored total if available, otherwise compute from lines
      let total: number | null = null;
      if (typeof d.totalGrossAmount === 'number') {
        total = d.totalGrossAmount;
      } else if (Array.isArray(d.lines) && d.lines.length > 0) {
        const net = d.lines.reduce((s: number, l: any) => s + (l.quantity ?? 1) * (l.netPrice ?? 0), 0);
        const taxRate = d.taxRate ?? 19;
        const tax = d.kleinunternehmer ? 0 : net * taxRate / 100;
        total = Math.round((net + tax) * 100) / 100;
      }
      return {
        buyer: d.buyer?.name || '—',
        lines: d.lines?.length ?? 0,
        currency: d.currencyCode || 'EUR',
        total,
      };
    } catch {
      return { buyer: '—', lines: 0, currency: 'EUR', total: null };
    }
  }

  function cancelEdit() {
    editingInvNum = null;
    editingPay = null;
    editingLine = null;
    editError = '';
  }

  function previewNumber(prefix: string, digits: number, next: number): string {
    return prefix + String(next).padStart(digits, '0');
  }
</script>

<div class="page-header">
  <div class="page-title-group">
    <h1>{activeTab === 'payments' ? t('templates.zahlungsarten_title') : activeTab === 'line-items' ? t('templates.positionen_title') : activeTab === 'invoices' ? t('templates.rechnungsvorlagen_title') : t('templates.nummernvorlagen_title')}</h1>
    <p class="subtitle">{activeTab === 'payments' ? t('templates.zahlungsarten_subtitle') : activeTab === 'line-items' ? t('templates.positionen_subtitle') : activeTab === 'invoices' ? t('templates.rechnungsvorlagen_subtitle') : t('templates.nummernvorlagen_subtitle')}</p>
  </div>
  {#if activeTab === 'invoice-numbers'}
    <button class="primary" onclick={startCreateInvNum}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      {t('templates.neue_nummernvorlage')}
    </button>
  {:else if activeTab === 'payments'}
    <button class="primary" onclick={startCreatePay}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      {t('templates.neue_zahlungsvorlage')}
    </button>
  {:else if activeTab === 'line-items'}
    <button class="primary" onclick={startCreateLine}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      {t('templates.neue_positionsvorlage')}
    </button>
  {/if}
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
    <span>{t('templates.laden')}</span>
  </div>
{:else}

  <!-- Invoice Number Templates -->
  {#if activeTab === 'invoice-numbers'}
    {#if invNumTemplates.length === 0}
      <div class="empty-state">
        <h2>{t('templates.noch_keine_nummernvorlagen')}</h2>
        <p>{t('templates.noch_keine_nummernvorlagen_text')}</p>
        <button class="primary" onclick={startCreateInvNum}>{t('templates.erste_vorlage_anlegen')}</button>
      </div>
    {:else}
      <div class="templates-grid">
        {#each invNumTemplates as tpl, i}
          <div class="template-card" style="animation-delay: {i * 40}ms">
            <div class="template-name">{tpl.name}</div>
            <div class="template-details">
              <div class="template-detail">
                <span class="detail-key">{t('templates.praefix')}</span>
                <span class="detail-val">{tpl.prefix}</span>
              </div>
              <div class="template-detail">
                <span class="detail-key">{t('templates.stellen')}</span>
                <span class="detail-val">{tpl.digits}</span>
              </div>
              <div class="template-detail">
                <span class="detail-key">{t('templates.naechste')}</span>
                <span class="detail-val preview-num">{previewNumber(tpl.prefix, tpl.digits, tpl.nextNumber)}</span>
              </div>
            </div>
            <div class="template-actions">
              <button class="ghost" onclick={() => startEditInvNum(tpl)}>{t('templates.bearbeiten')}</button>
              <button class="danger" onclick={() => deleteInvNum(tpl.id)}>{t('templates.loeschen')}</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Payment Templates -->
  {#if activeTab === 'payments'}
    {#if payTemplates.length === 0}
      <div class="empty-state">
        <h2>{t('templates.noch_keine_zahlungsvorlagen')}</h2>
        <p>{t('templates.noch_keine_zahlungsvorlagen_text')}</p>
        <button class="primary" onclick={startCreatePay}>{t('templates.erste_vorlage_anlegen')}</button>
      </div>
    {:else}
      <div class="templates-grid">
        {#each payTemplates as tpl, i}
          <div class="template-card" style="animation-delay: {i * 40}ms">
            <div class="template-name">{tpl.name}</div>
            <div class="template-details">
              <div class="template-detail">
                <span class="detail-key">{t('templates.zahlungsart')}</span>
                <span class="detail-val">{t(('code.payment.' + tpl.paymentMeansCode) as any)}</span>
              </div>
              {#if tpl.iban}
                <div class="template-detail">
                  <span class="detail-key">IBAN</span>
                  <span class="detail-val mono">{formatIban(tpl.iban)}</span>
                </div>
              {/if}
              {#if tpl.bic}
                <div class="template-detail">
                  <span class="detail-key">BIC</span>
                  <span class="detail-val mono">{tpl.bic}</span>
                </div>
              {/if}
            </div>
            <div class="template-actions">
              <button class="ghost" onclick={() => startEditPay(tpl)}>{t('templates.bearbeiten')}</button>
              <button class="danger" onclick={() => deletePay(tpl.id)}>{t('templates.loeschen')}</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Line Item Templates -->
  {#if activeTab === 'line-items'}
    {#if lineTemplates.length === 0}
      <div class="empty-state">
        <h2>{t('templates.noch_keine_positionsvorlagen')}</h2>
        <p>{t('templates.noch_keine_positionsvorlagen_text')}</p>
        <button class="primary" onclick={startCreateLine}>{t('templates.erste_vorlage_anlegen')}</button>
      </div>
    {:else}
      <div class="templates-grid">
        {#each lineTemplates as tpl, i}
          <div class="template-card" style="animation-delay: {i * 40}ms">
            <div class="template-name">{tpl.name}</div>
            <div class="template-details">
              <div class="template-detail">
                <span class="detail-key">{t('templates.einheit')}</span>
                <span class="detail-val">{t(('code.unit.' + tpl.unitCode) as any)}</span>
              </div>
              <div class="template-detail">
                <span class="detail-key">{t('templates.preis')}</span>
                <span class="detail-val mono">{fmtCurrency(tpl.netPrice, 'EUR', getSettings().numberFormat)}</span>
              </div>
              <div class="template-detail">
                <span class="detail-key">{t('templates.ust')}</span>
                <span class="detail-val">{t(('code.vat.' + tpl.vatCategoryCode) as any)} — {tpl.vatRate}%</span>
              </div>
            </div>
            <div class="template-actions">
              <button class="ghost" onclick={() => startEditLine(tpl)}>{t('templates.bearbeiten')}</button>
              <button class="danger" onclick={() => deleteLine(tpl.id)}>{t('templates.loeschen')}</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Invoice Templates -->
  {#if activeTab === 'invoices'}
    {#if invTemplates.length === 0}
      <div class="empty-state">
        <h2>{t('templates.noch_keine_rechnungsvorlagen')}</h2>
        <p>{t('templates.noch_keine_rechnungsvorlagen_text')}</p>
      </div>
    {:else}
      <div class="templates-grid">
        {#each invTemplates as tpl, i}
          {@const summary = getInvTplSummary(tpl)}
          <div class="template-card" style="animation-delay: {i * 40}ms">
            <div class="template-name">{tpl.name}</div>
            <div class="template-details">
              <div class="template-detail">
                <span class="detail-key">{t('templates.kaeufer')}</span>
                <span class="detail-val">{summary.buyer}</span>
              </div>
              <div class="template-detail">
                <span class="detail-key">{t('templates.positionen_anz')}</span>
                <span class="detail-val">{summary.lines}</span>
              </div>
              {#if summary.total !== null}
                <div class="template-detail">
                  <span class="detail-key">{t('templates.brutto')}</span>
                  <span class="detail-val mono">{fmtCurrency(summary.total!, summary.currency, getSettings().numberFormat)}</span>
                </div>
              {/if}
            </div>
            <div class="template-actions">
              <button class="ghost" onclick={() => push(`/templates/invoices/${tpl.id}`)}>{t('templates.bearbeiten')}</button>
              <button class="danger" onclick={() => deleteInvTpl(tpl.id)}>{t('templates.loeschen')}</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
{/if}

<!-- Modals -->
{#if editingInvNum}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={cancelEdit}>
    <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>{editingInvNum.id ? t('templates.nummernvorlage_bearbeiten') : t('templates.neue_nummernvorlage_modal')}</h2>
        <button class="modal-close" onclick={cancelEdit} aria-label={t('templates.schliessen')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {#if editError}<div class="error-banner modal-error">{editError}</div>{/if}
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group" style="grid-column: span 2;">
            <label for="invnum-name">{t('templates.name')} <span class="required">*</span></label>
            <input id="invnum-name" bind:value={editingInvNum.name} placeholder={t('templates.name_placeholder')} />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="invnum-prefix">{t('templates.praefix_label')} <span class="required">*</span></label>
            <input id="invnum-prefix" bind:value={editingInvNum.prefix} placeholder={t('templates.praefix_placeholder')} />
          </div>
          <div class="form-group">
            <label for="invnum-digits">{t('templates.stellen_label')} <span class="required">*</span></label>
            <input id="invnum-digits" type="number" min="1" max="6" bind:value={editingInvNum.digits} />
          </div>
          <div class="form-group">
            <label for="invnum-next">{t('templates.naechste_nr')} <span class="required">*</span></label>
            <input id="invnum-next" type="number" min="1" bind:value={editingInvNum.nextNumber} />
          </div>
        </div>
        <div class="preview-box">
          <span class="preview-label">{t('templates.vorschau')}</span>
          <span class="preview-value">{previewNumber(editingInvNum.prefix, editingInvNum.digits, editingInvNum.nextNumber)}</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="ghost" onclick={cancelEdit}>{t('templates.abbrechen')}</button>
        <button class="primary" onclick={saveInvNum} disabled={saving}>{saving ? t('templates.speichern_laufend') : t('templates.speichern')}</button>
      </div>
    </div>
  </div>
{/if}

{#if editingPay}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={cancelEdit}>
    <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>{editingPay.id ? t('templates.zahlungsvorlage_bearbeiten') : t('templates.neue_zahlungsvorlage_modal')}</h2>
        <button class="modal-close" onclick={cancelEdit} aria-label={t('templates.schliessen')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {#if editError}<div class="error-banner modal-error">{editError}</div>{/if}
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group" style="grid-column: span 2;">
            <label for="pay-name">{t('templates.name')} <span class="required">*</span></label>
            <input id="pay-name" bind:value={editingPay.name} placeholder={t('templates.pay_name_placeholder')} />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="pay-means">{t('templates.pay_zahlungsart')} <span class="required">*</span></label>
            <select id="pay-means" bind:value={editingPay.paymentMeansCode}>
              {#each Object.entries(PAYMENT_MEANS_CODES) as [code]}
                <option value={code}>{code} — {t(('code.payment.' + code) as any)}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="pay-bic">{t('templates.pay_bic')}</label>
            <input id="pay-bic" bind:value={editingPay.bic} placeholder="COBADEFFXXX" />
          </div>
        </div>
        <div class="form-group">
          <label for="pay-iban">{t('templates.pay_iban')}</label>
          <input id="pay-iban" class="iban-input" bind:value={editingPay.iban} onblur={(e) => { const f = formatIban(editingPay.iban || ''); editingPay.iban = f; (e.target as HTMLInputElement).value = f; }} placeholder="DE89 3704 0044 0532 0130 00" />
        </div>
        <div class="form-group">
          <label for="pay-terms">{t('templates.pay_zahlungsbedingungen')}</label>
          <textarea id="pay-terms" rows="2" bind:value={editingPay.paymentTerms} placeholder={t('templates.pay_zahlungsbedingungen_placeholder')}></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="ghost" onclick={cancelEdit}>{t('templates.abbrechen')}</button>
        <button class="primary" onclick={savePay} disabled={saving}>{saving ? t('templates.speichern_laufend') : t('templates.speichern')}</button>
      </div>
    </div>
  </div>
{/if}

{#if editingLine}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={cancelEdit}>
    <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>{editingLine.id ? t('templates.positionsvorlage_bearbeiten') : t('templates.neue_positionsvorlage_modal')}</h2>
        <button class="modal-close" onclick={cancelEdit} aria-label={t('templates.schliessen')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {#if editError}<div class="error-banner modal-error">{editError}</div>{/if}
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group" style="grid-column: span 2;">
            <label for="line-name">{t('templates.line_bezeichnung')} <span class="required">*</span></label>
            <input id="line-name" bind:value={editingLine.name} placeholder={t('templates.line_bezeichnung_placeholder')} />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="line-unit">{t('templates.line_einheit')} <span class="required">*</span></label>
            <select id="line-unit" bind:value={editingLine.unitCode}>
              {#each Object.entries(UNIT_CODES) as [code]}
                <option value={code}>{t(('code.unit.' + code) as any)}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="line-price">{t('templates.line_einzelpreis')} <span class="required">*</span></label>
            <input id="line-price" type="number" step="0.01" min="0" bind:value={editingLine.netPrice} />
          </div>
          <div class="form-group">
            <label for="line-vat">{t('templates.line_ust_kategorie')}</label>
            <select id="line-vat" bind:value={editingLine.vatCategoryCode}>
              {#each Object.entries(VAT_CATEGORY_CODES) as [code]}
                <option value={code}>{code} — {t(('code.vat.' + code) as any)}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="line-vatrate">{t('templates.line_ust_satz')}</label>
            <input id="line-vatrate" type="number" step="0.01" min="0" bind:value={editingLine.vatRate} />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="ghost" onclick={cancelEdit}>{t('templates.abbrechen')}</button>
        <button class="primary" onclick={saveLine} disabled={saving}>{saving ? t('templates.speichern_laufend') : t('templates.speichern')}</button>
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

  .modal-error {
    margin: 0.85rem 1.35rem 0;
  }

  /* --- Content States --- */
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

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 4rem 2rem;
    text-align: center;
    animation: slideUp 0.4s var(--ease-out);
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
    margin-bottom: 1.25rem;
  }

  /* --- Template Cards --- */
  .templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.85rem;
  }

  .template-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.15rem 1.35rem;
    transition: all 0.2s var(--ease-out);
    animation: slideUp 0.3s var(--ease-out) both;
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
  }

  .detail-key {
    color: var(--text-muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .detail-val {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .preview-num {
    color: var(--primary);
    font-weight: 600;
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

  /* --- Preview Box --- */
  .preview-box {
    margin-top: 0.85rem;
    padding: 0.65rem 0.9rem;
    background: var(--primary-light);
    border: 1px solid rgba(166, 47, 36, 0.12);
    border-radius: var(--radius);
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }

  .preview-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .preview-value {
    font-family: var(--font-display), sans-serif;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--primary);
    letter-spacing: -0.01em;
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
    max-width: 640px;
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

  .iban-input {
    min-width: min(22rem, 100%);
    letter-spacing: 0.05em;
  }
</style>
