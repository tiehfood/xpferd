import type BetterSqlite3 from 'better-sqlite3';
import type { PartyDto } from '../../shared/types';

interface PartyRow {
  id: number;
  type: string;
  name: string;
  street: string;
  city: string;
  postal_code: string;
  country_code: string;
  vat_id: string | null;
  tax_number: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export class PartyModel {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(type?: 'seller' | 'buyer'): PartyDto[] {
    const query = type
      ? 'SELECT * FROM parties WHERE type = ? ORDER BY name'
      : 'SELECT * FROM parties ORDER BY type, name';
    const rows = (type
      ? this.db.prepare(query).all(type)
      : this.db.prepare(query).all()) as PartyRow[];
    return rows.map(this.toDto);
  }

  findById(id: number): PartyDto | null {
    const row = this.db.prepare('SELECT * FROM parties WHERE id = ?').get(id) as PartyRow | undefined;
    return row ? this.toDto(row) : null;
  }

  create(dto: PartyDto): PartyDto {
    const result = this.db.prepare(`
      INSERT INTO parties (type, name, street, city, postal_code, country_code,
        vat_id, tax_number, contact_name, contact_phone, contact_email, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dto.type, dto.name, dto.street, dto.city, dto.postalCode, dto.countryCode,
      dto.vatId ?? null, dto.taxNumber ?? null, dto.contactName ?? null,
      dto.contactPhone ?? null, dto.contactEmail ?? null, dto.email ?? null,
    );
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, dto: PartyDto): PartyDto | null {
    const existing = this.findById(id);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE parties SET
        type = ?, name = ?, street = ?, city = ?, postal_code = ?, country_code = ?,
        vat_id = ?, tax_number = ?, contact_name = ?, contact_phone = ?, contact_email = ?,
        email = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      dto.type, dto.name, dto.street, dto.city, dto.postalCode, dto.countryCode,
      dto.vatId ?? null, dto.taxNumber ?? null, dto.contactName ?? null,
      dto.contactPhone ?? null, dto.contactEmail ?? null, dto.email ?? null,
      id,
    );
    return this.findById(id)!;
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM parties WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private toDto(row: PartyRow): PartyDto {
    return {
      id: row.id,
      type: row.type as 'seller' | 'buyer',
      name: row.name,
      street: row.street,
      city: row.city,
      postalCode: row.postal_code,
      countryCode: row.country_code,
      vatId: row.vat_id ?? undefined,
      taxNumber: row.tax_number ?? undefined,
      contactName: row.contact_name ?? undefined,
      contactPhone: row.contact_phone ?? undefined,
      contactEmail: row.contact_email ?? undefined,
      email: row.email ?? undefined,
    };
  }
}
