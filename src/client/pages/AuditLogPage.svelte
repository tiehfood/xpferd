<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import AppBadge from '../lib/components/AppBadge.svelte';
  import BadgeDot from '../lib/components/BadgeDot.svelte';
  import { t } from '../lib/i18n.js';
  import { recurringInvoiceApi } from '../lib/api/recurringInvoiceApi.js';
  import { fmtDate as formatDateStr } from '../../shared/constants/format.js';
  import { getSettings } from '../lib/settingsStore.svelte.js';

  let logs: any[] = $state([]);
  let rules: any[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let limit = $state(50);
  let allLoaded = $state(false);

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    try {
      const [logsData, rulesData] = await Promise.all([
        recurringInvoiceApi.getAllLogs(limit),
        recurringInvoiceApi.list(),
      ]);
      logs = logsData;
      rules = rulesData;
      allLoaded = logsData.length < limit;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    limit += 50;
    await load();
  }

  function getRuleName(recurringInvoiceId: number): string {
    const rule = rules.find((r: any) => r.id === recurringInvoiceId);
    return rule?.name ?? `#${recurringInvoiceId}`;
  }

  function fmtDate(d: string): string {
    return formatDateStr(d, getSettings().dateFormat);
  }

  function fmtTimestamp(ts: string): string {
    if (!ts) return '—';
    const datePart = ts.slice(0, 10);
    const timePart = ts.slice(11, 16); // HH:MM
    return `${fmtDate(datePart)} ${timePart}`;
  }
</script>

<div class="page-header">
  <div class="page-title-group">
    <h1>{t('auditlog.title')}</h1>
    <p class="subtitle">{t('auditlog.subtitle')} — {logs.length} {logs.length === 1 ? t('auditlog.rechnung') : t('auditlog.rechnung')}</p>
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

{#if loading}
  <div class="loading-card">
    <div class="loading-pulse"></div>
    <span>{t('dashboard.laden')}</span>
  </div>
{:else if logs.length === 0}
  <div class="empty-state">
    <div class="empty-illustration">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
    </div>
    <p>{t('auditlog.keine_eintraege')}</p>
  </div>
{:else}
  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th>{t('auditlog.datum')}</th>
          <th>{t('auditlog.regel')}</th>
          <th>{t('auditlog.geplant_fuer')}</th>
          <th>{t('auditlog.rechnung')}</th>
          <th>{t('auditlog.status')}</th>
        </tr>
      </thead>
      <tbody>
        {#each logs as log, i}
          <tr style="animation-delay: {i * 30}ms" class="row-enter">
            <td class="mono date-cell">{fmtTimestamp(log.generatedAt)}</td>
            <td class="rule-cell">{getRuleName(log.recurringInvoiceId)}</td>
            <td class="mono date-cell">{log.scheduledDate ? fmtDate(log.scheduledDate) : '—'}</td>
            <td>
              {#if log.invoiceId}
                <button
                  class="invoice-link"
                  onclick={() => push(`/invoices/${log.invoiceId}`)}
                >
                  {log.invoiceNumber || `#${log.invoiceId}`}
                </button>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td class="status-cell">
              {#if log.status === 'success'}
                <AppBadge variant="success" rounded>
                  <BadgeDot color="success" />
                  {t('auditlog.erfolg')}
                </AppBadge>
              {:else}
                <div class="status-error-group">
                  <AppBadge variant="danger" rounded>
                    <BadgeDot color="danger" />
                    {t('auditlog.fehler')}
                  </AppBadge>
                  {#if log.errorMessage}
                    <span class="error-message">{log.errorMessage}</span>
                  {/if}
                </div>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="load-more-row">
    {#if allLoaded}
      <span class="all-loaded">{t('auditlog.alle_geladen')}</span>
    {:else}
      <button class="ghost load-more-btn" onclick={loadMore} disabled={loading}>
        {t('auditlog.mehr_laden')}
      </button>
    {/if}
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
    margin-bottom: 1rem;
    color: var(--border-strong);
  }

  .empty-state p {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .table-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    animation: slideUp 0.3s var(--ease-out);
  }

  thead th {
    white-space: nowrap;
  }

  tbody td {
    vertical-align: top;
  }

  .date-cell {
    white-space: nowrap;
    color: var(--text-muted);
  }

  .rule-cell {
    font-weight: 500;
    color: var(--text);
  }

  .muted {
    color: var(--text-muted);
  }

  .invoice-link {
    background: none;
    border: none;
    padding: 0;
    height: auto;
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
    font-size: 0.775rem;
    color: var(--primary);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .invoice-link:hover {
    color: var(--primary-hover);
  }

  .status-cell {
    white-space: nowrap;
  }

  .status-error-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: flex-start;
  }

  .error-message {
    font-size: 0.7rem;
    color: var(--text-muted);
    max-width: 28ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .load-more-row {
    display: flex;
    justify-content: center;
    margin-top: 1.25rem;
  }

  .load-more-btn {
    font-size: 0.8125rem;
    padding: 0.5rem 1.5rem;
  }

  .all-loaded {
    font-size: 0.775rem;
    color: var(--text-muted);
  }
</style>
