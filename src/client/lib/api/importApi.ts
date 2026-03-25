const BASE = '/api/v1/invoices';

export const importApi = {
  preview: async (xml: string) => {
    const res = await fetch(`${BASE}/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml }),
    });
    const text = await res.text();
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const body = JSON.parse(text);
        errorMsg = body.error || errorMsg;
      } catch {
        // not JSON
      }
      throw new Error(errorMsg);
    }
    return JSON.parse(text);
  },
};
