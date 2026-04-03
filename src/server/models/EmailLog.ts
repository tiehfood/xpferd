import type BetterSqlite3 from 'better-sqlite3';
import type { EmailLogDto } from '../../shared/types/index.js';

interface EmailLogRow {
  id: number;
  invoice_id: number;
  invoice_number: string | null;
  recipient_email: string;
  subject: string;
  attachment_type: string;
  pdf_template_id: number | null;
  pdf_template_name: string | null;
  sent_at: string;
  status: string;
  error_message: string | null;
}

export class EmailLogModel {
  constructor(private db: BetterSqlite3.Database) {}

  create(dto: Omit<EmailLogDto, 'id'>): EmailLogDto {
    const result = this.db.prepare(`
      INSERT INTO email_log (
        invoice_id, invoice_number, recipient_email, subject,
        attachment_type, pdf_template_id, pdf_template_name,
        sent_at, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dto.invoiceId,
      dto.invoiceNumber ?? null,
      dto.recipientEmail,
      dto.subject,
      dto.attachmentType,
      dto.pdfTemplateId ?? null,
      dto.pdfTemplateName ?? null,
      dto.sentAt,
      dto.status,
      dto.errorMessage ?? null,
    );
    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): EmailLogDto | null {
    const row = this.db
      .prepare('SELECT * FROM email_log WHERE id = ?')
      .get(id) as EmailLogRow | undefined;
    return row ? this.toDto(row) : null;
  }

  findByInvoiceId(invoiceId: number): EmailLogDto[] {
    const rows = this.db
      .prepare('SELECT * FROM email_log WHERE invoice_id = ? ORDER BY sent_at DESC')
      .all(invoiceId) as EmailLogRow[];
    return rows.map(row => this.toDto(row));
  }

  findAll(limit: number = 100): EmailLogDto[] {
    const rows = this.db
      .prepare('SELECT * FROM email_log ORDER BY sent_at DESC LIMIT ?')
      .all(limit) as EmailLogRow[];
    return rows.map(row => this.toDto(row));
  }

  private toDto(row: EmailLogRow): EmailLogDto {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number ?? undefined,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      attachmentType: row.attachment_type as EmailLogDto['attachmentType'],
      pdfTemplateId: row.pdf_template_id ?? undefined,
      pdfTemplateName: row.pdf_template_name ?? undefined,
      sentAt: row.sent_at,
      status: row.status as EmailLogDto['status'],
      errorMessage: row.error_message ?? undefined,
    };
  }
}
