/**
 * Lightweight invoice warning checks — runs on both client and server.
 * No external dependencies. Full IBAN Mod-97 checksum validation included.
 */

/** Basic IBAN format: 2 uppercase letters + 2 digits + 11-30 alphanumeric chars */
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/**
 * Validate an IBAN using the ISO 7064 Mod-97-10 algorithm.
 * Algorithm:
 *  1. Move the first 4 characters (country + check digits) to the end.
 *  2. Replace each letter with its numeric equivalent: A=10, B=11, ..., Z=35.
 *  3. Compute the number mod 97 using chunked string arithmetic (avoids
 *     BigInt — not universally available in all client environments).
 *  4. A valid IBAN yields a remainder of 1.
 *
 * @param iban - whitespace-free, uppercase IBAN string
 */
function validateIbanChecksum(iban: string): boolean {
  // Rearrange: move first 4 chars to end
  const rearranged = iban.slice(4) + iban.slice(0, 4);

  // Convert letters to digits: A→10, B→11, ..., Z→35
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  // Compute numeric mod 97 using 9-digit chunks to avoid precision loss
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = String(remainder) + numeric.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }

  return remainder === 1;
}

/** BIC/SWIFT: 4 letters (bank) + 2 letters (country) + 2 alphanum (location) + optional 3 alphanum (branch) */
const BIC_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

/** Basic email: something@something.something */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InvoiceWarning {
  field: string;   // dot-path like 'seller.contactName', 'iban', 'buyer.email'
  message: string; // German warning text
}

/**
 * Check an invoice-like object for common XRechnung compliance issues.
 * Returns an array of warnings — these do NOT block saving.
 */
export function checkInvoiceWarnings(invoice: any): InvoiceWarning[] {
  if (!invoice) return [];
  const warnings: InvoiceWarning[] = [];
  const seller = invoice.seller ?? {};
  const buyer = invoice.buyer ?? {};
  const lines: any[] = invoice.lines ?? [];

  // ── IBAN ──────────────────────────────────────────────────────
  if (invoice.iban) {
    const cleaned = invoice.iban.replace(/\s/g, '');
    if (!IBAN_RE.test(cleaned) || !validateIbanChecksum(cleaned)) {
      warnings.push({ field: 'iban', message: `IBAN ungültig: ${invoice.iban}` });
    }
  }

  // ── BIC ───────────────────────────────────────────────────────
  if (invoice.bic) {
    if (!BIC_RE.test(invoice.bic)) {
      warnings.push({ field: 'bic', message: `BIC ungültig: ${invoice.bic}` });
    }
  }

  // ── Seller contact (XRechnung BR-DE-2 / BR-DE-5 / BR-DE-7) ──
  if (!seller.contactName) {
    warnings.push({ field: 'seller.contactName', message: 'Verkäufer: Ansprechpartner fehlt (XRechnung-Pflicht BR-DE-2)' });
  }
  if (!seller.contactPhone) {
    warnings.push({ field: 'seller.contactPhone', message: 'Verkäufer: Telefonnummer fehlt (XRechnung-Pflicht BR-DE-5)' });
  }
  if (!seller.contactEmail) {
    warnings.push({ field: 'seller.contactEmail', message: 'Verkäufer: E-Mail-Adresse fehlt (XRechnung-Pflicht BR-DE-7)' });
  } else if (!EMAIL_RE.test(seller.contactEmail)) {
    warnings.push({ field: 'seller.contactEmail', message: `Verkäufer: E-Mail-Adresse ungültig: ${seller.contactEmail}` });
  }

  // ── Buyer email (XRechnung BR-DE-1) ──────────────────────────
  if (!buyer.email) {
    warnings.push({ field: 'buyer.email', message: 'Käufer: E-Mail-Adresse fehlt (XRechnung-Pflicht BR-DE-1)' });
  } else if (!EMAIL_RE.test(buyer.email)) {
    warnings.push({ field: 'buyer.email', message: `Käufer: E-Mail-Adresse ungültig: ${buyer.email}` });
  }

  // ── Seller VAT / tax number (BR-DE-16) ───────────────────────
  if (!seller.vatId && !seller.taxNumber) {
    warnings.push({ field: 'seller.vatId', message: 'Verkäufer: USt-IdNr. oder Steuernummer fehlt (BR-DE-16)' });
  }

  // ── Buyer reference / Leitweg-ID ─────────────────────────────
  if (!invoice.buyerReference) {
    warnings.push({ field: 'buyerReference', message: 'Käuferreferenz (Leitweg-ID) fehlt — für öffentliche Auftraggeber Pflicht' });
  }

  // ── Due date / payment terms (BR-CO-25) ──────────────────────
  const hasPositiveAmount = lines.some((l: any) => l.lineNetAmount > 0);
  if (hasPositiveAmount && !invoice.dueDate && !invoice.paymentTerms) {
    warnings.push({ field: 'dueDate', message: 'Fälligkeitsdatum oder Zahlungsbedingungen fehlen (BR-CO-25)' });
  }

  // ── Seller address ────────────────────────────────────────────
  if (!seller.street) {
    warnings.push({ field: 'seller.street', message: 'Verkäufer: Straße fehlt' });
  }
  if (!seller.city) {
    warnings.push({ field: 'seller.city', message: 'Verkäufer: Ort fehlt' });
  }
  if (!seller.postalCode) {
    warnings.push({ field: 'seller.postalCode', message: 'Verkäufer: PLZ fehlt' });
  }

  // ── Buyer address ─────────────────────────────────────────────
  if (!buyer.street) {
    warnings.push({ field: 'buyer.street', message: 'Käufer: Straße fehlt' });
  }
  if (!buyer.city) {
    warnings.push({ field: 'buyer.city', message: 'Käufer: Ort fehlt' });
  }
  if (!buyer.postalCode) {
    warnings.push({ field: 'buyer.postalCode', message: 'Käufer: PLZ fehlt' });
  }

  return warnings;
}
