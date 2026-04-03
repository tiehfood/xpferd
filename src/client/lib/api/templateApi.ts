import { t } from '../i18n.js';

const BASE = '/api/v1/templates';

function getFieldLabels(): Record<string, string> {
  return {
    name: 'Name',
    prefix: 'Präfix',
    digits: 'Stellen',
    nextNumber: 'Nächste Nr.',
    paymentMeansCode: 'Zahlungsart',
    unitCode: t('lines.einheit'),
    netPrice: t('lines.einzelpreis'),
    vatCategoryCode: 'USt-Kategorie',
    vatRate: 'USt-Satz',
  };
}

function formatValidationErrors(details: any[]): string {
  if (!details || details.length === 0) return 'Validierung fehlgeschlagen';
  const fieldLabels = getFieldLabels();
  const seen = new Set<string>();
  const messages: string[] = [];
  for (const d of details) {
    const path = d.path?.join('.') ?? '';
    const msg = fieldLabels[path] ?? path;
    if (!seen.has(msg)) {
      seen.add(msg);
      messages.push(msg);
    }
  }
  return 'Fehlende/ungültige Felder: ' + messages.join(', ');
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

export const invoiceNumberTemplateApi = {
  list: () => request<any[]>(`${BASE}/invoice-numbers`),
  create: (data: any) =>
    request<any>(`${BASE}/invoice-numbers`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) =>
    request<any>(`${BASE}/invoice-numbers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  preview: (id: number) =>
    request<{ invoiceNumber: string }>(`${BASE}/invoice-numbers/${id}/preview`),
  generate: (id: number) =>
    request<{ invoiceNumber: string }>(`${BASE}/invoice-numbers/${id}/generate`, { method: 'POST' }),
  delete: (id: number) =>
    request<void>(`${BASE}/invoice-numbers/${id}`, { method: 'DELETE' }),
};

export const paymentTemplateApi = {
  list: () => request<any[]>(`${BASE}/payments`),
  create: (data: any) =>
    request<any>(`${BASE}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) =>
    request<any>(`${BASE}/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<void>(`${BASE}/payments/${id}`, { method: 'DELETE' }),
};

export const lineItemTemplateApi = {
  list: () => request<any[]>(`${BASE}/line-items`),
  create: (data: any) =>
    request<any>(`${BASE}/line-items`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) =>
    request<any>(`${BASE}/line-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<void>(`${BASE}/line-items/${id}`, { method: 'DELETE' }),
};

export const invoiceTemplateApi = {
  list: () => request<any[]>(`${BASE}/invoice-templates`),
  get: (id: number) => request<any>(`${BASE}/invoice-templates/${id}`),
  create: (data: any) =>
    request<any>(`${BASE}/invoice-templates`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) =>
    request<any>(`${BASE}/invoice-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<void>(`${BASE}/invoice-templates/${id}`, { method: 'DELETE' }),
};
