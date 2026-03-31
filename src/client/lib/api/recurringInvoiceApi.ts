const BASE = '/api/v1/recurring-invoices';

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
      errorMsg = body.error || errorMsg;
    } catch { /* not JSON */ }
    throw new Error(errorMsg);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Ungültige Serverantwort');
  }
}

export const recurringInvoiceApi = {
  list: () => request<any[]>(BASE),
  get: (id: number) => request<any>(`${BASE}/${id}`),
  create: (data: any) => request<any>(BASE, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request<any>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`${BASE}/${id}`, { method: 'DELETE' }),
  toggle: (id: number) => request<any>(`${BASE}/${id}/toggle`, { method: 'PATCH' }),
  generate: (id: number) => request<any>(`${BASE}/${id}/generate`, { method: 'POST' }),
  generateAll: () => request<any>(`${BASE}/generate-all`, { method: 'POST' }),
  previewOccurrences: (data: any) =>
    request<{ dates: string[] }>(`${BASE}/preview-occurrences`, { method: 'POST', body: JSON.stringify(data) })
      .then(r => r.dates ?? []),
  getLogs: (id: number) => request<any[]>(`${BASE}/${id}/logs`),
  getAllLogs: (limit?: number) => request<any[]>(`${BASE}/logs${limit ? `?limit=${limit}` : ''}`),
};
