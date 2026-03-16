import type BetterSqlite3 from 'better-sqlite3';
import type { InvoiceLineDto } from '../../shared/types';

interface InvoiceLineRow {
  id: number;
  invoice_id: number;
  line_number: number;
  quantity: number;
  unit_code: string;
  item_name: string;
  net_price: number;
  vat_category_code: string;
  vat_rate: number;
  line_net_amount: number;
}

export class InvoiceLineModel {
  constructor(private db: BetterSqlite3.Database) {}

  findByInvoiceId(invoiceId: number): InvoiceLineDto[] {
    const rows = this.db.prepare(
      'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY line_number'
    ).all(invoiceId) as InvoiceLineRow[];
    return rows.map(this.toDto);
  }

  replaceForInvoice(invoiceId: number, lines: InvoiceLineDto[]): void {
    this.db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(invoiceId);
    const insert = this.db.prepare(`
      INSERT INTO invoice_lines (invoice_id, line_number, quantity, unit_code, item_name, net_price, vat_category_code, vat_rate, line_net_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      insert.run(
        invoiceId,
        line.lineNumber,
        line.quantity,
        line.unitCode,
        line.itemName,
        line.netPrice,
        line.vatCategoryCode,
        line.vatRate,
        line.lineNetAmount,
      );
    }
  }

  private toDto(row: InvoiceLineRow): InvoiceLineDto {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      lineNumber: row.line_number,
      quantity: row.quantity,
      unitCode: row.unit_code,
      itemName: row.item_name,
      netPrice: row.net_price,
      vatCategoryCode: row.vat_category_code,
      vatRate: row.vat_rate,
      lineNetAmount: row.line_net_amount,
    };
  }
}
