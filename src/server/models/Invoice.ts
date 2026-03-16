import type BetterSqlite3 from 'better-sqlite3';
import type { InvoiceDto, InvoiceSummaryDto } from '../../shared/types';
import { InvoiceLineModel } from './InvoiceLine.js';

interface InvoiceRow {
  id: number;
  created_at: string;
  updated_at: string;
  invoice_number: string;
  invoice_date: string;
  invoice_type_code: string;
  currency_code: string;
  due_date: string | null;
  buyer_reference: string;
  seller_name: string;
  seller_street: string;
  seller_city: string;
  seller_postal_code: string;
  seller_country_code: string;
  seller_vat_id: string | null;
  seller_tax_number: string | null;
  seller_contact_name: string | null;
  seller_contact_phone: string | null;
  seller_contact_email: string | null;
  buyer_name: string;
  buyer_street: string;
  buyer_city: string;
  buyer_postal_code: string;
  buyer_country_code: string;
  buyer_vat_id: string | null;
  buyer_email: string | null;
  payment_means_code: string;
  payment_terms: string | null;
  iban: string | null;
  bic: string | null;
  tax_category_code: string;
  tax_rate: number;
  kleinunternehmer: number;
  total_net_amount: number;
  total_tax_amount: number;
  total_gross_amount: number;
  amount_due: number;
}

export class InvoiceModel {
  private lineModel: InvoiceLineModel;

  constructor(private db: BetterSqlite3.Database) {
    this.lineModel = new InvoiceLineModel(db);
  }

  findAll(): InvoiceSummaryDto[] {
    const rows = this.db.prepare(
      `SELECT id, invoice_number, invoice_date, buyer_name, total_gross_amount, currency_code, updated_at
       FROM invoices ORDER BY updated_at DESC`
    ).all() as Pick<InvoiceRow, 'id' | 'invoice_number' | 'invoice_date' | 'buyer_name' | 'total_gross_amount' | 'currency_code' | 'updated_at'>[];

    return rows.map(row => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      buyerName: row.buyer_name,
      totalGrossAmount: row.total_gross_amount,
      currencyCode: row.currency_code,
      updatedAt: row.updated_at,
    }));
  }

  findById(id: number): InvoiceDto | null {
    const row = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow | undefined;
    if (!row) return null;
    const lines = this.lineModel.findByInvoiceId(id);
    return this.toDto(row, lines);
  }

  create(dto: InvoiceDto): InvoiceDto {
    const result = this.db.prepare(`
      INSERT INTO invoices (
        invoice_number, invoice_date, invoice_type_code, currency_code, due_date, buyer_reference,
        seller_name, seller_street, seller_city, seller_postal_code, seller_country_code,
        seller_vat_id, seller_tax_number, seller_contact_name, seller_contact_phone, seller_contact_email,
        buyer_name, buyer_street, buyer_city, buyer_postal_code, buyer_country_code, buyer_vat_id, buyer_email,
        payment_means_code, payment_terms, iban, bic,
        tax_category_code, tax_rate, kleinunternehmer,
        total_net_amount, total_tax_amount, total_gross_amount, amount_due
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dto.invoiceNumber, dto.invoiceDate, dto.invoiceTypeCode, dto.currencyCode, dto.dueDate ?? null, dto.buyerReference ?? '',
      dto.seller.name, dto.seller.street, dto.seller.city, dto.seller.postalCode, dto.seller.countryCode,
      dto.seller.vatId ?? null, dto.seller.taxNumber ?? null, dto.seller.contactName ?? null, dto.seller.contactPhone ?? null, dto.seller.contactEmail ?? null,
      dto.buyer.name, dto.buyer.street, dto.buyer.city, dto.buyer.postalCode, dto.buyer.countryCode, dto.buyer.vatId ?? null, dto.buyer.email ?? null,
      dto.paymentMeansCode, dto.paymentTerms ?? null, dto.iban ?? null, dto.bic ?? null,
      dto.taxCategoryCode, dto.taxRate, dto.kleinunternehmer ? 1 : 0,
      dto.totalNetAmount ?? 0, dto.totalTaxAmount ?? 0, dto.totalGrossAmount ?? 0, dto.amountDue ?? 0,
    );

    const invoiceId = result.lastInsertRowid as number;
    if (dto.lines.length > 0) {
      this.lineModel.replaceForInvoice(invoiceId, dto.lines);
    }

    return this.findById(invoiceId)!;
  }

  update(id: number, dto: InvoiceDto): InvoiceDto | null {
    const existing = this.findById(id);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE invoices SET
        invoice_number = ?, invoice_date = ?, invoice_type_code = ?, currency_code = ?, due_date = ?, buyer_reference = ?,
        seller_name = ?, seller_street = ?, seller_city = ?, seller_postal_code = ?, seller_country_code = ?,
        seller_vat_id = ?, seller_tax_number = ?, seller_contact_name = ?, seller_contact_phone = ?, seller_contact_email = ?,
        buyer_name = ?, buyer_street = ?, buyer_city = ?, buyer_postal_code = ?, buyer_country_code = ?, buyer_vat_id = ?, buyer_email = ?,
        payment_means_code = ?, payment_terms = ?, iban = ?, bic = ?,
        tax_category_code = ?, tax_rate = ?, kleinunternehmer = ?,
        total_net_amount = ?, total_tax_amount = ?, total_gross_amount = ?, amount_due = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      dto.invoiceNumber, dto.invoiceDate, dto.invoiceTypeCode, dto.currencyCode, dto.dueDate ?? null, dto.buyerReference ?? '',
      dto.seller.name, dto.seller.street, dto.seller.city, dto.seller.postalCode, dto.seller.countryCode,
      dto.seller.vatId ?? null, dto.seller.taxNumber ?? null, dto.seller.contactName ?? null, dto.seller.contactPhone ?? null, dto.seller.contactEmail ?? null,
      dto.buyer.name, dto.buyer.street, dto.buyer.city, dto.buyer.postalCode, dto.buyer.countryCode, dto.buyer.vatId ?? null, dto.buyer.email ?? null,
      dto.paymentMeansCode, dto.paymentTerms ?? null, dto.iban ?? null, dto.bic ?? null,
      dto.taxCategoryCode, dto.taxRate, dto.kleinunternehmer ? 1 : 0,
      dto.totalNetAmount ?? 0, dto.totalTaxAmount ?? 0, dto.totalGrossAmount ?? 0, dto.amountDue ?? 0,
      id,
    );

    this.lineModel.replaceForInvoice(id, dto.lines);
    return this.findById(id)!;
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private toDto(row: InvoiceRow, lines: InvoiceDto['lines']): InvoiceDto {
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      invoiceTypeCode: row.invoice_type_code,
      currencyCode: row.currency_code,
      dueDate: row.due_date ?? undefined,
      buyerReference: row.buyer_reference,
      seller: {
        name: row.seller_name,
        street: row.seller_street,
        city: row.seller_city,
        postalCode: row.seller_postal_code,
        countryCode: row.seller_country_code,
        vatId: row.seller_vat_id ?? undefined,
        taxNumber: row.seller_tax_number ?? undefined,
        contactName: row.seller_contact_name ?? undefined,
        contactPhone: row.seller_contact_phone ?? undefined,
        contactEmail: row.seller_contact_email ?? undefined,
      },
      buyer: {
        name: row.buyer_name,
        street: row.buyer_street,
        city: row.buyer_city,
        postalCode: row.buyer_postal_code,
        countryCode: row.buyer_country_code,
        vatId: row.buyer_vat_id ?? undefined,
        email: row.buyer_email ?? undefined,
      },
      paymentMeansCode: row.payment_means_code,
      paymentTerms: row.payment_terms ?? undefined,
      iban: row.iban ?? undefined,
      bic: row.bic ?? undefined,
      taxCategoryCode: row.tax_category_code,
      taxRate: row.tax_rate,
      kleinunternehmer: Boolean(row.kleinunternehmer),
      totalNetAmount: row.total_net_amount,
      totalTaxAmount: row.total_tax_amount,
      totalGrossAmount: row.total_gross_amount,
      amountDue: row.amount_due,
      lines,
    };
  }
}
