import validator from 'validator';
import type { InvoiceDto } from '../../shared/types/Invoice.js';
import { checkInvoiceWarnings } from '../../shared/utils/invoiceWarnings.js';

export class ImportWarningService {
  /**
   * Analyze a parsed InvoiceDto and return warnings.
   * Uses the shared warning checks + server-only strict IBAN/BIC validation.
   */
  check(invoice: InvoiceDto): string[] {
    // Start with shared warnings (regex-based IBAN/BIC checks)
    const sharedWarnings = checkInvoiceWarnings(invoice);

    // Replace regex-based IBAN/BIC warnings with stricter validator-based ones
    const warnings: string[] = [];
    for (const w of sharedWarnings) {
      if (w.field === 'iban' || w.field === 'bic') continue; // skip — replace below
      warnings.push(w.message);
    }

    // Strict IBAN check using `validator` library (checksum-level)
    if (invoice.iban) {
      const cleaned = invoice.iban.replace(/\s/g, '');
      if (!validator.isIBAN(cleaned)) {
        warnings.push(`IBAN ungültig: ${invoice.iban}`);
      }
    }

    // Strict BIC check
    if (invoice.bic && !validator.isBIC(invoice.bic)) {
      warnings.push(`BIC ungültig: ${invoice.bic}`);
    }

    return warnings;
  }
}
