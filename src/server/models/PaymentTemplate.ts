import type BetterSqlite3 from 'better-sqlite3';
import type { PaymentTemplateDto } from '../../shared/types';

interface Row {
  id: number;
  name: string;
  payment_means_code: string;
  iban: string | null;
  bic: string | null;
  payment_terms: string | null;
  created_at: string;
  updated_at: string;
}

export class PaymentTemplateModel {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): PaymentTemplateDto[] {
    const rows = this.db.prepare('SELECT * FROM payment_templates ORDER BY name').all() as Row[];
    return rows.map(this.toDto);
  }

  findById(id: number): PaymentTemplateDto | null {
    const row = this.db.prepare('SELECT * FROM payment_templates WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toDto(row) : null;
  }

  create(dto: PaymentTemplateDto): PaymentTemplateDto {
    const result = this.db.prepare(`
      INSERT INTO payment_templates (name, payment_means_code, iban, bic, payment_terms)
      VALUES (?, ?, ?, ?, ?)
    `).run(dto.name, dto.paymentMeansCode, dto.iban ?? null, dto.bic ?? null, dto.paymentTerms ?? null);
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, dto: PaymentTemplateDto): PaymentTemplateDto | null {
    if (!this.findById(id)) return null;
    this.db.prepare(`
      UPDATE payment_templates SET
        name = ?, payment_means_code = ?, iban = ?, bic = ?, payment_terms = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(dto.name, dto.paymentMeansCode, dto.iban ?? null, dto.bic ?? null, dto.paymentTerms ?? null, id);
    return this.findById(id)!;
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM payment_templates WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private toDto(row: Row): PaymentTemplateDto {
    return {
      id: row.id,
      name: row.name,
      paymentMeansCode: row.payment_means_code,
      iban: row.iban ?? undefined,
      bic: row.bic ?? undefined,
      paymentTerms: row.payment_terms ?? undefined,
    };
  }
}
