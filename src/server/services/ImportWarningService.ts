import validator from 'validator';
import type { InvoiceDto } from '../../shared/types/Invoice.js';

export class ImportWarningService {
  /**
   * Analyze a parsed InvoiceDto and return warnings for common issues.
   * These are NOT validation errors — the invoice can still be saved.
   */
  check(invoice: InvoiceDto): string[] {
    const warnings: string[] = [];

    // IBAN validation
    if (invoice.iban) {
      const cleaned = invoice.iban.replace(/\s/g, '');
      if (!validator.isIBAN(cleaned)) {
        warnings.push(`IBAN ungültig: ${invoice.iban}`);
      }
    }

    // BIC validation
    if (invoice.bic && !validator.isBIC(invoice.bic)) {
      warnings.push(`BIC ungültig: ${invoice.bic}`);
    }

    // Seller contact (required by XRechnung BR-DE-2 / BR-DE-5 / BR-DE-7)
    if (!invoice.seller.contactName) {
      warnings.push('Verkäufer: Ansprechpartner fehlt (XRechnung-Pflicht BR-DE-2)');
    }
    if (!invoice.seller.contactPhone) {
      warnings.push('Verkäufer: Telefonnummer fehlt (XRechnung-Pflicht BR-DE-5)');
    }
    if (!invoice.seller.contactEmail) {
      warnings.push('Verkäufer: E-Mail-Adresse fehlt (XRechnung-Pflicht BR-DE-7)');
    } else if (!validator.isEmail(invoice.seller.contactEmail)) {
      warnings.push(`Verkäufer: E-Mail-Adresse ungültig: ${invoice.seller.contactEmail}`);
    }

    // Buyer email (required by XRechnung BR-DE-1)
    if (!invoice.buyer.email) {
      warnings.push('Käufer: E-Mail-Adresse fehlt (XRechnung-Pflicht BR-DE-1)');
    } else if (!validator.isEmail(invoice.buyer.email)) {
      warnings.push(`Käufer: E-Mail-Adresse ungültig: ${invoice.buyer.email}`);
    }

    // Seller VAT ID or tax number (BR-DE-16)
    if (!invoice.seller.vatId && !invoice.seller.taxNumber) {
      warnings.push('Verkäufer: USt-IdNr. oder Steuernummer fehlt (BR-DE-16)');
    }

    // Missing buyer reference (Leitweg-ID, required for German public sector)
    if (!invoice.buyerReference) {
      warnings.push('Käuferreferenz (Leitweg-ID) fehlt — für öffentliche Auftraggeber Pflicht');
    }

    // Due date / payment terms (BR-CO-25)
    const hasPositiveAmount = invoice.lines.some(l => l.lineNetAmount > 0);
    if (hasPositiveAmount && !invoice.dueDate && !invoice.paymentTerms) {
      warnings.push('Fälligkeitsdatum oder Zahlungsbedingungen fehlen (BR-CO-25)');
    }

    // Missing seller address fields
    if (!invoice.seller.street) {
      warnings.push('Verkäufer: Straße fehlt');
    }
    if (!invoice.seller.city) {
      warnings.push('Verkäufer: Ort fehlt');
    }
    if (!invoice.seller.postalCode) {
      warnings.push('Verkäufer: PLZ fehlt');
    }

    // Missing buyer address fields
    if (!invoice.buyer.street) {
      warnings.push('Käufer: Straße fehlt');
    }
    if (!invoice.buyer.city) {
      warnings.push('Käufer: Ort fehlt');
    }
    if (!invoice.buyer.postalCode) {
      warnings.push('Käufer: PLZ fehlt');
    }

    return warnings;
  }
}
