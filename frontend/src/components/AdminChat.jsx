import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import ChatMessageBubble from './ChatMessageBubble';
import { MessageSquare, Send, Trash2, RefreshCw, ImagePlus, Ban } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { mergeMessages, createClientMessageId, formatChatTime, retryRequest, getApiErrorMessage } from '../utils/chatHelpers';
import {
  MAX_IMAGE_SIZE_BYTES,
  isSupportedImageFile,
} from '../utils/chatConstants';

const API = '/api';
const POLL_INTERVAL = 2500;

const AdminChat = () => {
  const { t, locale } = useLanguage();
  const ac = t.admin.chat;
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const forceScrollToBottomRef = useRef(false);
  const lastSinceRef = useRef(null);
  const fileInputRef = useRef(null);
  const replyInputRef = useRef(null);
  const pollRef = useRef(null);
  const [blacklistIpInput, setBlacklistIpInput] = useState('');

  const getToken = () => localStorage.getItem('admin_token');

  const fetchSessions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/admin/chat/sessions`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setSessions(res.data.sessions || []);
    } catch (e) {
      if (e.response?.status === 401) return;
      console.error('Failed to fetch chat sessions', e);
    }
  }, []);

  const fetchMessages = useCallback(async (sessionId, since = null, fullLoad = false) => {
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
    } catch (e) {
      if (e.response?.status === 401) return;
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    pollRef.current = setInterval(fetchSessions, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [fetchSessions]);

  useEffect(() => {
    if (selectedSession) {
      lastSinceRef.current = null;
      fetchMessages(selectedSession.session_id, null, true);
      const msgPoll = setInterval(
        () => fetchMessages(selectedSession.session_id, lastSinceRef.current),
        POLL_INTERVAL
      );
      return () => clearInterval(msgPoll);
    }
  }, [selectedSession, fetchMessages]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || !messagesEndRef.current) return;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (forceScrollToBottomRef.current || nearBottom) {
      // 用户不在底部时不要强制滚动，避免“乱动”
      messagesEndRef.current.scrollIntoView({ behavior: forceScrollToBottomRef.current ? 'auto' : 'smooth' });
      forceScrollToBottomRef.current = false;
    }
  }, [messages]);

  const handleSelectSession = (session) => {
    setSelectedSession(session);
    setMessages([]);
    lastSinceRef.current = null;
    forceScrollToBottomRef.current = true;
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
      setSelectedSession((prev) => {
        if (!prev) return prev;
        if (prev.visitor_ip !== ip) return prev;
        return { ...prev, blacklisted: !blacklisted };
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, ac.operationFailed, t));
    }
  };

  const handleBlacklistForSession = async (session, e) => {
    e?.stopPropagation?.();
    await toggleBlacklistByIp(session?.visitor_ip, session?.blacklisted);
  };

  const handleAddBlacklistManually = async () => {
    const ip = blacklistIpInput.trim();
    if (!ip) return;
    await toggleBlacklistByIp(ip, false);
    setBlacklistIpInput('');
  };

  const sendTextReply = async (content, clientMessageId) => {
    const optimistic = {
      client_message_id: clientMessageId,
      session_id: selectedSession.session_id,
      sender: 'admin',
      type: 'text',
      content,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    setMessages((prev) => mergeMessages(prev, [optimistic]));

    try {
      const res = await retryRequest(() =>
        axios.post(
          `${API}/admin/chat/sessions/${selectedSession.session_id}/messages`,
          { content, client_message_id: clientMessageId },
          { headers: { Authorization: `Bearer ${getToken()}` }, timeout: 15000 }
        )
      );
      const serverMsg = {
        ...res.data.message,
        client_message_id: res.data.message.client_message_id || clientMessageId,
      };
      setMessages((prev) => mergeMessages(prev, [serverMsg]));
      if (serverMsg.created_at) {
        lastSinceRef.current = serverMsg.created_at;
      }
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
    const content = reply.trim();
    if (!content || !selectedSession || sending) return;

    setSending(true);
    setReply('');
    const clientId = createClientMessageId();
    try {
      await sendTextReply(content, clientId);
    } catch (err) {
      setReply(content);
      toast.error(getApiErrorMessage(err, ac.sendFailed, t));
    } finally {
      setSending(false);
      replyInputRef.current?.focus();
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSession || uploading) return;
    e.target.value = '';

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
    const previewUrl = URL.createObjectURL(file);
    const optimistic = {
      client_message_id: clientId,
      session_id: selectedSession.session_id,
      sender: 'admin',
      type: 'image',
      content: '',
      image_url: previewUrl,
      filename: file.name,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    setMessages((prev) => mergeMessages(prev, [optimistic]));

    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('client_message_id', clientId);

      const res = await retryRequest(() =>
        axios.post(
          `${API}/admin/chat/sessions/${selectedSession.session_id}/upload`,
          form,
          {
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
          }
        )
      );
      URL.revokeObjectURL(previewUrl);
      const serverMsg = {
        ...res.data.message,
        client_message_id: res.data.message.client_message_id || clientId,
      };
      setMessages((prev) => mergeMessages(prev, [serverMsg]));
      if (serverMsg.created_at) {
        lastSinceRef.current = serverMsg.created_at;
      }
      fetchSessions();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.client_message_id === clientId ? { ...m, status: 'failed' } : m
        )
      );
      toast.error(getApiErrorMessage(err, t.chat.imageUploadFailed, t));
    } finally {
      setUploading(false);
      replyInputRef.current?.focus();
    }
  };

  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();
    if (!window.confirm(ac.deleteConfirm)) return;
    try {
      await axios.delete(`${API}/admin/chat/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (selectedSession?.session_id === sessionId) {
        setSelectedSession(null);
        setMessages([]);
      }
      fetchSessions();
      toast.success(ac.deleted);
    } catch {
      toast.error(ac.deleteFailed);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchSessions();
    if (selectedSession) await fetchMessages(selectedSession.session_id, null, true);
    setLoading(false);
  };

  const totalUnread = sessions.reduce((sum, s) => sum + (s.unread_admin || 0), 0);

  return (
    <Card className="glass-card border-green-500/20 hover:border-green-500/40 transition-all duration-300 shadow-xl shadow-green-500/10 md:col-span-2">
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <h2 className="text-xl md:text-2xl font-bold text-white flex items-center">
          <MessageSquare className="w-6 h-6 me-3 text-green-400" />
          {ac.title}
          {totalUnread > 0 && (
            <Badge className="ms-3 bg-red-500/80 text-white border-none">{totalUnread} {ac.newBadge}</Badge>
          )}
        </h2>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="text-gray-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="flex flex-col md:flex-row h-[500px]">
        <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto max-h-[200px] md:max-h-none">
          <div className="p-3 border-b border-white/10 bg-black/20">
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
                onClick={handleAddBlacklistManually}
                className="h-9 w-9 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <Ban className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {sessions.length === 0 ? (
            <p className="text-gray-500 text-center py-8 text-sm">{ac.noConversations}</p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.session_id}
                onClick={() => handleSelectSession(session)}
                className={`w-full text-start p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${
                  selectedSession?.session_id === session.session_id ? 'bg-white/10' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm truncate">
                        {session.visitor_name || ac.guest}
                      </span>
                      {(session.unread_admin || 0) > 0 && (
                        <Badge className="bg-red-500/80 text-white border-none text-[10px] px-1.5 py-0">
                          {session.unread_admin}
                        </Badge>
                      )}
                    </div>
                    {(session.blacklisted) && (
                      <Badge className="bg-red-600/80 text-white border-none text-[10px] px-1.5 py-0 me-1">
                        {ac.blocked}
                      </Badge>
                    )}
                    {session.visitor_phone && (
                      <p className="text-blue-400/80 text-xs font-mono mt-0.5" dir="ltr">
                        {session.visitor_phone}
                      </p>
                    )}
                    <p className="text-gray-500 text-xs truncate mt-1">
                      {session.last_message || ac.noMessages}
                    </p>
                    <p className="text-gray-600 text-[10px] mt-1">
                      {session.visitor_ip} · {formatChatTime(session.last_message_at, true, locale)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10 shrink-0 ms-2"
                    onClick={(e) => handleDeleteSession(session.session_id, e)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className={
                      session.blacklisted
                        ? 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10 shrink-0 ms-2'
                        : 'text-red-400/60 hover:text-red-400 hover:bg-red-500/10 shrink-0 ms-2'
                    }
                    onClick={(e) => handleBlacklistForSession(session, e)}
                    title={session.blacklisted ? ac.unblockTitle : ac.blockTitle}
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex-1 flex flex-col">
          {selectedSession ? (
            <>
              <div className="px-4 py-3 border-b border-white/10 bg-black/20">
                <p className="text-white font-medium text-sm">{selectedSession.visitor_name}</p>
                {selectedSession.visitor_phone && (
                  <p className="text-blue-400/80 text-xs font-mono" dir="ltr">{selectedSession.visitor_phone}</p>
                )}
                <p className="text-gray-500 text-xs">{selectedSession.visitor_ip}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={messagesContainerRef}>
                {messages.map((msg) => (
                  <ChatMessageBubble
                    key={msg.message_id || msg.client_message_id}
                    msg={msg}
                    isOwn={msg.sender === 'admin'}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t border-white/10 flex gap-2 items-center">
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
                  ref={replyInputRef}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendReply())}
                  placeholder={ac.replyPlaceholder}
                  disabled={sending}
                  className="flex-1 bg-[#0a0e1a]/80 border-white/10 text-white text-sm h-10"
                />
                <Button
                  onClick={handleSendReply}
                  disabled={!reply.trim() || sending}
                  size="icon"
                  className="h-10 w-10 bg-green-600 hover:bg-green-700 shrink-0 rtl:scale-x-[-1]"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              {ac.selectConversation}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default AdminChat;
