import { memo, useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/conversation';

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
}

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

function formatTime(iso: string): string {
  const date = parseISO(iso);
  return isValid(date) ? format(date, 'HH:mm', { locale: fr }) : '';
}

function MessageBubble({ message, isLast }: MessageBubbleProps) {
  const [showArabic, setShowArabic] = useState(false);
  const isUser = message.role === 'user';

  if (message.role === 'tool') return null;

  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-slate-500 bg-white/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/60">
          {message.content}
        </span>
      </div>
    );
  }

  // Tunisian replies are Latin (Arabizi); ttsText carries the Arabic-script version when available.
  const arabicAlt =
    !isUser &&
    message.language === 'tn' &&
    message.ttsText &&
    message.ttsText !== message.content &&
    ARABIC_SCRIPT.test(message.ttsText) &&
    !ARABIC_SCRIPT.test(message.content)
      ? message.ttsText
      : null;

  const text = showArabic && arabicAlt ? arabicAlt : message.content;
  const lines = text.split('\n');
  const time = formatTime(message.timestamp);

  return (
    <div className={cn('flex gap-2 mb-2', isUser ? 'flex-row-reverse' : 'flex-row', isLast && 'animate-slide-up')}>
      {!isUser && (
        <div
          aria-hidden
          className="h-7 w-7 rounded-full bg-gradient-to-br from-white/90 to-white/60 backdrop-blur-md border border-white/70 shadow-glass-sm flex items-center justify-center flex-shrink-0 self-end mb-4"
        >
          <span className="text-[#b51a1a] font-bold text-2xs">IA</span>
        </div>
      )}

      <div className={cn('flex flex-col max-w-[75%]', isUser ? 'items-end' : 'items-start')}>
        <div
          dir={ARABIC_SCRIPT.test(text) ? 'rtl' : 'auto'}
          className={cn(
            'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
            isUser
              ? 'bg-gradient-to-br from-[#e5504f] via-[#d62121] to-[#a91717] text-white rounded-br-sm shadow-glow-red'
              : 'bg-white/70 backdrop-blur-md text-slate-800 border border-white/70 rounded-bl-sm shadow-glass-sm',
          )}
        >
          <span className="sr-only">{isUser ? 'Vous : ' : 'Assistant : '}</span>
          {lines.map((line, i) => (
            <span key={i}>
              {line}
              {i < lines.length - 1 && <br />}
            </span>
          ))}
        </div>

        {arabicAlt && (
          <button
            type="button"
            onClick={() => setShowArabic((v) => !v)}
            aria-pressed={showArabic}
            className="mt-1 px-1 text-2xs font-medium text-slate-400 hover:text-[#b51a1a] transition-colors"
          >
            {showArabic ? 'Afficher en lettres latines' : 'عرض بالعربية'}
          </button>
        )}

        {message.ticketId && (
          <span className="mt-1 rounded-full border border-sage-200 bg-sage-50 px-2 py-0.5 text-[10px] font-medium text-sage-700">
            Ticket créé · {message.ticketId}
          </span>
        )}
        {time && <span className="text-2xs text-slate-400 mt-1 px-1">{time}</span>}
      </div>
    </div>
  );
}

export default memo(MessageBubble);