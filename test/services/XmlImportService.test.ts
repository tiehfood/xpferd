import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { XmlImportService } from '../../src/server/services/XmlImportService.js';

const service = new XmlImportService();

function readExample(name: string): string {
  return readFileSync(join(process.cwd(), 'examples', name), 'utf-8');
}

// ---------------------------------------------------------------------------
// UBL 2.1 — xrechnung-beispiel.xml (Mustermann Consulting GmbH)
// ---------------------------------------------------------------------------
describe('XmlImportService — UBL 2.1 (xrechnung-beispiel.xml)', () => {
  let result: ReturnType<typeof service.parse>;

  // Parse once; all tests share the single parsed result
  const xml = readExample('xrechnung-beispiel.xml');
  result = service.parse(xml);

  it('parses invoice number', () => {
    expect(result.invoiceNumber).toBe('RE-2024-0042');
  });

  it('parses invoice date', () => {
    expect(result.invoiceDate).toBe('2024-03-15');
  });

  it('parses due date', () => {
    expect(result.dueDate).toBe('2024-04-14');
  });

  it('parses invoice type code', () => {
    expect(result.invoiceTypeCode).toBe('380');
  });

  it('parses currency code', () => {
    expect(result.currencyCode).toBe('EUR');
  });

  it('parses buyer reference', () => {
    expect(result.buyerReference).toBe('BESTELLUNG-2024-0099');
  });

  it('parses note', () => {
    expect(result.note).toBe('Zahlbar innerhalb von 30 Tagen ohne Abzug.');
  });

  it('parses seller name from PartyLegalEntity/RegistrationName', () => {
    expect(result.seller.name).toBe('Mustermann Consulting GmbH');
  });

  it('parses seller street', () => {
    expect(result.seller.street).toBe('Unter den Linden 42');
  });

  it('parses seller city', () => {
    expect(result.seller.city).toBe('Berlin');
  });

  it('parses seller postal code', () => {
    expect(result.seller.postalCode).toBe('10117');
  });

  it('parses seller country code', () => {
    expect(result.seller.countryCode).toBe('DE');
  });

  it('parses seller VAT ID', () => {
    expect(result.seller.vatId).toBe('DE123456789');
  });

  it('parses seller contact name', () => {
    expect(result.seller.contactName).toBe('Max Mustermann');
  });

  it('parses seller contact phone', () => {
    expect(result.seller.contactPhone).toBe('+49 30 123456-0');
  });

  it('parses seller contact email', () => {
    expect(result.seller.contactEmail).toBe('max.mustermann@mustermann-consulting.de');
  });

  it('parses buyer name from PartyLegalEntity/RegistrationName', () => {
    expect(result.buyer.name).toBe('Muster AG');
  });

  it('parses buyer street', () => {
    expect(result.buyer.street).toBe('Maximilianstraße 10');
  });

  it('parses buyer city', () => {
    expect(result.buyer.city).toBe('München');
  });

  it('parses buyer postal code', () => {
    expect(result.buyer.postalCode).toBe('80539');
  });

  it('parses buyer country code', () => {
    expect(result.buyer.countryCode).toBe('DE');
  });

  it('parses payment means code', () => {
    expect(result.paymentMeansCode).toBe('58');
  });

  it('parses IBAN', () => {
    expect(result.iban).toBe('DE89370400440532013000');
  });

  it('parses BIC from FinancialInstitutionBranch/ID', () => {
    expect(result.bic).toBe('COBADEFFXXX');
  });

  it('parses payment reference (PaymentID)', () => {
    expect(result.paymentReference).toBe('RE-2024-0042');
  });

  it('parses account name', () => {
    expect(result.accountName).toBe('Mustermann Consulting GmbH');
  });

  it('parses tax category S', () => {
    expect(result.taxCategoryCode).toBe('S');
  });

  it('parses tax rate 19', () => {
    expect(result.taxRate).toBe(19);
  });

  it('parses total net amount', () => {
    expect(result.totalNetAmount).toBeCloseTo(6000, 2);
  });

  it('parses total tax amount', () => {
    expect(result.totalTaxAmount).toBeCloseTo(1140, 2);
  });

  it('parses total gross amount', () => {
    expect(result.totalGrossAmount).toBeCloseTo(7140, 2);
  });

  it('parses 1 line item', () => {
    expect(result.lines).toHaveLength(1);
  });

  it('line item 1 — itemName', () => {
    expect(result.lines[0].itemName).toBe('IT-Beratung');
  });

  it('line item 1 — unit code DAY', () => {
    expect(result.lines[0].unitCode).toBe('DAY');
  });

  it('line item 1 — quantity 5', () => {
    expect(result.lines[0].quantity).toBe(5);
  });

  it('line item 1 — net price 1200', () => {
    expect(result.lines[0].netPrice).toBeCloseTo(1200, 2);
  });

  it('line item 1 — line net amount 6000', () => {
    expect(result.lines[0].lineNetAmount).toBeCloseTo(6000, 2);
  });

  it('line item 1 — VAT category S', () => {
    expect(result.lines[0].vatCategoryCode).toBe('S');
  });

  it('line item 1 — VAT rate 19', () => {
    expect(result.lines[0].vatRate).toBe(19);
  });

  it('line item 1 — item description', () => {
    expect(result.lines[0].itemDescription).toContain('Beratung zur IT-Infrastruktur');
  });

  it('sets kleinunternehmer to false (category S, not E)', () => {
    expect(result.kleinunternehmer).toBe(false);
  });

  it('no delivery date in this file', () => {
    expect(result.deliveryDate).toBeUndefined();
  });

  it('no order reference in this file', () => {
    expect(result.orderReference).toBeUndefined();
  });

  it('no contract reference in this file', () => {
    expect(result.contractReference).toBeUndefined();
  });

  it('no prepaid amount in this file', () => {
    expect(result.prepaidAmount).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UBL 2.1 — UBL-Invoice-2.1-Example.xml (EN16931 example with extra fields)
// ---------------------------------------------------------------------------
describe('XmlImportService — UBL 2.1 (UBL-Invoice-2.1-Example.xml)', () => {
  const xml = readExample('UBL-Invoice-2.1-Example.xml');
  let result: ReturnType<typeof service.parse>;
  result = service.parse(xml);

  it('parses invoice number TOSL108', () => {
    expect(result.invoiceNumber).toBe('TOSL108');
  });

  it('parses invoice date 2009-12-15', () => {
    expect(result.invoiceDate).toBe('2009-12-15');
  });

  it('parses seller name from PartyName when no RegistrationName', () => {
    // This file has RegistrationName: "The Sellercompany Incorporated"
    expect(result.seller.name).toBe('The Sellercompany Incorporated');
  });

  it('parses delivery date 2009-12-15', () => {
    expect(result.deliveryDate).toBe('2009-12-15');
  });

  it('parses order reference 123', () => {
    expect(result.orderReference).toBe('123');
  });

  it('parses contract reference Contract321', () => {
    expect(result.contractReference).toBe('Contract321');
  });

  it('parses prepaid amount 1000', () => {
    expect(result.prepaidAmount).toBeCloseTo(1000, 2);
  });

  it('parses 5 line items', () => {
    expect(result.lines).toHaveLength(5);
  });

  it('first line item — Labtop computer', () => {
    expect(result.lines[0].itemName).toBe('Labtop computer');
  });

  it('first line item — has item description', () => {
    expect(result.lines[0].itemDescription).toBeDefined();
    expect(result.lines[0].itemDescription).toContain('Processor');
  });

  it('parses BIC from nested FinancialInstitution/ID', () => {
    expect(result.bic).toBe('DKDKABCD');
  });

  it('parses payment reference Payref1', () => {
    expect(result.paymentReference).toBe('Payref1');
  });

  it('parses buyer email from Contact/ElectronicMail (not EM endpoint)', () => {
    expect(result.buyer.email).toBe('john@buyercompany.eu');
  });

  it('parses payment terms note', () => {
    expect(result.paymentTerms).toContain('Penalty percentage');
  });
});

// ---------------------------------------------------------------------------
// CII — XRechnung-Beispiel2.xml (Lieferant GmbH)
// ---------------------------------------------------------------------------
describe('XmlImportService — CII (XRechnung-Beispiel2.xml)', () => {
  const xml = readExample('XRechnung-Beispiel2.xml');
  let result: ReturnType<typeof service.parse>;
  result = service.parse(xml);

  it('parses invoice number 24101', () => {
    expect(result.invoiceNumber).toBe('24101');
  });

  it('parses CII date YYYYMMDD → YYYY-MM-DD', () => {
    expect(result.invoiceDate).toBe('2024-12-20');
  });

  it('parses due date 2025-01-19', () => {
    expect(result.dueDate).toBe('2025-01-19');
  });

  it('parses invoice type code 380', () => {
    expect(result.invoiceTypeCode).toBe('380');
  });

  it('parses currency code EUR', () => {
    expect(result.currencyCode).toBe('EUR');
  });

  it('parses seller name Lieferant GmbH', () => {
    expect(result.seller.name).toBe('Lieferant GmbH');
  });

  it('parses seller street Lieferantenstraße 20', () => {
    expect(result.seller.street).toBe('Lieferantenstraße 20');
  });

  it('parses seller city München', () => {
    expect(result.seller.city).toBe('München');
  });

  it('parses seller postal code 80333', () => {
    expect(result.seller.postalCode).toBe('80333');
  });

  it('parses seller country DE', () => {
    expect(result.seller.countryCode).toBe('DE');
  });

  it('parses seller VAT ID (scheme VA)', () => {
    expect(result.seller.vatId).toBe('DE123456789');
  });

  it('parses seller tax number (scheme FC)', () => {
    expect(result.seller.taxNumber).toBe('201/113/40209');
  });

  it('parses seller contact name', () => {
    expect(result.seller.contactName).toBe('Max Mustermann');
  });

  it('parses seller contact phone', () => {
    expect(result.seller.contactPhone).toBe('05355 - 123 456');
  });

  it('parses seller contact email', () => {
    expect(result.seller.contactEmail).toBe('info@mein-lieferant.de');
  });

  it('parses buyer name Kunden AG Mitte', () => {
    expect(result.buyer.name).toBe('Kunden AG Mitte');
  });

  it('parses buyer street Kundenstr. 15', () => {
    expect(result.buyer.street).toBe('Kundenstr. 15');
  });

  it('parses buyer city Frankfurt', () => {
    expect(result.buyer.city).toBe('Frankfurt');
  });

  it('parses buyer postal code 69876', () => {
    expect(result.buyer.postalCode).toBe('69876');
  });

  it('parses buyer country DE', () => {
    expect(result.buyer.countryCode).toBe('DE');
  });

  it('parses payment means code 58', () => {
    expect(result.paymentMeansCode).toBe('58');
  });

  it('parses IBAN DE1234567891223404', () => {
    expect(result.iban).toBe('DE1234567891223404');
  });

  it('parses BIC MEINEBIC12N', () => {
    expect(result.bic).toBe('MEINEBIC12N');
  });

  it('parses account name Max Mustermann', () => {
    expect(result.accountName).toBe('Max Mustermann');
  });

  it('parses payment terms description', () => {
    expect(result.paymentTerms).toBe('30 Tage netto, 10 Tage 3% Skonto');
  });

  it('joins multiple IncludedNote elements with newline', () => {
    expect(result.note).toBeDefined();
    expect(result.note).toContain('Powered by Hyreka');
    expect(result.note).toContain('Zahlbar innerhalb 30 Tagen');
  });

  it('parses order reference BE1234 (BuyerOrderReferencedDocument)', () => {
    expect(result.orderReference).toBe('BE1234');
  });

  it('parses delivery date 2024-12-20', () => {
    expect(result.deliveryDate).toBe('2024-12-20');
  });

  it('parses 2 line items', () => {
    expect(result.lines).toHaveLength(2);
  });

  it('line item 1 — Trennblätter A4', () => {
    expect(result.lines[0].itemName).toBe('Trennblätter A4');
  });

  it('line item 1 — quantity 20, unit H87', () => {
    expect(result.lines[0].quantity).toBeCloseTo(20, 2);
    expect(result.lines[0].unitCode).toBe('H87');
  });

  it('line item 1 — net price 9.90', () => {
    expect(result.lines[0].netPrice).toBeCloseTo(9.9, 2);
  });

  it('line item 1 — line net amount 198.00', () => {
    expect(result.lines[0].lineNetAmount).toBeCloseTo(198, 2);
  });

  it('line item 1 — VAT category S, rate 19', () => {
    expect(result.lines[0].vatCategoryCode).toBe('S');
    expect(result.lines[0].vatRate).toBe(19);
  });

  it('line item 2 — Joghurt Banane', () => {
    expect(result.lines[1].itemName).toBe('Joghurt Banane');
  });

  it('line item 2 — quantity 50, VAT rate 7', () => {
    expect(result.lines[1].quantity).toBeCloseTo(50, 2);
    expect(result.lines[1].vatRate).toBe(7);
  });

  it('line item 2 — line net amount 275.00', () => {
    expect(result.lines[1].lineNetAmount).toBeCloseTo(275, 2);
  });

  it('parses total net amount 473', () => {
    expect(result.totalNetAmount).toBeCloseTo(473, 2);
  });

  it('parses total tax amount 56.87', () => {
    expect(result.totalTaxAmount).toBeCloseTo(56.87, 1);
  });

  it('parses total gross amount 529.87', () => {
    expect(result.totalGrossAmount).toBeCloseTo(529.87, 1);
  });

  it('TotalPrepaidAmount is 0 so prepaidAmount is undefined', () => {
    // Service only sets prepaidAmount when raw > 0
    expect(result.prepaidAmount).toBeUndefined();
  });

  it('sets kleinunternehmer to false', () => {
    expect(result.kleinunternehmer).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CII — beispiel-xrechnung-cii.xml
// ---------------------------------------------------------------------------
describe('XmlImportService — CII (beispiel-xrechnung-cii.xml)', () => {
  it('parses successfully and returns an invoice with lines', () => {
    const xml = readExample('beispiel-xrechnung-cii.xml');
    const result = service.parse(xml);
    expect(result.invoiceNumber).toBeTruthy();
    expect(result.seller.name).toBeTruthy();
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// CII — Musterrechnung_XRechnung.xml (Max Mustermann)
// ---------------------------------------------------------------------------
describe('XmlImportService — CII (Musterrechnung_XRechnung.xml)', () => {
  it('parses successfully and returns an invoice with lines', () => {
    const xml = readExample('Musterrechnung_XRechnung.xml');
    const result = service.parse(xml);
    expect(result.invoiceNumber).toBeTruthy();
    expect(result.seller.name).toBeTruthy();
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Error / edge cases
// ---------------------------------------------------------------------------
describe('XmlImportService — error and edge cases', () => {
  it('throws for empty string input', () => {
    expect(() => service.parse('')).toThrow();
  });

  it('error message for empty string contains German text', () => {
    expect(() => service.parse('')).toThrow(/Ungültig|XML|leer/i);
  });

  it('throws for non-XML plain text', () => {
    expect(() => service.parse('this is not xml at all')).toThrow();
  });

  it('throws for HTML input', () => {
    expect(() =>
      service.parse('<!DOCTYPE html><html><body><p>Hello</p></body></html>'),
    ).toThrow();
  });

  it('error for unknown XML root element is in German', () => {
    expect(() =>
      service.parse('<SomeUnknownRoot><ID>123</ID></SomeUnknownRoot>'),
    ).toThrow(/Unbekanntes XML-Format/);
  });

  it('throws for XML with wrong root element', () => {
    expect(() =>
      service.parse('<foo><bar>baz</bar></foo>'),
    ).toThrow();
  });

  it('provides IMPORT-timestamp fallback for missing invoice number', () => {
    const minimal = `<?xml version="1.0"?>
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
        <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
      </Invoice>`;
    const result = service.parse(minimal);
    expect(result.invoiceNumber).toMatch(/^IMPORT-\d+$/);
  });

  it('defaults currency code to EUR when missing', () => {
    const minimal = `<?xml version="1.0"?>
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
        <cbc:ID>TEST-001</cbc:ID>
      </Invoice>`;
    const result = service.parse(minimal);
    expect(result.currencyCode).toBe('EUR');
  });

  it('defaults payment means code to 58 when missing', () => {
    const minimal = `<?xml version="1.0"?>
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
        <cbc:ID>TEST-002</cbc:ID>
        <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
      </Invoice>`;
    const result = service.parse(minimal);
    expect(result.paymentMeansCode).toBe('58');
  });

  it('defaults invoice type code to 380 when missing', () => {
    const minimal = `<?xml version="1.0"?>
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
        <cbc:ID>TEST-003</cbc:ID>
      </Invoice>`;
    const result = service.parse(minimal);
    expect(result.invoiceTypeCode).toBe('380');
  });

  it('handles missing optional fields gracefully (no throw)', () => {
    const minimal = `<?xml version="1.0"?>
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
        <cbc:ID>MINIMAL-001</cbc:ID>
        <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
      </Invoice>`;
    expect(() => service.parse(minimal)).not.toThrow();
    const result = service.parse(minimal);
    expect(result.dueDate).toBeUndefined();
    expect(result.note).toBeUndefined();
    expect(result.deliveryDate).toBeUndefined();
    expect(result.orderReference).toBeUndefined();
    expect(result.contractReference).toBeUndefined();
    expect(result.iban).toBeUndefined();
    expect(result.bic).toBeUndefined();
    expect(result.paymentReference).toBeUndefined();
    expect(result.accountName).toBeUndefined();
    expect(result.paymentTerms).toBeUndefined();
    expect(result.prepaidAmount).toBeUndefined();
  });

  it('returns empty lines array when no InvoiceLine elements present', () => {
    const minimal = `<?xml version="1.0"?>
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
        <cbc:ID>NO-LINES-001</cbc:ID>
      </Invoice>`;
    const result = service.parse(minimal);
    expect(result.lines).toEqual([]);
  });

  it('sets kleinunternehmer to false by default', () => {
    const xml = readExample('xrechnung-beispiel.xml');
    const result = service.parse(xml);
    expect(result.kleinunternehmer).toBe(false);
  });

  it('CII format: throws for unknown root', () => {
    expect(() =>
      service.parse('<rsm:SomethingElse xmlns:rsm="urn:example"><rsm:Foo/></rsm:SomethingElse>'),
    ).toThrow();
  });

  it('CII: provides IMPORT-timestamp fallback for missing invoice number', () => {
    const minimal = `<?xml version="1.0"?>
      <rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                                xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                                xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
        <rsm:ExchangedDocument>
          <ram:TypeCode>380</ram:TypeCode>
        </rsm:ExchangedDocument>
        <rsm:SupplyChainTradeTransaction/>
      </rsm:CrossIndustryInvoice>`;
    const result = service.parse(minimal);
    expect(result.invoiceNumber).toMatch(/^IMPORT-\d+$/);
  });
});

// ---------------------------------------------------------------------------
// Kleinunternehmer detection
// ---------------------------------------------------------------------------
describe('XmlImportService — kleinunternehmer detection', () => {
  it('sets kleinunternehmer=true when category E + rate 0 + note contains §19', () => {
    const xml = `<?xml version="1.0"?>
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
        <cbc:ID>KU-001</cbc:ID>
        <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
        <cbc:Note>Gemäß §19 UStG wird keine Umsatzsteuer berechnet.</cbc:Note>
        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="EUR">500.00</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:ID>E</cbc:ID>
              <cbc:Percent>0</cbc:Percent>
              <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
            </cac:TaxCategory>
          </cac:TaxSubtotal>
        </cac:TaxTotal>
      </Invoice>`;
    const result = service.parse(xml);
    expect(result.kleinunternehmer).toBe(true);
  });

  it('sets kleinunternehmer=false when category E but note lacks §19', () => {
    const xml = `<?xml version="1.0"?>
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
        <cbc:ID>KU-002</cbc:ID>
        <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
        <cbc:Note>Steuerbefreit aus anderem Grund.</cbc:Note>
        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="EUR">500.00</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:ID>E</cbc:ID>
              <cbc:Percent>0</cbc:Percent>
              <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
            </cac:TaxCategory>
          </cac:TaxSubtotal>
        </cac:TaxTotal>
      </Invoice>`;
    const result = service.parse(xml);
    expect(result.kleinunternehmer).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Format auto-detection
// ---------------------------------------------------------------------------
describe('XmlImportService — format auto-detection', () => {
  it('detects UBL by Invoice root element', () => {
    const xml = readExample('xrechnung-beispiel.xml');
    const result = service.parse(xml);
    // UBL produces cbc/cac namespace fields
    expect(result.invoiceNumber).toBe('RE-2024-0042');
  });

  it('detects CII by CrossIndustryInvoice root element', () => {
    const xml = readExample('XRechnung-Beispiel2.xml');
    const result = service.parse(xml);
    expect(result.invoiceNumber).toBe('24101');
  });
});
