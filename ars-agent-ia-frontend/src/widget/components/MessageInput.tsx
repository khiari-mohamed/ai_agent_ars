import { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Écrivez votre message…"
        disabled={disabled}
        rows={1}
        aria-label="Message"
        className={cn(
          'flex-1 resize-none rounded-xl border border-surface-border bg-surface-raised',
          'px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400',
          'focus:outline-none focus:ring-2 focus:ring-[#d62121] focus:border-[#d62121]',
          'transition-colors duration-150 scrollbar-hidden',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'max-h-[120px]',
        )}
      />
      <button
        type="submit"
        disabled={!value.trim() || disabled}
        aria-label="Envoyer"
        className={cn(
          'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0',
          'bg-[#d62121] hover:bg-[#b51a1a] active:bg-[#8f1717] text-white',
          'transition-all duration-150',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
          'focus-visible:ring-2 focus-visible:ring-navy-400',
        )}
      >
        <Send className="h-4 w-4" />
      </button>
    </form>
  );
}