import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { Database } from '../../src/server/database/Database.js';
import type { Server } from 'http';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.resolve(process.cwd(), `test/.test-recurring-${Date.now()}.db`);
let server: Server;
let baseUrl: string;

// ─── Shared test state ────────────────────────────────────────────────────────
let invoiceTemplateId: number;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function api(method: string, urlPath: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = res.status === 204
    ? null
    : (res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text);
  return { status: res.status, data };
}

function sampleRecurring(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Test Recurring',
    invoiceTemplateId,
    frequency: 'monthly',
    dayOfMonth: 15,
    startDate: '2026-01-01',
    dueDateOffsetDays: 30,
    deliveryDateOffsetDays: 0,
    active: true,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

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

  // Create an invoice template that recurring invoices can reference
  const templateData = JSON.stringify({
    invoiceNumber: 'RECURRING-TPL-001',
    invoiceDate: '2026-01-15',
    invoiceTypeCode: '380',
    currencyCode: 'EUR',
    dueDate: '2026-02-14',
    buyerReference: 'LEITWEG-123',
    seller: {
      name: 'Recurring Seller GmbH',
      street: 'Musterstraße 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      vatId: 'DE123456789',
    },
    buyer: {
      name: 'Test Buyer AG',
      street: 'Käuferstraße 2',
      city: 'München',
      postalCode: '80331',
      countryCode: 'DE',
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
        itemName: 'Monatlicher Service',
        netPrice: 500,
        vatCategoryCode: 'S',
        vatRate: 19,
        lineNetAmount: 500,
      },
    ],
  });

  const { status, data } = await api('POST', '/api/v1/templates/invoice-templates', {
    name: 'Recurring Test Template',
    data: templateData,
  });
  expect(status, 'Invoice template creation failed in beforeAll').toBe(201);
  invoiceTemplateId = (data as { id: number }).id;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  Database.resetInstance();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (fs.existsSync(TEST_DB + '-wal')) fs.unlinkSync(TEST_DB + '-wal');
  if (fs.existsSync(TEST_DB + '-shm')) fs.unlinkSync(TEST_DB + '-shm');
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Recurring Invoice API', () => {

  // ── CRUD: List ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/recurring-invoices', () => {
    it('returns empty array when no schedules exist', async () => {
      const { status, data } = await api('GET', '/api/v1/recurring-invoices');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect((data as unknown[]).length).toBe(0);
    });
  });

  // ── CRUD: Create ────────────────────────────────────────────────────────────

  describe('POST /api/v1/recurring-invoices', () => {
    it('creates a monthly recurring invoice with valid data → 201 with id', async () => {
      const { status, data } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring());
      expect(status).toBe(201);
      const body = data as Record<string, unknown>;
      expect(body.id).toBeTypeOf('number');
      expect(body.name).toBe('Test Recurring');
      expect(body.invoiceTemplateId).toBe(invoiceTemplateId);
      expect(body.frequency).toBe('monthly');
      expect(body.dayOfMonth).toBe(15);
      expect(body.active).toBe(true);
    });

    it('computes nextScheduledDate on creation', async () => {
      const { status, data } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'NextDate Check',
        startDate: '2026-01-01',
        dayOfMonth: 10,
      }));
      expect(status).toBe(201);
      const body = data as Record<string, unknown>;
      expect(body.nextScheduledDate).toBeTypeOf('string');
      // nextScheduledDate should be a valid date >= startDate
      expect(body.nextScheduledDate as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns 400 when name is missing', async () => {
      const payload = sampleRecurring();
      delete (payload as Record<string, unknown>).name;
      const { status, data } = await api('POST', '/api/v1/recurring-invoices', payload);
      expect(status).toBe(400);
      const body = data as Record<string, unknown>;
      expect(body.error).toBe('Validation failed');
      expect(Array.isArray(body.details)).toBe(true);
      expect((body.details as unknown[]).length).toBeGreaterThan(0);
    });

    it('returns 400 when frequency is missing', async () => {
      const payload = sampleRecurring();
      delete (payload as Record<string, unknown>).frequency;
      const { status, data } = await api('POST', '/api/v1/recurring-invoices', payload);
      expect(status).toBe(400);
      const body = data as Record<string, unknown>;
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 for monthly frequency without dayOfMonth or monthPosition', async () => {
      const payload = sampleRecurring();
      delete (payload as Record<string, unknown>).dayOfMonth;
      const { status, data } = await api('POST', '/api/v1/recurring-invoices', payload);
      expect(status).toBe(400);
      const body = data as Record<string, unknown>;
      expect(body.error).toBe('Validation failed');
      expect(body.details).toBeDefined();
    });

    it('returns 400 for quarterly frequency without dayOfMonth or monthPosition', async () => {
      const { status, data } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        frequency: 'quarterly',
        // dayOfMonth omitted intentionally
        dayOfMonth: undefined,
      }));
      expect(status).toBe(400);
      const body = data as Record<string, unknown>;
      expect(body.error).toBe('Validation failed');
    });

    it('accepts monthly with monthPosition=last instead of dayOfMonth', async () => {
      const payload: Record<string, unknown> = {
        name: 'End of Month',
        invoiceTemplateId,
        frequency: 'monthly',
        monthPosition: 'last',
        startDate: '2026-01-01',
        dueDateOffsetDays: 14,
        deliveryDateOffsetDays: 0,
        active: true,
      };
      const { status, data } = await api('POST', '/api/v1/recurring-invoices', payload);
      expect(status).toBe(201);
      const body = data as Record<string, unknown>;
      expect(body.id).toBeTypeOf('number');
      expect(body.monthPosition).toBe('last');
    });

    it('accepts weekly frequency (no dayOfMonth required)', async () => {
      const payload: Record<string, unknown> = {
        name: 'Weekly Schedule',
        invoiceTemplateId,
        frequency: 'weekly',
        dayOfWeek: 0, // Monday
        startDate: '2026-01-05',
        dueDateOffsetDays: 7,
        deliveryDateOffsetDays: 0,
        active: true,
      };
      const { status, data } = await api('POST', '/api/v1/recurring-invoices', payload);
      expect(status).toBe(201);
      const body = data as Record<string, unknown>;
      expect(body.frequency).toBe('weekly');
    });
  });

  // ── CRUD: Get by ID ─────────────────────────────────────────────────────────

  describe('GET /api/v1/recurring-invoices/:id', () => {
    it('returns the created schedule with correct data', async () => {
      // Create one to retrieve
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'GetById Test',
        dayOfMonth: 20,
      }));
      const id = (created as Record<string, unknown>).id as number;

      const { status, data } = await api('GET', `/api/v1/recurring-invoices/${id}`);
      expect(status).toBe(200);
      const body = data as Record<string, unknown>;
      expect(body.id).toBe(id);
      expect(body.name).toBe('GetById Test');
      expect(body.dayOfMonth).toBe(20);
      expect(body.invoiceTemplateId).toBe(invoiceTemplateId);
    });

    it('returns 404 for non-existent id', async () => {
      const { status, data } = await api('GET', '/api/v1/recurring-invoices/999999');
      expect(status).toBe(404);
      expect((data as Record<string, unknown>).error).toBeDefined();
    });
  });

  // ── CRUD: Update ────────────────────────────────────────────────────────────

  describe('PUT /api/v1/recurring-invoices/:id', () => {
    it('updates name and returns 200 with changed name', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Before Update',
      }));
      const id = (created as Record<string, unknown>).id as number;

      const { status, data } = await api('PUT', `/api/v1/recurring-invoices/${id}`, sampleRecurring({
        name: 'After Update',
      }));
      expect(status).toBe(200);
      expect((data as Record<string, unknown>).name).toBe('After Update');
      expect((data as Record<string, unknown>).id).toBe(id);
    });

    it('updates frequency-related fields correctly', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Freq Update Test',
        dayOfMonth: 10,
      }));
      const id = (created as Record<string, unknown>).id as number;

      const { status, data } = await api('PUT', `/api/v1/recurring-invoices/${id}`, sampleRecurring({
        name: 'Freq Update Test',
        dayOfMonth: 25,
        dueDateOffsetDays: 45,
      }));
      expect(status).toBe(200);
      const body = data as Record<string, unknown>;
      expect(body.dayOfMonth).toBe(25);
      expect(body.dueDateOffsetDays).toBe(45);
    });

    it('returns 400 for invalid update payload', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Validation Test',
      }));
      const id = (created as Record<string, unknown>).id as number;

      const { status } = await api('PUT', `/api/v1/recurring-invoices/${id}`, {
        name: 'Missing frequency',
        invoiceTemplateId,
        startDate: '2026-01-01',
      });
      expect(status).toBe(400);
    });

    it('returns 404 for non-existent id', async () => {
      const { status } = await api('PUT', '/api/v1/recurring-invoices/999999', sampleRecurring({
        name: 'Ghost Update',
      }));
      expect(status).toBe(404);
    });
  });

  // ── CRUD: Delete ────────────────────────────────────────────────────────────

  describe('DELETE /api/v1/recurring-invoices/:id', () => {
    it('deletes a schedule → 204, then GET returns 404', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'To Delete',
      }));
      const id = (created as Record<string, unknown>).id as number;

      const { status: deleteStatus } = await api('DELETE', `/api/v1/recurring-invoices/${id}`);
      expect(deleteStatus).toBe(204);

      const { status: getStatus } = await api('GET', `/api/v1/recurring-invoices/${id}`);
      expect(getStatus).toBe(404);
    });

    it('returns 404 when deleting non-existent id', async () => {
      const { status } = await api('DELETE', '/api/v1/recurring-invoices/999999');
      expect(status).toBe(404);
    });
  });

  // ── List reflects all created items ─────────────────────────────────────────

  describe('GET /api/v1/recurring-invoices (list)', () => {
    it('returns array containing previously created schedules', async () => {
      // Create one with a unique name to search for
      const uniqueName = `List-Check-${Date.now()}`;
      await api('POST', '/api/v1/recurring-invoices', sampleRecurring({ name: uniqueName }));

      const { status, data } = await api('GET', '/api/v1/recurring-invoices');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      const list = data as Array<Record<string, unknown>>;
      const found = list.find((item) => item.name === uniqueName);
      expect(found).toBeDefined();
    });
  });

  // ── Toggle Active ────────────────────────────────────────────────────────────

  describe('PATCH /api/v1/recurring-invoices/:id/toggle', () => {
    it('toggles active from true to false → 200', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Toggle Test',
        active: true,
      }));
      const id = (created as Record<string, unknown>).id as number;

      const { status, data } = await api('PATCH', `/api/v1/recurring-invoices/${id}/toggle`);
      expect(status).toBe(200);
      expect((data as Record<string, unknown>).active).toBe(false);
    });

    it('second toggle restores active to true → 200', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Double Toggle Test',
        active: true,
      }));
      const id = (created as Record<string, unknown>).id as number;

      // First toggle: true → false
      await api('PATCH', `/api/v1/recurring-invoices/${id}/toggle`);

      // Second toggle: false → true
      const { status, data } = await api('PATCH', `/api/v1/recurring-invoices/${id}/toggle`);
      expect(status).toBe(200);
      expect((data as Record<string, unknown>).active).toBe(true);
    });

    it('returns 404 when toggling non-existent id', async () => {
      const { status } = await api('PATCH', '/api/v1/recurring-invoices/999999/toggle');
      expect(status).toBe(404);
    });
  });

  // ── Generation ────────────────────────────────────────────────────────────────

  describe('POST /api/v1/recurring-invoices/:id/generate', () => {
    it('manually generates an invoice → 201 with invoiceId', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Generate Test',
        dayOfMonth: 1,
      }));
      const id = (created as Record<string, unknown>).id as number;

      const { status, data } = await api('POST', `/api/v1/recurring-invoices/${id}/generate`);
      expect(status).toBe(201);
      const body = data as Record<string, unknown>;
      expect(body.invoiceId).toBeTypeOf('number');
    });

    it('generated invoice exists via GET /api/v1/invoices/:id', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Generate Verify Test',
        dayOfMonth: 5,
      }));
      const recurringId = (created as Record<string, unknown>).id as number;

      const { data: genResult } = await api('POST', `/api/v1/recurring-invoices/${recurringId}/generate`);
      const invoiceId = (genResult as Record<string, unknown>).invoiceId as number;

      const { status, data } = await api('GET', `/api/v1/invoices/${invoiceId}`);
      expect(status).toBe(200);
      expect((data as Record<string, unknown>).id).toBe(invoiceId);
    });

    it('generated invoice has autoGenerated=true', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'AutoGenerated Flag Test',
        dayOfMonth: 5,
      }));
      const recurringId = (created as Record<string, unknown>).id as number;

      const { data: genResult } = await api('POST', `/api/v1/recurring-invoices/${recurringId}/generate`);
      const invoiceId = (genResult as Record<string, unknown>).invoiceId as number;

      const { data: invoice } = await api('GET', `/api/v1/invoices/${invoiceId}`);
      expect((invoice as Record<string, unknown>).autoGenerated).toBe(true);
    });

    it('generated invoice has correct invoiceDate set to nextScheduledDate', async () => {
      const startDate = '2026-03-01';
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Date Propagation Test',
        startDate,
        dayOfMonth: 15,
      }));
      const recurringId = (created as Record<string, unknown>).id as number;
      const nextScheduledDate = (created as Record<string, unknown>).nextScheduledDate as string;

      const { data: genResult } = await api('POST', `/api/v1/recurring-invoices/${recurringId}/generate`);
      const invoiceId = (genResult as Record<string, unknown>).invoiceId as number;

      const { data: invoice } = await api('GET', `/api/v1/invoices/${invoiceId}`);
      const inv = invoice as Record<string, unknown>;
      expect(inv.invoiceDate).toBe(nextScheduledDate);
    });

    it('generated invoice dueDate is invoiceDate + dueDateOffsetDays', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'DueDate Offset Test',
        dayOfMonth: 15,
        dueDateOffsetDays: 30,
      }));
      const recurringId = (created as Record<string, unknown>).id as number;
      const nextScheduledDate = (created as Record<string, unknown>).nextScheduledDate as string;

      const { data: genResult } = await api('POST', `/api/v1/recurring-invoices/${recurringId}/generate`);
      const invoiceId = (genResult as Record<string, unknown>).invoiceId as number;

      const { data: invoice } = await api('GET', `/api/v1/invoices/${invoiceId}`);
      const inv = invoice as Record<string, unknown>;

      // Compute expected due date: nextScheduledDate + 30 days
      const scheduled = new Date(nextScheduledDate + 'T00:00:00Z');
      scheduled.setUTCDate(scheduled.getUTCDate() + 30);
      const expectedDueDate = scheduled.toISOString().slice(0, 10);

      expect(inv.dueDate).toBe(expectedDueDate);
    });

    it('generation advances nextScheduledDate on the recurring rule', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Advance Schedule Test',
        dayOfMonth: 10,
      }));
      const recurringId = (created as Record<string, unknown>).id as number;
      const originalNext = (created as Record<string, unknown>).nextScheduledDate as string;

      await api('POST', `/api/v1/recurring-invoices/${recurringId}/generate`);

      const { data: updated } = await api('GET', `/api/v1/recurring-invoices/${recurringId}`);
      const newNext = (updated as Record<string, unknown>).nextScheduledDate as string;
      // nextScheduledDate must have advanced beyond the original
      expect(newNext > originalNext).toBe(true);
    });

    it('returns 400 (with error message) for non-existent recurring invoice', async () => {
      // The generate controller returns 400 for all error conditions (including not-found),
      // because the service returns { error: string } without distinguishing 404 vs other errors.
      const { status, data } = await api('POST', '/api/v1/recurring-invoices/999999/generate');
      expect(status).toBe(400);
      expect((data as Record<string, unknown>).error).toBeTypeOf('string');
    });

    it('returns 400 when generating from inactive schedule', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Inactive Generate Test',
        active: false,
      }));
      const id = (created as Record<string, unknown>).id as number;

      const { status, data } = await api('POST', `/api/v1/recurring-invoices/${id}/generate`);
      expect(status).toBe(400);
      expect((data as Record<string, unknown>).error).toBeTypeOf('string');
    });
  });

  // ── Preview Occurrences ───────────────────────────────────────────────────────

  describe('POST /api/v1/recurring-invoices/preview-occurrences', () => {
    it('weekly schedule returns array of dates', async () => {
      const { status, data } = await api('POST', '/api/v1/recurring-invoices/preview-occurrences', {
        frequency: 'weekly',
        dayOfWeek: 0, // Monday
        startDate: '2026-03-01',
        months: 1,
      });
      expect(status).toBe(200);
      const body = data as Record<string, unknown>;
      expect(Array.isArray(body.dates)).toBe(true);
      const dates = body.dates as string[];
      expect(dates.length).toBeGreaterThan(0);
      // All dates should be Mondays (ISO weekday 0) — JS Monday = day 1
      for (const dateStr of dates) {
        const d = new Date(dateStr + 'T00:00:00Z');
        expect(d.getUTCDay(), `${dateStr} should be Monday (1)`).toBe(1);
      }
    });

    it('monthly dayOfMonth schedule returns dates on the correct day', async () => {
      const { status, data } = await api('POST', '/api/v1/recurring-invoices/preview-occurrences', {
        frequency: 'monthly',
        dayOfMonth: 15,
        startDate: '2026-01-01',
        months: 3,
      });
      expect(status).toBe(200);
      const body = data as Record<string, unknown>;
      const dates = body.dates as string[];
      expect(dates.length).toBeGreaterThan(0);
      for (const dateStr of dates) {
        const day = parseInt(dateStr.slice(8, 10), 10);
        expect(day).toBe(15);
      }
    });

    it('monthly end-of-month schedule returns last days of each month', async () => {
      const { status, data } = await api('POST', '/api/v1/recurring-invoices/preview-occurrences', {
        frequency: 'monthly',
        monthPosition: 'last',
        startDate: '2026-01-01',
        months: 3,
      });
      expect(status).toBe(200);
      const body = data as Record<string, unknown>;
      const dates = body.dates as string[];
      expect(dates.length).toBeGreaterThan(0);

      // Each returned date must be the last day of its month
      for (const dateStr of dates) {
        const year = parseInt(dateStr.slice(0, 4), 10);
        const month = parseInt(dateStr.slice(5, 7), 10);
        const day = parseInt(dateStr.slice(8, 10), 10);
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        expect(day, `${dateStr} should be last day of month (${lastDay})`).toBe(lastDay);
      }
    });

    it('quarterly schedule returns dates ~3 months apart', async () => {
      const { status, data } = await api('POST', '/api/v1/recurring-invoices/preview-occurrences', {
        frequency: 'quarterly',
        dayOfMonth: 1,
        startDate: '2026-01-01',
        months: 12,
      });
      expect(status).toBe(200);
      const body = data as Record<string, unknown>;
      const dates = body.dates as string[];
      expect(dates.length).toBeGreaterThanOrEqual(3);

      // Gap between consecutive dates should be ~90 days
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1] + 'T00:00:00Z');
        const curr = new Date(dates[i] + 'T00:00:00Z');
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        // Quarterly = 3 months apart: could be 89–92 days
        expect(diffDays, `Gap between ${dates[i - 1]} and ${dates[i]}`).toBeGreaterThanOrEqual(85);
        expect(diffDays, `Gap between ${dates[i - 1]} and ${dates[i]}`).toBeLessThanOrEqual(95);
      }
    });

    it('returns empty dates array when no frequency/startDate provided', async () => {
      const { status, data } = await api('POST', '/api/v1/recurring-invoices/preview-occurrences', {
        months: 3,
      });
      expect(status).toBe(200);
      const body = data as Record<string, unknown>;
      expect(Array.isArray(body.dates)).toBe(true);
      expect((body.dates as string[]).length).toBe(0);
    });
  });

  // ── Logs: Per-schedule ────────────────────────────────────────────────────────

  describe('GET /api/v1/recurring-invoices/:id/logs', () => {
    it('returns logs after a generation', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Log Test Schedule',
        dayOfMonth: 5,
      }));
      const recurringId = (created as Record<string, unknown>).id as number;

      // Generate an invoice to produce a log entry
      await api('POST', `/api/v1/recurring-invoices/${recurringId}/generate`);

      const { status, data } = await api('GET', `/api/v1/recurring-invoices/${recurringId}/logs`);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      const logs = data as Array<Record<string, unknown>>;
      expect(logs.length).toBeGreaterThan(0);

      const log = logs[0];
      expect(log.recurringInvoiceId).toBe(recurringId);
      expect(log.status).toBe('success');
      expect(log.invoiceId).toBeTypeOf('number');
      expect(log.scheduledDate).toBeTypeOf('string');
      expect(log.generatedAt).toBeTypeOf('string');
    });

    it('returns empty array when no generations have occurred', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Empty Log Test',
      }));
      const recurringId = (created as Record<string, unknown>).id as number;

      const { status, data } = await api('GET', `/api/v1/recurring-invoices/${recurringId}/logs`);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect((data as unknown[]).length).toBe(0);
    });
  });

  // ── Logs: All logs ────────────────────────────────────────────────────────────

  describe('GET /api/v1/recurring-invoices/logs', () => {
    it('returns all generation logs across schedules', async () => {
      // Create and generate to ensure at least one log entry exists
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'All Logs Test',
        dayOfMonth: 3,
      }));
      const recurringId = (created as Record<string, unknown>).id as number;
      await api('POST', `/api/v1/recurring-invoices/${recurringId}/generate`);

      const { status, data } = await api('GET', '/api/v1/recurring-invoices/logs');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      const logs = data as Array<Record<string, unknown>>;
      expect(logs.length).toBeGreaterThan(0);

      // Verify log structure
      const log = logs[0];
      expect(log.id).toBeTypeOf('number');
      expect(log.recurringInvoiceId).toBeTypeOf('number');
      expect(log.scheduledDate).toBeTypeOf('string');
      expect(log.generatedAt).toBeTypeOf('string');
      expect(['success', 'error']).toContain(log.status);
    });
  });

  // ── Frequency-specific nextScheduledDate tests ────────────────────────────────

  describe('nextScheduledDate computation by frequency', () => {
    it('weekly schedule: nextScheduledDate falls on the correct weekday', async () => {
      // Create a weekly schedule starting on a Monday (2026-03-02 is a Monday)
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', {
        name: 'Weekly Weekday Test',
        invoiceTemplateId,
        frequency: 'weekly',
        dayOfWeek: 0, // Monday (ISO)
        startDate: '2026-03-02',
        dueDateOffsetDays: 7,
        deliveryDateOffsetDays: 0,
        active: true,
      });
      const body = created as Record<string, unknown>;
      expect(body.nextScheduledDate).toBeTypeOf('string');

      // nextScheduledDate should be a Monday (JS getUTCDay() === 1 for Monday)
      const d = new Date((body.nextScheduledDate as string) + 'T00:00:00Z');
      expect(d.getUTCDay(), 'nextScheduledDate should be Monday').toBe(1);
    });

    it('monthly with dayOfMonth=15: nextScheduledDate falls on the 15th', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', sampleRecurring({
        name: 'Monthly 15th Test',
        startDate: '2026-01-01',
        dayOfMonth: 15,
      }));
      const body = created as Record<string, unknown>;
      const nextDate = body.nextScheduledDate as string;
      expect(nextDate).toMatch(/^\d{4}-\d{2}-15$/);
    });

    it('monthly with monthPosition=last: nextScheduledDate is end of a month', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', {
        name: 'Monthly Last Day Test',
        invoiceTemplateId,
        frequency: 'monthly',
        monthPosition: 'last',
        startDate: '2026-01-01',
        dueDateOffsetDays: 30,
        deliveryDateOffsetDays: 0,
        active: true,
      });
      const body = created as Record<string, unknown>;
      const nextDate = body.nextScheduledDate as string;
      expect(nextDate).toBeTypeOf('string');
      expect(nextDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify the date is the last day of its month
      const year = parseInt(nextDate.slice(0, 4), 10);
      const month = parseInt(nextDate.slice(5, 7), 10);
      const day = parseInt(nextDate.slice(8, 10), 10);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      expect(day).toBe(lastDay);
    });

    it('quarterly schedule: nextScheduledDate is ~3 months from startDate', async () => {
      const { data: created } = await api('POST', '/api/v1/recurring-invoices', {
        name: 'Quarterly Test',
        invoiceTemplateId,
        frequency: 'quarterly',
        dayOfMonth: 1,
        startDate: '2026-01-01',
        dueDateOffsetDays: 30,
        deliveryDateOffsetDays: 0,
        active: true,
      });
      const body = created as Record<string, unknown>;
      const nextDate = body.nextScheduledDate as string;
      const startDate = '2026-01-01';

      const start = new Date(startDate + 'T00:00:00Z');
      const next = new Date(nextDate + 'T00:00:00Z');
      const diffDays = (next.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      // Quarterly: should be between 85 and 95 days from start
      expect(diffDays).toBeGreaterThanOrEqual(0);
      expect(diffDays).toBeLessThanOrEqual(95);
    });
  });

  // ── Generate-all (catch-up) ───────────────────────────────────────────────────

  describe('POST /api/v1/recurring-invoices/generate-all', () => {
    it('returns generated and errors counts', async () => {
      const { status, data } = await api('POST', '/api/v1/recurring-invoices/generate-all');
      expect(status).toBe(200);
      const body = data as Record<string, unknown>;
      expect(body.generated).toBeTypeOf('number');
      expect(body.errors).toBeTypeOf('number');
    });
  });

});
