<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { importApi } from '../lib/api/importApi.js';
  import { t } from '../lib/i18n.js';
  import { fmtCurrency, fmtDate } from '../../shared/constants/format.js';
  import { getSettings } from '../lib/settingsStore.svelte.js';

  let xmlContent = $state('');
  let fileName = $state('');
  let loading = $state(false);
  let error = $state('');
  let preview: any = $state(null);
  let warnings: string[] = $state([]);
  let dragOver = $state(false);

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    readFile(file);
  }

  function readFile(file: File) {
    fileName = file.name;
    error = '';
    preview = null;
    warnings = [];
    const reader = new FileReader();
    reader.onload = () => {
      xmlContent = reader.result as string;
    };
    reader.onerror = () => {
      error = t('import.datei_fehler');
    };
    reader.readAsText(file);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith('.xml') || file.type === 'text/xml' || file.type === 'application/xml')) {
      readFile(file);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  async function handlePreview() {
    if (!xmlContent.trim()) {
      error = t('import.keine_datei');
      return;
    }
    loading = true;
    error = '';
    preview = null;
    warnings = [];
    try {
      const result = await importApi.preview(xmlContent);
      preview = result.invoice;
      warnings = result.warnings ?? [];
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function handleImport() {
    if (!preview) return;
    sessionStorage.setItem('import-invoice', JSON.stringify(preview));
    push('/invoices/new');
  }
</script>

<div class="page-header">
  <div>
    <h1>{t('import.title')}</h1>
    <p class="subtitle">{t('import.subtitle')}</p>
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

<div class="import-layout">
  <div class="card upload-card">
    <div class="card-header">{t('import.datei_waehlen')}</div>

    <div
      class="drop-zone"
      role="button"
      tabindex="0"
      aria-label={t('import.datei_waehlen')}
      class:drag-over={dragOver}
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      onclick={() => document.getElementById('xml-file-input')?.click()}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('xml-file-input')?.click(); } }}
    >
      <input id="xml-file-input" type="file" accept=".xml,text/xml,application/xml" onchange={handleFileSelect} style="display:none" />
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="upload-icon">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      {#if fileName}
        <span class="file-name">{fileName}</span>
      {:else}
        <span class="drop-text">{t('import.drop_text')}</span>
        <span class="drop-hint">{t('import.drop_hint')}</span>
      {/if}
    </div>

    <div class="divider-with-text">
      <span>{t('import.oder_einfuegen')}</span>
    </div>

    <textarea
      class="xml-input"
      rows="8"
      bind:value={xmlContent}
      placeholder='<?xml version="1.0" ...?>'
    ></textarea>

    <div class="action-row">
      <button class="primary" onclick={handlePreview} disabled={loading || !xmlContent.trim()}>
        {#if loading}
          <span class="spinner"></span>
          {t('import.wird_analysiert')}
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          {t('import.vorschau')}
        {/if}
      </button>
    </div>
  </div>

  {#if preview}
    <div class="card preview-card">
      <div class="card-header">{t('import.vorschau')}</div>

      {#if warnings.length > 0}
        <div class="warnings-section">
          <div class="warnings-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {warnings.length} {warnings.length === 1 ? t('import.hinweis') : t('import.hinweise')}
          </div>
          <ul class="warnings-list">
            {#each warnings as w}
              <li>{w}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="preview-grid">
        <div class="preview-item">
          <span class="preview-label">{t('import.rechnungsnr')}</span>
          <span class="preview-value">{preview.invoiceNumber || '—'}</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">{t('import.datum')}</span>
          <span class="preview-value">{preview.invoiceDate ? fmtDate(preview.invoiceDate, getSettings().dateFormat) : '—'}</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">{t('import.verkaeufer')}</span>
          <span class="preview-value">{preview.seller?.name || '—'}</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">{t('import.kaeufer')}</span>
          <span class="preview-value">{preview.buyer?.name || '—'}</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">{t('import.positionen')}</span>
          <span class="preview-value">{preview.lines?.length ?? 0}</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">{t('import.bruttobetrag')}</span>
          <span class="preview-value mono">{fmtCurrency(preview.totalGrossAmount ?? 0, preview.currencyCode ?? 'EUR', getSettings().numberFormat)}</span>
        </div>
        {#if preview.note}
          <div class="preview-item full-width">
            <span class="preview-label">{t('import.bemerkung')}</span>
            <span class="preview-value">{preview.note}</span>
          </div>
        {/if}
      </div>

      {#if preview.lines && preview.lines.length > 0}
        <div class="preview-lines">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('import.bezeichnung')}</th>
                <th class="text-right">{t('import.menge')}</th>
                <th class="text-right">{t('import.einzelpreis')}</th>
                <th class="text-right">{t('import.gesamt')}</th>
              </tr>
            </thead>
            <tbody>
              {#each preview.lines as line}
                {@const unitKey = ('code.unit.' + line.unitCode)}
                {@const unitLabel = t(unitKey as any)}
                <tr>
                  <td class="mono">{line.lineNumber}</td>
                  <td>{line.itemName}{#if line.itemDescription}<br/><span class="line-desc">{line.itemDescription}</span>{/if}</td>
                  <td class="text-right mono">{line.quantity} {unitLabel.startsWith('code.unit.') ? line.unitCode : unitLabel}</td>
                  <td class="text-right mono">{fmtCurrency(line.netPrice, preview.currencyCode ?? 'EUR', getSettings().numberFormat)}</td>
                  <td class="text-right mono">{fmtCurrency(line.lineNetAmount, preview.currencyCode ?? 'EUR', getSettings().numberFormat)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="action-row">
        <button class="primary import-btn" onclick={handleImport}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {t('import.importieren')}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .page-header {
    margin-bottom: 1.5rem;
  }

  .page-header h1 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.65rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.2;
  }

  .subtitle {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
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

  .import-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    align-items: start;
  }

  @media (max-width: 900px) {
    .import-layout {
      grid-template-columns: 1fr;
    }
  }

  .preview-card {
    animation: slideUp 0.2s var(--ease-out);
  }

  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem 1.5rem;
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    text-align: center;
    outline: none;
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: var(--primary);
    background: rgba(166, 47, 36, 0.03);
  }

  .upload-icon {
    color: var(--text-muted);
    opacity: 0.5;
  }

  .drop-text {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .drop-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    opacity: 0.7;
  }

  .file-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--primary);
  }

  .divider-with-text {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1rem 0;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .divider-with-text::before,
  .divider-with-text::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--border);
  }

  .xml-input {
    width: 100%;
    font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
    font-size: 0.75rem;
    resize: vertical;
  }

  .action-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
    gap: 0.5rem;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .preview-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .preview-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .preview-item.full-width {
    grid-column: 1 / -1;
  }

  .preview-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .preview-value {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .mono {
    font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  }

  .preview-lines {
    overflow-x: auto;
    margin: 0 -1.35rem;
    padding: 0 1.35rem;
  }

  .preview-lines table {
    width: 100%;
    font-size: 0.8rem;
    border-collapse: collapse;
  }

  .preview-lines th {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
    text-align: left;
  }

  .preview-lines td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .text-right {
    text-align: right;
  }

  .line-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .import-btn {
    padding: 0.55rem 1.5rem;
  }

  .warnings-section {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    animation: fadeIn 0.2s var(--ease-out);
  }

  .warnings-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #92400e;
    margin-bottom: 0.4rem;
  }

  .warnings-header svg {
    color: #d97706;
    flex-shrink: 0;
  }

  .warnings-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .warnings-list li {
    font-size: 0.75rem;
    color: #92400e;
    padding-left: 1.25rem;
    position: relative;
  }

  .warnings-list li::before {
    content: '•';
    position: absolute;
    left: 0.35rem;
    color: #d97706;
  }
</style>
