/**
 * PartyPropagation.test.ts
 *
 * Verifies that PartyService.update() propagates party changes to all invoices
 * that reference the updated party by name + city.
 *
 * Tests are ordered within a shared DB so each can depend on the state left by
 * the previous one (sequential integration pattern), but isolated from all other
 * test suites via a unique ephemeral DB path.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { Database } from '../../src/server/database/Database.js';
import { PartyService } from '../../src/server/services/PartyService.js';
import { InvoiceService } from '../../src/server/services/InvoiceService.js';
import type { PartyDto, InvoiceDto } from '../../src/shared/types';

const TEST_DB = path.resolve(process.cwd(), `test/.test-party-propagation-${Date.now()}.db`);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeSellerParty(overrides: Partial<PartyDto> = {}): PartyDto {
  return {
    type: 'seller',
    name: 'Propagation Seller GmbH',
    street: 'Verkäuferstraße 1',
    city: 'Berlin',
    postalCode: '10115',
    countryCode: 'DE',
    vatId: 'DE123456789',
    taxNumber: '12/345/67890',
    contactName: 'Max Mustermann',
    contactPhone: '+49 30 12345678',
    contactEmail: 'seller@example.de',
    ...overrides,
  };
}

function makeBuyerParty(overrides: Partial<PartyDto> = {}): PartyDto {
  return {
    type: 'buyer',
    name: 'Propagation Buyer AG',
    street: 'Käuferstraße 2',
    city: 'München',
    postalCode: '80331',
    countryCode: 'DE',
    email: 'buyer@example.de',
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    invoiceNumber: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    invoiceDate: '2026-01-01',
    invoiceTypeCode: '380',
    currencyCode: 'EUR',
    buyerReference: 'BR-TEST',
    seller: {
      name: 'Propagation Seller GmbH',
      street: 'Verkäuferstraße 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      taxNumber: '12/345/67890',
    },
    buyer: {
      name: 'Propagation Buyer AG',
      street: 'Käuferstraße 2',
      city: 'München',
      postalCode: '80331',
      countryCode: 'DE',
      email: 'buyer@example.de',
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
        itemName: 'Testposition',
        netPrice: 100,
        vatCategoryCode: 'S',
        vatRate: 19,
        lineNetAmount: 100,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PartyService — update propagation to invoices', () => {
  let partyService: PartyService;
  let invoiceService: InvoiceService;

  beforeAll(() => {
    Database.resetInstance();
    Database.getInstance(TEST_DB);
    partyService = new PartyService();
    invoiceService = new InvoiceService();
  });

  afterAll(() => {
    Database.resetInstance();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TEST_DB + '-wal')) fs.unlinkSync(TEST_DB + '-wal');
    if (fs.existsSync(TEST_DB + '-shm')) fs.unlinkSync(TEST_DB + '-shm');
  });

  // -------------------------------------------------------------------------
  // 1. Seller update propagates taxNumber to matching invoice
  // -------------------------------------------------------------------------
  describe('seller update propagates to a single invoice', () => {
    it('invoice seller taxNumber is updated after party update', () => {
      // Create the party in the parties table
      const party = partyService.create(makeSellerParty({ taxNumber: '12/345/67890' }));

      // Create an invoice whose seller name+city match the party
      const invoice = invoiceService.create(
        makeInvoice({
          seller: {
            name: party.name,
            street: party.street!,
            city: party.city,
            postalCode: party.postalCode,
            countryCode: party.countryCode,
            taxNumber: '12/345/67890',
          },
        })
      );
      expect(invoice.seller.taxNumber).toBe('12/345/67890');

      // Update the party with a new taxNumber
      partyService.update(party.id!, makeSellerParty({ taxNumber: '98/765/43210' }));

      // The invoice should now reflect the new taxNumber
      const updated = invoiceService.getById(invoice.id!);
      expect(updated).not.toBeNull();
      expect(updated!.seller.taxNumber).toBe('98/765/43210');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Buyer update propagates email to matching invoice
  // -------------------------------------------------------------------------
  describe('buyer update propagates to a single invoice', () => {
    it('invoice buyer email is updated after party update', () => {
      const party = partyService.create(makeBuyerParty({ email: 'old@buyer.de' }));

      const invoice = invoiceService.create(
        makeInvoice({
          buyer: {
            name: party.name,
            street: party.street!,
            city: party.city,
            postalCode: party.postalCode,
            countryCode: party.countryCode,
            email: 'old@buyer.de',
          },
        })
      );
      expect(invoice.buyer.email).toBe('old@buyer.de');

      partyService.update(party.id!, makeBuyerParty({ email: 'new@buyer.de' }));

      const updated = invoiceService.getById(invoice.id!);
      expect(updated).not.toBeNull();
      expect(updated!.buyer.email).toBe('new@buyer.de');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Multiple invoices with same seller are all updated
  // -------------------------------------------------------------------------
  describe('seller update propagates to multiple invoices', () => {
    it('both invoices have the new vatId after a single party update', () => {
      const party = partyService.create(
        makeSellerParty({ name: 'Multi Invoice Seller', city: 'Hamburg', vatId: 'DE111111111' })
      );

      const sellerData = {
        name: party.name,
        street: party.street!,
        city: party.city,
        postalCode: party.postalCode,
        countryCode: party.countryCode,
        vatId: 'DE111111111',
      };

      const inv1 = invoiceService.create(makeInvoice({ seller: sellerData }));
      const inv2 = invoiceService.create(makeInvoice({ seller: sellerData }));

      // Confirm initial state
      expect(invoiceService.getById(inv1.id!)!.seller.vatId).toBe('DE111111111');
      expect(invoiceService.getById(inv2.id!)!.seller.vatId).toBe('DE111111111');

      // Update the party
      partyService.update(
        party.id!,
        makeSellerParty({ name: party.name, city: party.city, vatId: 'DE999999999' })
      );

      // Both invoices must be updated
      expect(invoiceService.getById(inv1.id!)!.seller.vatId).toBe('DE999999999');
      expect(invoiceService.getById(inv2.id!)!.seller.vatId).toBe('DE999999999');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Invoice with a DIFFERENT seller is NOT updated
  // -------------------------------------------------------------------------
  describe('non-matching invoices are not affected', () => {
    it('invoice with a different seller name is unchanged after party update', () => {
      // Party A — the one being updated
      const partyA = partyService.create(
        makeSellerParty({ name: 'Seller A GmbH', city: 'Köln', taxNumber: 'A-OLD' })
      );

      // Party B — a different seller, different name
      const invoiceB = invoiceService.create(
        makeInvoice({
          seller: {
            name: 'Seller B GmbH',
            street: 'Andere Str. 5',
            city: 'Dresden',
            postalCode: '01067',
            countryCode: 'DE',
            taxNumber: 'B-ORIGINAL',
          },
        })
      );

      // Invoice for party A
      const invoiceA = invoiceService.create(
        makeInvoice({
          seller: {
            name: partyA.name,
            street: partyA.street!,
            city: partyA.city,
            postalCode: partyA.postalCode,
            countryCode: partyA.countryCode,
            taxNumber: 'A-OLD',
          },
        })
      );

      // Update only party A
      partyService.update(partyA.id!, makeSellerParty({ name: partyA.name, city: partyA.city, taxNumber: 'A-NEW' }));

      // Invoice A is updated
      expect(invoiceService.getById(invoiceA.id!)!.seller.taxNumber).toBe('A-NEW');

      // Invoice B is NOT touched
      expect(invoiceService.getById(invoiceB.id!)!.seller.taxNumber).toBe('B-ORIGINAL');
    });

    it('invoice with same seller name but different city is not updated', () => {
      const party = partyService.create(
        makeSellerParty({ name: 'Same Name GmbH', city: 'Frankfurt', taxNumber: 'FRANKFURT-OLD' })
      );

      // Invoice in Frankfurt — matches the party
      const invFrankfurt = invoiceService.create(
        makeInvoice({
          seller: {
            name: 'Same Name GmbH',
            street: 'Mainzer Str 1',
            city: 'Frankfurt',
            postalCode: '60311',
            countryCode: 'DE',
            taxNumber: 'FRANKFURT-OLD',
          },
        })
      );

      // Invoice in Stuttgart — same company name but different city (does NOT match)
      const invStuttgart = invoiceService.create(
        makeInvoice({
          seller: {
            name: 'Same Name GmbH',
            street: 'Königstr 1',
            city: 'Stuttgart',
            postalCode: '70173',
            countryCode: 'DE',
            taxNumber: 'STUTTGART-UNCHANGED',
          },
        })
      );

      // Update the Frankfurt party
      partyService.update(party.id!, makeSellerParty({ name: 'Same Name GmbH', city: 'Frankfurt', taxNumber: 'FRANKFURT-NEW' }));

      // Frankfurt invoice updated
      expect(invoiceService.getById(invFrankfurt.id!)!.seller.taxNumber).toBe('FRANKFURT-NEW');

      // Stuttgart invoice untouched
      expect(invoiceService.getById(invStuttgart.id!)!.seller.taxNumber).toBe('STUTTGART-UNCHANGED');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Name + city rename propagates — invoices with old name are updated
  // -------------------------------------------------------------------------
  describe('seller name+city rename propagates to invoices', () => {
    it('invoices referencing old seller name are updated to the new name', () => {
      const party = partyService.create(
        makeSellerParty({ name: 'Alte Firma GmbH', city: 'Leipzig', vatId: 'DE777777777' })
      );

      const invoice = invoiceService.create(
        makeInvoice({
          seller: {
            name: 'Alte Firma GmbH',
            street: party.street!,
            city: 'Leipzig',
            postalCode: party.postalCode,
            countryCode: party.countryCode,
            vatId: 'DE777777777',
          },
        })
      );

      expect(invoice.seller.name).toBe('Alte Firma GmbH');

      // Rename the company (name changes, city stays the same)
      partyService.update(
        party.id!,
        makeSellerParty({ name: 'Neue Firma GmbH', city: 'Leipzig', vatId: 'DE777777777' })
      );

      const updated = invoiceService.getById(invoice.id!);
      expect(updated).not.toBeNull();
      expect(updated!.seller.name).toBe('Neue Firma GmbH');
    });

    it('the renamed party itself is updated in the parties table', () => {
      const party = partyService.create(
        makeSellerParty({ name: 'Umbenennung GmbH', city: 'Bremen' })
      );

      partyService.update(
        party.id!,
        makeSellerParty({ name: 'Neuer Name GmbH', city: 'Bremen' })
      );

      const found = partyService.getById(party.id!);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Neuer Name GmbH');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Full field propagation — all seller fields are propagated
  // -------------------------------------------------------------------------
  describe('all seller fields are propagated, not just taxNumber', () => {
    it('street, postalCode, countryCode, vatId, contactName, contactEmail all update', () => {
      const party = partyService.create(
        makeSellerParty({
          name: 'Full Fields Seller',
          city: 'Düsseldorf',
          street: 'Alte Str 1',
          postalCode: '40210',
          vatId: 'DE100000001',
          contactName: 'Alter Kontakt',
          contactEmail: 'alt@example.de',
        })
      );

      const invoice = invoiceService.create(
        makeInvoice({
          seller: {
            name: 'Full Fields Seller',
            street: 'Alte Str 1',
            city: 'Düsseldorf',
            postalCode: '40210',
            countryCode: 'DE',
            vatId: 'DE100000001',
            contactName: 'Alter Kontakt',
            contactEmail: 'alt@example.de',
          },
        })
      );

      partyService.update(
        party.id!,
        makeSellerParty({
          name: 'Full Fields Seller',
          city: 'Düsseldorf',
          street: 'Neue Str 99',
          postalCode: '40213',
          vatId: 'DE200000002',
          contactName: 'Neuer Kontakt',
          contactEmail: 'neu@example.de',
        })
      );

      const updated = invoiceService.getById(invoice.id!)!;
      expect(updated.seller.street).toBe('Neue Str 99');
      expect(updated.seller.postalCode).toBe('40213');
      expect(updated.seller.vatId).toBe('DE200000002');
      expect(updated.seller.contactName).toBe('Neuer Kontakt');
      expect(updated.seller.contactEmail).toBe('neu@example.de');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Full field propagation — all buyer fields are propagated
  // -------------------------------------------------------------------------
  describe('all buyer fields are propagated', () => {
    it('street, postalCode, email, vatId all update in matching invoices', () => {
      const party = partyService.create(
        makeBuyerParty({
          name: 'Full Fields Buyer',
          city: 'Nürnberg',
          street: 'Käufer Alte Str 1',
          postalCode: '90402',
          vatId: 'DE300000003',
          email: 'alt@buyer.de',
        })
      );

      const invoice = invoiceService.create(
        makeInvoice({
          buyer: {
            name: 'Full Fields Buyer',
            street: 'Käufer Alte Str 1',
            city: 'Nürnberg',
            postalCode: '90402',
            countryCode: 'DE',
            vatId: 'DE300000003',
            email: 'alt@buyer.de',
          },
        })
      );

      partyService.update(
        party.id!,
        makeBuyerParty({
          name: 'Full Fields Buyer',
          city: 'Nürnberg',
          street: 'Käufer Neue Str 42',
          postalCode: '90403',
          vatId: 'DE400000004',
          email: 'neu@buyer.de',
        })
      );

      const updated = invoiceService.getById(invoice.id!)!;
      expect(updated.buyer.street).toBe('Käufer Neue Str 42');
      expect(updated.buyer.postalCode).toBe('90403');
      expect(updated.buyer.vatId).toBe('DE400000004');
      expect(updated.buyer.email).toBe('neu@buyer.de');
    });
  });

  // -------------------------------------------------------------------------
  // 8. Updating a non-existent party returns null and does not throw
  // -------------------------------------------------------------------------
  describe('edge case: update on non-existent party', () => {
    it('returns null without modifying any invoice', () => {
      const invoice = invoiceService.create(makeInvoice());
      const originalSeller = invoice.seller.name;

      const result = partyService.update(999999, makeSellerParty());
      expect(result).toBeNull();

      // Invoice is unchanged
      const after = invoiceService.getById(invoice.id!);
      expect(after!.seller.name).toBe(originalSeller);
    });
  });
});
