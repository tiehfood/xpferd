import type BetterSqlite3 from 'better-sqlite3';
import type { InvoiceNumberTemplateDto } from '../../shared/types';

interface Row {
  id: number;
  name: string;
  prefix: string;
  digits: number;
  next_number: number;
  created_at: string;
  updated_at: string;
}

export class InvoiceNumberTemplateModel {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): InvoiceNumberTemplateDto[] {
    const rows = this.db.prepare('SELECT * FROM invoice_number_templates ORDER BY name').all() as Row[];
    return rows.map(this.toDto);
  }

  findById(id: number): InvoiceNumberTemplateDto | null {
    const row = this.db.prepare('SELECT * FROM invoice_number_templates WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toDto(row) : null;
  }

  create(dto: InvoiceNumberTemplateDto): InvoiceNumberTemplateDto {
    const result = this.db.prepare(`
      INSERT INTO invoice_number_templates (name, prefix, digits, next_number)
      VALUES (?, ?, ?, ?)
    `).run(dto.name, dto.prefix, dto.digits, dto.nextNumber);
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, dto: InvoiceNumberTemplateDto): InvoiceNumberTemplateDto | null {
    if (!this.findById(id)) return null;
    this.db.prepare(`
      UPDATE invoice_number_templates SET
        name = ?, prefix = ?, digits = ?, next_number = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(dto.name, dto.prefix, dto.digits, dto.nextNumber, id);
    return this.findById(id)!;
  }

  previewNext(id: number): { invoiceNumber: string } | null {
    const row = this.findById(id);
    if (!row) return null;
    const num = String(row.nextNumber).padStart(row.digits, '0');
    return { invoiceNumber: `${row.prefix}${num}` };
  }

  generateNext(id: number): { invoiceNumber: string } | null {
    const row = this.findById(id);
    if (!row) return null;
    const num = String(row.nextNumber).padStart(row.digits, '0');
    const invoiceNumber = `${row.prefix}${num}`;
    this.db.prepare('UPDATE invoice_number_templates SET next_number = next_number + 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
    return { invoiceNumber };
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM invoice_number_templates WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private toDto(row: Row): InvoiceNumberTemplateDto {
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      digits: row.digits,
      nextNumber: row.next_number,
    };
  }
}
