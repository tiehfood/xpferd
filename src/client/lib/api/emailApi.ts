import type { EmailSettingsDto, EmailTemplateDto, EmailLogDto, SendEmailRequest } from '$shared/types';

const BASE = '/api/v1/email';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try { errorMsg = JSON.parse(text).error || errorMsg; } catch { /* not JSON */ }
    throw new Error(errorMsg);
  }
  if (res.status === 204) return undefined as T;
  return JSON.parse(text);
}

export const emailApi = {
  // Settings
  getSettings: () => request<EmailSettingsDto>(`${BASE}/settings`),
  updateSettings: (dto: EmailSettingsDto) => request<EmailSettingsDto>(`${BASE}/settings`, {
    method: 'PUT', body: JSON.stringify(dto),
  }),
  testConnection: () => request<{ success: boolean; error?: string }>(`${BASE}/test-connection`, {
    method: 'POST',
  }),

  // Templates
  listTemplates: () => request<EmailTemplateDto[]>(`${BASE}/templates`),
  getTemplate: (id: number) => request<EmailTemplateDto>(`${BASE}/templates/${id}`),
  createTemplate: (dto: Omit<EmailTemplateDto, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<EmailTemplateDto>(`${BASE}/templates`, {
      method: 'POST', body: JSON.stringify(dto),
    }),
  updateTemplate: (id: number, dto: Omit<EmailTemplateDto, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<EmailTemplateDto>(`${BASE}/templates/${id}`, {
      method: 'PUT', body: JSON.stringify(dto),
    }),
  deleteTemplate: (id: number) => request<void>(`${BASE}/templates/${id}`, { method: 'DELETE' }),

  // Send
  sendEmail: (invoiceId: number, dto: SendEmailRequest) =>
    request<EmailLogDto>(`/api/v1/invoices/${invoiceId}/send-email`, {
      method: 'POST', body: JSON.stringify(dto),
    }),

  // Log
  getLog: () => request<EmailLogDto[]>(`${BASE}/log`),
  getLogForInvoice: (invoiceId: number) => request<EmailLogDto[]>(`${BASE}/log/invoice/${invoiceId}`),
};
