import { createApp } from './app.js';
import { Database } from './database/Database.js';
import { seedIfEmpty } from './database/seed.js';
import { RecurringInvoiceScheduler } from './services/RecurringInvoiceScheduler.js';

// Initialize database
Database.getInstance();

// Seed sample data if database is empty
seedIfEmpty();

// Start recurring invoice scheduler (generates overdue invoices on startup, then hourly)
const scheduler = new RecurringInvoiceScheduler();
scheduler.start();

const app = createApp();
const port = Number(process.env.PORT) || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`XRechnung server running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api-docs`);
});
