<script lang="ts">
  let {
    color = 'primary' as 'primary' | 'success' | 'danger' | 'amber' | 'neutral',
  }: {
    color?: 'primary' | 'success' | 'danger' | 'amber' | 'neutral';
  } = $props();
</script>

<span class="badge-dot {color}"></span>

<style>
  .badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .badge-dot.primary {
    background: var(--primary);
  }

  .badge-dot.success {
    background: var(--success);
  }

  .badge-dot.danger {
    background: var(--danger);
  }

  .badge-dot.amber {
    background: var(--amber);
  }

  .badge-dot.neutral {
    background: var(--text-muted);
  }
</style>
