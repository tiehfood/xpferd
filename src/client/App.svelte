<script lang="ts">
  import Router from 'svelte-spa-router';
  import Sidebar from './lib/components/Sidebar.svelte';
  import DashboardPage from './pages/DashboardPage.svelte';
  import InvoiceEditPage from './pages/InvoiceEditPage.svelte';
  import PartiesPage from './pages/PartiesPage.svelte';
  import TemplatesPage from './pages/TemplatesPage.svelte';
  import PdfBuilderPage from './pages/PdfBuilderPage.svelte';
  import InvoiceTemplateEditPage from './pages/InvoiceTemplateEditPage.svelte';
  import SettingsPage from './pages/SettingsPage.svelte';
  import ImportPage from './pages/ImportPage.svelte';
  import RecurringInvoicesPage from './pages/RecurringInvoicesPage.svelte';
  import AuditLogPage from './pages/AuditLogPage.svelte';
  import EmailTemplatesPage from './pages/EmailTemplatesPage.svelte';
  import { loadSettings } from './lib/settingsStore.svelte.js';

  // Load settings on app startup so they're available everywhere
  loadSettings();

  const routes = {
    '/': DashboardPage,
    '/invoices/new': InvoiceEditPage,
    '/invoices/:id': InvoiceEditPage,
    '/import': ImportPage,
    '/recurring': RecurringInvoicesPage,
    '/sellers': PartiesPage,
    '/buyers': PartiesPage,
    '/templates': TemplatesPage,
    '/templates/numbers': TemplatesPage,
    '/templates/payments': TemplatesPage,
    '/templates/line-items': TemplatesPage,
    '/templates/invoices/:id': InvoiceTemplateEditPage,
    '/templates/invoices': TemplatesPage,
    '/pdf-templates': PdfBuilderPage,
    '/pdf-templates/*': PdfBuilderPage,
    '/audit-log': AuditLogPage,
    '/email-templates': EmailTemplatesPage,
    '/settings': SettingsPage,
  };
</script>

<div class="app-layout">
  <Sidebar />
  <main class="app-content">
    <Router {routes} />
  </main>
</div>
