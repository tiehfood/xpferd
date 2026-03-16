import type BetterSqlite3 from 'better-sqlite3';
import type { InvoiceTemplateDto } from '../../shared/types';

interface Row {
  id: number;
  name: string;
  data: string;
  created_at: string;
  updated_at: string;
}

export class InvoiceTemplateModel {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): InvoiceTemplateDto[] {
    const rows = this.db.prepare('SELECT * FROM invoice_templates ORDER BY name').all() as Row[];
    return rows.map(this.toDto);
  }

  findById(id: number): InvoiceTemplateDto | null {
    const row = this.db.prepare('SELECT * FROM invoice_templates WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toDto(row) : null;
  }

  create(dto: InvoiceTemplateDto): InvoiceTemplateDto {
    const result = this.db.prepare(`
      INSERT INTO invoice_templates (name, data) VALUES (?, ?)
    `).run(dto.name, dto.data);
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, dto: InvoiceTemplateDto): InvoiceTemplateDto | null {
    if (!this.findById(id)) return null;
    this.db.prepare(`
      UPDATE invoice_templates SET name = ?, data = ?, updated_at = datetime('now') WHERE id = ?
    `).run(dto.name, dto.data, id);
    return this.findById(id)!;
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM invoice_templates WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private toDto(row: Row): InvoiceTemplateDto {
    return {
      id: row.id,
      name: row.name,
      data: row.data,
    };
  }
}
