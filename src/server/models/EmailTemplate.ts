import type BetterSqlite3 from 'better-sqlite3';
import type { EmailTemplateDto } from '../../shared/types/index.js';

interface EmailTemplateRow {
  id: number;
  name: string;
  subject: string;
  body: string;
  body_html: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_TEMPLATE_BODY = `Sehr geehrte Damen und Herren,

anbei erhalten Sie die Rechnung {rechnungsnummer} vom {rechnungsdatum} über {betrag_brutto} {währung}.

Zahlungsziel: {fälligkeitsdatum}

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
{verkäufer}`;

export class EmailTemplateModel {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): EmailTemplateDto[] {
    const rows = this.db
      .prepare('SELECT * FROM email_templates ORDER BY name')
      .all() as EmailTemplateRow[];

    if (rows.length === 0) {
      this.seedDefault();
      return this.findAll();
    }

    return rows.map(row => this.toDto(row));
  }

  findById(id: number): EmailTemplateDto | null {
    const row = this.db
      .prepare('SELECT * FROM email_templates WHERE id = ?')
      .get(id) as EmailTemplateRow | undefined;
    return row ? this.toDto(row) : null;
  }

  findDefault(): EmailTemplateDto | null {
    const row = this.db
      .prepare('SELECT * FROM email_templates WHERE is_default = 1 LIMIT 1')
      .get() as EmailTemplateRow | undefined;
    return row ? this.toDto(row) : null;
  }

  create(dto: EmailTemplateDto): EmailTemplateDto {
    if (dto.isDefault) {
      this.db.prepare('UPDATE email_templates SET is_default = 0').run();
    }
    const result = this.db.prepare(`
      INSERT INTO email_templates (name, subject, body, body_html, is_default)
      VALUES (?, ?, ?, ?, ?)
    `).run(dto.name, dto.subject, dto.body, dto.bodyHtml || null, dto.isDefault ? 1 : 0);
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, dto: EmailTemplateDto): EmailTemplateDto | null {
    if (!this.findById(id)) return null;
    if (dto.isDefault) {
      this.db.prepare('UPDATE email_templates SET is_default = 0 WHERE id != ?').run(id);
    }
    this.db.prepare(`
      UPDATE email_templates SET
        name = ?,
        subject = ?,
        body = ?,
        body_html = ?,
        is_default = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(dto.name, dto.subject, dto.body, dto.bodyHtml || null, dto.isDefault ? 1 : 0, id);
    return this.findById(id)!;
  }

  delete(id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM email_templates WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  seedDefault(): void {
    this.db.prepare(`
      INSERT INTO email_templates (name, subject, body, is_default)
      VALUES (?, ?, ?, 1)
    `).run(
      'Standard',
      'Rechnung {rechnungsnummer}',
      DEFAULT_TEMPLATE_BODY,
    );
  }

  private toDto(row: EmailTemplateRow): EmailTemplateDto {
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      body: row.body,
      ...(row.body_html ? { bodyHtml: row.body_html } : {}),
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
