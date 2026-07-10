import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { MessageSquare, Send, Minimize2, ImagePlus } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import ChatMessageBubble from './ChatMessageBubble';
import axios from 'axios';
import {
  mergeMessages,
  getPendingMessages,
  savePendingMessage,
  removePendingMessage,
  validateIsraeliPhone,
  formatIsraeliPhoneInput,
  createClientMessageId,
  getApiErrorMessage,
  visitorChatHeaders,
  visitorChatParams,
} from '../utils/chatHelpers';
import {
  MAX_IMAGE_SIZE_BYTES,
  isSupportedImageFile,
} from '../utils/chatConstants';

const API = '/api';
const SESSION_KEY = 'chat_session_id';
const NAME_KEY = 'chat_visitor_name';
const PHONE_KEY = 'chat_visitor_phone';
const POLL_INTERVAL = 1500;
const PING_INTERVAL = 5000;
const BG_SYNC_INTERVAL = 8000;

const getOrCreateSessionId = () => {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
};

const isRegistered = () =>
  localStorage.getItem(NAME_KEY) && localStorage.getItem(PHONE_KEY);

const ChatWidget = () => {
  const { t, isRTL } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [visitorName, setVisitorName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [visitorPhone, setVisitorPhone] = useState(() => localStorage.getItem(PHONE_KEY) || '');
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [needsRegister, setNeedsRegister] = useState(() => !isRegistered());
  const [phoneError, setPhoneError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [unread, setUnread] = useState(0);
  const sessionId = useRef(getOrCreateSessionId());
  const messagesEndRef = useRef(null);
  const lastSinceRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const pollRef = useRef(null);
  const pendingFilesRef = useRef(new Map());

  const applyMessages = useCallback((incoming, isIncremental = false) => {
    setMessages((prev) => {
      const base = isIncremental ? prev : [];
      const failedPending = getPendingMessages(sessionId.current).filter(
        (m) => m.status === 'failed'
      );
      const merged = mergeMessages(mergeMessages(base, incoming), failedPending);
      if (merged.length > 0) {
        const last = merged[merged.length - 1];
        if (last.created_at && last.message_id) {
          lastSinceRef.current = last.created_at;
        }
      }
      return merged;
    });
  }, []);

  const syncFromServer = useCallback(async () => {
    if (needsRegister) return;
    try {
      const res = await axios.get(`${API}/chat/sync`, {
        params: visitorChatParams(sessionId.current, visitorPhone),
        headers: visitorChatHeaders(visitorPhone),
      });
      const serverMsgs = res.data.messages || [];
      const serverUnread = res.data.unread_visitor || 0;

      applyMessages(serverMsgs, false);

      if (!isOpen) {
        setUnread(serverUnread);
      }
    } catch {
      // keep local state on network error
    }
  }, [needsRegister, isOpen, applyMessages, visitorPhone]);

  const fetchMessages = useCallback(async (since = null, fullLoad = false) => {
    try {
      const params = visitorChatParams(sessionId.current, visitorPhone);
      if (since && !fullLoad) params.since = since;

      const res = await axios.get(`${API}/chat/messages`, {
        params,
        headers: visitorChatHeaders(visitorPhone),
      });
      const newMsgs = res.data.messages || [];

      if (newMsgs.length > 0 || fullLoad) {
        applyMessages(newMsgs, !fullLoad && !!since);

        if (!isOpen) {
          const adminMsgs = newMsgs.filter((m) => m.sender === 'admin');
          if (adminMsgs.length > 0) {
            setUnread((u) => u + adminMsgs.length);
          }
        }
      }
    } catch {
      // keep local/pending messages on network error
    }
  }, [isOpen, applyMessages, visitorPhone]);

  const initSession = useCallback(async (name, phone) => {
    await axios.post(`${API}/chat/session`, {
      session_id: sessionId.current,
      visitor_name: name,
      visitor_phone: phone,
    });
  }, []);

  const retryPendingMessages = useCallback(async () => {
    const pending = getPendingMessages(sessionId.current);
    for (const msg of pending) {
      if (msg.status !== 'pending' && msg.status !== 'failed') continue;
      try {
        let res;
        if (msg.type === 'image') {
          const file = pendingFilesRef.current.get(msg.client_message_id);
          if (!file) continue;
          const form = new FormData();
          form.append('session_id', sessionId.current);
          form.append('file', file, file.name);
          form.append('content', msg.content || '');
          form.append('visitor_name', visitorName);
          form.append('visitor_phone', visitorPhone);
          form.append('client_message_id', msg.client_message_id);
          res = await axios.post(`${API}/chat/upload`, form, {
            headers: { 'Content-Type': 'multipart/form-data', ...visitorChatHeaders(visitorPhone) },
          });
        } else {
          res = await axios.post(`${API}/chat/messages`, {
            session_id: sessionId.current,
            content: msg.content,
            visitor_name: visitorName,
            visitor_phone: visitorPhone,
            client_message_id: msg.client_message_id,
          }, { headers: visitorChatHeaders(visitorPhone) });
        }
        removePendingMessage(sessionId.current, msg.client_message_id);
        pendingFilesRef.current.delete(msg.client_message_id);
        setMessages((prev) => mergeMessages(prev.filter((m) => m.client_message_id !== msg.client_message_id), [res.data.message]));
      } catch {
        savePendingMessage(sessionId.current, { ...msg, status: 'failed' });
        setMessages((prev) =>
          prev.map((m) =>
            m.client_message_id === msg.client_message_id ? { ...m, status: 'failed' } : m
          )
        );
      }
    }
  }, [visitorName, visitorPhone]);

  useEffect(() => {
    const handleOpenChat = (event) => {
      setIsOpen(true);
      const draft = event?.detail?.draft;
      if (typeof draft === 'string' && draft.trim()) {
        setInput(draft.trim());
      }
    };
    window.addEventListener('open-chat', handleOpenChat);
    return () => window.removeEventListener('open-chat', handleOpenChat);
  }, []);

  useEffect(() => {
    if (!needsRegister && visitorName && visitorPhone) {
      initSession(visitorName, visitorPhone).catch(() => {});
      syncFromServer();
      const pending = getPendingMessages(sessionId.current);
      if (pending.length) {
        setMessages((prev) => mergeMessages(prev, pending));
        retryPendingMessages();
      }
    }
  }, [needsRegister, visitorName, visitorPhone, initSession, retryPendingMessages, syncFromServer]);

  useEffect(() => {
    const handleResume = () => {
      if (!needsRegister) {
        syncFromServer();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleResume();
      }
    };

    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [needsRegister, syncFromServer]);

  useEffect(() => {
    if (needsRegister) return undefined;

    const ping = () => {
      if (document.visibilityState === 'hidden') return;
      const phone = localStorage.getItem(PHONE_KEY) || '';
      axios
        .post(
          `${API}/chat/ping`,
          null,
          {
            params: visitorChatParams(sessionId.current, phone),
            headers: visitorChatHeaders(phone),
            timeout: 8000,
          }
        )
        .catch(() => {});
    };

    ping();
    const id = setInterval(ping, PING_INTERVAL);
    return () => clearInterval(id);
  }, [needsRegister]);

  useEffect(() => {
    if (!needsRegister && !isOpen) {
      const bgPoll = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        syncFromServer();
      }, BG_SYNC_INTERVAL);
      return () => clearInterval(bgPoll);
    }
  }, [needsRegister, isOpen, syncFromServer]);

  useEffect(() => {
    if (isOpen && !needsRegister) {
      setUnread(0);
      lastSinceRef.current = null;
      fetchMessages(null, true);
      pollRef.current = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        fetchMessages(lastSinceRef.current);
      }, POLL_INTERVAL);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [isOpen, needsRegister, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleRetryMessage = async (msg) => {
    if (!msg?.client_message_id || sending || uploading) return;
    if (msg.type === 'image') {
      const file = pendingFilesRef.current.get(msg.client_message_id);
      if (!file) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append('session_id', sessionId.current);
        form.append('file', file, file.name);
        form.append('content', msg.content || '');
        form.append('visitor_name', visitorName);
        form.append('visitor_phone', visitorPhone);
        form.append('client_message_id', msg.client_message_id);
        const res = await axios.post(`${API}/chat/upload`, form, {
          headers: { 'Content-Type': 'multipart/form-data', ...visitorChatHeaders(visitorPhone) },
          timeout: 120000,
        });
        removePendingMessage(sessionId.current, msg.client_message_id);
        pendingFilesRef.current.delete(msg.client_message_id);
        setMessages((prev) =>
          mergeMessages(prev.filter((m) => m.client_message_id !== msg.client_message_id), [res.data.message])
        );
      } catch (err) {
        setPhoneError(getApiErrorMessage(err, t.chat.imageUploadFailed, t));
      } finally {
        setUploading(false);
      }
      return;
    }
    setSending(true);
    setMessages((prev) =>
      prev.map((m) =>
        m.client_message_id === msg.client_message_id ? { ...m, status: 'pending' } : m
      )
    );
    try {
      await sendTextMessage(msg.content, msg.client_message_id);
    } catch {
      // sendTextMessage already marks failed
    } finally {
      setSending(false);
    }
  };

  const handleRegister = async () => {
    const name = nameInput.trim();
    const phone = validateIsraeliPhone(phoneInput);
    if (!name || name.length < 2) {
      setPhoneError(t.chat.nameRequired);
      return;
    }
    if (!phone) {
      setPhoneError(t.chat.phoneInvalid);
      return;
    }
    setPhoneError('');
    setRegistering(true);
    try {
      await initSession(name, phone);
      localStorage.setItem(NAME_KEY, name);
      localStorage.setItem(PHONE_KEY, phone);
      setVisitorName(name);
      setVisitorPhone(phone);
      setNeedsRegister(false);
      fetchMessages(null, true);
    } catch (err) {
      setPhoneError(
        err.response
          ? getApiErrorMessage(err, t.chat.registerFailed, t)
          : t.chat.networkError
      );
    } finally {
      setRegistering(false);
    }
  };

  const sendTextMessage = async (content, clientMessageId) => {
    const optimistic = {
      client_message_id: clientMessageId,
      session_id: sessionId.current,
      sender: 'visitor',
      type: 'text',
      content,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    savePendingMessage(sessionId.current, optimistic);
    setMessages((prev) => mergeMessages(prev, [optimistic]));

    try {
      const res = await axios.post(`${API}/chat/messages`, {
        session_id: sessionId.current,
        content,
        visitor_name: visitorName,
        visitor_phone: visitorPhone,
        client_message_id: clientMessageId,
      }, { headers: visitorChatHeaders(visitorPhone) });
      removePendingMessage(sessionId.current, clientMessageId);
      const serverMsg = {
        ...res.data.message,
        client_message_id: res.data.message.client_message_id || clientMessageId,
      };
      setMessages((prev) => mergeMessages(prev, [serverMsg]));
      if (serverMsg.created_at) {
        lastSinceRef.current = serverMsg.created_at;
      }
    } catch {
      savePendingMessage(sessionId.current, { ...optimistic, status: 'failed' });
      setMessages((prev) =>
        prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'failed' } : m
        )
      );
      throw new Error('send failed');
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');
    const clientId = createClientMessageId();
    try {
      await sendTextMessage(content, clientId);
    } catch {
      setInput(content);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    e.target.value = '';

    if (!isSupportedImageFile(file)) {
      setPhoneError(t.chat.imageUnsupported);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setPhoneError(t.chat.imageTooLarge);
      return;
    }

    setUploading(true);
    const clientId = createClientMessageId();
    const previewUrl = URL.createObjectURL(file);
    pendingFilesRef.current.set(clientId, file);
    const optimistic = {
      client_message_id: clientId,
      session_id: sessionId.current,
      sender: 'visitor',
      type: 'image',
      content: '',
      image_url: previewUrl,
      filename: file.name,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    savePendingMessage(sessionId.current, optimistic);
    setMessages((prev) => mergeMessages(prev, [optimistic]));

    try {
      const form = new FormData();
      form.append('session_id', sessionId.current);
      form.append('file', file, file.name);
      form.append('visitor_name', visitorName);
      form.append('visitor_phone', visitorPhone);
      form.append('client_message_id', clientId);

      const res = await axios.post(`${API}/chat/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data', ...visitorChatHeaders(visitorPhone) },
        timeout: 120000,
      });
      URL.revokeObjectURL(previewUrl);
      removePendingMessage(sessionId.current, clientId);
      pendingFilesRef.current.delete(clientId);
      setMessages((prev) =>
        mergeMessages(
          prev.filter((m) => m.client_message_id !== clientId),
          [res.data.message]
        )
      );
    } catch (err) {
      savePendingMessage(sessionId.current, { ...optimistic, status: 'failed' });
      setMessages((prev) =>
        prev.map((m) =>
          m.client_message_id === clientId ? { ...m, status: 'failed' } : m
        )
      );
      setPhoneError(getApiErrorMessage(err, t.chat.imageUploadFailed, t));
    } finally {
      setUploading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (needsRegister) handleRegister();
      else handleSend();
    }
  };

  const toggleOpen = () => {
    setIsOpen((open) => !open);
  };

  return (
    <>
      {isOpen && (
        <div
          className="chat-panel fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col overflow-hidden border border-white/10 bg-gradient-to-b from-[#0F1419] to-[#06080F] shadow-2xl sm:inset-auto sm:bottom-24 sm:start-6 sm:h-auto sm:max-h-[min(560px,calc(100dvh-7rem))] sm:w-[min(400px,calc(100vw-3rem))] sm:rounded-2xl"
          dir={isRTL ? 'rtl' : 'ltr'}
          role="dialog"
          aria-label={t.chat.title}
        >
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-blue-600/80 to-purple-600/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.chat.title}</p>
                <p className="text-xs text-white/70">{t.chat.subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleOpen}
              className="p-1 text-white/70 transition-colors hover:text-white"
              aria-label="Close chat"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>

          {needsRegister ? (
            <div className="flex flex-1 flex-col justify-center gap-3 p-6">
              <p className="text-center text-sm text-gray-300">{t.chat.registerPrompt}</p>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={t.chat.namePlaceholder}
                className="border-white/10 bg-[#0a0e1a]/80 text-white"
                dir="auto"
                autoComplete="name"
                autoFocus
              />
              <Input
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(formatIsraeliPhoneInput(e.target.value));
                  setPhoneError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder={t.chat.phonePlaceholder}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="border-white/10 bg-[#0a0e1a]/80 text-start text-white"
                dir="ltr"
              />
              {phoneError && <p className="text-center text-xs text-red-400">{phoneError}</p>}
              <Button
                onClick={handleRegister}
                disabled={registering}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700"
              >
                {registering ? t.chat.registering : t.chat.startChat}
              </Button>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:min-h-[280px] sm:max-h-[380px]">
                {messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-gray-500">{t.chat.empty}</p>
                )}
                {messages.map((msg) => (
                  <ChatMessageBubble
                    key={msg.message_id || msg.client_message_id}
                    msg={msg}
                    isOwn={msg.sender === 'visitor'}
                    onRetry={msg.status === 'failed' ? () => handleRetryMessage(msg) : undefined}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {phoneError && (
                <p className="px-4 pb-1 text-center text-xs text-red-400">{phoneError}</p>
              )}
              <div className="flex items-center gap-2 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
                  className="h-10 w-10 shrink-0 text-gray-400 hover:text-white"
                >
                  <ImagePlus className="h-5 w-5" />
                </Button>
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (phoneError) setPhoneError('');
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={t.chat.inputPlaceholder}
                  disabled={sending}
                  dir="auto"
                  className="h-10 flex-1 border-white/10 bg-[#0a0e1a]/80 text-sm text-white"
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  size="icon"
                  className="h-10 w-10 shrink-0 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rtl:scale-x-[-1]"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {!isOpen && (
        <button
          type="button"
          onClick={toggleOpen}
          className="chat-fab fixed z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-600 shadow-2xl transition-all duration-300 hover:scale-110 hover:from-blue-600 hover:to-purple-700 hover:shadow-purple-500/40"
          aria-label={t.chat.title}
        >
          <MessageSquare className="h-6 w-6 text-white" />
          {unread > 0 && (
            <span className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    </>
  );
};

export default ChatWidget;
