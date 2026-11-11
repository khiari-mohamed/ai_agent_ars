import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import ChatWindow from './components/ChatWindow.tsx';
import { useConversationStore } from '@/store/conversationStore';

const PANEL_ID = 'ars-chat-panel';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [seenCount, setSeenCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const reset = useConversationStore((s) => s.reset);
  const assistantCount = useConversationStore(
    (s) => s.messages.filter((m) => m.role === 'assistant').length,
  );

  const unreadCount = open ? 0 : Math.max(0, assistantCount - seenCount);

  useEffect(() => {
    if (open) setSeenCount(assistantCount);
  }, [open, assistantCount]);

  useEffect(() => {
    panelRef.current?.toggleAttribute('inert', !open);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const toggle = useCallback(() => {
    setStarted(true);
    setOpen((v) => !v);
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  /** New conversation: wipe the store and remount the window (fresh session). */
  const handleReset = useCallback(() => {
    reset();
    setSeenCount(0);
    setSessionKey((k) => k + 1);
  }, [reset]);

  const label = open
    ? 'Réduire le chat'
    : unreadCount > 0
      ? `Ouvrir le chat, ${unreadCount} nouveau${unreadCount > 1 ? 'x' : ''} message${unreadCount > 1 ? 's' : ''}`
      : 'Ouvrir le chat';

  return (
    <>
      <div
        id={PANEL_ID}
        ref={panelRef}
        role="dialog"
        aria-label="Assistant ARS Tunisie"
        aria-hidden={!open}
        className={cn(
          'fixed bottom-24 right-4 sm:right-6 z-50',
          'w-[min(380px,calc(100vw-2rem))] max-h-[min(580px,calc(100dvh-8rem))]',
          'transition-[opacity,transform,visibility] duration-300 ease-spring origin-bottom-right',
          'motion-reduce:transition-none',
          open
            ? 'scale-100 opacity-100 visible pointer-events-auto'
            : 'scale-90 opacity-0 invisible pointer-events-none',
        )}
      >
        {started && <ChatWindow key={sessionKey} onClose={handleClose} onReset={handleReset} />}
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        className={cn(
          'fixed bottom-6 right-4 sm:right-6 z-50',
          'h-14 w-14 rounded-full',
          'bg-gradient-to-br from-[#e5504f] via-[#d62121] to-[#a91717]',
          'shadow-glow-red-lg ring-1 ring-white/40',
          'text-white transition-all duration-300 ease-spring motion-reduce:transition-none',
          'hover:scale-105 hover:shadow-[0_20px_60px_-8px_rgb(214,33,33,0.65)]',
          'active:scale-95',
          'flex items-center justify-center',
          'focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2',
        )}
      >
        <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 backdrop-blur-[2px]" aria-hidden />
        <span className="relative">
          {open ? (
            <X className="h-5 w-5" aria-hidden />
          ) : (
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="4" y="6" width="16" height="12" rx="3" fill="white" fillOpacity="0.95" />
              <circle cx="9" cy="11" r="1.25" fill="#d62121" />
              <circle cx="15" cy="11" r="1.25" fill="#d62121" />
              <rect x="11" y="15" width="2" height="1.6" rx="0.3" fill="#d62121" />
            </svg>
          )}
        </span>
        {!open && unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-br from-red-400 to-red-600 text-white text-2xs font-bold flex items-center justify-center ring-2 ring-white animate-pulse-slow motion-reduce:animate-none"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}