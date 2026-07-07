import React, { useState } from 'react';
import { formatChatTime } from '../utils/chatHelpers';
import { Loader2, AlertCircle, ImageIcon } from 'lucide-react';

const ChatMessageBubble = ({ msg, isOwn }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isPending = msg.status === 'pending';
  const isFailed = msg.status === 'failed';

  const ownClass = msg.sender === 'admin'
    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-ee-sm'
    : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-ee-sm';
  const otherClass = 'bg-white/10 text-gray-100 rounded-es-sm';
  const cls = isOwn ? ownClass : otherClass;

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm relative ${cls} ${isPending ? 'opacity-70' : ''} ${isFailed ? 'border border-red-500/50' : ''}`}>
        {msg.type === 'image' && msg.image_url && (
          <div className="mb-1">
            {!imgLoaded && !imgError && (
              <div className="w-48 h-32 bg-black/20 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-8 h-8 opacity-40" />
              </div>
            )}
            {!imgError ? (
              <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={msg.image_url}
                  alt={msg.filename || 'image'}
                  className={`max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity ${imgLoaded ? '' : 'hidden'}`}
                  style={{ maxHeight: '300px' }}
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgError(true)}
                />
              </a>
            ) : (
              <p className="text-xs opacity-60">Image failed to load</p>
            )}
          </div>
        )}
        {msg.content && (
          <p className="break-words whitespace-pre-wrap">{msg.content}</p>
        )}
        <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'text-white/60' : 'text-gray-500'}`}>
          <p className="text-[10px]">{formatChatTime(msg.created_at)}</p>
          {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
          {isFailed && <AlertCircle className="w-3 h-3 text-red-400" />}
        </div>
      </div>
    </div>
  );
};

export default ChatMessageBubble;
