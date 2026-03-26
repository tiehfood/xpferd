import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { createApp } from '../../src/server/app.js';
import { Database } from '../../src/server/database/Database.js';

const TEST_DB = path.resolve(process.cwd(), 'test/.test-import-api.db');

let server: http.Server;
let baseUrl: string;

function readExample(name: string): string {
  return readFileSync(join(process.cwd(), 'examples', name), 'utf-8');
}

async function postImport(body: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${baseUrl}/api/v1/invoices/import/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

beforeAll(async () => {
  Database.resetInstance();
  Database.getInstance(TEST_DB);
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  Database.resetInstance();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (fs.existsSync(TEST_DB + '-wal')) fs.unlinkSync(TEST_DB + '-wal');
  if (fs.existsSync(TEST_DB + '-shm')) fs.unlinkSync(TEST_DB + '-shm');
});

// ---------------------------------------------------------------------------
// Happy path — UBL
// ---------------------------------------------------------------------------
describe('POST /api/v1/invoices/import/preview — UBL', () => {
  it('returns 200 with parsed UBL invoice', async () => {
    const xml = readExample('xrechnung-beispiel.xml');
    const { status, data } = await postImport({ xml });
    expect(status).toBe(200);
    expect((data as any).invoiceNumber).toBe('RE-2024-0042');
    expect((data as any).seller.name).toBe('Mustermann Consulting GmbH');
  });

  it('response includes buyer, payment, lines for UBL invoice', async () => {
    const xml = readExample('xrechnung-beispiel.xml');
    const { status, data } = await postImport({ xml });
    expect(status).toBe(200);
    const dto = data as any;
    expect(dto.buyer.name).toBe('Muster AG');
    expect(dto.iban).toBe('DE89370400440532013000');
    expect(dto.lines).toHaveLength(1);
    expect(dto.lines[0].itemName).toBe('IT-Beratung');
  });

  it('UBL response includes totals', async () => {
    const xml = readExample('xrechnung-beispiel.xml');
    const { status, data } = await postImport({ xml });
    expect(status).toBe(200);
    const dto = data as any;
    expect(dto.totalNetAmount).toBeCloseTo(6000, 2);
    expect(dto.totalGrossAmount).toBeCloseTo(7140, 2);
  });
});

// ---------------------------------------------------------------------------
// Happy path — CII
// ---------------------------------------------------------------------------
describe('POST /api/v1/invoices/import/preview — CII', () => {
  it('returns 200 with parsed CII invoice (XRechnung-Beispiel2)', async () => {
    const xml = readExample('XRechnung-Beispiel2.xml');
    const { status, data } = await postImport({ xml });
    expect(status).toBe(200);
    expect((data as any).invoiceNumber).toBe('24101');
    expect((data as any).seller.name).toBe('Lieferant GmbH');
  });

  it('CII response includes correct line items and totals', async () => {
    const xml = readExample('XRechnung-Beispiel2.xml');
    const { status, data } = await postImport({ xml });
    expect(status).toBe(200);
    const dto = data as any;
    expect(dto.lines).toHaveLength(2);
    expect(dto.totalNetAmount).toBeCloseTo(473, 2);
    expect(dto.totalGrossAmount).toBeCloseTo(529.87, 1);
  });

  it('returns 200 with parsed CII invoice (beispiel-xrechnung-cii)', async () => {
    const xml = readExample('beispiel-xrechnung-cii.xml');
    const { status, data } = await postImport({ xml });
    expect(status).toBe(200);
    expect((data as any).invoiceNumber).toBeTruthy();
    expect((data as any).seller.name).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Validation errors — 400
// ---------------------------------------------------------------------------
describe('POST /api/v1/invoices/import/preview — validation errors', () => {
  it('returns 400 when xml field is missing in body', async () => {
    const { status, data } = await postImport({});
    expect(status).toBe(400);
    expect((data as any).error).toBeTruthy();
  });

  it('returns 400 when body is empty object', async () => {
    const res = await fetch(`${baseUrl}/api/v1/invoices/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text());
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when xml is empty string', async () => {
    const { status, data } = await postImport({ xml: '' });
    expect(status).toBe(400);
    expect((data as any).error).toBeTruthy();
  });

  it('returns 400 when xml is whitespace only', async () => {
    const { status, data } = await postImport({ xml: '   \n\t  ' });
    expect(status).toBe(400);
    expect((data as any).error).toBeTruthy();
  });

  it('returns 400 for non-XML content', async () => {
    const { status, data } = await postImport({ xml: 'this is plain text, not xml' });
    expect(status).toBe(400);
    expect((data as any).error).toBeTruthy();
  });

  it('returns 400 for HTML input', async () => {
    const { status, data } = await postImport({ xml: '<!DOCTYPE html><html><body></body></html>' });
    expect(status).toBe(400);
    expect((data as any).error).toBeTruthy();
  });

  it('error message for HTML input is in German', async () => {
    const { status, data } = await postImport({ xml: '<html><body>not xml</body></html>' });
    expect(status).toBe(400);
    // The error is either "Unbekanntes XML-Format" or "Ungültiges XML"
    const error: string = (data as any).error;
    expect(error).toMatch(/[Uu]ngültig|[Uu]nbekannt/);
  });

  it('returns 400 for XML with unknown root element', async () => {
    const { status, data } = await postImport({ xml: '<Rechnung><ID>123</ID></Rechnung>' });
    expect(status).toBe(400);
    expect((data as any).error).toContain('Unbekanntes XML-Format');
  });

  it('response error field is a string', async () => {
    const { status, data } = await postImport({ xml: 'not xml' });
    expect(status).toBe(400);
    expect(typeof (data as any).error).toBe('string');
  });

  it('returns 400 when xml is null', async () => {
    const { status, data } = await postImport({ xml: null });
    expect(status).toBe(400);
    expect((data as any).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Side-effect isolation — import/preview must NOT save to DB
// ---------------------------------------------------------------------------
describe('POST /api/v1/invoices/import/preview — does not persist', () => {
  it('does NOT save invoice to DB — GET /api/v1/invoices returns empty array after import', async () => {
    const xml = readExample('xrechnung-beispiel.xml');
    // First import
    const { status } = await postImport({ xml });
    expect(status).toBe(200);

    // Verify nothing was saved
    const listRes = await fetch(`${baseUrl}/api/v1/invoices`);
    const listBody = JSON.parse(await listRes.text());
    expect(listRes.status).toBe(200);
    expect(listBody).toEqual([]);
  });

  it('importing twice does NOT create two DB records', async () => {
    const xml = readExample('XRechnung-Beispiel2.xml');
    await postImport({ xml });
    await postImport({ xml });

    const listRes = await fetch(`${baseUrl}/api/v1/invoices`);
    const listBody = JSON.parse(await listRes.text());
    expect(listBody).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Response shape validation
// ---------------------------------------------------------------------------
describe('POST /api/v1/invoices/import/preview — response shape', () => {
  it('200 response has invoiceNumber, seller, buyer, lines fields', async () => {
    const xml = readExample('xrechnung-beispiel.xml');
    const { status, data } = await postImport({ xml });
    expect(status).toBe(200);
    const dto = data as any;
    expect(dto).toHaveProperty('invoiceNumber');
    expect(dto).toHaveProperty('seller');
    expect(dto).toHaveProperty('buyer');
    expect(dto).toHaveProperty('lines');
    expect(Array.isArray(dto.lines)).toBe(true);
  });

  it('200 response does NOT include a database id', async () => {
    const xml = readExample('xrechnung-beispiel.xml');
    const { status, data } = await postImport({ xml });
    expect(status).toBe(200);
    // The preview DTO should have no id (not persisted)
    expect((data as any).id).toBeUndefined();
  });

  it('400 response has error field', async () => {
    const { status, data } = await postImport({ xml: '' });
    expect(status).toBe(400);
    expect(data).toHaveProperty('error');
    expect(typeof (data as any).error).toBe('string');
    expect((data as any).error.length).toBeGreaterThan(0);
  });

  it('response Content-Type is application/json', async () => {
    const xml = readExample('xrechnung-beispiel.xml');
    const res = await fetch(`${baseUrl}/api/v1/invoices/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('error response Content-Type is application/json', async () => {
    const res = await fetch(`${baseUrl}/api/v1/invoices/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: '' }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
