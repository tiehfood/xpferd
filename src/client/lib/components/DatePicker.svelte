<script lang="ts">
  import Datepicker from 'flowbite-svelte/Datepicker.svelte';
  import { getSettings } from '../settingsStore.svelte.js';

  let {
    value = $bindable(''),
    id = '',
    required = false,
    disabled = false,
    placeholder = '',
  }: {
    value: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
  } = $props();

  // ── String ↔ Date helpers ─────────────────────────────────────────────────

  function parseDate(str: string): Date | undefined {
    if (!str) return undefined;
    const [y, m, d] = str.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  }

  function formatDateStr(date: Date | undefined): string {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ── Internal state ────────────────────────────────────────────────────────

  let dateValue: Date | undefined = $state(parseDate(value));

  // When the external string value changes (e.g. parent sets a new date),
  // update the internal Date. Guard prevents infinite loop.
  $effect(() => {
    const v = value;
    if (formatDateStr(dateValue) !== v) {
      dateValue = parseDate(v);
    }
  });

  // ── Intl date format (zero-padded, locale controls separator + order) ───
  const intlDateFormat: Intl.DateTimeFormatOptions = {
    day: '2-digit', month: '2-digit', year: 'numeric',
  };

  // ── Event handler ─────────────────────────────────────────────────────────

  function handleSelect(date: Date | { from?: Date; to?: Date }) {
    if (date instanceof Date) {
      dateValue = date;
      value = formatDateStr(date);
    }
  }
</script>

<Datepicker
  bind:value={dateValue}
  locale={getSettings().locale}
  dateFormat={intlDateFormat}
  firstDayOfWeek={1}
  autohide
  color="primary"
  inputClass="!rounded-[10px] !bg-white !border-gray-200 !px-[0.85rem] !py-[0.6rem] !text-[0.8125rem] !h-[2.375rem]"
  {placeholder}
  {disabled}
  {required}
  onselect={handleSelect}
/>
