import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateSessionId } from '@/lib/utils';
import ChatWindow from './components/ChatWindow.tsx';
import { useConversationStore } from '@/store/conversationStore';

const SESSION_ID = generateSessionId();

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const reset = useConversationStore((s) => s.reset);
  const messagesCount = useConversationStore((s) => s.messages.length);
  const status = useConversationStore((s) => s.status);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleReset = useCallback(() => {
    reset();
    setOpen(false);
  }, [reset]);

  const unreadCount = status === 'IDLE' ? 0 : Math.max(0, messagesCount);

  return (
    <>
      {/* Chat Window */}
      <div
        className={cn(
          'fixed bottom-24 right-6 z-50 w-[380px] max-h-[580px]',
          'transition-all duration-300 ease-spring origin-bottom-right',
          open
            ? 'scale-100 opacity-100 pointer-events-auto'
            : 'scale-90 opacity-0 pointer-events-none',
        )}
        aria-hidden={!open}
      >
        {open && (
          <ChatWindow
            sessionId={SESSION_ID}
            onClose={handleClose}
            onReset={handleReset}
          />
        )}
      </div>

      {/* Floating Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fermer le chat' : 'Ouvrir le chat'}
        aria-expanded={open}
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'h-14 w-14 rounded-full shadow-widget',
          'bg-[#d62121] hover:bg-[#b51a1a] active:bg-[#8f1717]',
          'text-white transition-all duration-200 ease-spring',
          'flex items-center justify-center',
          'focus-visible:ring-2 focus-visible:ring-navy-400 focus-visible:ring-offset-2',
        )}
      >
        <span className={cn('transition-all duration-200', open ? 'scale-100 rotate-0' : 'scale-100 rotate-0')}>
          {open ? (
            <X className="h-5 w-5" />
          ) : (
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="4" y="6" width="16" height="12" rx="3" fill="white" />
              <circle cx="9" cy="11" r="1.25" fill="#d62121" />
              <circle cx="15" cy="11" r="1.25" fill="#d62121" />
              <rect x="11" y="15" width="2" height="1.6" rx="0.3" fill="#d62121" />
            </svg>
          )}
        </span>
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-2xs font-bold flex items-center justify-center animate-pulse-slow">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}