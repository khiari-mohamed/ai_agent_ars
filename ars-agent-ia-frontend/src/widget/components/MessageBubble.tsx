import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/conversation';

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
}

export default function MessageBubble({ message, isLast }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const time = format(parseISO(message.timestamp), 'HH:mm', { locale: fr });

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-slate-400 bg-surface-raised px-3 py-1 rounded-full border border-surface-border">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-2 mb-2',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isLast && 'animate-slide-up',
      )}
    >
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0 self-end mb-4">
          <span className="text-navy-600 font-bold text-2xs">IA</span>
        </div>
      )}

      <div className={cn('flex flex-col max-w-[75%]', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
            isUser
              ? 'bg-[#d62121] text-white rounded-br-sm'
              : 'bg-surface-raised text-slate-800 border border-surface-border rounded-bl-sm',
          )}
        >
          {message.content.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              {i < message.content.split('\n').length - 1 && <br />}
            </span>
          ))}
        </div>
        <span className="text-2xs text-slate-400 mt-1 px-1">{time}</span>
      </div>
    </div>
  );
}