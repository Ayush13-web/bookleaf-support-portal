export const BASE = import.meta.env.VITE_API_URL || '/api/v1';
const TOKEN_KEY = 'bookleaf_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && path !== '/auth/login') window.dispatchEvent(new Event('auth:expired'));
    const e = json?.error;
    throw new ApiError(res.status, e?.code || 'ERROR', e?.message || res.statusText, e?.details);
  }
  return json;
}

const qs = (params) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  return p.toString() ? `?${p}` : '';
};

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }).then((r) => r.data),
  me: () => request('/auth/me').then((r) => r.data),
  // author
  books: () => request('/books').then((r) => r.data),
  myTickets: () => request('/tickets').then((r) => r.data),
  createTicket: (body) => request('/tickets', { method: 'POST', body }).then((r) => r.data),
  replyAsAuthor: (id, body) => request(`/tickets/${id}/messages`, { method: 'POST', body: { body } }).then((r) => r.data),
  // admin
  adminMeta: () => request('/admin/meta').then((r) => r.data),
  adminStats: () => request('/admin/stats').then((r) => r.data),
  adminTickets: (filters) => request(`/admin/tickets${qs(filters)}`),
  adminTicket: (id) => request(`/admin/tickets/${id}`).then((r) => r.data),
  adminUpdate: (id, patch) => request(`/admin/tickets/${id}`, { method: 'PATCH', body: patch }).then((r) => r.data),
  adminNote: (id, body) => request(`/admin/tickets/${id}/notes`, { method: 'POST', body: { body } }).then((r) => r.data),
  adminRespond: (id, body, status) => request(`/admin/tickets/${id}/respond`, { method: 'POST', body: { body, status } }).then((r) => r.data),
  adminDraft: (id, regenerate = false) => request(`/admin/tickets/${id}/draft`, { method: 'POST', body: { regenerate } }).then((r) => r.data),
  adminReclassify: (id) => request(`/admin/tickets/${id}/reclassify`, { method: 'POST' }).then((r) => r.data),
};
