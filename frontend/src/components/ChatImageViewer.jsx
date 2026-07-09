import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Download, Copy, ZoomIn, ZoomOut } from 'lucide-react';

const ChatImageViewer = ({ open, imageSrc, filename, onClose }) => {
  const [zoomed, setZoomed] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const longPressTimer = useRef(null);

  useEffect(() => {
    if (!open) {
      setZoomed(false);
      setShowActions(false);
      return undefined;
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleSave = useCallback(async () => {
    if (!imageSrc) return;
    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'chat-image.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setShowActions(false);
    } catch {
      window.open(imageSrc, '_blank', 'noopener,noreferrer');
    }
  }, [imageSrc, filename]);

  const handleCopy = useCallback(async () => {
    if (!imageSrc) return;
    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const type = blob.type || 'image/png';
      await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      setShowActions(false);
    } catch {
      window.open(imageSrc, '_blank', 'noopener,noreferrer');
    }
  }, [imageSrc]);

  const handleTouchStart = () => {
    clearLongPress();
    longPressTimer.current = setTimeout(() => setShowActions(true), 500);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    setShowActions(true);
  };

  if (!open || !imageSrc) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 end-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setZoomed((z) => !z);
        }}
        className="absolute top-4 start-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
        aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
      >
        {zoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
      </button>

      <div
        className="flex-1 w-full flex items-center justify-center overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageSrc}
          alt={filename || 'image'}
          className={`transition-transform duration-200 select-none ${
            zoomed
              ? 'max-w-none max-h-none w-auto h-auto cursor-zoom-out'
              : 'max-w-[min(100%,96vw)] max-h-[min(100%,88vh)] object-contain cursor-zoom-in'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((z) => !z);
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={clearLongPress}
          onTouchMove={clearLongPress}
          onTouchCancel={clearLongPress}
          onContextMenu={handleContextMenu}
          draggable={false}
        />
      </div>

      {showActions && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 px-4 py-3 rounded-2xl bg-[#1a2332]/95 border border-white/10 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"
          >
            <Download className="w-4 h-4" />
            保存
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"
          >
            <Copy className="w-4 h-4" />
            复制
          </button>
          <button
            type="button"
            onClick={() => setShowActions(false)}
            className="px-3 py-2 rounded-xl text-white/60 hover:text-white text-sm"
          >
            取消
          </button>
        </div>
      )}

      <p className="absolute bottom-2 text-white/40 text-[10px] pointer-events-none">
        点击放大 · 长按保存/复制
      </p>
    </div>
  );
};

export default ChatImageViewer;
