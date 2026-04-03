<script lang="ts">
  export interface FormSelectItem {
    value: string;
    name: string;
    disabled?: boolean;
  }

  let {
    value = $bindable<any>(undefined),
    items = [] as FormSelectItem[],
    id = '',
    disabled = false,
    required = false,
    onchange,
    placeholder = '',
    class: className = '',
  }: {
    value?: any;
    items?: FormSelectItem[];
    id?: string;
    disabled?: boolean;
    required?: boolean;
    onchange?: (e: Event) => void;
    placeholder?: string;
    class?: string;
  } = $props();

  let isOpen = $state(false);
  let highlightedIndex = $state(-1);
  let typeaheadBuffer = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | null = null;
  let dropdownStyle = $state('');

  let triggerEl = $state<HTMLButtonElement | undefined>(undefined);
  let dropdownEl = $state<HTMLElement | undefined>(undefined);

  // ── Selected label ────────────────────────────────────────────────────────

  let selectedLabel = $derived(
    items.find(i => i.value === String(value ?? ''))?.name ?? ''
  );

  let showPlaceholder = $derived(!selectedLabel);

  // ── Position computation ──────────────────────────────────────────────────

  function updateDropdownPosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const maxH = 240;

    if (spaceBelow >= maxH || spaceBelow >= spaceAbove) {
      // Open below
      dropdownStyle = `top: ${rect.bottom + 4}px; left: ${rect.left}px; width: ${rect.width}px; max-height: ${Math.min(maxH, spaceBelow - 8)}px;`;
    } else {
      // Open above
      dropdownStyle = `bottom: ${window.innerHeight - rect.top + 4}px; left: ${rect.left}px; width: ${rect.width}px; max-height: ${Math.min(maxH, spaceAbove - 8)}px;`;
    }
  }

  // ── Open / close ──────────────────────────────────────────────────────────

  function open() {
    if (disabled || items.length === 0) return;
    updateDropdownPosition();  // compute BEFORE isOpen = true
    isOpen = true;
    const idx = items.findIndex(i => i.value === String(value ?? ''));
    highlightedIndex = idx >= 0 ? idx : 0;
    requestAnimationFrame(() => scrollHighlightedIntoView());
  }

  function close() {
    isOpen = false;
    highlightedIndex = -1;
  }

  function selectItem(item: FormSelectItem) {
    if (item.disabled) return;
    value = item.value;
    if (onchange) {
      const evt = new Event('change', { bubbles: true });
      Object.defineProperty(evt, 'target', {
        value: { value: item.value },
        enumerable: true,
      });
      onchange(evt);
    }
    close();
    triggerEl?.focus();
  }

  function handleTriggerClick() {
    if (isOpen) close(); else open();
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  function handleKeydown(e: KeyboardEvent) {
    if (disabled) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) open(); else moveHighlight(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) { open(); highlightedIndex = items.length - 1; }
        else moveHighlight(-1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) open();
        else if (highlightedIndex >= 0 && items[highlightedIndex]) selectItem(items[highlightedIndex]);
        break;
      case 'Escape':
        if (isOpen) { e.stopPropagation(); close(); triggerEl?.focus(); }
        break;
      case 'Home':
        if (isOpen) { e.preventDefault(); highlightedIndex = 0; scrollHighlightedIntoView(); }
        break;
      case 'End':
        if (isOpen) { e.preventDefault(); highlightedIndex = items.length - 1; scrollHighlightedIntoView(); }
        break;
      case 'Tab':
        if (isOpen) close();
        break;
      default:
        if (e.key.length === 1) { e.preventDefault(); handleTypeahead(e.key); }
    }
  }

  function moveHighlight(delta: number) {
    if (items.length === 0) return;
    let next = highlightedIndex + delta;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    let tries = 0;
    while (items[next]?.disabled && tries < items.length) {
      next += delta;
      if (next < 0) next = items.length - 1;
      if (next >= items.length) next = 0;
      tries++;
    }
    highlightedIndex = next;
    scrollHighlightedIntoView();
  }

  function scrollHighlightedIntoView() {
    requestAnimationFrame(() => {
      if (!dropdownEl) return;
      const el = dropdownEl.querySelector(`[data-index="${highlightedIndex}"]`);
      if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    });
  }

  function handleTypeahead(char: string) {
    if (!isOpen) open();
    typeaheadBuffer += char.toLowerCase();
    if (typeaheadTimer !== null) clearTimeout(typeaheadTimer);
    typeaheadTimer = setTimeout(() => { typeaheadBuffer = ''; }, 500);
    const idx = items.findIndex(i => !i.disabled && i.name.toLowerCase().startsWith(typeaheadBuffer));
    if (idx >= 0) { highlightedIndex = idx; scrollHighlightedIntoView(); }
  }

  // ── Click outside ─────────────────────────────────────────────────────────
  function handleWindowMousedown(e: MouseEvent) {
    if (!isOpen) return;
    const target = e.target as Node;
    if (triggerEl?.contains(target)) return;
    if (dropdownEl?.contains(target)) return;
    close();
  }

  // ── Window-level listeners while open (position tracking + keyboard) ───────
  $effect(() => {
    if (isOpen) {
      const scrollHandler = () => updateDropdownPosition();
      const keyHandler = (e: KeyboardEvent) => {
        // Capture-phase: intercept all keystrokes while dropdown is open
        handleKeydown(e);
      };
      window.addEventListener('scroll', scrollHandler, true);
      window.addEventListener('resize', scrollHandler);
      window.addEventListener('keydown', keyHandler, true);
      return () => {
        window.removeEventListener('scroll', scrollHandler, true);
        window.removeEventListener('resize', scrollHandler);
        window.removeEventListener('keydown', keyHandler, true);
      };
    }
  });
</script>

<svelte:window onmousedown={handleWindowMousedown} />

<div class="form-select-wrapper {className}">
  <button
    bind:this={triggerEl}
    {id}
    type="button"
    class="form-select-trigger"
    class:open={isOpen}
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    onclick={handleTriggerClick}
  >
    <span class="form-select-label" class:is-placeholder={showPlaceholder}>
      {showPlaceholder ? placeholder : selectedLabel}
    </span>
    <svg
      class="form-select-chevron"
      class:open={isOpen}
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>
</div>

{#if isOpen}
  <div
    bind:this={dropdownEl}
    class="form-select-dropdown"
    style={dropdownStyle}
    role="listbox"
    tabindex="-1"
    onmousedown={(e) => e.preventDefault()}
  >
    {#each items as item, i}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        data-index={i}
        class="form-select-item"
        class:selected={item.value === String(value ?? '')}
        class:highlighted={i === highlightedIndex}
        class:item-disabled={item.disabled}
        role="option"
        aria-selected={item.value === String(value ?? '')}
        aria-disabled={item.disabled}
        onmousedown={(e) => { e.preventDefault(); selectItem(item); }}
        onmouseenter={() => { if (!item.disabled) highlightedIndex = i; }}
      >
        <span class="item-text">{item.name}</span>
        {#if item.value === String(value ?? '') && !showPlaceholder}
          <svg class="item-check" width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .form-select-wrapper {
    position: relative;
    display: block;
  }

  /* ── Trigger button — matches text input appearance ──────────────────── */
  .form-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    width: 100%;
    height: var(--ctrl-h);
    padding: 0 0.85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    font-size: 0.8125rem;
    font-family: var(--font-body), sans-serif;
    color: var(--text);
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
    text-align: left;
    letter-spacing: normal;
    font-weight: 400;
    box-shadow: none;
    box-sizing: border-box;
    line-height: 1.3;
  }

  .form-select-trigger:hover {
    border-color: var(--border-strong);
    transform: none;
    box-shadow: none;
    background: var(--surface);
  }

  .form-select-trigger:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: var(--shadow-focus);
  }

  .form-select-trigger.open {
    border-color: var(--primary);
    box-shadow: var(--shadow-focus);
  }

  .form-select-trigger:disabled {
    background: var(--surface-alt);
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.7;
    transform: none;
    box-shadow: none;
  }

  .form-select-trigger:active {
    transform: none;
  }

  /* ── Label text ──────────────────────────────────────────────────────── */
  .form-select-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .form-select-label.is-placeholder {
    color: var(--text-muted);
    opacity: 0.6;
  }

  /* ── Chevron ─────────────────────────────────────────────────────────── */
  .form-select-chevron {
    width: 14px;
    height: 14px;
    color: var(--text-muted);
    flex-shrink: 0;
    transition: transform 0.2s;
  }

  .form-select-chevron.open {
    transform: rotate(180deg);
  }

  /* ── Dropdown — position:fixed, rendered outside wrapper ────────────── */
  .form-select-dropdown {
    position: fixed;
    z-index: 9000;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 0.25rem 0;
    animation: scaleIn 0.1s var(--ease-out);
  }

  .form-select-dropdown:focus {
    outline: none;
  }

  /* ── Items ────────────────────────────────────────────────────────────── */
  .form-select-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.85rem;
    font-size: 0.8125rem;
    font-family: var(--font-body), sans-serif;
    color: var(--text);
    background: none;
    cursor: pointer;
    transition: background 0.1s;
    font-weight: 400;
    letter-spacing: normal;
    border: none;
    border-radius: 0;
    height: auto;
    min-height: 0;
    box-shadow: none;
    text-align: left;
    user-select: none;
  }

  .item-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .form-select-item:hover,
  .form-select-item.highlighted {
    background: var(--primary-light);
  }

  .form-select-item.selected {
    color: var(--primary);
    font-weight: 500;
  }

  .form-select-item.item-disabled {
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .form-select-item.item-disabled:hover {
    background: none;
  }

  .item-check {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--primary);
  }
</style>
