<script lang="ts">
  import { t } from '../i18n.js';

  let {
    dates = [],
    months = 4,
    offset = 0,
    onprev = () => {},
    onnext = () => {},
  }: {
    dates?: string[];
    months?: number;
    offset?: number;
    onprev?: () => void;
    onnext?: () => void;
  } = $props();

  let dateSet = $derived(new Set(dates));

  let monthGrids = $derived(buildMonthGrids(months, offset));

  let firstMonthLabel = $derived(monthGrids[0]?.monthName ?? '');
  let lastMonthLabel = $derived(monthGrids[monthGrids.length - 1]?.monthName ?? '');

  function buildMonthGrids(count: number, off: number) {
    const grids: Array<{
      year: number;
      month: number;
      monthName: string;
      cells: (number | null)[];
    }> = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + off + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();

      // Build the grid: 7 columns (Mo-Su), weeks as rows
      const firstDay = (d.getDay() + 6) % 7; // 0=Monday
      const lastDate = new Date(y, m + 1, 0).getDate();
      const cells: (number | null)[] = [];
      for (let pad = 0; pad < firstDay; pad++) cells.push(null);
      for (let day = 1; day <= lastDate; day++) cells.push(day);
      while (cells.length % 7 !== 0) cells.push(null);

      const monthName = d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      grids.push({ year: y, month: m, monthName, cells });
    }
    return grids;
  }

  function isHighlighted(year: number, month: number, day: number): boolean {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateSet.has(dateStr);
  }

  function isToday(year: number, month: number, day: number): boolean {
    const now = new Date();
    return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  }

  const DAY_HEADERS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
</script>

<div class="calendar-nav">
  <button class="ghost calendar-nav-btn" onclick={onprev} disabled={offset <= 0} aria-label={t('recurring.vorherige_monate')}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  </button>
  <span class="calendar-nav-label">{firstMonthLabel} – {lastMonthLabel}</span>
  <button class="ghost calendar-nav-btn" onclick={onnext} aria-label={t('recurring.naechste_monate')}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </button>
</div>

<div class="calendar-grid">
  {#each monthGrids as grid}
    <div class="month-block">
      <div class="month-header">{grid.monthName}</div>
      <div class="day-grid">
        {#each DAY_HEADERS as hdr}
          <div class="day-label">{hdr}</div>
        {/each}
        {#each grid.cells as cell}
          {#if cell === null}
            <div class="day-cell empty"></div>
          {:else}
            <div
              class="day-cell"
              class:highlighted={isHighlighted(grid.year, grid.month, cell)}
              class:today={isToday(grid.year, grid.month, cell)}
            >
              {cell}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .calendar-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .calendar-nav-btn {
    padding: 0.2rem 0.4rem !important;
    height: auto !important;
    min-width: 0;
    outline: none;
  }

  .calendar-nav-btn:disabled {
    opacity: 0.25;
    cursor: not-allowed;
    pointer-events: none;
  }

  .calendar-nav-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .month-block {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.65rem 0.75rem 0.75rem;
  }

  .month-header {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: capitalize;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
    letter-spacing: 0.02em;
  }

  .day-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
  }

  .day-label {
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--text-muted);
    text-align: center;
    padding: 2px 0 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .day-cell {
    font-size: 0.65rem;
    text-align: center;
    padding: 3px 1px;
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    color: var(--text);
    position: relative;
    transition: background 0.1s;
  }

  .day-cell.empty {
    visibility: hidden;
  }

  .day-cell.highlighted {
    background: var(--primary);
    color: white;
    font-weight: 600;
  }

  .day-cell.today:not(.highlighted) {
    outline: 1.5px solid var(--primary);
    color: var(--primary);
    font-weight: 600;
  }

  .day-cell.today.highlighted {
    background: var(--primary-hover);
    outline: 2px solid var(--primary-hover);
  }
</style>
