import type BetterSqlite3 from 'better-sqlite3';
import type { RecurringInvoiceDto } from '../../shared/types';

interface Row {
  id: number;
  name: string;
  invoice_template_id: number;
  invoice_number_template_id: number | null;
  frequency: string;
  day_of_week: number | null;
  day_of_month: number | null;
  month_position: string | null;
  start_date: string;
  end_date: string | null;
  due_date_offset_days: number;
  delivery_date_offset_days: number;
  active: number;
  last_generated_date: string | null;
  next_scheduled_date: string | null;
  created_at: string;
  updated_at: string;
  // Email auto-send fields (added via migration)
  auto_send_email: number | null;
  email_template_id: number | null;
  email_attachment_type: string | null;
  pdf_template_id: number | null;
}

export class RecurringInvoiceModel {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): RecurringInvoiceDto[] {
    const rows = this.db
      .prepare('SELECT * FROM recurring_invoices ORDER BY name')
      .all() as Row[];
    return rows.map(row => this.toDto(row));
  }

  findById(id: number): RecurringInvoiceDto | null {
    const row = this.db
      .prepare('SELECT * FROM recurring_invoices WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? this.toDto(row) : null;
  }

  findActive(): RecurringInvoiceDto[] {
    const rows = this.db
      .prepare('SELECT * FROM recurring_invoices WHERE active = 1 ORDER BY name')
      .all() as Row[];
    return rows.map(row => this.toDto(row));
  }

  /**
   * Returns all active recurring invoices whose next_scheduled_date is on or before
   * `beforeDate` and whose end_date has not yet passed (or is unbounded).
   */
  findDue(beforeDate: string): RecurringInvoiceDto[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM recurring_invoices
        WHERE active = 1
          AND next_scheduled_date <= ?
          AND (end_date IS NULL OR end_date >= ?)
        ORDER BY next_scheduled_date
      `)
      .all(beforeDate, beforeDate) as Row[];
    return rows.map(row => this.toDto(row));
  }

  create(dto: RecurringInvoiceDto): RecurringInvoiceDto {
    const result = this.db
      .prepare(`
        INSERT INTO recurring_invoices (
          name, invoice_template_id, invoice_number_template_id,
          frequency, day_of_week, day_of_month, month_position,
          start_date, end_date,
          due_date_offset_days, delivery_date_offset_days,
          active, last_generated_date, next_scheduled_date,
          auto_send_email, email_template_id, email_attachment_type, pdf_template_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        dto.name,
        dto.invoiceTemplateId,
        dto.invoiceNumberTemplateId ?? null,
        dto.frequency,
        dto.dayOfWeek ?? null,
        dto.dayOfMonth ?? null,
        dto.monthPosition ?? null,
        dto.startDate,
        dto.endDate ?? null,
        dto.dueDateOffsetDays,
        dto.deliveryDateOffsetDays,
        dto.active ? 1 : 0,
        dto.lastGeneratedDate ?? null,
        dto.nextScheduledDate ?? null,
        dto.autoSendEmail ? 1 : 0,
        dto.emailTemplateId ?? null,
        dto.emailAttachmentType ?? 'zugferd',
        dto.pdfTemplateId ?? null,
      );
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, dto: RecurringInvoiceDto): RecurringInvoiceDto | null {
    if (!this.findById(id)) return null;
    this.db
      .prepare(`
        UPDATE recurring_invoices SET
          name = ?, invoice_template_id = ?, invoice_number_template_id = ?,
          frequency = ?, day_of_week = ?, day_of_month = ?, month_position = ?,
          start_date = ?, end_date = ?,
          due_date_offset_days = ?, delivery_date_offset_days = ?,
          active = ?, last_generated_date = ?, next_scheduled_date = ?,
          auto_send_email = ?, email_template_id = ?, email_attachment_type = ?, pdf_template_id = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(
        dto.name,
        dto.invoiceTemplateId,
        dto.invoiceNumberTemplateId ?? null,
        dto.frequency,
        dto.dayOfWeek ?? null,
        dto.dayOfMonth ?? null,
        dto.monthPosition ?? null,
        dto.startDate,
        dto.endDate ?? null,
        dto.dueDateOffsetDays,
        dto.deliveryDateOffsetDays,
        dto.active ? 1 : 0,
        dto.lastGeneratedDate ?? null,
        dto.nextScheduledDate ?? null,
        dto.autoSendEmail ? 1 : 0,
        dto.emailTemplateId ?? null,
        dto.emailAttachmentType ?? 'zugferd',
        dto.pdfTemplateId ?? null,
        id,
      );
    return this.findById(id)!;
  }

  /**
   * Update only the scheduling state fields after a generation run.
   */
  updateScheduleState(id: number, lastGenerated: string, nextScheduled: string | null): void {
    this.db
      .prepare(`
        UPDATE recurring_invoices
        SET last_generated_date = ?, next_scheduled_date = ?, updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(lastGenerated, nextScheduled, id);
  }

  delete(id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM recurring_invoices WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  private toDto(row: Row): RecurringInvoiceDto {
    return {
      id: row.id,
      name: row.name,
      invoiceTemplateId: row.invoice_template_id,
      invoiceNumberTemplateId: row.invoice_number_template_id ?? undefined,
      frequency: row.frequency as RecurringInvoiceDto['frequency'],
      dayOfWeek: row.day_of_week ?? undefined,
      dayOfMonth: row.day_of_month ?? undefined,
      monthPosition: row.month_position as RecurringInvoiceDto['monthPosition'] ?? undefined,
      startDate: row.start_date,
      endDate: row.end_date ?? undefined,
      dueDateOffsetDays: row.due_date_offset_days,
      deliveryDateOffsetDays: row.delivery_date_offset_days,
      active: row.active === 1,
      lastGeneratedDate: row.last_generated_date ?? undefined,
      nextScheduledDate: row.next_scheduled_date ?? undefined,
      autoSendEmail: (row.auto_send_email ?? 0) === 1,
      emailTemplateId: row.email_template_id ?? undefined,
      emailAttachmentType: (row.email_attachment_type ?? 'zugferd') as RecurringInvoiceDto['emailAttachmentType'],
      pdfTemplateId: row.pdf_template_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
