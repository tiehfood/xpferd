<script lang="ts">
  import { onMount } from 'svelte';
  import { partyApi } from '../api/partyApi';
  import { t } from '../i18n.js';
  import FormSelect from './FormSelect.svelte';

  let { title, party = $bindable(), isSeller }: { title: string; party: any; isSeller: boolean } = $props();

  let savedParties: any[] = $state([]);
  let selectedPartyId = $state('');
  let loaded = $state(false);

  onMount(async () => {
    try {
      savedParties = await partyApi.list(isSeller ? 'seller' : 'buyer');
    } catch {
      // silently ignore
    }
    loaded = true;

    // If party already has data (editing existing invoice), try to match
    if (party.name) {
      const match = savedParties.find((p: any) =>
        p.name === party.name && p.city === party.city
      );
      if (match) {
        selectedPartyId = String(match.id);
      }
    }
  });

  // Re-match selectedPartyId when party data changes (e.g. template applied)
  $effect(() => {
    const name = party.name;
    const city = party.city;
    if (!name || savedParties.length === 0) return;
    const match = savedParties.find((p: any) =>
      p.name === name && p.city === city
    );
    if (match) {
      selectedPartyId = String(match.id);
    }
  });

  function handlePartySelect() {
    if (!selectedPartyId) {
      // Clear party fields when deselected
      party.name = '';
      party.street = '';
      party.city = '';
      party.postalCode = '';
      party.countryCode = 'DE';
      party.vatId = '';
      if (isSeller) {
        party.taxNumber = '';
        party.contactName = '';
        party.contactPhone = '';
        party.contactEmail = '';
      } else {
        party.email = '';
      }
      return;
    }
    const found = savedParties.find((p: any) => String(p.id) === selectedPartyId);
    if (!found) return;

    party.name = found.name;
    party.street = found.street;
    party.city = found.city;
    party.postalCode = found.postalCode;
    party.countryCode = found.countryCode;
    party.vatId = found.vatId ?? '';

    if (isSeller) {
      party.taxNumber = found.taxNumber ?? '';
      party.contactName = found.contactName ?? '';
      party.contactPhone = found.contactPhone ?? '';
      party.contactEmail = found.contactEmail ?? '';
    } else {
      party.email = found.email ?? '';
    }
  }

  let selectedParty = $derived(savedParties.find((p: any) => String(p.id) === selectedPartyId));
</script>

<div class="card party-card">
  <div class="card-header">{title} <span class="required">*</span></div>

  {#if !loaded}
    <div class="loading-state">
      <div class="loading-pulse"></div>
      <span>{t('party.laden')}</span>
    </div>
  {:else if savedParties.length === 0}
    <div class="empty-hint">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div>
        <p>Keine {title} gespeichert.</p>
        <p class="hint-sub">Erstelle zuerst einen {title} unter dem Menüpunkt „{title}".</p>
      </div>
    </div>
  {:else}
    <div class="party-selector">
      <label for="{title}-select">{title} {t('party.auswaehlen').replace('{title}', '')} <span class="required">*</span></label>
      <FormSelect
        id="{title}-select"
        bind:value={selectedPartyId}
        onchange={handlePartySelect}
        placeholder={t('party.bitte_waehlen')}
        items={savedParties.map(sp => ({ value: String(sp.id), name: `${sp.name} (${sp.city})` }))}
      />
    </div>

    {#if selectedParty}
      <div class="party-details">
        <div class="detail-row">
          <span class="detail-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </span>
          <div>
            <span class="detail-name">{selectedParty.name}</span>
          </div>
        </div>
        <div class="detail-row">
          <span class="detail-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </span>
          <div>
            <span class="detail-value">{selectedParty.street}</span>
            <span class="detail-value">{selectedParty.postalCode} {selectedParty.city}, {selectedParty.countryCode}</span>
          </div>
        </div>
        {#if selectedParty.vatId}
          <div class="detail-row">
            <span class="detail-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="2" y1="7" x2="22" y2="7"/>
              </svg>
            </span>
            <span class="detail-value">{t('party.ust_idnr')} {selectedParty.vatId}</span>
          </div>
        {/if}
        {#if isSeller && selectedParty.taxNumber}
          <div class="detail-row">
            <span class="detail-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="2" y1="7" x2="22" y2="7"/>
              </svg>
            </span>
            <span class="detail-value">{t('party.steuernr')} {selectedParty.taxNumber}</span>
          </div>
        {/if}
        {#if isSeller && selectedParty.contactName}
          <div class="detail-row">
            <span class="detail-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3"/>
              </svg>
            </span>
            <span class="detail-value">
              {selectedParty.contactName}
              {#if selectedParty.contactEmail} · {selectedParty.contactEmail}{/if}
              {#if selectedParty.contactPhone} · {selectedParty.contactPhone}{/if}
            </span>
          </div>
        {/if}
        {#if !isSeller && selectedParty.email}
          <div class="detail-row">
            <span class="detail-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
              </svg>
            </span>
            <span class="detail-value">{selectedParty.email}</span>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .required {
    color: var(--danger);
    font-weight: 700;
  }

  .loading-state {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: var(--text-muted);
    font-size: 0.8125rem;
    padding: 1rem 0;
  }

  .loading-pulse {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }


  .empty-hint {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    padding: 1.25rem 0.75rem;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .empty-hint svg {
    flex-shrink: 0;
    margin-top: 0.1rem;
    opacity: 0.5;
  }

  .hint-sub {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    opacity: 0.75;
  }

  .party-selector {
    margin-bottom: 0.85rem;
  }

  .party-details {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    border-radius: var(--radius);
    padding: 0.65rem 0.85rem;
    animation: fadeIn 0.2s var(--ease-out);
  }

  .detail-row {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.3rem 0;
    font-size: 0.8125rem;
  }

  .detail-row + .detail-row {
    border-top: 1px solid var(--border);
  }

  .detail-icon {
    flex-shrink: 0;
    color: var(--text-muted);
    opacity: 0.5;
    margin-top: 0.15rem;
  }

  .detail-row div {
    display: flex;
    flex-direction: column;
  }

  .detail-name {
    font-weight: 600;
    color: var(--text);
  }

  .detail-value {
    color: var(--text-secondary);
    font-size: 0.8rem;
  }
</style>
