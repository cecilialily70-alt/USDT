import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import ChatMessageBubble from './ChatMessageBubble';
import {
  MessageSquare,
  Send,
  Trash2,
  RefreshCw,
  ImagePlus,
  Ban,
  Languages,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import {
  mergeMessages,
  createClientMessageId,
  formatChatTime,
  retryRequest,
  getApiErrorMessage,
  isSessionVisitorOnline,
} from '../utils/chatHelpers';
import {
  MAX_IMAGE_SIZE_BYTES,
  isSupportedImageFile,
  extractClipboardImageFile,
} from '../utils/chatConstants';
import { requestNotificationPermission, showBrowserNotification } from '../utils/notifications';
import { adminZh } from '../i18n/adminZh';
import { useLanguage } from '../contexts/LanguageContext';

const API = '/api';
const SESSION_POLL_INTERVAL = 3000;
const MESSAGE_POLL_INTERVAL = 2000;
const PROVIDER_KEY = 'admin_translate_provider';

const PresenceDot = ({ online, label }) => (
  <span className="inline-flex items-center gap-1 text-[10px]">
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}
      aria-hidden
    />
    <span className={online ? 'text-green-400/90' : 'text-gray-500'}>{label}</span>
  </span>
);

const UnreadDot = ({ show }) =>
  show ? (
    <span
      className="w-2 h-2 rounded-full bg-red-500 shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.8)]"
      aria-hidden
    />
  ) : null;

const AdminChat = ({
  view = 'contacts',
  selectedSessionId = null,
  onSelectSession,
  onOpenChat,
  onUnreadChange,
} = {}) => {
  const { t } = useLanguage(); // for getApiErrorMessage mapping
  const ac = adminZh.chat;
  const [sessions, setSessions] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draftZh, setDraftZh] = useState('');
  const [sendHe, setSendHe] = useState('');
  const [pendingOriginal, setPendingOriginal] = useState('');
  const [sending, setSending] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateStatus, setTranslateStatus] = useState('');
  const [provider, setProvider] = useState(
    () => localStorage.getItem(PROVIDER_KEY) || 'google'
  );
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [zhCache, setZhCache] = useState({});
  const messagesContainerRef = useRef(null);
  const forceScrollToBottomRef = useRef(false);
  const lastSinceRef = useRef(null);
  const fileInputRef = useRef(null);
  const draftRef = useRef(null);
  const sendRef = useRef(null);
  const sessionPollRef = useRef(null);
  const prevUnreadRef = useRef(null);
  const notificationsReadyRef = useRef(false);
  const translatingIdsRef = useRef(new Set());
  const [blacklistIpInput, setBlacklistIpInput] = useState('');
  const [presenceTick, setPresenceTick] = useState(0);

  const getToken = () => localStorage.getItem('admin_token');

  const selectedSession =
    sessions.find((s) => s.session_id === selectedSessionId) || null;

  const fetchSessions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/admin/chat/sessions`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const incoming = res.data.sessions || [];
      const totalUnread = incoming.reduce(
        (sum, s) =>
          sum +
          (s.session_id === selectedSessionId ? 0 : Number(s.unread_admin || 0)),
        0
      );
      const rawTotal = incoming.reduce((sum, s) => sum + Number(s.unread_admin || 0), 0);
      if (prevUnreadRef.current !== null && rawTotal > prevUnreadRef.current) {
        showBrowserNotification({
          title: ac.newVisitorTitle,
          body: ac.newVisitorBody,
          tag: 'admin-chat',
        });
      }
      prevUnreadRef.current = rawTotal;
      setSessions(
        incoming.map((s) =>
          s.session_id === selectedSessionId ? { ...s, unread_admin: 0 } : s
        )
      );
      if (typeof onUnreadChange === 'function') {
        onUnreadChange(totalUnread);
      }
    } catch (e) {
      if (e.response?.status === 401) return;
      console.error('Failed to fetch chat sessions', e);
    }
  }, [
    selectedSessionId,
    ac.newVisitorTitle,
    ac.newVisitorBody,
    onUnreadChange,
  ]);

  useEffect(() => {
    if (notificationsReadyRef.current) return undefined;
    notificationsReadyRef.current = true;
    requestNotificationPermission();
    return undefined;
  }, []);

  const fetchBlacklist = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/admin/blacklist`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setBlacklist(res.data.blacklist || []);
    } catch (e) {
      if (e.response?.status === 401) return;
    }
  }, []);

  const fetchMessages = useCallback(
    async (sessionId, since = null, fullLoad = false) => {
      try {
        const params = {};
        if (since && !fullLoad) params.since = since;

        const res = await axios.get(`${API}/admin/chat/sessions/${sessionId}/messages`, {
          headers: { Authorization: `Bearer ${getToken()}` },
          params,
        });
        const incoming = res.data.messages || [];
        setMessages((prev) => {
          const merged = mergeMessages(fullLoad ? [] : prev, incoming);
          if (merged.length > 0) {
            const last = merged[merged.length - 1];
            if (last.created_at && !last.status) lastSinceRef.current = last.created_at;
          }
          return merged;
        });
        const latestVisitor = [...incoming]
          .reverse()
          .find((m) => m?.sender === 'visitor' && m?.created_at);
        setSessions((prev) =>
          prev.map((s) => {
            if (s.session_id !== sessionId) return s;
            const next = { ...s, unread_admin: 0 };
            if (latestVisitor?.created_at) {
              next.last_seen_at = latestVisitor.created_at;
              next.last_message_at = latestVisitor.created_at;
            }
            return next;
          })
        );
      } catch (e) {
        if (e.response?.status === 401) return;
      }
    },
    []
  );

  useEffect(() => {
    fetchSessions();
    fetchBlacklist();
    sessionPollRef.current = setInterval(fetchSessions, SESSION_POLL_INTERVAL);
    return () => clearInterval(sessionPollRef.current);
  }, [fetchSessions, fetchBlacklist]);

  useEffect(() => {
    const id = setInterval(() => setPresenceTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (view === 'chat' && selectedSessionId) {
      lastSinceRef.current = null;
      forceScrollToBottomRef.current = true;
      setMessages([]);
      setDraftZh('');
      setSendHe('');
      setPendingOriginal('');
      fetchMessages(selectedSessionId, null, true);
      const msgPoll = setInterval(
        () => fetchMessages(selectedSessionId, lastSinceRef.current),
        MESSAGE_POLL_INTERVAL
      );
      return () => clearInterval(msgPoll);
    }
    return undefined;
  }, [view, selectedSessionId, fetchMessages]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (forceScrollToBottomRef.current || nearBottom) {
      const behavior = forceScrollToBottomRef.current ? 'auto' : 'smooth';
      forceScrollToBottomRef.current = false;
      if (behavior === 'smooth' && typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages, zhCache]);

  // Auto-translate foreign messages → Chinese (visitor + admin without original)
  useEffect(() => {
    if (view !== 'chat') return;
    const token = getToken();
    messages.forEach((msg) => {
      if (msg.type === 'image') return;
      const mid = msg.message_id || msg.client_message_id;
      if (!mid) return;
      if (zhCache[mid] !== undefined) return;

      const original = (msg.content_original || '').trim();
      if (original) {
        setZhCache((prev) => ({ ...prev, [mid]: original }));
        return;
      }

      const text = (msg.content || '').trim();
      if (!text) return;
      if (translatingIdsRef.current.has(mid)) return;
      translatingIdsRef.current.add(mid);
      axios
        .post(
          `${API}/admin/translate`,
          { text, target: 'zh', provider },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 60000 }
        )
        .then((res) => {
          setZhCache((prev) => ({ ...prev, [mid]: res.data?.text || text }));
        })
        .catch((err) => {
          console.warn('translate zh failed', err?.response?.status, err?.message);
          setZhCache((prev) => ({ ...prev, [mid]: '' }));
        })
        .finally(() => {
          translatingIdsRef.current.delete(mid);
        });
    });
  }, [messages, view, provider]);

  const handleSelectSession = (session) => {
    const sid = session.session_id;
    setSessions((prev) =>
      prev.map((s) => (s.session_id === sid ? { ...s, unread_admin: 0 } : s))
    );
    onSelectSession?.(session);
    onOpenChat?.();
  };

  const toggleBlacklistByIp = async (ip, blacklisted) => {
    if (!ip) {
      toast.error(ac.missingIp);
      return;
    }
    try {
      if (blacklisted) {
        await retryRequest(() =>
          axios.delete(`${API}/admin/blacklist/${encodeURIComponent(ip)}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
            timeout: 15000,
          })
        );
      } else {
        await retryRequest(() =>
          axios.post(
            `${API}/admin/blacklist`,
            { ip },
            { headers: { Authorization: `Bearer ${getToken()}` }, timeout: 15000 }
          )
        );
      }
      fetchSessions();
      fetchBlacklist();
    } catch (err) {
      toast.error(getApiErrorMessage(err, ac.operationFailed, t));
    }
  };

  const handleDeleteSession = async (sessionId, e) => {
    e?.stopPropagation?.();
    if (!window.confirm(ac.deleteConfirm)) return;
    try {
      await axios.delete(`${API}/admin/chat/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (selectedSessionId === sessionId) {
        onSelectSession?.(null);
        setMessages([]);
      }
      toast.success(ac.deleted);
      fetchSessions();
    } catch (err) {
      toast.error(getApiErrorMessage(err, ac.deleteFailed, t));
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    Promise.all([fetchSessions(), fetchBlacklist()]).finally(() => setLoading(false));
  };

  const switchProvider = (p) => {
    setProvider(p);
    localStorage.setItem(PROVIDER_KEY, p);
    setTranslateStatus(
      `${p === 'deepseek' ? ac.providerDeepseek : ac.providerGoogle}`
    );
    setTimeout(() => setTranslateStatus(''), 1600);
  };

  const handleComposerEnter = () => {
    const hasSend = !!sendHe.trim();
    const hasDraft = !!draftZh.trim();
    if (hasSend && hasDraft) {
      // 两框都有字：清空发送框，翻译下方中文
      setSendHe('');
      setPendingOriginal('');
      handleTranslateDraft();
      return;
    }
    if (hasSend) {
      handleSendReply();
      return;
    }
    if (hasDraft) {
      handleTranslateDraft();
    }
  };

  const handleTranslateDraft = async () => {
    const text = draftZh.trim();
    if (!text || translating) return;
    setTranslating(true);
    setTranslateStatus(ac.translating);
    try {
      const res = await axios.post(
        `${API}/admin/translate`,
        { text, target: 'he', provider },
        { headers: { Authorization: `Bearer ${getToken()}` }, timeout: 60000 }
      );
      const hebrew = (res.data?.text || text).trim();
      setPendingOriginal(text);
      setSendHe(hebrew);
      setDraftZh('');
      setTranslateStatus(ac.translateDone);
      setTimeout(() => setTranslateStatus(''), 1800);
      sendRef.current?.focus();
    } catch (err) {
      setTranslateStatus('');
      const detail = err?.response?.data?.detail;
      toast.error(
        typeof detail === 'string'
          ? `${ac.translateFailed}: ${detail}`
          : getApiErrorMessage(err, ac.translateFailed, t)
      );
    } finally {
      setTranslating(false);
    }
  };

  const sendTextReply = async (content, clientMessageId, contentOriginal = '') => {
    const optimistic = {
      client_message_id: clientMessageId,
      session_id: selectedSessionId,
      sender: 'admin',
      type: 'text',
      content,
      content_original: contentOriginal || undefined,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    setMessages((prev) => mergeMessages(prev, [optimistic]));

    try {
      const res = await retryRequest(() =>
        axios.post(
          `${API}/admin/chat/sessions/${selectedSessionId}/messages`,
          {
            content,
            client_message_id: clientMessageId,
            content_original: contentOriginal || '',
          },
          { headers: { Authorization: `Bearer ${getToken()}` }, timeout: 15000 }
        )
      );
      const serverMsg = {
        ...res.data.message,
        client_message_id: res.data.message.client_message_id || clientMessageId,
      };
      setMessages((prev) => mergeMessages(prev, [serverMsg]));
      if (serverMsg.created_at) lastSinceRef.current = serverMsg.created_at;
      fetchSessions();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'failed' } : m
        )
      );
      throw err;
    }
  };

  const handleSendReply = async () => {
    const hebrew = sendHe.trim();
    const original = (pendingOriginal || draftZh || hebrew).trim();
    if (!hebrew || !selectedSessionId || sending) return;
    if (!pendingOriginal && !sendHe.trim()) {
      toast.error(ac.needTranslateFirst);
      return;
    }

    setSending(true);
    const clientId = createClientMessageId();
    try {
      await sendTextReply(hebrew, clientId, original);
      setDraftZh('');
      setSendHe('');
      setPendingOriginal('');
      setTranslateStatus('');
    } catch (err) {
      toast.error(getApiErrorMessage(err, ac.sendFailed, t));
    } finally {
      setSending(false);
      draftRef.current?.focus();
    }
  };

  const handleRetryMessage = async (msg) => {
    if (!selectedSessionId || sending || uploading) return;
    if (msg.type !== 'text' || !msg.content?.trim()) {
      toast.error(ac.imageRetryHint);
      return;
    }
    setSending(true);
    try {
      await sendTextReply(
        msg.content.trim(),
        msg.client_message_id || createClientMessageId(),
        msg.content_original || ''
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, ac.sendFailed, t));
    } finally {
      setSending(false);
    }
  };

  const uploadImageFile = async (file) => {
    if (!file || !selectedSessionId || uploading) return;

    if (!isSupportedImageFile(file)) {
      toast.error(t.chat.imageUnsupported);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error(t.chat.imageTooLarge);
      return;
    }

    setUploading(true);
    const clientId = createClientMessageId();
    const localUrl = URL.createObjectURL(file);
    const optimistic = {
      client_message_id: clientId,
      session_id: selectedSessionId,
      sender: 'admin',
      type: 'image',
      content: '',
      image_url: localUrl,
      filename: file.name,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    setMessages((prev) => mergeMessages(prev, [optimistic]));
    forceScrollToBottomRef.current = true;

    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('client_message_id', clientId);
      const res = await retryRequest(() =>
        axios.post(`${API}/admin/chat/sessions/${selectedSessionId}/upload`, form, {
          headers: { Authorization: `Bearer ${getToken()}` },
          timeout: 60000,
        })
      );
      const serverMsg = {
        ...res.data.message,
        client_message_id: res.data.message.client_message_id || clientId,
      };
      setMessages((prev) => mergeMessages(prev, [serverMsg]));
      if (serverMsg.created_at) lastSinceRef.current = serverMsg.created_at;
      fetchSessions();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.client_message_id === clientId ? { ...m, status: 'failed' } : m
        )
      );
      toast.error(getApiErrorMessage(err, ac.sendFailed, t));
    } finally {
      URL.revokeObjectURL(localUrl);
      setUploading(false);
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await uploadImageFile(file);
  };

  const handlePasteImage = (e) => {
    if (!selectedSessionId || uploading) return;
    const file = extractClipboardImageFile(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    uploadImageFile(file);
  };

  const sessionPresence = (session) => {
    void presenceTick;
    if (session?.blacklisted) return { online: false, label: ac.blocked };
    const online = isSessionVisitorOnline(session);
    return { online, label: online ? ac.online : ac.offline };
  };

  // ── Contacts view ──
  if (view === 'contacts') {
    return (
      <Card className="h-full min-h-0 flex flex-col overflow-hidden glass-card border-green-500/20 shadow-xl rounded-none sm:rounded-xl border-0 sm:border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-green-400" />
            {ac.title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="text-gray-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="p-3 border-b border-white/10 bg-black/20 shrink-0">
          <p className="text-white/80 text-xs mb-2">{ac.blockSection}</p>
          <div className="flex gap-2 items-center">
            <Input
              value={blacklistIpInput}
              onChange={(e) => setBlacklistIpInput(e.target.value)}
              placeholder={ac.ipPlaceholder}
              className="flex-1 bg-[#0a0e1a]/80 border-white/10 text-white text-xs h-9"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const ip = blacklistIpInput.trim();
                if (!ip) return;
                toggleBlacklistByIp(ip, false);
                setBlacklistIpInput('');
              }}
              className="h-9 w-9 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Ban className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-white/60 text-[10px] mt-3 mb-1">{ac.blacklistTitle}</p>
          <div className="max-h-20 overflow-y-auto space-y-1">
            {blacklist.length === 0 ? (
              <p className="text-gray-600 text-[10px]">{ac.blacklistEmpty}</p>
            ) : (
              blacklist.map((item) => (
                <div key={item.ip} className="flex justify-between items-center gap-2">
                  <span className="text-gray-400 font-mono text-[10px] truncate" dir="ltr">
                    {item.ip}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-red-400/70 hover:text-red-300 shrink-0"
                    onClick={() => toggleBlacklistByIp(item.ip, true)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="text-gray-500 text-center py-8 text-sm">{ac.noConversations}</p>
          ) : (
            sessions.map((session) => {
              const presence = sessionPresence(session);
              const unread = Number(session.unread_admin || 0) > 0;
              const active = session.session_id === selectedSessionId;
              return (
                <button
                  key={session.session_id}
                  type="button"
                  onClick={() => handleSelectSession(session)}
                  className={`w-full text-start p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${
                    active ? 'bg-white/10' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <UnreadDot show={unread} />
                        <span className="text-white font-medium text-sm truncate">
                          {session.visitor_name || ac.guest}
                        </span>
                        {unread && (
                          <Badge className="bg-red-500/80 text-white border-none text-[10px] px-1.5 py-0">
                            {session.unread_admin}
                          </Badge>
                        )}
                        <PresenceDot online={presence.online} label={presence.label} />
                      </div>
                      {session.visitor_phone && (
                        <p className="text-blue-400/80 text-xs font-mono mt-0.5" dir="ltr">
                          {session.visitor_phone}
                        </p>
                      )}
                      <p className="text-gray-500 text-xs truncate mt-1">
                        {session.last_message || ac.noMessages}
                      </p>
                      <p className="text-gray-600 text-[10px] mt-1">
                        {session.visitor_ip} ·{' '}
                        {formatChatTime(session.last_message_at, true, 'zh-CN')}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                        onClick={(e) => handleDeleteSession(session.session_id, e)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={
                          session.blacklisted
                            ? 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10'
                            : 'text-red-400/60 hover:text-red-400 hover:bg-red-500/10'
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBlacklistByIp(session.visitor_ip, session.blacklisted);
                        }}
                        title={session.blacklisted ? ac.unblockTitle : ac.blockTitle}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Card>
    );
  }

  // ── Chat room view ──
  if (!selectedSessionId || !selectedSession) {
    return (
      <Card className="h-full min-h-0 flex flex-col items-center justify-center glass-card border-green-500/20 rounded-none sm:rounded-xl border-0 sm:border text-gray-500 text-sm px-6 text-center">
        <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
        {ac.pickContactFirst}
      </Card>
    );
  }

  return (
    <Card className="h-full min-h-0 flex flex-col overflow-hidden glass-card border-green-500/20 shadow-xl rounded-none sm:rounded-xl border-0 sm:border">
      <div className="px-4 py-3 border-b border-white/10 bg-black/20 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white font-medium text-sm truncate">
                {selectedSession.visitor_name}
              </p>
              <PresenceDot {...sessionPresence(selectedSession)} />
            </div>
            {selectedSession.visitor_phone && (
              <p className="text-blue-400/80 text-xs font-mono" dir="ltr">
                {selectedSession.visitor_phone}
              </p>
            )}
            <p className="text-gray-500 text-xs">{selectedSession.visitor_ip}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant={provider === 'google' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 text-[11px] px-2"
              onClick={() => switchProvider('google')}
            >
              {ac.providerGoogle}
            </Button>
            <Button
              type="button"
              variant={provider === 'deepseek' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 text-[11px] px-2"
              onClick={() => switchProvider('deepseek')}
            >
              {ac.providerDeepseek}
            </Button>
          </div>
        </div>
        {translateStatus ? (
          <p className="text-[11px] text-amber-300/90 mt-1">{translateStatus}</p>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3" ref={messagesContainerRef}>
        {messages.map((msg) => {
          const mid = msg.message_id || msg.client_message_id;
          const isOwn = msg.sender === 'admin';
          // 外文在上、中文在下
          const foreign = msg.content || '';
          let chinese = null;
          if (msg.type !== 'image' && mid) {
            if (msg.content_original) chinese = msg.content_original;
            else if (zhCache[mid] === '') chinese = ac.translationFailedHint;
            else if (zhCache[mid]) chinese = zhCache[mid];
            else chinese = ac.translatingHint;
            // 与外文完全相同时不重复显示
            if (chinese && foreign && chinese.trim() === foreign.trim()) {
              chinese = null;
            }
          }
          return (
            <ChatMessageBubble
              key={mid}
              msg={msg}
              isOwn={isOwn}
              showAdminLayout
              foreignText={foreign}
              chineseText={chinese}
              onRetry={msg.status === 'failed' ? () => handleRetryMessage(msg) : undefined}
            />
          );
        })}
      </div>

      <div className="p-3 border-t border-white/10 space-y-2 shrink-0" onPaste={handlePasteImage}>
        {/* 发送框在上 */}
        <div className="flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-10 w-10 text-gray-400 hover:text-white shrink-0"
          >
            <ImagePlus className="w-5 h-5" />
          </Button>
          <Input
            ref={sendRef}
            value={sendHe}
            onChange={(e) => setSendHe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleComposerEnter();
              }
            }}
            onPaste={handlePasteImage}
            placeholder={ac.sendPlaceholder}
            disabled={sending}
            dir="auto"
            className="flex-1 bg-[#0a0e1a]/80 border-white/10 text-white text-sm h-10"
          />
          <Button
            onClick={handleSendReply}
            disabled={!sendHe.trim() || sending}
            size="icon"
            className="h-10 w-10 bg-green-600 hover:bg-green-700 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {/* 中文翻译输入在下 */}
        <div className="flex gap-2 items-center">
          <Input
            ref={draftRef}
            value={draftZh}
            onChange={(e) => setDraftZh(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleComposerEnter();
              }
            }}
            onPaste={handlePasteImage}
            placeholder={ac.draftPlaceholder}
            disabled={sending || translating}
            className="flex-1 bg-[#0a0e1a]/80 border-white/10 text-white text-sm h-10"
          />
          <Button
            type="button"
            disabled={!draftZh.trim() || translating || sending}
            onClick={handleTranslateDraft}
            className="h-10 shrink-0 bg-amber-600 hover:bg-amber-700 gap-1"
          >
            <Languages className="w-4 h-4" />
            {translating ? ac.translating : ac.translateBtn}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default AdminChat;
