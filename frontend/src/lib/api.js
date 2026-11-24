const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export function getToken() {
  return localStorage.getItem('triagesync_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('triagesync_token', token);
  else localStorage.removeItem('triagesync_token');
}

export async function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
  const userEmail = localStorage.getItem('triagesync_user_email');

  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userEmail ? { 'X-Agent': userEmail } : {}),
      ...headers,
    },
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, config);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      setToken(null);
      window.dispatchEvent(new Event('auth:logout'));
    }
    const message = data?.error?.message || `Request failed (${res.status})`;
    const code = data?.error?.code || 'ERROR';
    const err = new Error(message);
    err.code = code;
    err.status = res.status;
    throw err;
  }

  return data;
}

// Format UTC ISO strings into user's local timezone
export function formatLocalDateTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Convert local date (YYYY-MM-DD) + HH:MM (00 or 30) to UTC ISO 8601 string with 0s/0ms
export function toUtcIso(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  return localDate.toISOString();
}