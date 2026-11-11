import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MAX_TEXT_LENGTH } from '@/lib/ws/protocol';

interface MessageInputProps {
  /** Returns true when the message was actually sent; the field is cleared only then. */
  onSend: (content: string) => boolean;
  disabled?: boolean;
  /** Agent is answering: the user can keep typing but cannot send yet. */
  busy?: boolean;
}

const MAX_HEIGHT_PX = 120;
const COUNTER_THRESHOLD = MAX_TEXT_LENGTH * 0.8;

export default function MessageInput({ onSend, disabled = false, busy = false }: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled && !busy;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  const submit = () => {
    if (!canSend) return;
    if (onSend(value.trim())) {
      setValue('');
      textareaRef.current?.focus();
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={busy ? "L'agent répond…" : 'Écrivez votre message…'}
          disabled={disabled}
          maxLength={MAX_TEXT_LENGTH}
          rows={1}
          aria-label="Message"
          className={cn(
            'flex-1 resize-none rounded-2xl border border-white/70 bg-white/55 backdrop-blur-md',
            'px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400',
            'shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)]',
            'focus:outline-none focus:ring-2 focus:ring-[#d62121]/25 focus:border-[#d62121]/40 focus:bg-white/75',
            'transition-all duration-150 scrollbar-hidden',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'max-h-[120px]',
          )}
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Envoyer"
          className={cn(
            'h-9 w-9 rounded-2xl flex items-center justify-center flex-shrink-0',
            'bg-gradient-to-br from-[#e5504f] via-[#d62121] to-[#a91717] text-white',
            'shadow-glow-red hover:shadow-glow-red-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-95',
            'transition-all duration-150',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none disabled:hover:translate-y-0 disabled:shadow-none',
            'focus-visible:ring-2 focus-visible:ring-red-300',
          )}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {value.length >= COUNTER_THRESHOLD && (
        <span className="self-end pr-1 text-2xs text-slate-400" aria-live="polite">
          {value.length}/{MAX_TEXT_LENGTH}
        </span>
      )}
    </form>
  );
}