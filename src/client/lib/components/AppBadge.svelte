<script lang="ts">
  let {
    variant = 'primary' as 'primary' | 'success' | 'danger' | 'amber' | 'amber-solid' | 'neutral',
    rounded = false,
    children,
    class: className = '',
  }: {
    variant?: 'primary' | 'success' | 'danger' | 'amber' | 'amber-solid' | 'neutral';
    rounded?: boolean;
    children: any;
    class?: string;
  } = $props();
</script>

<span
  class="app-badge {variant} {className}"
  class:pill={rounded}
>
  {@render children()}
</span>

<style>
  .app-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.55rem;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    border-radius: 6px;
    white-space: nowrap;
    line-height: 1.4;
  }

  .app-badge.pill {
    border-radius: 9999px;
  }

  /* ── Primary: brand red ── */
  .app-badge.primary {
    background: var(--primary-light);
    color: var(--primary);
  }

  /* ── Success: muted forest green ── */
  .app-badge.success {
    background: var(--success-bg);
    color: var(--success);
  }

  /* ── Danger: bright red for errors ── */
  .app-badge.danger {
    background: #fef2f2;
    color: var(--danger);
  }

  /* ── Amber: warm gold for warnings, §19 ── */
  .app-badge.amber {
    background: var(--amber-bg);
    color: var(--amber);
  }

  /* ── Amber solid: filled background for prominent badges (§19 UStG) ── */
  .app-badge.amber-solid {
    background: var(--amber);
    color: white;
  }

  /* ── Neutral: gray, muted, for paused/inactive states ── */
  .app-badge.neutral {
    background: var(--surface-alt);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }
</style>
