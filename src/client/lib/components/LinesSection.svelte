<script lang="ts">
  import { onMount } from 'svelte';
  import { UNIT_CODES, VAT_CATEGORY_CODES } from '$shared/constants';
  import { fmtDe } from '$shared/constants';
  import { lineItemTemplateApi } from '../api/templateApi';
  import { getSettings } from '../settingsStore.svelte';
  import { t } from '../i18n.js';

  let { lines = $bindable(), kleinunternehmer = false, onchange = () => {} }: {
    lines: any[];
    kleinunternehmer?: boolean;
    onchange?: () => void;
  } = $props();

  let lineTemplates: any[] = $state([]);
  let selectedTemplateId = $state('');
  let editingPriceIndex = $state(-1);

  onMount(async () => {
    try {
      lineTemplates = await lineItemTemplateApi.list();
    } catch {
      // silently ignore
    }
  });

  function addLine() {
    lines = [...lines, {
      lineNumber: lines.length + 1,
      quantity: 1,
      unitCode: 'C62',
      itemName: '',
      netPrice: 0,
      vatCategoryCode: kleinunternehmer ? 'E' : 'S',
      vatRate: kleinunternehmer ? 0 : 19,
      lineNetAmount: 0,
    }];
  }

  function addFromTemplate() {
    if (!selectedTemplateId) return;
    const t = lineTemplates.find((t: any) => String(t.id) === selectedTemplateId);
    if (!t) return;
    const newLine = {
      lineNumber: 1,
      quantity: 1,
      unitCode: t.unitCode,
      itemName: t.name,
      netPrice: t.netPrice,
      vatCategoryCode: kleinunternehmer ? 'E' : t.vatCategoryCode,
      vatRate: kleinunternehmer ? 0 : t.vatRate,
      lineNetAmount: 0,
    };
    // Replace a single empty default line instead of appending
    const isDefaultEmpty = lines.length === 1
      && !lines[0].itemName
      && lines[0].netPrice === 0
      && lines[0].quantity === 1;
    if (isDefaultEmpty) {
      lines = [newLine];
    } else {
      newLine.lineNumber = lines.length + 1;
      lines = [...lines, newLine];
    }
    selectedTemplateId = '';
    onchange();
  }

  function removeLine(index: number) {
    lines = lines.filter((_, i) => i !== index);
    lines.forEach((l, i) => l.lineNumber = i + 1);
    onchange();
  }

  function handleInput() {
    onchange();
  }
</script>

<div class="card">
  <div class="lines-header">
    <div class="card-header" style="border: none; margin: 0; padding: 0;">{t('lines.positionen')}</div>
    <div class="lines-header-actions">
      {#if lineTemplates.length > 0}
        <select class="template-select" bind:value={selectedTemplateId}>
          <option value="">{t('lines.vorlage_placeholder')}</option>
          {#each lineTemplates as tpl}
            <option value={String(tpl.id)}>{tpl.name}</option>
          {/each}
        </select>
        <button class="ghost" onclick={addFromTemplate} disabled={!selectedTemplateId}>{t('lines.hinzufuegen')}</button>
      {/if}
      <button class="primary add-line-btn" onclick={addLine}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {t('lines.position')}
      </button>
    </div>
  </div>

  {#if lines.length === 0}
    <div class="empty-lines">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
      <span>{t('lines.keine_positionen')}</span>
    </div>
  {:else}
    <div class="lines-table-wrap">
      <table>
        <thead>
          <tr>
            <th class="col-nr">#</th>
            <th class="col-name">{t('lines.bezeichnung')} <span class="required">*</span></th>
            <th class="col-qty">{t('lines.menge')} <span class="required">*</span></th>
            <th class="col-unit">{t('lines.einheit')}</th>
            <th class="col-price">{t('lines.einzelpreis')} <span class="required">*</span></th>
            {#if !kleinunternehmer}
              <th class="col-vat">{t('lines.ust')}</th>
              <th class="col-vatrate">%</th>
            {/if}
            <th class="col-total">{t('lines.gesamt')}</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {#each lines as line, i}
            <tr>
              <td class="col-nr mono">{line.lineNumber}</td>
              <td class="col-name">
                <input bind:value={line.itemName} placeholder={t('lines.artikelbezeichnung_placeholder')} />
                {#if line.itemDescription !== undefined && line.itemDescription !== ''}
                  <textarea class="item-desc" rows="2" bind:value={line.itemDescription} placeholder={t('lines.beschreibung_placeholder')}></textarea>
                {:else}
                  <button class="add-desc-btn" type="button" onclick={() => { line.itemDescription = ''; }}>
                    + {t('lines.beschreibung')}
                  </button>
                {/if}
              </td>
              <td class="col-qty">
                <input type="number" step="0.01" min="0" bind:value={line.quantity} oninput={handleInput} />
              </td>
              <td class="col-unit">
                <select bind:value={line.unitCode}>
                  {#each Object.entries(UNIT_CODES) as [code]}
                    <option value={code}>{t(('code.unit.' + code) as any)}</option>
                  {/each}
                </select>
              </td>
              <td class="col-price">
                {#if editingPriceIndex === i}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input type="number" step="0.01" min="0" bind:value={line.netPrice}
                    oninput={handleInput}
                    onblur={() => { editingPriceIndex = -1; }}
                    autofocus />
                {:else}
                  <input type="text" readonly value={fmtDe(line.netPrice, getSettings().numberFormat)}
                    onfocus={() => { editingPriceIndex = i; }}
                    class="price-display" />
                {/if}
              </td>
              {#if !kleinunternehmer}
                <td class="col-vat">
                  <select bind:value={line.vatCategoryCode}>
                    {#each Object.entries(VAT_CATEGORY_CODES) as [code]}
                      <option value={code}>{code}</option>
                    {/each}
                  </select>
                </td>
                <td class="col-vatrate">
                  <input type="number" step="0.01" min="0" bind:value={line.vatRate} oninput={handleInput} />
                </td>
              {/if}
              <td class="col-total mono">
                {fmtDe(line.lineNetAmount, getSettings().numberFormat)}
              </td>
              <td class="col-actions">
                <button class="remove-btn" onclick={() => removeLine(i)} disabled={lines.length <= 1} aria-label={t('lines.position_entfernen')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .lines-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.85rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--border);
  }

  .lines-header-actions {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }

  .template-select {
    width: auto;
    min-width: 120px;
  }

  .empty-lines {
    color: var(--text-muted);
    text-align: center;
    padding: 2.5rem 1rem;
    font-size: 0.875rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
  }

  .empty-lines svg {
    opacity: 0.35;
  }

  .lines-table-wrap {
    overflow-x: auto;
    margin: 0 -1.35rem;
    padding: 0 1.35rem;
  }

  table input, table select {
    height: auto;            /* override global --ctrl-h for compact table cells */
    font-size: 0.8125rem;
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius);
  }

  .required {
    color: var(--danger);
    font-weight: 700;
    text-transform: none;
  }

  .col-nr { width: 40px; color: var(--text-muted); }
  .col-name { min-width: 180px; }
  .col-qty { width: 80px; }
  .col-unit { width: 130px; }
  .col-price { width: 100px; }
  .col-vat { width: 65px; }
  .col-vatrate { width: 65px; }
  .col-total { width: 90px; text-align: right; font-weight: 600; color: var(--text); }
  .col-actions { width: 36px; }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.15s;
  }

  .remove-btn:hover {
    background: #fef2f2;
    color: var(--danger);
  }

  .remove-btn:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .price-display {
    text-align: right;
    cursor: text;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .item-desc {
    width: 100%;
    margin-top: 0.35rem;
    font-size: 0.75rem;
    padding: 0.35rem 0.5rem;
    resize: vertical;
    min-height: 40px;
    height: auto;
  }

  .add-desc-btn {
    display: inline-block;
    margin-top: 0.25rem;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 0.7rem;
    cursor: pointer;
    transition: color 0.15s;
    outline: none;
  }

  .add-desc-btn:hover {
    color: var(--primary);
  }
</style>
