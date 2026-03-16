import type BetterSqlite3 from 'better-sqlite3';
import type { LineItemTemplateDto } from '../../shared/types';

interface Row {
  id: number;
  name: string;
  unit_code: string;
  net_price: number;
  vat_category_code: string;
  vat_rate: number;
  created_at: string;
  updated_at: string;
}

export class LineItemTemplateModel {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): LineItemTemplateDto[] {
    const rows = this.db.prepare('SELECT * FROM line_item_templates ORDER BY name').all() as Row[];
    return rows.map(this.toDto);
  }

  findById(id: number): LineItemTemplateDto | null {
    const row = this.db.prepare('SELECT * FROM line_item_templates WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toDto(row) : null;
  }

  create(dto: LineItemTemplateDto): LineItemTemplateDto {
    const result = this.db.prepare(`
      INSERT INTO line_item_templates (name, unit_code, net_price, vat_category_code, vat_rate)
      VALUES (?, ?, ?, ?, ?)
    `).run(dto.name, dto.unitCode, dto.netPrice, dto.vatCategoryCode, dto.vatRate);
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, dto: LineItemTemplateDto): LineItemTemplateDto | null {
    if (!this.findById(id)) return null;
    this.db.prepare(`
      UPDATE line_item_templates SET
        name = ?, unit_code = ?, net_price = ?, vat_category_code = ?, vat_rate = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(dto.name, dto.unitCode, dto.netPrice, dto.vatCategoryCode, dto.vatRate, id);
    return this.findById(id)!;
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM line_item_templates WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private toDto(row: Row): LineItemTemplateDto {
    return {
      id: row.id,
      name: row.name,
      unitCode: row.unit_code,
      netPrice: row.net_price,
      vatCategoryCode: row.vat_category_code,
      vatRate: row.vat_rate,
    };
  }
}
