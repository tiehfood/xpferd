<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import AppBadge from '../lib/components/AppBadge.svelte';
  import BadgeDot from '../lib/components/BadgeDot.svelte';
  import { t } from '../lib/i18n.js';
  import { fmtDate } from '../../shared/constants/format.js';
  import { getSettings } from '../lib/settingsStore.svelte.js';
  import { recurringInvoiceApi } from '../lib/api/recurringInvoiceApi.js';
  import { invoiceTemplateApi, invoiceNumberTemplateApi } from '../lib/api/templateApi.js';
  import { describeSchedule, computeOccurrences, addDays } from '../../shared/utils/recurringDates.js';
  import RecurringCalendarPreview from '../lib/components/RecurringCalendarPreview.svelte';
  import DatePicker from '../lib/components/DatePicker.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';

  // ── Page state ────────────────────────────────────────────────────────────
  let rules: any[] = $state([]);
  let invoiceTemplates: any[] = $state([]);
  let numberTemplates: any[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let successMsg = $state('');

  // ── Modal state ───────────────────────────────────────────────────────────
  let showModal = $state(false);
  let editingRule: any = $state(null); // null = creating new
  let saving = $state(false);
  let modalError = $state('');

  // ── Calendar preview state ────────────────────────────────────────────────
  let calendarOffset = $state(0);
  const CALENDAR_MONTHS = 4;

  // ── Template override badges ──────────────────────────────────────────────
  let templateDueDays: number | null = $state(null);
  let templateDeliveryDays: number | null = $state(null);

  // ── Edit form ─────────────────────────────────────────────────────────────
  let editForm = $state({
    name: '',
    invoiceTemplateId: 0,
    invoiceNumberTemplateId: undefined as number | undefined,
    frequency: 'monthly' as 'weekly' | 'biweekly' | 'monthly' | 'quarterly',
    dayOfWeek: 0,
    dayOfMonth: 1,
    monthPosition: undefined as 'first' | 'last' | undefined,
    anchorType: 'day' as 'day' | 'first' | 'last',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    hasEndDate: false,
    dueDateOffsetDays: 30,
    deliveryDateOffsetDays: 0,
    active: true,
  });

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    try {
      const [rulesData, templatesData, numberTemplatesData] = await Promise.all([
        recurringInvoiceApi.list(),
        invoiceTemplateApi.list(),
        invoiceNumberTemplateApi.list(),
      ]);
      rules = rulesData;
      invoiceTemplates = templatesData;
      numberTemplates = numberTemplatesData;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function openCreateModal() {
    editingRule = null;
    editForm = {
      name: '',
      invoiceTemplateId: invoiceTemplates[0]?.id ?? 0,
      invoiceNumberTemplateId: undefined,
      frequency: 'monthly',
      dayOfWeek: 0,
      dayOfMonth: 1,
      monthPosition: undefined,
      anchorType: 'day',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      hasEndDate: false,
      dueDateOffsetDays: 30,
      deliveryDateOffsetDays: 0,
      active: true,
    };
    templateDueDays = null;
    templateDeliveryDays = null;
    calendarOffset = 0;
    modalError = '';
    showModal = true;
    if (editForm.invoiceTemplateId) {
      autoSelectNumberTemplate(editForm.invoiceTemplateId);
    }
  }

  function openEditModal(rule: any) {
    editingRule = rule;
    // Determine anchorType
    let anchorType: 'day' | 'first' | 'last' = 'day';
    if (rule.monthPosition === 'first') anchorType = 'first';
    else if (rule.monthPosition === 'last') anchorType = 'last';

    editForm = {
      name: rule.name ?? '',
      invoiceTemplateId: rule.invoiceTemplateId ?? 0,
      invoiceNumberTemplateId: rule.invoiceNumberTemplateId,
      frequency: rule.frequency ?? 'monthly',
      dayOfWeek: rule.dayOfWeek ?? 0,
      dayOfMonth: rule.dayOfMonth ?? 1,
      monthPosition: rule.monthPosition,
      anchorType,
      startDate: rule.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: rule.endDate ?? '',
      hasEndDate: !!rule.endDate,
      dueDateOffsetDays: rule.dueDateOffsetDays ?? 30,
      deliveryDateOffsetDays: rule.deliveryDateOffsetDays ?? 0,
      active: rule.active ?? true,
    };
    templateDueDays = null;
    templateDeliveryDays = null;
    calendarOffset = 0;
    modalError = '';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingRule = null;
  }

  function buildDto() {
    const dto: any = {
      name: editForm.name,
      invoiceTemplateId: Number(editForm.invoiceTemplateId),
      invoiceNumberTemplateId: editForm.invoiceNumberTemplateId ? Number(editForm.invoiceNumberTemplateId) : undefined,
      frequency: editForm.frequency,
      startDate: editForm.startDate,
      endDate: editForm.hasEndDate && editForm.endDate ? editForm.endDate : undefined,
      dueDateOffsetDays: Number(editForm.dueDateOffsetDays),
      deliveryDateOffsetDays: Number(editForm.deliveryDateOffsetDays),
      active: editForm.active,
    };
    if (editForm.frequency === 'weekly' || editForm.frequency === 'biweekly') {
      dto.dayOfWeek = Number(editForm.dayOfWeek);
    } else {
      // monthly or quarterly
      if (editForm.anchorType === 'first') {
        dto.monthPosition = 'first';
      } else if (editForm.anchorType === 'last') {
        dto.monthPosition = 'last';
      } else {
        dto.dayOfMonth = Number(editForm.dayOfMonth);
      }
    }
    return dto;
  }

  async function handleSave() {
    if (!editForm.name.trim()) {
      modalError = t('recurring.name') + ' ist erforderlich';
      return;
    }
    if (!editForm.invoiceTemplateId) {
      modalError = t('recurring.vorlage') + ' ist erforderlich';
      return;
    }
    saving = true;
    modalError = '';
    try {
      const dto = buildDto();
      if (editingRule) {
        await recurringInvoiceApi.update(editingRule.id, dto);
        showSuccess(t('recurring.regel_aktualisiert'));
      } else {
        await recurringInvoiceApi.create(dto);
        showSuccess(t('recurring.regel_erstellt'));
      }
      closeModal();
      await load();
    } catch (e: any) {
      modalError = e.message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete(rule: any) {
    if (!confirm(t('recurring.loeschen_bestaetigen'))) return;
    try {
      await recurringInvoiceApi.delete(rule.id);
      showSuccess(t('recurring.regel_geloescht'));
      await load();
    } catch (e: any) {
      error = e.message;
    }
  }

  async function handleToggle(rule: any) {
    try {
      await recurringInvoiceApi.toggle(rule.id);
      await load();
    } catch (e: any) {
      error = e.message;
    }
  }

  async function handleGenerate(rule: any) {
    try {
      const result = await recurringInvoiceApi.generate(rule.id);
      if (result?.invoiceId) {
        showSuccess(t('recurring.rechnung_erstellt'));
        push(`/invoices/${result.invoiceId}`);
      } else {
        showSuccess(t('recurring.rechnung_erstellt'));
      }
      await load();
    } catch (e: any) {
      error = e.message;
    }
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => { successMsg = ''; }, 3000);
  }

  async function autoSelectNumberTemplate(templateId: number) {
    if (!templateId) return;
    try {
      const tpl = await invoiceTemplateApi.get(templateId);
      const data = JSON.parse(tpl.data ?? '{}');
      if (data.invNumTemplateId) {
        const exists = numberTemplates.find((nt: any) => nt.id === Number(data.invNumTemplateId));
        if (exists) {
          editForm.invoiceNumberTemplateId = Number(data.invNumTemplateId);
        }
      }
      // Extract date offsets from template if present
      templateDueDays = null;
      templateDeliveryDays = null;
      if (data.invoiceDate && data.dueDate) {
        const inv = new Date(data.invoiceDate + 'T00:00:00Z');
        const due = new Date(data.dueDate + 'T00:00:00Z');
        const diffDays = Math.round((due.getTime() - inv.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          templateDueDays = diffDays;
          editForm.dueDateOffsetDays = diffDays;
        }
      }
      if (data.invoiceDate && data.deliveryDate) {
        const inv = new Date(data.invoiceDate + 'T00:00:00Z');
        const del = new Date(data.deliveryDate + 'T00:00:00Z');
        const diffDays = Math.round((del.getTime() - inv.getTime()) / (1000 * 60 * 60 * 24));
        templateDeliveryDays = diffDays;
        editForm.deliveryDateOffsetDays = diffDays;
      }
    } catch {
      // silently ignore
    }
  }

  function computeInvoiceNumber(templateId: number | undefined, index: number): string | null {
    if (!templateId) return null;
    const tpl = numberTemplates.find((nt: any) => nt.id === Number(templateId));
    if (!tpl) return null;
    const num = String(tpl.nextNumber + index).padStart(tpl.digits, '0');
    return `${tpl.prefix}${num}`;
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '—';
    return fmtDate(dateStr, getSettings().dateFormat);
  }

  function getScheduleDescription(rule: any): string {
    return describeSchedule(
      {
        frequency: rule.frequency,
        dayOfWeek: rule.dayOfWeek,
        dayOfMonth: rule.dayOfMonth,
        monthPosition: rule.monthPosition,
        startDate: rule.startDate,
        endDate: rule.endDate,
      },
      'de',
    );
  }

  function getTemplateName(id: number): string {
    const tpl = invoiceTemplates.find((t: any) => t.id === id);
    return tpl?.name ?? `Vorlage #${id}`;
  }

  const WEEKDAY_KEYS = [
    'recurring.montag',
    'recurring.dienstag',
    'recurring.mittwoch',
    'recurring.donnerstag',
    'recurring.freitag',
    'recurring.samstag',
    'recurring.sonntag',
  ] as const;

  const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  // Compute all occurrences client-side — instant, no API call needed
  // Always compute a generous range: from today to well past the visible calendar
  let allPreviewDates = $derived.by(() => {
    if (!showModal || !editForm.startDate || !editForm.frequency) return [] as string[];

    const rule = {
      frequency: editForm.frequency,
      dayOfWeek: editForm.frequency === 'weekly' || editForm.frequency === 'biweekly' ? Number(editForm.dayOfWeek) : undefined,
      dayOfMonth: editForm.anchorType === 'day' ? Number(editForm.dayOfMonth) : undefined,
      monthPosition: editForm.anchorType === 'first' ? 'first' as const : editForm.anchorType === 'last' ? 'last' as const : undefined,
      startDate: editForm.startDate,
      endDate: editForm.hasEndDate && editForm.endDate ? editForm.endDate : undefined,
    };

    const today = new Date().toISOString().slice(0, 10);
    // Start from the later of today or startDate — no dates before the rule starts
    const fromDate = editForm.startDate > today ? editForm.startDate : today;
    // Compute dates far enough ahead: current offset + extra buffer for navigation
    const totalMonths = calendarOffset + CALENDAR_MONTHS + 12; // 12 months ahead buffer
    const toDate = addDays(today, totalMonths * 31);

    return computeOccurrences(rule, fromDate, toDate);
  });

  // Visible dates: only those within the currently displayed calendar range.
  // Uses pure YYYY-MM-DD string comparison to avoid local-vs-UTC timezone mismatch.
  let visibleDates = $derived(() => {
    const now = new Date();
    // First day of the first displayed month
    const s = new Date(now.getFullYear(), now.getMonth() + calendarOffset, 1);
    const rangeStart = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-01`;
    // Last day of the last displayed month (month indices 0..CALENDAR_MONTHS-1)
    const e = new Date(now.getFullYear(), now.getMonth() + calendarOffset + CALENDAR_MONTHS, 0);
    const rangeEnd = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
    return allPreviewDates.filter(d => {
      const ds = d.slice(0, 10);
      return ds >= rangeStart && ds <= rangeEnd;
    });
  });

  // Handle Escape key to close modal
  $effect(() => {
    if (!showModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
</script>

<!-- Page header -->
<div class="page-header">
  <div class="page-title-group">
    <h1>{t('recurring.title')}</h1>
    <p class="subtitle">{rules.length} {t('recurring.subtitle')}</p>
  </div>
  <button class="primary" onclick={openCreateModal}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    {t('recurring.neu')}
  </button>
</div>

<!-- Success banner -->
{#if successMsg}
  <div class="success-banner">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    {successMsg}
  </div>
{/if}

<!-- Error banner -->
{#if error}
  <div class="error-banner">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
    {error}
  </div>
{/if}

<!-- Loading -->
{#if loading}
  <div class="loading-card">
    <div class="loading-pulse"></div>
    <span>{t('recurring.title')}...</span>
  </div>
{:else if rules.length === 0}
  <div class="empty-state">
    <div class="empty-illustration">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    </div>
    <h2>{t('recurring.keine_regeln')}</h2>
    <button class="primary" onclick={openCreateModal}>{t('recurring.neu')}</button>
  </div>
{:else}
  <div class="rules-list">
    {#each rules as rule, i}
      <div class="rule-card" style="animation-delay: {i * 40}ms">
        <div class="rule-card-header">
          <div class="rule-card-title-group">
            <span class="rule-name">{rule.name}</span>
            {#if rule.active}
              <AppBadge variant="success" rounded>
                <BadgeDot color="success" />
                {t('recurring.aktiv')}
              </AppBadge>
            {:else}
              <AppBadge variant="neutral" rounded>
                {t('recurring.pausiert')}
              </AppBadge>
            {/if}
          </div>
          <div class="rule-meta">
            <span class="rule-schedule">{getScheduleDescription(rule)}</span>
            <span class="rule-template">{getTemplateName(rule.invoiceTemplateId)}</span>
          </div>
        </div>

        <div class="rule-card-dates">
          <div class="date-pair">
            <span class="date-label">{t('recurring.naechste_ausfuehrung')}</span>
            <span class="date-value">{formatDate(rule.nextScheduledDate)}</span>
          </div>
          <div class="date-pair">
            <span class="date-label">{t('recurring.letzte_ausfuehrung')}</span>
            <span class="date-value">{formatDate(rule.lastGeneratedDate)}</span>
          </div>
        </div>

        <div class="rule-card-actions">
          <button class="ghost" onclick={() => openEditModal(rule)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            {t('recurring.bearbeiten')}
          </button>
          <button class="ghost" onclick={() => handleToggle(rule)}>
            {#if rule.active}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
              </svg>
              {t('recurring.pausieren')}
            {:else}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              {t('recurring.aktivieren')}
            {/if}
          </button>
          <button class="ghost" onclick={() => handleGenerate(rule)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            {t('recurring.manuell_ausfuehren')}
          </button>
          <button class="danger" onclick={() => handleDelete(rule)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            {t('recurring.loeschen')}
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Create/Edit Modal -->
{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={closeModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" role="dialog" tabindex="-1" aria-label={editingRule ? t('recurring.bearbeiten') : t('recurring.neu')} onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
      <h2>{editingRule ? t('recurring.bearbeiten') : t('recurring.neu')}</h2>
      <button class="modal-close" aria-label={t('recurring.abbrechen')} onclick={closeModal}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    {#if modalError}
      <div class="modal-error">{modalError}</div>
    {/if}

    <div class="modal-body">
      <div class="modal-cols">
        <!-- Left column: form fields -->
        <div class="form-col">
          <!-- Name -->
          <div class="form-group">
            <label for="rule-name">{t('recurring.name')}</label>
            <input
              id="rule-name"
              type="text"
              bind:value={editForm.name}
              placeholder={t('recurring.name')}
            />
          </div>

          <!-- Invoice template -->
          <div class="form-group">
            <label for="rule-template">{t('recurring.vorlage')}</label>
            <FormSelect
              id="rule-template"
              bind:value={editForm.invoiceTemplateId}
              onchange={() => autoSelectNumberTemplate(Number(editForm.invoiceTemplateId))}
              items={invoiceTemplates.map(tpl => ({ value: String(tpl.id), name: tpl.name }))}
            />
          </div>

          <!-- Number template -->
          <div class="form-group">
            <label for="rule-numtpl">{t('recurring.nummernvorlage')}</label>
            <FormSelect
              id="rule-numtpl"
              bind:value={editForm.invoiceNumberTemplateId}
              placeholder={t('recurring.keine_nummernvorlage')}
              items={numberTemplates.map(ntpl => ({ value: String(ntpl.id), name: ntpl.name }))}
            />
          </div>

          <!-- Frequency -->
          <div class="form-group">
            <label for="rule-frequency">{t('recurring.haeufigkeit')}</label>
            <FormSelect
              id="rule-frequency"
              bind:value={editForm.frequency}
              items={[
                { value: 'weekly', name: t('recurring.woechentlich') },
                { value: 'biweekly', name: t('recurring.zweiwoechentlich') },
                { value: 'monthly', name: t('recurring.monatlich') },
                { value: 'quarterly', name: t('recurring.vierteljaehrlich') },
              ]}
            />
          </div>

          <!-- Timing: weekly/biweekly → weekday buttons -->
          {#if editForm.frequency === 'weekly' || editForm.frequency === 'biweekly'}
            <div class="form-group">
              <span class="form-label-text">{t('recurring.wochentag')}</span>
              <div class="weekday-picker">
                {#each WEEKDAY_SHORT as label, idx}
                  <button
                    type="button"
                    class="weekday-btn"
                    class:selected={editForm.dayOfWeek === idx}
                    onclick={() => { editForm.dayOfWeek = idx; }}
                  >
                    {label}
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <!-- monthly/quarterly → day anchor -->
            <div class="form-group">
              <span class="form-label-text">{t('recurring.zeitpunkt')}</span>
              <div class="anchor-options">
                <label class="radio-option">
                  <input
                    type="radio"
                    bind:group={editForm.anchorType}
                    value="day"
                  />
                  <span>
                    {t('recurring.am_tag')}
                    <input
                      type="number"
                      class="inline-number"
                      min="1"
                      max="31"
                      bind:value={editForm.dayOfMonth}
                      disabled={editForm.anchorType !== 'day'}
                    />
                    {t('recurring.tag_des_monats')}
                  </span>
                </label>
                <label class="radio-option">
                  <input
                    type="radio"
                    bind:group={editForm.anchorType}
                    value="first"
                  />
                  <span>{t('recurring.monatsanfang')}</span>
                </label>
                <label class="radio-option">
                  <input
                    type="radio"
                    bind:group={editForm.anchorType}
                    value="last"
                  />
                  <span>{t('recurring.monatsende')}</span>
                </label>
              </div>
            </div>
          {/if}

          <!-- Start date -->
          <div class="form-group">
            <label for="rule-start">{t('recurring.startdatum')}</label>
            <DatePicker id="rule-start" bind:value={editForm.startDate} />
          </div>

          <!-- End date (optional) -->
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={editForm.hasEndDate} />
              {t('recurring.enddatum')}
            </label>
            {#if editForm.hasEndDate}
              <div style="margin-top: 0.35rem;">
                <DatePicker id="rule-end" bind:value={editForm.endDate} />
              </div>
            {/if}
          </div>

          <!-- Due date offset -->
          <div class="form-group form-row">
            <div class="form-col-half">
              <label for="rule-due">
                {t('recurring.zahlungsziel')}
                {#if templateDueDays !== null && editForm.dueDateOffsetDays === templateDueDays}
                  <span class="template-override-badge">{t('recurring.aus_vorlage')}</span>
                {/if}
              </label>
              <div class="input-with-unit">
                <input
                  id="rule-due"
                  type="number"
                  min="0"
                  bind:value={editForm.dueDateOffsetDays}
                />
                <span class="unit-label">{t('recurring.tage')}</span>
              </div>
            </div>
            <div class="form-col-half">
              <label for="rule-delivery">
                {t('recurring.leistungsdatum_versatz')}
                {#if templateDeliveryDays !== null && editForm.deliveryDateOffsetDays === templateDeliveryDays}
                  <span class="template-override-badge">{t('recurring.aus_vorlage')}</span>
                {/if}
              </label>
              <div class="input-with-unit">
                <input
                  id="rule-delivery"
                  type="number"
                  bind:value={editForm.deliveryDateOffsetDays}
                />
                <span class="unit-label">{t('recurring.tage')}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right column: calendar preview -->
        <div class="preview-col">
          <div class="preview-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {t('recurring.kalender_vorschau')}
          </div>
          <RecurringCalendarPreview
            dates={allPreviewDates}
            months={CALENDAR_MONTHS}
            offset={calendarOffset}
            onprev={() => { if (calendarOffset > 0) calendarOffset -= CALENDAR_MONTHS; }}
            onnext={() => { calendarOffset += CALENDAR_MONTHS; }}
          />
          <div class="preview-dates-section">
            <span class="form-label-text">{t('recurring.geplante_termine')}</span>
            {#if visibleDates().length === 0}
              <p class="preview-no-dates">{t('recurring.keine_termine')}</p>
            {:else}
              <div class="preview-next-list">
                {#each visibleDates() as dt, localIdx}
                  {@const globalIdx = allPreviewDates.indexOf(dt)}
                  <div class="preview-date-row">
                    <span class="preview-idx">{globalIdx + 1}</span>
                    <span class="preview-date-chip">{formatDate(dt)}</span>
                    <span class="preview-invoice-nr">
                      {#if computeInvoiceNumber(editForm.invoiceNumberTemplateId, globalIdx)}
                        {computeInvoiceNumber(editForm.invoiceNumberTemplateId, globalIdx)}
                      {/if}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="ghost" onclick={closeModal}>{t('recurring.abbrechen')}</button>
      <button class="primary" onclick={handleSave} disabled={saving}>
        {saving ? '...' : t('recurring.speichern')}
      </button>
    </div>
    </div>
  </div>
{/if}

<style>
  /* ── Page layout ─────────────────────────────────────────────────────────── */
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

  /* ── Banners ──────────────────────────────────────────────────────────────── */
  .success-banner {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
    padding: 0.65rem 1rem;
    border-radius: var(--radius);
    font-size: 0.8125rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    animation: fadeIn 0.2s var(--ease-out);
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

  /* ── Loading / Empty ──────────────────────────────────────────────────────── */
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .empty-illustration {
    color: var(--border-strong);
  }

  .empty-state h2 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text);
  }

  /* ── Rule cards ───────────────────────────────────────────────────────────── */
  .rules-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .rule-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.1rem 1.25rem;
    animation: fadeIn 0.3s var(--ease-out) both;
    position: relative;
  }

  .rule-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--primary);
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  }

  .rule-card-header {
    margin-bottom: 0.65rem;
  }

  .rule-card-title-group {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.3rem;
    flex-wrap: wrap;
  }

  .rule-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
  }

  .rule-meta {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .rule-schedule {
    font-size: 0.8rem;
    color: var(--primary);
    font-weight: 500;
  }

  .rule-template {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .rule-card-dates {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 0.85rem;
    flex-wrap: wrap;
  }

  .date-pair {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .date-label {
    font-size: 0.675rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .date-value {
    font-size: 0.8125rem;
    color: var(--text);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .rule-card-actions {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  /* ── Modal ────────────────────────────────────────────────────────────────── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(28, 27, 24, 0.45);
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
    max-width: 880px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    animation: scaleIn 0.2s var(--ease-out);
    outline: none;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.1rem 1.4rem 0.9rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .modal-header h2 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text);
  }

  .modal-close {
    background: none;
    border: none;
    height: auto;
    cursor: pointer;
    color: var(--text-muted);
    padding: 0.25rem;
    display: flex;
    align-items: center;
    border-radius: var(--radius);
    transition: color 0.15s, background 0.15s;
    outline: none;
  }

  .modal-close:hover {
    color: var(--text);
    background: var(--bg);
  }

  .modal-error {
    background: #fef2f2;
    border-bottom: 1px solid #fecaca;
    color: var(--danger);
    padding: 0.6rem 1.4rem;
    font-size: 0.8125rem;
    flex-shrink: 0;
  }

  .modal-body {
    padding: 1.25rem 1.4rem;
    overflow-y: auto;
    flex: 1;
  }

  .modal-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.75rem;
  }

  @media (max-width: 680px) {
    .modal-cols {
      grid-template-columns: 1fr;
    }
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    padding: 0.9rem 1.4rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  /* ── Form ─────────────────────────────────────────────────────────────────── */
  /* .form-col uses global .form-group margin-bottom for spacing — no custom gap */

  .form-col-half {
    flex: 1;
  }

  .input-with-unit {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .input-with-unit input {
    flex: 1;
  }

  .unit-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .template-override-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.1rem 0.4rem;
    margin-left: 0.35rem;
    font-size: 0.55rem;
    font-weight: 700;
    color: var(--primary);
    background: var(--primary-light);
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    vertical-align: middle;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    margin: 0;
    cursor: pointer;
  }

  /* ── Weekday picker ───────────────────────────────────────────────────────── */
  .weekday-picker {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .weekday-btn {
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--radius);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    padding: 0;
  }

  .weekday-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .weekday-btn.selected {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  /* ── Anchor radio options ─────────────────────────────────────────────────── */
  .anchor-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 0.65rem 0.75rem;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.8125rem;
    color: var(--text);
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
  }


  .radio-option span {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .inline-number {
    width: 52px !important;
    padding: 0.2rem 0.35rem !important;
    text-align: center;
    display: inline-block;
  }

  /* ── Calendar preview ─────────────────────────────────────────────────────── */
  .preview-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .preview-dates-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .preview-no-dates {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: 0;
  }

  .preview-next-list {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
  }

  .preview-date-row {
    display: contents;
  }

  .preview-idx {
    font-size: 0.65rem;
    font-weight: 500;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    text-align: right;
    padding: 0.2rem 0.5rem 0.2rem 0.35rem;
    white-space: nowrap;
  }

  .preview-date-chip {
    background: rgba(166, 47, 36, 0.08);
    color: var(--primary);
    border-radius: 9999px;
    padding: 0.2rem 0.55rem;
    font-size: 0.7rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .preview-invoice-nr {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    padding: 0.2rem 0.35rem 0.2rem 0.5rem;
  }
</style>
