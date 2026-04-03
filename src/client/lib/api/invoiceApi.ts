import { t } from '../i18n.js';

const BASE = '/api/v1/invoices';

const FIELD_LABELS: Record<string, string> = {
  invoiceNumber: 'Rechnungsnummer',
  invoiceDate: 'Rechnungsdatum',
  invoiceTypeCode: 'Rechnungsart',
  currencyCode: 'Währung',
  dueDate: 'Fälligkeitsdatum',
  buyerReference: 'Käuferreferenz',
  note: 'Bemerkung',
  deliveryDate: 'Leistungsdatum',
  orderReference: 'Bestellnummer',
  contractReference: 'Vertragsnummer',
  paymentMeansCode: 'Zahlungsart',
  paymentTerms: 'Zahlungsbedingungen',
  iban: 'IBAN',
  bic: 'BIC',
  paymentReference: 'Verwendungszweck',
  accountName: 'Kontoinhaber',
  taxCategoryCode: 'USt-Kategorie',
  taxRate: 'USt-Satz',
  kleinunternehmer: 'Kleinunternehmer',
  prepaidAmount: 'Anzahlung',
  'seller.name': 'Verkäufer — Name',
  'seller.street': 'Verkäufer — Straße',
  'seller.city': 'Verkäufer — Ort',
  'seller.postalCode': 'Verkäufer — PLZ',
  'seller.countryCode': 'Verkäufer — Land',
  'seller.vatId': 'Verkäufer — USt-IdNr.',
  'seller.taxNumber': 'Verkäufer — Steuernummer',
  'seller.contactName': 'Verkäufer — Ansprechpartner',
  'seller.contactPhone': 'Verkäufer — Telefon',
  'seller.contactEmail': 'Verkäufer — E-Mail',
  'buyer.name': 'Käufer — Name',
  'buyer.street': 'Käufer — Straße',
  'buyer.city': 'Käufer — Ort',
  'buyer.postalCode': 'Käufer — PLZ',
  'buyer.countryCode': 'Käufer — Land',
  'buyer.vatId': 'Käufer — USt-IdNr.',
  'buyer.email': 'Käufer — E-Mail',
};

function formatValidationErrors(details: any[]): string {
  if (!details || details.length === 0) return 'Validierung fehlgeschlagen';
  const seen = new Set<string>();
  const messages: string[] = [];
  for (const d of details) {
    const path = d.path?.join('.') ?? '';
    let msg: string;
    // Handle line item paths like "lines.0.itemName"
    const lineMatch = path.match(/^lines\.(\d+)\.(.+)$/);
    if (lineMatch) {
      const lineNum = Number(lineMatch[1]) + 1;
      const field = lineMatch[2];
      const fieldNames: Record<string, string> = {
        itemName: t('lines.bezeichnung'), quantity: t('lines.menge'), unitCode: t('lines.einheit'),
        netPrice: t('lines.einzelpreis'), vatCategoryCode: 'USt-Kategorie', vatRate: 'USt-Satz',
        itemDescription: t('lines.beschreibung'),
      };
      msg = `Position ${lineNum}: ${fieldNames[field] ?? field}`;
    } else {
      const label = FIELD_LABELS[path] ?? path;
      // Only show message if it's a custom German refinement message (not a raw Zod default)
      const isCustomMessage = d.message && !/^(Required|Too |String |Expected |Number |Invalid )/.test(d.message) && d.message !== 'too_small';
      if (isCustomMessage) {
        msg = `${label}: ${d.message}`;
      } else {
        msg = label;
      }
    }
    if (!seen.has(msg)) {
      seen.add(msg);
      messages.push(msg);
    }
  }
  return 'Fehlende Pflichtfelder\n' + messages.join('\n');
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let errorMsg = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text);
      if (body.details) {
        throw new Error(formatValidationErrors(body.details));
      }
      errorMsg = body.error || errorMsg;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Fehlende')) throw e;
      // response was not JSON
    }
    throw new Error(errorMsg);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Ungültige Serverantwort`);
  }
}

export const invoiceApi = {
  list: () => request<any[]>(BASE),

  get: (id: number) => request<any>(`${BASE}/${id}`),

  create: (data: any) =>
    request<any>(BASE, { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<any>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<void>(`${BASE}/${id}`, { method: 'DELETE' }),

  duplicate: (id: number) =>
    request<any>(`${BASE}/${id}/duplicate`, { method: 'POST' }),

  exportUrl: (id: number) => `${BASE}/${id}/export`,
};
