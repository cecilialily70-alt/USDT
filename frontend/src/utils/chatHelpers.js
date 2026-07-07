const PENDING_KEY = 'chat_pending_messages';

export const mergeMessages = (prev, incoming) => {
  const byId = new Map();
  const byClientId = new Map();

  const add = (msg) => {
    if (msg.message_id) byId.set(msg.message_id, msg);
    if (msg.client_message_id) byClientId.set(msg.client_message_id, msg);
  };

  prev.forEach(add);
  incoming.forEach((msg) => {
    if (msg.client_message_id && byClientId.has(msg.client_message_id)) {
      const pending = byClientId.get(msg.client_message_id);
      if (pending.status === 'pending' || pending.status === 'failed') {
        byClientId.delete(msg.client_message_id);
        if (pending.message_id) byId.delete(pending.message_id);
      }
    }
    add(msg);
  });

  const merged = new Map();
  byClientId.forEach((v) => merged.set(v.client_message_id, v));
  byId.forEach((v) => merged.set(v.message_id || v.client_message_id, v));

  return Array.from(merged.values()).sort((a, b) =>
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
  let cleaned = phone.replace(/[\s\-()]/g, '').trim();
  if (cleaned.startsWith('+972')) cleaned = '0' + cleaned.slice(4);
  else if (cleaned.startsWith('972')) cleaned = '0' + cleaned.slice(3);
  return /^05\d{8}$/.test(cleaned) ? cleaned : null;
};

export const formatChatTime = (iso, withDate = false) => {
  try {
    const d = new Date(iso);
    if (withDate) return d.toLocaleString();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const createClientMessageId = () => crypto.randomUUID();
