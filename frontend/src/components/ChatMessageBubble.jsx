import React, { useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { formatChatTime, resolveChatImageUrl } from '../utils/chatHelpers';
import { Loader2, AlertCircle, ImageIcon } from 'lucide-react';
import ChatImageViewer from './ChatImageViewer';

/**
 * Admin: pass showAdminLayout + foreignText (top) + chineseText (bottom).
 * Visitor widget: only msg/isOwn/onRetry — shows content as before.
 */
const ChatMessageBubble = ({
  msg,
  isOwn,
  onRetry,
  foreignText,
  chineseText,
  showAdminLayout = false,
}) => {
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

  const roundOwn = 'rounded-ee-sm rtl:rounded-es-sm';
  const roundOther = 'rounded-es-sm rtl:rounded-ee-sm';
  const round = isOwn ? roundOwn : roundOther;
  // Swapped palettes (admin ↔ visitor): colorful was "staff/own", gray was "other"
  const styleGray = `bg-white/10 text-gray-100 ${round}`;
  const styleGreen = `bg-gradient-to-r from-green-600 to-emerald-600 text-white ${round}`;
  const styleBluePurple = `bg-gradient-to-r from-blue-500 to-purple-600 text-white ${round}`;

  let cls;
  let timeMuted;
  if (showAdminLayout) {
    // Admin room: staff → gray; visitor → green (swapped)
    cls = isOwn ? styleGray : styleGreen;
    timeMuted = isOwn ? 'text-gray-500' : 'text-white/60';
  } else {
    // Visitor widget: visitor → gray; staff → blue-purple (swapped)
    cls = isOwn ? styleGray : styleBluePurple;
    timeMuted = isOwn ? 'text-gray-500' : 'text-white/60';
  }

  const topText = showAdminLayout ? foreignText ?? msg.content : msg.content;
  const bottomText = showAdminLayout ? chineseText : null;
  const timeLocale = showAdminLayout ? 'zh-CN' : locale;

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

          {topText ? (
            <p className="break-words whitespace-pre-wrap" dir="auto">
              {topText}
            </p>
          ) : null}

          {bottomText ? (
            <p
              className="break-words whitespace-pre-wrap mt-1.5 text-[12px] opacity-90 border-t border-white/20 pt-1.5"
              dir="auto"
            >
              {bottomText}
            </p>
          ) : null}

          <div className={`flex items-center gap-1 mt-1 ${timeMuted}`}>
            <p className="text-[10px]" dir="ltr">
              {formatChatTime(msg.created_at, false, timeLocale)}
            </p>
            {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            {isFailed && <AlertCircle className="w-3 h-3 text-red-400" />}
          </div>
          {isFailed && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 text-[11px] underline opacity-90 hover:opacity-100"
            >
              {showAdminLayout
                ? '发送失败，点击重试'
                : t.chat.sendFailedRetry || t.chat.imageRetry}
            </button>
          )}
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
