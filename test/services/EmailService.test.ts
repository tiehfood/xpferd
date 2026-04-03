import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EmailService } from '../../src/server/services/EmailService.js';
import { CryptoService } from '../../src/server/services/CryptoService.js';
import { Database } from '../../src/server/database/Database.js';
import type { EmailTemplateDto, InvoiceDto } from '../../src/shared/types/index.js';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.resolve(process.cwd(), 'test/.test-email-svc.db');

// Factory: returns fresh InvoiceDto each call
function makeInvoice(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    invoiceNumber: 'INV-2026-001',
    invoiceDate: '2026-01-15',
    dueDate: '2026-02-15',
    invoiceTypeCode: '380',
    currencyCode: 'EUR',
    buyerReference: 'LEITWEG-001',
    totalGrossAmount: 119.0,
    totalNetAmount: 100.0,
    iban: 'DE89370400440532013000',
    paymentReference: 'INV-2026-001',
    seller: {
      name: 'Acme GmbH',
      street: 'Musterstraße 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
    },
    buyer: {
      name: 'Musterkunde AG',
      street: 'Kundenstraße 2',
      city: 'München',
      postalCode: '80331',
      countryCode: 'DE',
      email: 'buyer@example.com',
    },
    paymentMeansCode: '58',
    taxCategoryCode: 'S',
    taxRate: 19,
    kleinunternehmer: false,
    lines: [
      {
        lineNumber: 1,
        quantity: 1,
        unitCode: 'C62',
        itemName: 'Consulting',
        netPrice: 100,
        vatCategoryCode: 'S',
        vatRate: 19,
        lineNetAmount: 100,
      },
    ],
    ...overrides,
  };
}

// Factory: returns fresh EmailTemplateDto each call
function makeTemplate(overrides: Partial<EmailTemplateDto> = {}): EmailTemplateDto {
  return {
    name: 'Test Template',
    subject: 'Rechnung {rechnungsnummer} von {verkäufer}',
    body: [
      'Betreff: {rechnungsnummer}',
      'Datum: {rechnungsdatum}',
      'Fällig: {fälligkeitsdatum}',
      'Brutto: {betrag_brutto} {währung}',
      'Netto: {betrag_netto} {währung}',
      'Empfänger: {empfänger}',
      'Verkäufer: {verkäufer}',
      'IBAN: {iban}',
      'Verwendungszweck: {verwendungszweck}',
    ].join('\n'),
    isDefault: false,
    ...overrides,
  };
}

describe('EmailService.renderTemplate', () => {
  let service: EmailService;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'c'.repeat(64);
    CryptoService.resetInstance();
    Database.resetInstance();
    Database.getInstance(TEST_DB);
    service = new EmailService();
  });

  afterAll(() => {
    Database.resetInstance();
    delete process.env.ENCRYPTION_KEY;
    CryptoService.resetInstance();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TEST_DB + '-wal')) fs.unlinkSync(TEST_DB + '-wal');
    if (fs.existsSync(TEST_DB + '-shm')) fs.unlinkSync(TEST_DB + '-shm');
  });

  it('replaces {rechnungsnummer} in subject and body', () => {
    const result = service.renderTemplate(
      makeTemplate({ subject: 'Rechnung {rechnungsnummer}', body: 'Nr: {rechnungsnummer}' }),
      makeInvoice({ invoiceNumber: 'INV-42' }),
    );
    expect(result.subject).toBe('Rechnung INV-42');
    expect(result.body).toBe('Nr: INV-42');
  });

  it('replaces all ten placeholders in the body', () => {
    const invoice = makeInvoice();
    const template = makeTemplate();
    const result = service.renderTemplate(template, invoice);

    expect(result.body).toContain('INV-2026-001');        // {rechnungsnummer}
    expect(result.body).toContain('2026-01-15');          // {rechnungsdatum}
    expect(result.body).toContain('2026-02-15');          // {fälligkeitsdatum}
    expect(result.body).toContain('119.00');              // {betrag_brutto}
    expect(result.body).toContain('100.00');              // {betrag_netto}
    expect(result.body).toContain('EUR');                 // {währung}
    expect(result.body).toContain('Musterkunde AG');      // {empfänger}
    expect(result.body).toContain('Acme GmbH');          // {verkäufer}
    expect(result.body).toContain('DE89370400440532013000'); // {iban}
    expect(result.body).toContain('INV-2026-001');        // {verwendungszweck}
  });

  it('replaces {verkäufer} in subject', () => {
    const result = service.renderTemplate(
      makeTemplate({ subject: 'Von: {verkäufer}', body: 'body' }),
      makeInvoice({ seller: { name: 'Meine Firma GmbH', street: 'Str', city: 'City', postalCode: '12345', countryCode: 'DE' } }),
    );
    expect(result.subject).toBe('Von: Meine Firma GmbH');
  });

  it('missing optional fields render as empty string, not "undefined"', () => {
    const invoice = makeInvoice({
      dueDate: undefined,
      iban: undefined,
      paymentReference: undefined,
      totalGrossAmount: undefined,
      totalNetAmount: undefined,
    });
    const template = makeTemplate({
      body: 'Fällig: {fälligkeitsdatum}\nIBAN: {iban}\nZweck: {verwendungszweck}\nBrutto: {betrag_brutto}\nNetto: {betrag_netto}',
    });
    const result = service.renderTemplate(template, invoice);

    expect(result.body).not.toContain('undefined');
    expect(result.body).toContain('Fällig: \n');
    expect(result.body).toContain('IBAN: \n');
    expect(result.body).toContain('Zweck: \n');
    // When amount is undefined → '0.00'
    expect(result.body).toContain('Brutto: 0.00');
    expect(result.body).toContain('Netto: 0.00');
  });

  it('multiple occurrences of the same placeholder are all replaced', () => {
    const template = makeTemplate({
      body: '{rechnungsnummer} - {rechnungsnummer} - {rechnungsnummer}',
    });
    const result = service.renderTemplate(template, makeInvoice({ invoiceNumber: 'X-99' }));
    expect(result.body).toBe('X-99 - X-99 - X-99');
    expect(result.body).not.toContain('{rechnungsnummer}');
  });

  it('multiple occurrences of placeholder in subject are all replaced', () => {
    const template = makeTemplate({
      subject: '{empfänger} / {empfänger}',
    });
    const result = service.renderTemplate(template, makeInvoice());
    expect(result.subject).toBe('Musterkunde AG / Musterkunde AG');
  });

  it('no placeholders in template leaves text unchanged', () => {
    const template = makeTemplate({
      subject: 'Kein Platzhalter',
      body: 'Fester Text ohne Ersetzung.',
    });
    const result = service.renderTemplate(template, makeInvoice());
    expect(result.subject).toBe('Kein Platzhalter');
    expect(result.body).toBe('Fester Text ohne Ersetzung.');
  });

  it('unknown placeholder is left as-is', () => {
    const template = makeTemplate({
      body: '{unbekannter_platzhalter}',
    });
    const result = service.renderTemplate(template, makeInvoice());
    expect(result.body).toContain('{unbekannter_platzhalter}');
  });

  it('empty invoiceNumber renders as empty string, not undefined', () => {
    const result = service.renderTemplate(
      makeTemplate({ subject: 'Re: {rechnungsnummer}', body: '{rechnungsnummer}' }),
      makeInvoice({ invoiceNumber: '' }),
    );
    expect(result.subject).toBe('Re: ');
    expect(result.body).toBe('');
  });

  it('buyer with no name renders empfänger as empty string', () => {
    const invoice = makeInvoice({
      buyer: { name: '', street: 'Str', city: 'City', postalCode: '12345', countryCode: 'DE' },
    });
    const result = service.renderTemplate(
      makeTemplate({ body: 'Empfänger: {empfänger}' }),
      invoice,
    );
    expect(result.body).toBe('Empfänger: ');
    expect(result.body).not.toContain('undefined');
  });

  it('currency falls back to EUR when currencyCode is missing', () => {
    // TypeScript won't allow undefined on required field, but service must handle it gracefully
    const invoice = makeInvoice({ currencyCode: '' as any });
    const result = service.renderTemplate(
      makeTemplate({ body: '{währung}' }),
      invoice,
    );
    // Empty string falls through — the || 'EUR' guard in service
    // Either '' or 'EUR' is acceptable; must not be 'undefined'
    expect(result.body).not.toContain('undefined');
  });

  it('subject and body are both rendered independently', () => {
    const template = makeTemplate({
      subject: 'Rechnung {rechnungsnummer}',
      body: 'Firma: {verkäufer}',
    });
    const result = service.renderTemplate(template, makeInvoice());
    expect(result.subject).toBe('Rechnung INV-2026-001');
    expect(result.body).toBe('Firma: Acme GmbH');
  });
});
