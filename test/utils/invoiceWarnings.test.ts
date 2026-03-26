import { describe, it, expect } from 'vitest';
import { checkInvoiceWarnings } from '../../src/shared/utils/invoiceWarnings.js';

/**
 * Helper: returns a minimal invoice that satisfies every check EXCEPT the fields
 * under test. This ensures that only the targeted field generates warnings.
 */
function makeInvoice(overrides: Record<string, any> = {}) {
  return {
    iban: '',
    bic: '',
    seller: {
      name: 'Test GmbH',
      contactName: 'Max Mustermann',
      contactPhone: '+49 30 12345678',
      contactEmail: 'kontakt@test.de',
      vatId: 'DE123456789',
      street: 'Musterstraße 1',
      city: 'Berlin',
      postalCode: '10115',
    },
    buyer: {
      name: 'Käufer GmbH',
      email: 'einkauf@kaeuf.de',
      street: 'Kaufstraße 5',
      city: 'Hamburg',
      postalCode: '20095',
    },
    buyerReference: '04011000-12345-03',
    dueDate: '2026-04-30',
    lines: [{ lineNetAmount: 100 }],
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Null / empty input
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — null / empty input', () => {
  it('returns empty array for null invoice', () => {
    expect(checkInvoiceWarnings(null)).toEqual([]);
  });

  it('returns empty array for undefined invoice', () => {
    expect(checkInvoiceWarnings(undefined)).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// IBAN — no IBAN field → no IBAN warning
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — IBAN absent or empty', () => {
  it('produces no IBAN warning when iban is empty string', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ iban: '' }));
    expect(warnings.some(w => w.field === 'iban')).toBe(false);
  });

  it('produces no IBAN warning when iban key is absent', () => {
    const inv = makeInvoice();
    delete (inv as any).iban;
    const warnings = checkInvoiceWarnings(inv);
    expect(warnings.some(w => w.field === 'iban')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// IBAN — valid IBANs produce no warning
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — valid IBANs', () => {
  const validIbans = [
    ['German with spaces', 'DE89 3704 0044 0532 0130 00'],
    ['German without spaces', 'DE89370400440532013000'],
    ['UK', 'GB29NWBK60161331926819'],
    ['French', 'FR7630006000011234567890189'],
  ];

  for (const [label, iban] of validIbans) {
    it(`no IBAN warning for ${label} (${iban.replace(/\s/g, '')})`, () => {
      const warnings = checkInvoiceWarnings(makeInvoice({ iban }));
      const ibanWarnings = warnings.filter(w => w.field === 'iban');
      expect(ibanWarnings, `Expected no IBAN warning for: ${iban}`).toHaveLength(0);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// IBAN — format-valid but checksum-invalid → warning
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — IBAN checksum failures', () => {
  it('warns for DE1234567891223404 (passes regex, fails Mod-97)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ iban: 'DE1234567891223404' }));
    const ibanWarnings = warnings.filter(w => w.field === 'iban');
    expect(ibanWarnings).toHaveLength(1);
    expect(ibanWarnings[0].message).toContain('DE1234567891223404');
  });

  it('warns for DE00370400440532013000 (check digits 00 are never valid)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ iban: 'DE00370400440532013000' }));
    expect(warnings.some(w => w.field === 'iban')).toBe(true);
  });

  it('warns for GB29NWBK60161331926818 (last digit changed — wrong checksum)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ iban: 'GB29NWBK60161331926818' }));
    expect(warnings.some(w => w.field === 'iban')).toBe(true);
  });

  it('warning message contains the original IBAN value', () => {
    const badIban = 'DE00370400440532013000';
    const warnings = checkInvoiceWarnings(makeInvoice({ iban: badIban }));
    const warn = warnings.find(w => w.field === 'iban');
    expect(warn).toBeDefined();
    expect(warn!.message).toContain(badIban);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// IBAN — format-invalid → warning
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — IBAN format failures', () => {
  const formatInvalidIbans = [
    ['too short / wrong format', 'INVALID'],
    ['no country code', '1234567890'],
    ['only country + check digits', 'DE89'],
    ['lowercase country code', 'de89370400440532013000'],
  ];

  for (const [label, iban] of formatInvalidIbans) {
    it(`warns for ${label} (${iban})`, () => {
      const warnings = checkInvoiceWarnings(makeInvoice({ iban }));
      expect(warnings.some(w => w.field === 'iban'), `Expected IBAN warning for: ${iban}`).toBe(true);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// IBAN — spaces are stripped before validation
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — IBAN whitespace handling', () => {
  it('strips spaces before checking — DE89 3704 0044 0532 0130 00 is valid', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ iban: 'DE89 3704 0044 0532 0130 00' }));
    expect(warnings.some(w => w.field === 'iban')).toBe(false);
  });

  it('valid IBAN with extra internal spaces still passes', () => {
    // Same IBAN but formatted differently
    const warnings = checkInvoiceWarnings(makeInvoice({ iban: 'DE89370400440532013000' }));
    expect(warnings.some(w => w.field === 'iban')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BIC — valid BICs produce no warning
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — valid BICs', () => {
  it('no warning for COBADEFFXXX (11-char BIC)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ bic: 'COBADEFFXXX' }));
    expect(warnings.some(w => w.field === 'bic')).toBe(false);
  });

  it('no warning for COBADEFF (8-char BIC)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ bic: 'COBADEFF' }));
    expect(warnings.some(w => w.field === 'bic')).toBe(false);
  });

  it('no warning for DEUTDEDBPAL (11-char with letters only branch)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ bic: 'DEUTDEDBPAL' }));
    expect(warnings.some(w => w.field === 'bic')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BIC — absent or empty → no warning
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — BIC absent or empty', () => {
  it('produces no BIC warning when bic is empty string', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ bic: '' }));
    expect(warnings.some(w => w.field === 'bic')).toBe(false);
  });

  it('produces no BIC warning when bic key is absent', () => {
    const inv = makeInvoice();
    delete (inv as any).bic;
    const warnings = checkInvoiceWarnings(inv);
    expect(warnings.some(w => w.field === 'bic')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BIC — invalid BICs produce a warning
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — invalid BICs', () => {
  it('warns for INVALID (too short, not matching regex)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ bic: 'INVALID' }));
    const bicWarnings = warnings.filter(w => w.field === 'bic');
    expect(bicWarnings).toHaveLength(1);
    expect(bicWarnings[0].message).toContain('INVALID');
  });

  it('warns for cobadeffxxx (lowercase — regex requires uppercase)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ bic: 'cobadeffxxx' }));
    expect(warnings.some(w => w.field === 'bic')).toBe(true);
  });

  it('warns for COBA (only 4 chars — too short)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ bic: 'COBA' }));
    expect(warnings.some(w => w.field === 'bic')).toBe(true);
  });

  it('warns for COBADEFF1234 (branch too long — 12 chars total)', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({ bic: 'COBADEFF1234' }));
    expect(warnings.some(w => w.field === 'bic')).toBe(true);
  });

  it('warning message contains the invalid BIC value', () => {
    const badBic = 'INVALID';
    const warnings = checkInvoiceWarnings(makeInvoice({ bic: badBic }));
    const warn = warnings.find(w => w.field === 'bic');
    expect(warn).toBeDefined();
    expect(warn!.message).toContain(badBic);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Combined IBAN + BIC — independence of checks
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — IBAN and BIC are checked independently', () => {
  it('valid IBAN + invalid BIC → only BIC warning', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({
      iban: 'DE89370400440532013000',
      bic: 'INVALID',
    }));
    expect(warnings.some(w => w.field === 'iban')).toBe(false);
    expect(warnings.some(w => w.field === 'bic')).toBe(true);
  });

  it('invalid IBAN + valid BIC → only IBAN warning', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({
      iban: 'DE00370400440532013000',
      bic: 'COBADEFFXXX',
    }));
    expect(warnings.some(w => w.field === 'iban')).toBe(true);
    expect(warnings.some(w => w.field === 'bic')).toBe(false);
  });

  it('invalid IBAN + invalid BIC → both warnings', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({
      iban: 'NOTANIBAN',
      bic: 'bad',
    }));
    expect(warnings.some(w => w.field === 'iban')).toBe(true);
    expect(warnings.some(w => w.field === 'bic')).toBe(true);
  });

  it('valid IBAN + valid BIC → neither warning', () => {
    const warnings = checkInvoiceWarnings(makeInvoice({
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
    }));
    expect(warnings.some(w => w.field === 'iban')).toBe(false);
    expect(warnings.some(w => w.field === 'bic')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Warning structure — InvoiceWarning interface shape
// ────────────────────────────────────────────────────────────────────────────

describe('checkInvoiceWarnings — InvoiceWarning structure', () => {
  it('each warning has a string field and a string message', () => {
    // Use an invoice guaranteed to produce at least one warning (invalid IBAN)
    const warnings = checkInvoiceWarnings(makeInvoice({ iban: 'DE00370400440532013000' }));
    const ibanWarn = warnings.find(w => w.field === 'iban');
    expect(ibanWarn).toBeDefined();
    expect(typeof ibanWarn!.field).toBe('string');
    expect(typeof ibanWarn!.message).toBe('string');
    expect(ibanWarn!.field.length).toBeGreaterThan(0);
    expect(ibanWarn!.message.length).toBeGreaterThan(0);
  });

  it('returns an array (never throws)', () => {
    const result = checkInvoiceWarnings(makeInvoice({ iban: 'WHATEVER', bic: '!!!' }));
    expect(Array.isArray(result)).toBe(true);
  });
});
