import { RecurringInvoiceService } from './RecurringInvoiceService.js';

export class RecurringInvoiceScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private service = new RecurringInvoiceService();
  private readonly CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  start(): void {
    // Run catch-up immediately on startup
    console.log('[RecurringInvoiceScheduler] Starting — running initial catch-up...');
    this.runCheck();

    // Then schedule hourly checks
    this.intervalId = setInterval(() => this.runCheck(), this.CHECK_INTERVAL_MS);
    console.log('[RecurringInvoiceScheduler] Scheduled hourly checks');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[RecurringInvoiceScheduler] Stopped');
    }
  }

  private runCheck(): void {
    try {
      const result = this.service.generateDueInvoices();
      if (result.generated > 0 || result.errors > 0) {
        console.log(
          `[RecurringInvoiceScheduler] Generated ${result.generated} invoice(s), ${result.errors} error(s)`,
        );
      }
    } catch (err) {
      console.error('[RecurringInvoiceScheduler] Error during check:', err);
    }
  }
}
