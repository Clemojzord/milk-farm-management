const API_BASE = (
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000' : '')
).replace(/\/+$/, '');
const TOKEN_KEY = 'milk_farm_api_token';

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function readAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function writeAuthToken(token) {
  try {
    if (!token) {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }

    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage failures and keep the app operational.
  }
}

export function clearAuthToken() {
  writeAuthToken('');
}

export function hasAuthToken() {
  return Boolean(readAuthToken());
}

function normalizePath(path) {
  if (path.startsWith('/')) return path;
  return `/${path}`;
}

async function request(path, options = {}) {
  const { method = 'GET', headers = {}, body } = options;
  const normalizedPath = normalizePath(path);
  const finalHeaders = { ...headers };

  const token = readAuthToken();
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let finalBody = body;
  const hasObjectBody =
    body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData);

  if (hasObjectBody) {
    finalBody = JSON.stringify(body);
    if (!finalHeaders['Content-Type']) {
      finalHeaders['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(`${API_BASE}${normalizedPath}`, {
    method,
    headers: finalHeaders,
    body: finalBody,
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload?.data ?? null;
}

export function isUnauthorized(error) {
  return error instanceof ApiError && error.status === 401;
}

export function isForbidden(error) {
  return error instanceof ApiError && error.status === 403;
}

export async function login(username, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: {
      username,
      password,
    },
  });

  writeAuthToken(data?.token || '');
  return data?.user || null;
}

export async function getCurrentUser() {
  const data = await request('/api/auth/me');
  return data?.user || null;
}

export async function logout() {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    if (!isUnauthorized(error)) {
      throw error;
    }
  } finally {
    clearAuthToken();
  }
}

export function canManageFarmers(role) {
  return role === 'admin';
}

export function canWriteFinance(role) {
  return role === 'admin' || role === 'accountant';
}

const NAV_LINKS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'DB', roles: ['admin', 'accountant', 'viewer'] },
  { id: 'farmers', label: 'Farmers', icon: 'FM', roles: ['admin'] },
  { id: 'expenses', label: 'Expenses', icon: 'EX', roles: ['admin', 'accountant'] },
  { id: 'revenue', label: 'Revenue', icon: 'RV', roles: ['admin', 'accountant'] },
  { id: 'reports', label: 'Reports', icon: 'RP', roles: ['admin', 'accountant', 'viewer'] },
];

export function getNavLinksForRole(role) {
  return NAV_LINKS.filter((item) => item.roles.includes(role));
}

export function getDashboardSummary() {
  return request('/api/dashboard/summary');
}

export function getState() {
  return request('/api/state');
}

export function getFarmers() {
  return request('/api/farmers');
}

export function createFarmer(payload) {
  return request('/api/farmers', {
    method: 'POST',
    body: payload,
  });
}

export function addFarmerDelivery(farmerId, payload) {
  return request(`/api/farmers/${encodeURIComponent(farmerId)}/deliveries`, {
    method: 'POST',
    body: payload,
  });
}

export function markFarmerPaid(farmerId) {
  return request(`/api/farmers/${encodeURIComponent(farmerId)}/mark-paid`, {
    method: 'POST',
  });
}

export function getExpenses() {
  return request('/api/expenses');
}

export function createExpense(payload) {
  return request('/api/expenses', {
    method: 'POST',
    body: payload,
  });
}

export function getRevenue() {
  return request('/api/revenue');
}

export function createRevenue(payload) {
  return request('/api/revenue', {
    method: 'POST',
    body: payload,
  });
}
