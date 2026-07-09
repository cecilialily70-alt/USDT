import { resolveApiError } from './apiErrors';

const PENDING_KEY = 'chat_pending_messages';

export const mergeMessages = (prev, incoming) => {
  const map = new Map();

  const upsert = (msg) => {
    if (!msg) return;

    const clientId = msg.client_message_id;
    const serverId = msg.message_id;

    if (serverId && clientId) {
      map.delete(clientId);
      map.set(serverId, { ...msg, status: undefined });
      return;
    }

    if (serverId) {
      const existing = map.get(serverId);
      if (!existing || existing.status === 'pending') {
        map.set(serverId, { ...msg, status: undefined });
      }
      return;
    }

    if (clientId) {
      const confirmed = [...map.values()].some(
        (m) => m.client_message_id === clientId && m.message_id
      );
      if (!confirmed) {
        map.set(clientId, msg);
      }
    }
  };

  [...prev, ...incoming].forEach(upsert);

  return Array.from(map.values()).sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
};

export const getPendingMessages = (sessionId) => {
  try {
    const all = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    return all[sessionId] || [];
  } catch {
    return [];
  }
};

export const savePendingMessage = (sessionId, message) => {
  const { _file, ...serializable } = message;
  const all = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
  const list = all[sessionId] || [];
  const idx = list.findIndex((m) => m.client_message_id === serializable.client_message_id);
  if (idx >= 0) list[idx] = serializable;
  else list.push(serializable);
  all[sessionId] = list;
  localStorage.setItem(PENDING_KEY, JSON.stringify(all));
};

export const removePendingMessage = (sessionId, clientMessageId) => {
  const all = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
  if (!all[sessionId]) return;
  all[sessionId] = all[sessionId].filter((m) => m.client_message_id !== clientMessageId);
  if (all[sessionId].length === 0) delete all[sessionId];
  localStorage.setItem(PENDING_KEY, JSON.stringify(all));
};

export const validateIsraeliPhone = (phone) => {
  let cleaned = phone.replace(/[\s\-().]/g, '').trim();
  if (cleaned.startsWith('+972')) cleaned = '0' + cleaned.slice(4);
  else if (cleaned.startsWith('972')) cleaned = '0' + cleaned.slice(3);
  if (cleaned.startsWith('5') && cleaned.length <= 9) cleaned = '0' + cleaned;
  return /^05\d{8}$/.test(cleaned) ? cleaned : null;
};

/** Format Israeli mobile as user types: 050-123-4567 */
export const formatIsraeliPhoneInput = (raw) => {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (d.startsWith('5') && !d.startsWith('05')) d = '0' + d;
  if (!d.length) return '';
  if (!d.startsWith('0') && !d.startsWith('5')) return raw.replace(/[^\d+\-\s]/g, '');
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};

export const LOCALE_MAP = { he: 'he-IL', en: 'en-IL', ar: 'ar-IL' };

export const formatChatTime = (iso, withDate = false, locale = 'he-IL') => {
  try {
    const d = new Date(iso);
    const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
    if (withDate) return d.toLocaleString(locale, { ...opts, day: 'numeric', month: 'short' });
    return d.toLocaleTimeString(locale, opts);
  } catch {
    return '';
  }
};

export const resolveChatImageUrl = (imageUrl) => {
  if (!imageUrl) return '';
  if (/^(https?:|blob:|data:)/i.test(imageUrl)) return imageUrl;
  if (typeof window === 'undefined') return imageUrl;
  const path = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${window.location.origin}${path}`;
};

export const createClientMessageId = () => crypto.randomUUID();

export const getApiErrorMessage = (err, fallback = 'Request failed', t = null) => {
  if (!err?.response) {
    return t?.errors?.networkError || fallback;
  }
  const detail = err.response.data?.detail;
  if (typeof detail === 'string') {
    return resolveApiError(detail, t, fallback);
  }
  if (Array.isArray(detail)) {
    const joined = detail.map((d) => d.msg || d).join(', ');
    return t ? resolveApiError(joined, t, fallback) : joined;
  }
  return t?.errors?.requestFailed || fallback;
};

export const visitorChatHeaders = (phone) => {
  const headers = {};
  if (phone) headers['X-Visitor-Phone'] = phone;
  return headers;
};

export const visitorChatParams = (sessionId, phone, extra = {}) => {
  const params = { session_id: sessionId, ...extra };
  if (phone) params.visitor_phone = phone;
  return params;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const retryRequest = async (fn, retries = 3, baseDelay = 400) => {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        throw error;
      }
      if (attempt < retries - 1) {
        await sleep(baseDelay * (attempt + 1));
      }
    }
  }
  throw lastError;
};
