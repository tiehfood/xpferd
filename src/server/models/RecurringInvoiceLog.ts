import type BetterSqlite3 from 'better-sqlite3';
import type { RecurringInvoiceLogDto } from '../../shared/types';

interface Row {
  id: number;
  recurring_invoice_id: number;
  invoice_id: number | null;
  invoice_number: string | null;
  scheduled_date: string;
  generated_at: string;
  status: string;
  error_message: string | null;
}

export class RecurringInvoiceLogModel {
  constructor(private db: BetterSqlite3.Database) {}

  findByRecurringId(recurringId: number): RecurringInvoiceLogDto[] {
    const rows = this.db
      .prepare(`
        SELECT ril.*, i.invoice_number
        FROM recurring_invoice_logs ril
        LEFT JOIN invoices i ON i.id = ril.invoice_id
        WHERE ril.recurring_invoice_id = ?
        ORDER BY ril.generated_at DESC
      `)
      .all(recurringId) as Row[];
    return rows.map(row => this.toDto(row));
  }

  findAll(limit = 100): RecurringInvoiceLogDto[] {
    const rows = this.db
      .prepare(`
        SELECT ril.*, i.invoice_number
        FROM recurring_invoice_logs ril
        LEFT JOIN invoices i ON i.id = ril.invoice_id
        ORDER BY ril.generated_at DESC
        LIMIT ?
      `)
      .all(limit) as Row[];
    return rows.map(row => this.toDto(row));
  }

  create(dto: RecurringInvoiceLogDto): RecurringInvoiceLogDto {
    const result = this.db
      .prepare(`
        INSERT INTO recurring_invoice_logs (
          recurring_invoice_id, invoice_id, scheduled_date,
          generated_at, status, error_message
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        dto.recurringInvoiceId,
        dto.invoiceId ?? null,
        dto.scheduledDate,
        dto.generatedAt,
        dto.status,
        dto.errorMessage ?? null,
      );
    const id = result.lastInsertRowid as number;
    const row = this.db
      .prepare('SELECT * FROM recurring_invoice_logs WHERE id = ?')
      .get(id) as Row;
    return this.toDto(row);
  }

  private toDto(row: Row): RecurringInvoiceLogDto {
    return {
      id: row.id,
      recurringInvoiceId: row.recurring_invoice_id,
      invoiceId: row.invoice_id ?? undefined,
      invoiceNumber: row.invoice_number ?? undefined,
      scheduledDate: row.scheduled_date,
      generatedAt: row.generated_at,
      status: row.status as RecurringInvoiceLogDto['status'],
      errorMessage: row.error_message ?? undefined,
    };
  }
}
