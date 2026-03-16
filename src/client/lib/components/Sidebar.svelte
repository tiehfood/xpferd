<script lang="ts">
  import { push, router } from 'svelte-spa-router';
  import '../../../shared/constants/version';
  import { t } from '../i18n.js';

  let currentPath = $derived(router.location);

  function isActive(path: string): boolean {
    if (path === '/') return currentPath === '/' || currentPath === '';
    // template sub-routes: exact match only (they don't have further sub-routes)
    if (path.startsWith('/templates/')) return currentPath === path;
    // other routes: match self + sub-paths
    return currentPath === path || currentPath.startsWith(path + '/');
  }

  function navigate(e: MouseEvent, path: string) {
    e.preventDefault();
    push(path);
  }
</script>

<aside class="sidebar">
  <div class="sidebar-top">
    <a href="#/" class="brand" onclick={(e) => navigate(e, '/')}>
      <span class="brand-logo">
        <img src="/icons/icon1.svg" alt="X(P)FeRD" width="34" height="34" style="display:block; border-radius: 8px;" />
      </span>
      <div class="brand-name">
        <span class="brand-text">X(P)FeRD</span>
      </div>
    </a>

    <button class="new-btn" onclick={() => push('/invoices/new')}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      {t('sidebar.neue_rechnung')}
    </button>
  </div>

  <nav class="sidebar-nav">
    <div class="nav-group">
      <span class="nav-label">{t('sidebar.haupt')}</span>
      <a
        href="#/"
        class="nav-link"
        class:active={isActive('/')}
        onclick={(e) => navigate(e, '/')}
      >
        <span class="nav-indicator"></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        {t('sidebar.rechnungen')}
      </a>
      <a
        href="#/pdf-templates"
        class="nav-link"
        class:active={isActive('/pdf-templates')}
        onclick={(e) => navigate(e, '/pdf-templates')}
      >
        <span class="nav-indicator"></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <rect x="7" y="7" width="3" height="9"/>
          <rect x="14" y="7" width="3" height="5"/>
        </svg>
        {t('sidebar.pdf_designer')}
      </a>
    </div>

    <div class="nav-group">
      <span class="nav-label">{t('sidebar.stammdaten')}</span>
      <a
        href="#/sellers"
        class="nav-link"
        class:active={isActive('/sellers')}
        onclick={(e) => navigate(e, '/sellers')}
      >
        <span class="nav-indicator"></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
        {t('sidebar.verkaeufer')}
      </a>
      <a
        href="#/buyers"
        class="nav-link"
        class:active={isActive('/buyers')}
        onclick={(e) => navigate(e, '/buyers')}
      >
        <span class="nav-indicator"></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        {t('sidebar.kaeufer')}
      </a>
      <a
        href="#/templates/invoices"
        class="nav-link"
        class:active={isActive('/templates/invoices')}
        onclick={(e) => navigate(e, '/templates/invoices')}
      >
        <span class="nav-indicator"></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <polyline points="9 15 12 18 15 15"/>
          <line x1="12" y1="11" x2="12" y2="18"/>
        </svg>
        {t('sidebar.rechnungsvorlagen')}
      </a>
      <a
        href="#/templates/line-items"
        class="nav-link"
        class:active={isActive('/templates/line-items')}
        onclick={(e) => navigate(e, '/templates/line-items')}
      >
        <span class="nav-indicator"></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        {t('sidebar.positionen')}
      </a>
      <a
        href="#/templates/payments"
        class="nav-link"
        class:active={isActive('/templates/payments')}
        onclick={(e) => navigate(e, '/templates/payments')}
      >
        <span class="nav-indicator"></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        {t('sidebar.zahlungsarten')}
      </a>
      <a
        href="#/templates/numbers"
        class="nav-link"
        class:active={isActive('/templates/numbers')}
        onclick={(e) => navigate(e, '/templates/numbers')}
      >
        <span class="nav-indicator"></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="9" x2="20" y2="9"/>
          <line x1="4" y1="15" x2="20" y2="15"/>
          <line x1="10" y1="3" x2="8" y2="21"/>
          <line x1="16" y1="3" x2="14" y2="21"/>
        </svg>
        {t('sidebar.nummernvorlagen')}
      </a>
    </div>
  </nav>

  <div class="sidebar-footer">
    <a
      href="#/settings"
      class="nav-link footer-settings-link"
      class:active={isActive('/settings')}
      onclick={(e) => navigate(e, '/settings')}
    >
      <span class="nav-indicator"></span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      {t('sidebar.einstellungen')}
    </a>
    <div class="footer-divider"></div>
    {#if VERSION !== 'dev'}
      <a href="https://github.com/tiehfood/xpferd/releases/tag/v{VERSION}" target="_blank" rel="noopener noreferrer" class="footer-app-version">v{VERSION}</a>
    {:else}
      <a href="https://github.com/tiehfood/xpferd" target="_blank" rel="noopener noreferrer" class="footer-app-version">dev</a>
    {/if}
    <div class="footer-versions">
      <a href="https://xeinkauf.de/xrechnung/versionen-und-bundles/" target="_blank" rel="noopener noreferrer" class="footer-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        XRechnung 3.0
      </a>
      <a href="https://www.ferd-net.de/standards/zugferd" target="_blank" rel="noopener noreferrer" class="footer-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        ZUGFeRD 2.3
      </a>
    </div>
  </div>
</aside>

<style>
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: var(--sidebar-width);
    height: 100vh;
    background: var(--sidebar-bg);
    display: flex;
    flex-direction: column;
    z-index: 100;
    overflow-y: auto;
    border-right: 1px solid rgba(255,255,255,0.04);
  }

  .sidebar-top {
    padding: 1.5rem 1.15rem 1.25rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    text-decoration: none;
    color: var(--sidebar-active);
    margin-bottom: 1.5rem;
    padding: 0.15rem 0;
    transition: opacity 0.15s;
  }

  .brand:hover {
    opacity: 0.85;
  }

  .brand-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(166, 47, 36, 0.3);
    border-radius: 8px;
    overflow: hidden;
  }

  .brand-name {
    display: flex;
    align-items: center;
    line-height: 1;
  }

  .brand-text {
    font-family: var(--font-display), sans-serif;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .new-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.6rem 0.8rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius);
    font-size: 0.8rem;
    font-weight: 600;
    font-family: var(--font-body), sans-serif;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    box-shadow: 0 1px 4px rgba(166, 47, 36, 0.25);
  }

  .new-btn:hover {
    background: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 3px 12px rgba(166, 47, 36, 0.3);
  }

  .new-btn:active {
    transform: translateY(0);
  }

  .sidebar-nav {
    flex: 1;
    padding: 0.25rem 0.65rem;
  }

  .nav-group {
    margin-bottom: 0.25rem;
  }

  .nav-label {
    display: block;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.2);
    padding: 1rem 0.55rem 0.4rem;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.5rem 0.55rem;
    border-radius: var(--radius);
    text-decoration: none;
    font-size: 0.8125rem;
    font-weight: 400;
    color: var(--sidebar-text);
    transition: all 0.15s var(--ease-out);
    position: relative;
  }

  .nav-indicator {
    position: absolute;
    left: -0.65rem;
    width: 3px;
    height: 0;
    background: var(--sidebar-accent);
    border-radius: 0 2px 2px 0;
    transition: height 0.2s var(--ease-out);
  }

  .nav-link:hover {
    color: var(--sidebar-text-hover);
    background: var(--sidebar-active-bg);
  }

  .nav-link.active {
    color: var(--sidebar-active);
    background: var(--sidebar-active-bg);
    font-weight: 500;
  }

  .nav-link.active .nav-indicator {
    height: 16px;
  }

  .nav-link svg {
    flex-shrink: 0;
    opacity: 0.5;
    transition: opacity 0.15s;
  }

  .nav-link:hover svg,
  .nav-link.active svg {
    opacity: 0.9;
  }

  .sidebar-footer {
    padding: 0.5rem 0.65rem 1rem;
    border-top: 1px solid rgba(255,255,255,0.05);
  }

  .footer-settings-link {
    font-size: 0.775rem;
    opacity: 0.75;
    margin-bottom: 0.6rem;
  }

  .footer-settings-link:hover {
    opacity: 1;
  }

  .footer-divider {
    border-top: 1px solid rgba(255,255,255,0.05);
    margin: 0 0.55rem 0.5rem;
  }

  .footer-app-version {
    padding: 0 0.55rem;
    font-size: 0.6rem;
    font-weight: 600;
    color: rgba(255,255,255,0.18);
    letter-spacing: 0.06em;
    margin-bottom: 0.45rem;
    text-decoration: none;
    transition: color 0.15s;
    display: block;
  }

  .footer-app-version:hover {
    color: rgba(255,255,255,0.5);
  }

  .footer-versions {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0 0.55rem;
  }

  .footer-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.65rem;
    color: rgba(255,255,255,0.25);
    letter-spacing: 0.02em;
    text-decoration: none;
    transition: color 0.15s;
  }

  .footer-badge:hover {
    color: rgba(255,255,255,0.55);
    text-decoration: none;
  }

  .footer-badge svg {
    opacity: 0.5;
    flex-shrink: 0;
  }

  .footer-badge:hover svg {
    opacity: 0.8;
  }

  @media (max-width: 860px) {
    .sidebar {
      display: none;
    }
  }
</style>
