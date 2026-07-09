import React, { useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { formatChatTime, resolveChatImageUrl } from '../utils/chatHelpers';
import { Loader2, AlertCircle, ImageIcon } from 'lucide-react';
import ChatImageViewer from './ChatImageViewer';

const ChatMessageBubble = ({ msg, isOwn }) => {
  const { t, locale } = useLanguage();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const isPending = msg.status === 'pending';
  const isFailed = msg.status === 'failed';

  const imageSrc = useMemo(() => {
    if (!msg.image_url) return '';
    const base = resolveChatImageUrl(msg.image_url);
    return retryCount > 0 ? `${base}${base.includes('?') ? '&' : '?'}r=${retryCount}` : base;
  }, [msg.image_url, retryCount]);

  const handleImageError = () => {
    if (retryCount < 2) {
      setRetryCount((n) => n + 1);
      setImgLoaded(false);
      return;
    }
    setImgError(true);
  };

  const ownClass = msg.sender === 'admin'
    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-ee-sm rtl:rounded-es-sm'
    : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-ee-sm rtl:rounded-es-sm';
  const otherClass = 'bg-white/10 text-gray-100 rounded-es-sm rtl:rounded-ee-sm';
  const cls = isOwn ? ownClass : otherClass;

  return (
    <>
      <div className="flex w-full">
        <div
          className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm relative ${cls} ${isOwn ? 'ms-auto' : 'me-auto'} ${isPending ? 'opacity-70' : ''} ${isFailed ? 'border border-red-500/50' : ''}`}
        >
          {msg.type === 'image' && imageSrc && (
            <div className="mb-1">
              {!imgLoaded && !imgError && (
                <div className="w-48 h-32 bg-black/20 rounded-lg flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 opacity-40" />
                </div>
              )}
              {!imgError ? (
                <button
                  type="button"
                  className="block border-0 p-0 bg-transparent cursor-pointer"
                  onClick={() => setViewerOpen(true)}
                >
                  <img
                    src={imageSrc}
                    alt={msg.filename || 'image'}
                    className={`max-w-full rounded-lg hover:opacity-90 transition-opacity ${imgLoaded ? '' : 'hidden'}`}
                    style={{ maxHeight: '300px' }}
                    loading="eager"
                    decoding="async"
                    onLoad={() => setImgLoaded(true)}
                    onError={handleImageError}
                    draggable={false}
                  />
                </button>
              ) : (
                <div className="text-xs opacity-70 space-y-1">
                  <p>{t.chat.imageLoadFailed}</p>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setViewerOpen(true)}
                  >
                    {t.chat.imageRetry}
                  </button>
                </div>
              )}
            </div>
          )}
          {msg.content && (
            <p className="break-words whitespace-pre-wrap" dir="auto">
              {msg.content}
            </p>
          )}
          <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'text-white/60' : 'text-gray-500'}`}>
            <p className="text-[10px]" dir="ltr">
              {formatChatTime(msg.created_at, false, locale)}
            </p>
            {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            {isFailed && <AlertCircle className="w-3 h-3 text-red-400" />}
          </div>
        </div>
      </div>

      <ChatImageViewer
        open={viewerOpen}
        imageSrc={imageSrc}
        filename={msg.filename}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
};

export default ChatMessageBubble;
