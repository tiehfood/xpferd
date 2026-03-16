<script lang="ts">
  import { router } from 'svelte-spa-router';
  import { partyApi, PartyValidationError } from '../lib/api/partyApi';
  import type { FieldErrors } from '../lib/api/partyApi';
  import { COUNTRY_CODES } from '$shared/constants';
  import { t } from '../lib/i18n.js';

  let partyType: 'seller' | 'buyer' = $state('seller');
  let parties: any[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  let editing: any = $state(null);
  let editError = $state('');
  let fieldErrors: FieldErrors = $state({});
  let saving = $state(false);

  $effect(() => {
    const val = router.location;
    partyType = val === '/buyers' ? 'buyer' : 'seller';
    load();
  });

  async function load() {
    loading = true;
    error = '';
    try {
      parties = await partyApi.list(partyType);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function startCreate() {
    editing = {
      type: partyType,
      name: '', street: '', city: '', postalCode: '', countryCode: 'DE',
      vatId: '', taxNumber: '', contactName: '', contactPhone: '', contactEmail: '', email: '',
    };
    editError = '';
    fieldErrors = {};
    plzError = '';
    citySuggestion = '';
  }

  function startEdit(party: any) {
    editing = { ...party };
    editError = '';
    fieldErrors = {};
    plzError = '';
    citySuggestion = '';
  }

  function cancelEdit() {
    editing = null;
    editError = '';
    fieldErrors = {};
    plzError = '';
    citySuggestion = '';
  }

  async function saveParty() {
    saving = true;
    editError = '';
    fieldErrors = {};
    try {
      if (editing.id) {
        await partyApi.update(editing.id, editing);
      } else {
        await partyApi.create(editing);
      }
      editing = null;
      await load();
    } catch (e: any) {
      if (e instanceof PartyValidationError) {
        fieldErrors = e.fieldErrors;
      }
      editError = e.message;
    } finally {
      saving = false;
    }
  }

  function clearFieldError(field: string) {
    if (fieldErrors[field]) {
      const next = { ...fieldErrors };
      delete next[field];
      fieldErrors = next;
    }
  }

  async function handleDelete(id: number) {
    const label = partyType === 'seller' ? t('sidebar.verkaeufer') : t('sidebar.kaeufer');
    if (!confirm(`${label} ${t('parties.confirm_loeschen')}`)) return;
    try {
      await partyApi.delete(id);
      await load();
    } catch (e: any) {
      error = e.message;
    }
  }

  let isSeller = $derived(partyType === 'seller');
  let title = $derived(isSeller ? 'Verkäufer' : 'Käufer');

  // PLZ validation + city lookup
  let plzError = $state('');
  let citySuggestion = $state('');

  function validatePlz(plz: string, country: string) {
    if (country === 'DE' && plz.length > 0 && !/^\d{5}$/.test(plz)) {
      plzError = t('parties.plz_fehler');
    } else {
      plzError = '';
    }
  }

  async function lookupCity(plz: string, country: string) {
    citySuggestion = '';
    if (country !== 'DE' || !/^\d{5}$/.test(plz)) return;
    try {
      const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`);
      if (!res.ok) return;
      const data = JSON.parse(await res.text());
      if (data.length > 0) {
        const city = data[0].name;
        if (editing && !editing.city) {
          editing.city = city;
        } else if (editing && editing.city !== city) {
          citySuggestion = city;
        }
      }
    } catch {
      // Network error — ignore silently
    }
  }

  function handlePlzInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (editing) {
      editing.postalCode = input.value;
      validatePlz(input.value, editing.countryCode);
      if (/^\d{5}$/.test(input.value) && editing.countryCode === 'DE') {
        lookupCity(input.value, editing.countryCode);
      }
    }
  }

  function applyCitySuggestion() {
    if (editing && citySuggestion) {
      editing.city = citySuggestion;
      citySuggestion = '';
    }
  }
</script>

<div class="page-header">
  <div class="page-title-group">
    <h1>{title}</h1>
    <p class="subtitle">{parties.length} {title} {t('parties.gespeichert')}</p>
  </div>
  <button class="primary" onclick={startCreate}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    {title} {t('parties.anlegen')}
  </button>
</div>

{#if error}
  <div class="error-banner">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
    {error}
  </div>
{/if}

<!-- Edit/Create Modal -->
{#if editing}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={cancelEdit}>
    <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>{editing.id ? `${title} ${t('parties.bearbeiten_modal')}` : `${t('parties.neuen_anlegen').replace('{title}', title)}`}</h2>
        <button class="modal-close" onclick={cancelEdit} aria-label={t('parties.schliessen')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {#if editError}
        <div class="error-banner modal-error">{editError}</div>
      {/if}

      <div class="modal-body">
        <div class="form-row">
          <div class="form-group" style="grid-column: span 2;">
            <label for="edit-name">{t('parties.name_firma')} <span class="required">*</span></label>
            <input id="edit-name" bind:value={editing.name} placeholder={t('parties.name_firma_placeholder')}
              class:field-invalid={fieldErrors['name']} oninput={() => clearFieldError('name')} />
            {#if fieldErrors['name']}<span class="field-error">{fieldErrors['name']}</span>{/if}
          </div>
          <div class="form-group">
            <label for="edit-vatId">{t('parties.ust_idnr')}</label>
            <input id="edit-vatId" bind:value={editing.vatId} placeholder={t('parties.ust_idnr_placeholder')} />
          </div>
          {#if isSeller}
            <div class="form-group">
              <label for="edit-taxNumber">{t('parties.steuernummer')}</label>
              <input id="edit-taxNumber" bind:value={editing.taxNumber} placeholder={t('parties.steuernummer_placeholder')} />
            </div>
          {/if}
        </div>

        <div class="form-row">
          <div class="form-group" style="grid-column: span 2;">
            <label for="edit-street">{t('parties.strasse')} <span class="required">*</span></label>
            <input id="edit-street" bind:value={editing.street} placeholder={t('parties.strasse_placeholder')}
              class:field-invalid={fieldErrors['street']} oninput={() => clearFieldError('street')} />
            {#if fieldErrors['street']}<span class="field-error">{fieldErrors['street']}</span>{/if}
          </div>
          <div class="form-group">
            <label for="edit-postalCode">{t('parties.plz')} <span class="required">*</span></label>
            <input id="edit-postalCode" value={editing.postalCode} oninput={(e) => { handlePlzInput(e); clearFieldError('postalCode'); }}
              placeholder={t('parties.plz_placeholder')} maxlength={editing.countryCode === 'DE' ? 5 : undefined}
              pattern={editing.countryCode === 'DE' ? '[0-9]{5}' : undefined}
              class:field-invalid={fieldErrors['postalCode'] || plzError} />
            {#if fieldErrors['postalCode']}<span class="field-error">{fieldErrors['postalCode']}</span>
            {:else if plzError}<span class="field-error">{plzError}</span>{/if}
          </div>
          <div class="form-group">
            <label for="edit-city">{t('parties.ort')} <span class="required">*</span></label>
            <input id="edit-city" bind:value={editing.city} placeholder={t('parties.ort_placeholder')}
              class:field-invalid={fieldErrors['city']} oninput={() => clearFieldError('city')} />
            {#if fieldErrors['city']}<span class="field-error">{fieldErrors['city']}</span>{/if}
            {#if citySuggestion}
              <button type="button" class="city-suggestion" onclick={applyCitySuggestion}>
                {t('parties.meinten_sie')} {citySuggestion}?
              </button>
            {/if}
          </div>
          <div class="form-group">
            <label for="edit-country">{t('parties.land')} <span class="required">*</span></label>
            <select id="edit-country" bind:value={editing.countryCode}>
              {#each Object.entries(COUNTRY_CODES) as [code]}
                <option value={code}>{code} — {t(('code.country.' + code) as any)}</option>
              {/each}
            </select>
          </div>
        </div>

        {#if isSeller}
          <div class="section-divider">{t('parties.ansprechpartner')}</div>
          <div class="form-row">
            <div class="form-group">
              <label for="edit-contactName">{t('parties.contact_name')} <span class="required">*</span></label>
              <input id="edit-contactName" bind:value={editing.contactName} placeholder={t('parties.contact_name_placeholder')}
                class:field-invalid={fieldErrors['contactName']} oninput={() => clearFieldError('contactName')} />
              {#if fieldErrors['contactName']}<span class="field-error">{fieldErrors['contactName']}</span>{/if}
            </div>
            <div class="form-group">
              <label for="edit-contactPhone">{t('parties.contact_phone')} <span class="required">*</span></label>
              <input id="edit-contactPhone" bind:value={editing.contactPhone} placeholder={t('parties.contact_phone_placeholder')}
                class:field-invalid={fieldErrors['contactPhone']} oninput={() => clearFieldError('contactPhone')} />
              {#if fieldErrors['contactPhone']}<span class="field-error">{fieldErrors['contactPhone']}</span>{/if}
            </div>
            <div class="form-group">
              <label for="edit-contactEmail">{t('parties.contact_email')} <span class="required">*</span></label>
              <input id="edit-contactEmail" type="email" bind:value={editing.contactEmail} placeholder={t('parties.contact_email_placeholder')}
                class:field-invalid={fieldErrors['contactEmail']} oninput={() => clearFieldError('contactEmail')} />
              {#if fieldErrors['contactEmail']}<span class="field-error">{fieldErrors['contactEmail']}</span>{/if}
            </div>
          </div>
        {:else}
          <div class="form-row">
            <div class="form-group">
              <label for="edit-email">{t('parties.email')} <span class="required">*</span></label>
              <input id="edit-email" type="email" bind:value={editing.email} placeholder={t('parties.email_placeholder')}
                class:field-invalid={fieldErrors['email']} oninput={() => clearFieldError('email')} />
              {#if fieldErrors['email']}<span class="field-error">{fieldErrors['email']}</span>{/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="ghost" onclick={cancelEdit}>{t('parties.abbrechen')}</button>
        <button class="primary" onclick={saveParty} disabled={saving}>
          {#if saving}
            <span class="save-spinner"></span>
            {t('parties.speichern_laufend')}
          {:else}
            {t('parties.speichern')}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Party List -->
{#if loading}
  <div class="loading-card">
    <div class="loading-pulse"></div>
    <span>{title} {t('parties.laden')}</span>
  </div>
{:else if parties.length === 0}
  <div class="empty-state">
    <div class="empty-illustration">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </div>
    <h2>{t('parties.noch_keine')} {title} {t('parties.gespeichert')}</h2>
    <p>{t('parties.noch_keine_text').replace('{title}', title)}</p>
    <button class="primary" onclick={startCreate}>{t('parties.ersten_anlegen').replace('{title}', title)}</button>
  </div>
{:else}
  <div class="parties-grid">
    {#each parties as p, i}
      <div class="party-card" style="animation-delay: {i * 40}ms">
        <div class="party-card-top">
          <div class="party-avatar">
            {p.name.charAt(0).toUpperCase()}
          </div>
          <div class="party-info">
            <div class="party-name">{p.name}</div>
            <div class="party-address">
              {p.street}, {p.postalCode} {p.city}
            </div>
          </div>
        </div>
        <div class="party-meta">
          {#if p.vatId}
            <span class="meta-tag">USt-IdNr. {p.vatId}</span>
          {/if}
          {#if isSeller && p.contactName}
            <span class="meta-tag">{p.contactName}</span>
          {/if}
          {#if !isSeller && p.email}
            <span class="meta-tag">{p.email}</span>
          {/if}
        </div>
        <div class="party-actions">
          <button class="ghost" onclick={() => startEdit(p)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            {t('parties.bearbeiten')}
          </button>
          <button class="danger" onclick={() => handleDelete(p.id)}>{t('parties.loeschen')}</button>
        </div>
      </div>
    {/each}
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

  .modal-error {
    margin: 0.85rem 1.35rem 0;
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

  @keyframes spin {
    to { transform: rotate(360deg); }
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
    margin-bottom: 1.25rem;
    color: var(--border-strong);
  }

  .empty-state h2 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.4rem;
  }

  .empty-state p {
    color: var(--text-muted);
    font-size: 0.875rem;
    margin-bottom: 1.5rem;
  }

  /* --- Party Cards --- */
  .parties-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 0.85rem;
  }

  .party-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.15rem 1.35rem;
    transition: all 0.2s var(--ease-out);
    animation: slideUp 0.3s var(--ease-out) both;
  }

  .party-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow);
  }

  .party-card-top {
    display: flex;
    gap: 0.85rem;
    align-items: flex-start;
    margin-bottom: 0.65rem;
  }

  .party-avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    background: var(--primary-light);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.875rem;
    font-family: var(--font-display), sans-serif;
    flex-shrink: 0;
  }

  .party-info {
    min-width: 0;
    flex: 1;
  }

  .party-name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .party-address {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin-top: 0.15rem;
  }

  .party-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }

  .meta-tag {
    font-size: 0.7rem;
    color: var(--text-muted);
    background: var(--surface-alt);
    border: 1px solid var(--border);
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius);
  }

  .party-actions {
    display: flex;
    gap: 0.35rem;
    padding-top: 0.65rem;
    border-top: 1px solid var(--border);
  }

  .party-actions button {
    padding: 0.3rem 0.65rem;
    font-size: 0.75rem;
  }

  /* --- Modal --- */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(28,27,24,0.45);
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
    max-width: 640px;
    max-height: 90vh;
    overflow-y: auto;
    animation: scaleIn 0.2s var(--ease-out);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.15rem 1.35rem 0.85rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    font-family: var(--font-display), sans-serif;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .modal-close {
    background: none;
    border: none;
    padding: 0.3rem;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius);
    transition: all 0.12s;
  }

  .modal-close:hover {
    background: var(--surface-alt);
    color: var(--text);
  }

  .modal-body {
    padding: 1.35rem;
  }

  .section-divider {
    font-family: var(--font-display), sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin: 0.85rem 0 0.6rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .section-divider::before {
    content: '';
    width: 3px;
    height: 12px;
    background: var(--amber);
    border-radius: 2px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    padding: 0.85rem 1.35rem 1.15rem;
    border-top: 1px solid var(--border);
  }

  .save-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    display: inline-block;
  }

  .required {
    color: var(--danger);
    font-weight: 700;
  }

  .field-error {
    display: block;
    font-size: 0.75rem;
    color: var(--danger);
    margin-top: 0.2rem;
  }

  :global(.field-invalid) {
    border-color: var(--danger) !important;
    box-shadow: 0 0 0 3px rgba(242, 76, 61, 0.08) !important;
  }

  .city-suggestion {
    display: inline-block;
    font-size: 0.75rem;
    color: var(--primary);
    background: none;
    border: none;
    padding: 0.15rem 0;
    margin-top: 0.2rem;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
  }

  .city-suggestion:hover {
    color: var(--primary-hover);
    text-decoration-style: solid;
  }
</style>
